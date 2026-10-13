import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../../db";
import type { Actor } from "../../auth/policy";
import { requirePermission } from "../../auth/policy";
import {
  adsBatches,
  adsHistory,
  adsBatchHistory,
  adsRequests,
  adsPresets,
  adsPreparations,
  donorVersions,
  donors,
} from "../../database/schema";
import { requireResource } from "../../meta/access";
import { AdsService } from "../service";
import { adsInput, type AdsInput } from "../validation";
import type { AdsProvider } from "../provider";
import { adsProvider } from "../provider";
import { previewFingerprint } from "../../donors/normalize";
import {
  bulkInput,
  bulkConfirm,
  cloneSchema,
  presetSchema,
  plan,
  sameConfig,
  type BulkInput,
  type PlanRow,
} from "./validation";
type Request = typeof adsRequests.$inferSelect;
function fail(code: string, message: string): never {
  throw new AppError(422, code, message);
}
import { AppError } from "../../http/errors";
export class BulkAdsService {
  private ads: AdsService;
  constructor(
    private db: AppDatabase,
    private resolve: (s: "LIVE" | "MOCK") => AdsProvider = adsProvider,
  ) {
    this.ads = new AdsService(db, resolve);
  }
  private async source(actor: Actor | null, id: string) {
    const [j] = await this.db
      .select()
      .from(adsRequests)
      .where(eq(adsRequests.id, id));
    if (!j) fail("CLONE_SOURCE", "Không tìm thấy source request.");
    await this.ads.authorize(actor, j.pageId, j.accountId);
    if (
      j.state !== "SUCCEEDED" ||
      !j.campaignId ||
      !j.adSetId ||
      !j.creativeId ||
      !j.adId
    )
      fail("CLONE_SOURCE", "Chỉ dùng Ads đã xác minh đủ IDs PAUSED trong app.");
    return j;
  }
  async cloneBlueprint(actor: Actor | null, input: unknown) {
    requirePermission(actor, "ads:write");
    const clone = cloneSchema.parse(input),
      seed = await this.source(actor, clone.sourceRequestId);
    const all =
      clone.level === "AD"
        ? [seed]
        : await this.db
            .select()
            .from(adsRequests)
            .where(
              and(
                eq(adsRequests.source, seed.source),
                eq(
                  clone.level === "CAMPAIGN"
                    ? adsRequests.campaignId
                    : adsRequests.adSetId,
                  clone.level === "CAMPAIGN" ? seed.campaignId! : seed.adSetId!,
                ),
              ),
            )
            .orderBy(adsRequests.createdAt)
            .limit(101);
    if (all.length * clone.copies > 100)
      fail(
        "CLONE_LIMIT",
        "Một batch tối đa 100 Ads; không cắt bớt source âm thầm.",
      );
    for (const j of all) await this.source(actor, j.id);
    const items: BulkInput["items"] = [];
    for (let copyIndex = 0; copyIndex < clone.copies; copyIndex++)
      for (const j of all) {
        const s = j.snapshot,
          story = s.creative.object_story_spec as
            | {
                video_data?: {
                  message?: string;
                  call_to_action?: { type?: "LEARN_MORE" | "SHOP_NOW" };
                };
              }
            | undefined;
        const budget =
          s.campaign.daily_budget ??
          s.campaign.lifetime_budget ??
          s.adSet.daily_budget ??
          s.adSet.lifetime_budget;
        items.push({
          key: randomUUID(),
          publishJobId: j.publishJobId,
          donorVersionId: j.donorVersionId,
          cloneSourceId: j.id,
          copyIndex,
          overrides: {
            mode: j.mode as AdsInput["mode"],
            objective: s.campaign.objective as AdsInput["objective"],
            optimization: s.adSet.optimization_goal as AdsInput["optimization"],
            budget: typeof budget === "string" ? budget : undefined,
            facebookOnly: true,
            acknowledgeDonorChanges: false,
            message: story?.video_data?.message,
            cta: story?.video_data?.call_to_action?.type,
          },
        });
      }
    return {
      clone,
      items,
      name: `Clone ${clone.level}`,
      structure: "PER_VIDEO" as const,
      warnings: [
        "Clone chỉ bao gồm cấu trúc đã được xác minh và lưu trong app, không khẳng định sao chép Ads ngoài app.",
        "New Creative phải dùng SubID/Custom Link mới; lịch cũ bị loại.",
      ],
    };
  }
  async prepareTracking(actor: Actor | null, input: unknown) {
    requirePermission(actor, "ads:write");
    const v = z
      .object({
        requestKey: z.string().uuid(),
        affiliateAccount: z.string(),
        items: z
          .array(
            z
              .object({
                key: z.string().uuid(),
                publishJobId: z.string().uuid(),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .parse(input);
    if (new Set(v.items.map((i) => i.key)).size !== v.items.length)
      fail("BULK_ROW_KEY", "Mỗi row key cần riêng.");
    const fingerprint = previewFingerprint(v);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847309)`);
      const [old] = await tx
        .select()
        .from(adsPreparations)
        .where(
          and(
            eq(adsPreparations.createdBy, actor.id),
            eq(adsPreparations.requestKey, v.requestKey),
          ),
        );
      const ads = new AdsService(tx as unknown as AppDatabase, this.resolve);
      for (const i of v.items) await ads.resources(actor, i.publishJobId);
      if (old) {
        if (old.fingerprint !== fingerprint)
          fail("BULK_PREPARE_KEY", "Preparation key đã dùng với rows khác.");
        return old.rows;
      }
      const rows = [];
      for (const i of v.items) {
        const [t] = await ads.prepareTracking(actor, {
          publishJobId: i.publishJobId,
          affiliateAccount: v.affiliateAccount,
        });
        rows.push({ ...i, trackingId: t.id, subId: t.subId });
      }
      await tx.insert(adsPreparations).values({
        requestKey: v.requestKey,
        fingerprint,
        createdBy: actor.id,
        rows,
      });
      return rows;
    });
  }
  private async preset(actor: Actor | null, id: string) {
    const [p] = await this.db
      .select()
      .from(adsPresets)
      .where(eq(adsPresets.id, id));
    if (!p) fail("ADS_PRESET", "Không tìm thấy preset.");
    const [v] = await this.db
      .select()
      .from(donorVersions)
      .where(eq(donorVersions.id, p.donorVersionId));
    const [d] = await this.db
      .select()
      .from(donors)
      .where(eq(donors.id, v.donorId));
    await requireResource(this.db, actor, "account", d.accountId);
    return p;
  }
  async presets(actor: Actor | null) {
    requirePermission(actor, "ads:write");
    const result = [];
    for (const p of await this.db
      .select()
      .from(adsPresets)
      .orderBy(desc(adsPresets.createdAt))
      .limit(200)) {
      try {
        await this.preset(actor, p.id);
        result.push(p);
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== "RESOURCE_FORBIDDEN")
          throw e;
      }
    }
    return result;
  }
  async savePreset(actor: Actor | null, input: unknown) {
    requirePermission(actor, "ads:write");
    const v = presetSchema.parse(input),
      [version] = await this.db
        .select()
        .from(donorVersions)
        .where(eq(donorVersions.id, v.donorVersionId));
    if (!version) fail("ADS_DONOR", "Version không tồn tại.");
    const [donor] = await this.db
      .select()
      .from(donors)
      .where(eq(donors.id, version.donorId));
    await requireResource(this.db, actor, "account", donor.accountId);
    const overrides = {
      ...v.overrides,
      acknowledgeDonorChanges: false,
      startTime: undefined,
      endTime: undefined,
    };
    if (v.id) {
      const old = await this.preset(actor, v.id);
      if (
        old.createdBy !== actor.id &&
        !["OWNER", "ADMIN"].includes(actor.role)
      )
        fail("ADS_PRESET_OWNER", "Chỉ tác giả/quản trị sửa preset.");
      await this.db
        .update(adsPresets)
        .set({
          name: v.name,
          donorVersionId: v.donorVersionId,
          structure: v.structure,
          overrides,
          updatedAt: new Date(),
        })
        .where(eq(adsPresets.id, v.id));
      return { id: v.id };
    }
    return (
      await this.db
        .insert(adsPresets)
        .values({
          name: v.name,
          donorVersionId: v.donorVersionId,
          structure: v.structure,
          overrides,
          createdBy: actor.id,
        })
        .returning({ id: adsPresets.id })
    )[0];
  }
  async preview(actor: Actor | null, input: unknown) {
    requirePermission(actor, "ads:write");
    const v = bulkInput.parse(input),
      preset = v.presetId ? await this.preset(actor, v.presetId) : undefined;
    const defaults = { ...preset?.overrides, ...v.overrides };
    let expectedSources: Request[] = [];
    if (v.clone) {
      const b = await this.cloneBlueprint(actor, v.clone);
      expectedSources = await Promise.all(
        [...new Set(b.items.map((i) => i.cloneSourceId!))].map((id) =>
          this.source(actor, id),
        ),
      );
      const expected = new Set(
        b.items.map((i) => `${i.cloneSourceId}:${i.copyIndex}`),
      );
      const actual = new Set(
        v.items.map((i) => `${i.cloneSourceId}:${i.copyIndex}`),
      );
      if (
        expected.size !== actual.size ||
        [...expected].some((k) => !actual.has(k)) ||
        v.items.length !== expected.size
      )
        fail(
          "CLONE_MEMBERS_CHANGED",
          "Membership source/copies đã đổi hoặc clone rows thiếu/trùng. Đọc blueprint mới.",
        );
    } else if (
      v.items.some((i) => i.cloneSourceId || i.copyIndex !== undefined)
    )
      fail("CLONE_ORIGIN", "Lineage cần clone origin hợp lệ.");
    const parent = v.parentRequestId
      ? await this.source(actor, v.parentRequestId)
      : undefined;
    if (
      !v.clone &&
      ["APPEND_ADS", "APPEND_ADSETS"].includes(v.structure) &&
      !parent
    )
      fail("BULK_PARENT", "Chọn parent request verified PAUSED.");
    const rows: Array<
      PlanRow & {
        input: AdsInput;
        donorVersionId: string;
        publishJobId: string;
        trackingId: string | null;
        linkVersionId: string | null;
        pageName: string;
        accountName: string;
        donorName: string;
        cloneSourceId: string | null;
        cloneLevel: string | null;
        warnings: string[];
      }
    > = [];
    for (const [index, item] of v.items.entries()) {
      const source = item.cloneSourceId
        ? expectedSources.find((s) => s.id === item.cloneSourceId)
        : undefined;
      const version =
        item.donorVersionId ?? v.donorVersionId ?? preset?.donorVersionId;
      if (!version) fail("BULK_DONOR", "Chọn Donor/version hoặc preset.");
      if (
        source &&
        (source.publishJobId !== item.publishJobId ||
          source.donorVersionId !== version)
      )
        fail(
          "CLONE_CONTENT",
          "Clone phải giữ đúng video/Donor source; dùng bulk mới nếu muốn đổi content.",
        );
      const value = adsInput.parse({
        ...defaults,
        ...Object.fromEntries(
          Object.entries(item.overrides ?? {}).filter(
            ([, value]) => value !== undefined,
          ),
        ),
        acknowledgeDonorChanges:
          defaults.acknowledgeDonorChanges === true ||
          item.overrides?.acknowledgeDonorChanges === true,
        publishJobId: item.publishJobId,
        donorVersionId: version,
        name: `${v.name.slice(0, 50)} ${index + 1}`,
        trackingId: item.trackingId,
      });
      const p = await this.ads.preview(actor, value),
        r = await this.ads.resources(actor, item.publishJobId);
      const scope = `${p.source}:${p.pageId}:${p.accountId}`;
      let campaignGroup = `${scope}:${item.key}`,
        adSetGroup = `${scope}:${item.key}`,
        campaignRefId: string | null = null,
        adSetRefId: string | null = null;
      let chosenParent: Request | undefined,
        keepSet = false;
      if (v.clone) {
        if (v.clone.level === "AD" && !v.clone.newParents) {
          chosenParent = source;
          keepSet = true;
        } else if (v.clone.level === "ADSET" && !v.clone.newParents)
          chosenParent = source;
        campaignGroup = `${scope}:copy${item.copyIndex}:${source!.campaignId}`;
        adSetGroup = `${scope}:copy${item.copyIndex}:${source!.adSetId}`;
      } else if (v.structure === "CAMPAIGN_PER_PAGE") {
        campaignGroup = scope;
      } else if (v.structure === "ADSET_PER_PAGE") {
        campaignGroup = scope;
        adSetGroup = scope;
      } else if (v.structure === "APPEND_ADSETS") chosenParent = parent;
      else if (v.structure === "APPEND_ADS") {
        chosenParent = parent;
        keepSet = true;
      }
      const findings = [...p.findings];
      if (chosenParent) {
        if (
          chosenParent.pageId !== p.pageId ||
          chosenParent.accountId !== p.accountId ||
          chosenParent.source !== p.source
        )
          fail(
            "BULK_PARENT_SCOPE",
            "Parent và rows phải cùng Page/TKQC/source.",
          );
        const c = await this.ads.material(chosenParent, "campaign");
        campaignRefId = c.owner.id;
        campaignGroup = `parent:${c.owner.id}`;
        if (!sameConfig(c.owner.snapshot.campaign, p.snapshot.campaign))
          findings.push({
            state: "NEEDS_FIX",
            field: "parent.campaign",
            reason: "Parent Campaign config/budget không khớp.",
            fix: "Giữ cấu hình parent hoặc chọn parents mới.",
          });
        try {
          await r.provider.verify(
            r.ctx,
            "campaign",
            c.id!,
            this.ads.payload(c.owner, "campaign"),
            c.owner.id,
          );
        } catch (e) {
          findings.push({
            state: "UNKNOWN",
            field: "parent.campaign",
            reason: e instanceof AppError ? e.message : "Chưa xác minh parent.",
            fix: "Kiểm tra parent PAUSED rồi preview lại.",
          });
        }
        if (keepSet) {
          const s = await this.ads.material(chosenParent, "adSet");
          adSetRefId = s.owner.id;
          adSetGroup = `parent:${s.owner.id}`;
          if (!sameConfig(s.owner.snapshot.adSet, p.snapshot.adSet))
            findings.push({
              state: "NEEDS_FIX",
              field: "parent.adSet",
              reason: "Target/budget/lịch parent Ad Set khác.",
              fix: "Không sửa parent qua clone; dùng parents mới.",
            });
          try {
            await r.provider.verify(
              r.ctx,
              "adSet",
              s.id!,
              this.ads.payload(s.owner, "adSet"),
              s.owner.id,
            );
          } catch (e) {
            findings.push({
              state: "UNKNOWN",
              field: "parent.adSet",
              reason:
                e instanceof AppError ? e.message : "Chưa xác minh parent.",
              fix: "Kiểm tra parent PAUSED.",
            });
          }
        }
      }
      rows.push({
        ...p,
        key: item.key,
        campaignGroup,
        adSetGroup,
        campaignOwnerKey: null,
        adSetOwnerKey: null,
        campaignRefId,
        adSetRefId,
        findings,
        cloneSourceId: source?.id ?? null,
        cloneLevel: v.clone?.level ?? null,
      });
    }
    if (new Set(rows.map((r) => r.source)).size !== 1)
      fail("BULK_SOURCE", "Một batch không trộn LIVE và MOCK.");
    const tracks = rows
      .filter((r) => r.input.mode === "NEW_CREATIVE" && r.trackingId)
      .map((r) => r.trackingId);
    if (new Set(tracks).size !== tracks.length)
      fail("BULK_TRACKING", "Mỗi New Creative cần tracking/SubID riêng.");
    const summary = plan(rows);
    const state = rows.every((r) => !r.findings.length)
      ? "READY"
      : rows.some((r) => r.findings.some((f) => f.state === "NEEDS_FIX"))
        ? "NEEDS_FIX"
        : rows.some((r) => r.findings.some((f) => f.state === "UNSUPPORTED"))
          ? "UNSUPPORTED"
          : "UNKNOWN";
    const fingerprint = previewFingerprint({
      input: v,
      preset: preset ?? null,
      rows: rows.map((r) => ({
        key: r.key,
        publishJobId: r.publishJobId,
        donorVersionId: r.donorVersionId,
        trackingId: r.trackingId,
        linkVersionId: r.linkVersionId,
        snapshot: r.snapshot,
        campaignGroup: r.campaignGroup,
        adSetGroup: r.adSetGroup,
        campaignRefId: r.campaignRefId,
        adSetRefId: r.adSetRefId,
        cloneSourceId: r.cloneSourceId,
      })),
      summary,
    });
    return {
      input: v,
      state,
      rows,
      ...summary,
      fingerprint,
      warnings: [
        "Mọi Campaign/Ad Set/Ad mới PAUSED, ngân sách là cấu hình/cap, không phải spend dự báo.",
        "Daily/Lifetime/currency/source tách riêng; parent budget dùng chung không nhân theo số Ads.",
        "Pause batch không thu hồi request đang gửi; UNKNOWN cần verified recovery, không retry mù.",
      ],
    };
  }
  async confirm(actor: Actor | null, input: unknown) {
    requirePermission(actor, "ads:write");
    const v = bulkConfirm.parse(input),
      digest = previewFingerprint(v.input);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847307)`);
      const [old] = await tx
        .select()
        .from(adsBatches)
        .where(
          and(
            eq(adsBatches.createdBy, actor.id),
            eq(adsBatches.requestKey, v.requestKey),
          ),
        );
      if (old) {
        await this.detail(actor, old.id);
        if (
          old.fingerprint !== v.fingerprint ||
          old.inputFingerprint !== digest
        )
          fail("BULK_REQUEST_KEY", "Key đã dùng với preview khác.");
        return { id: old.id, replayed: true };
      }
      const service = new BulkAdsService(
          tx as unknown as AppDatabase,
          this.resolve,
        ),
        p = await service.preview(actor, v.input);
      if (p.state !== "READY")
        fail("BULK_NOT_READY", "Sửa mọi row findings trước confirm.");
      if (p.fingerprint !== v.fingerprint)
        fail(
          "BULK_PREVIEW_CHANGED",
          "Link/template/membership/quyền/config đã đổi sau preview.",
        );
      const [batch] = await tx
        .insert(adsBatches)
        .values({
          requestKey: v.requestKey,
          fingerprint: v.fingerprint,
          inputFingerprint: digest,
          name: v.input.name,
          source: p.rows[0].source,
          structure: v.input.clone
            ? `CLONE_${v.input.clone.level}`
            : v.input.structure,
          counts: p.counts,
          budgets: p.budgets,
          createdBy: actor.id,
        })
        .returning({ id: adsBatches.id });
      const refs = new Map(p.rows.map((r) => [r.key, randomUUID()]));
      for (const [index, row] of p.rows.entries())
        await tx.insert(adsRequests).values({
          id: refs.get(row.key)!,
          requestKey: randomUUID(),
          fingerprint: previewFingerprint(row),
          publishJobId: row.publishJobId,
          donorVersionId: row.donorVersionId,
          pageId: row.pageId,
          accountId: row.accountId,
          source: row.source,
          mode: row.input.mode,
          trackingId: row.trackingId,
          linkVersionId: row.linkVersionId,
          snapshot: row.snapshot,
          createdBy: actor.id,
          bulkBatchId: batch.id,
          bulkIndex: index,
          campaignRefId:
            row.campaignRefId ??
            (row.campaignOwnerKey ? refs.get(row.campaignOwnerKey) : null),
          adSetRefId:
            row.adSetRefId ??
            (row.adSetOwnerKey ? refs.get(row.adSetOwnerKey) : null),
          cloneSourceId: row.cloneSourceId,
          cloneLevel: row.cloneLevel,
        });
      await tx.insert(adsBatchHistory).values({
        batchId: batch.id,
        actorId: actor.id,
        action: "CONFIRMED_PAUSED",
        details: {
          counts: p.counts,
          budgets: p.budgets,
          source: p.rows[0].source,
          clone: v.input.clone ?? null,
        },
      });
      return { id: batch.id, replayed: false };
    });
  }
  async list(actor: Actor | null) {
    requirePermission(actor, "ads:write");
    const result = [];
    for (const b of await this.db
      .select()
      .from(adsBatches)
      .orderBy(desc(adsBatches.createdAt))
      .limit(100)) {
      try {
        const detail = await this.detail(actor, b.id);
        result.push({ ...b, progress: detail.progress });
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== "RESOURCE_FORBIDDEN")
          throw e;
      }
    }
    return result;
  }
  async detail(actor: Actor | null, id: string) {
    requirePermission(actor, "ads:write");
    z.string().uuid().parse(id);
    const [batch] = await this.db
      .select()
      .from(adsBatches)
      .where(eq(adsBatches.id, id));
    if (!batch) fail("BULK_NOT_FOUND", "Không tìm thấy batch.");
    const requests = await this.db
      .select()
      .from(adsRequests)
      .where(eq(adsRequests.bulkBatchId, id))
      .orderBy(adsRequests.bulkIndex);
    for (const r of requests)
      await this.ads.authorize(actor, r.pageId, r.accountId);
    const progress = {
      total: requests.length,
      success: requests.filter((r) => r.state === "SUCCEEDED").length,
      failed: requests.filter((r) => r.state === "FAILED").length,
      unknown: requests.filter((r) => r.state === "UNKNOWN").length,
      waiting: requests.filter((r) => r.state === "WAITING").length,
      cancelled: requests.filter((r) => r.state === "CANCELLED").length,
      percent: requests.length
        ? Math.floor(
            (requests.filter((r) =>
              ["SUCCEEDED", "CANCELLED"].includes(r.state),
            ).length *
              100) /
              requests.length,
          )
        : 0,
    };
    return {
      batch,
      requests: requests.map(({ leaseToken, leaseUntil, enqueuedAt, ...r }) => {
        void leaseToken;
        void leaseUntil;
        void enqueuedAt;
        return r;
      }),
      progress,
      requestHistory: requests.length
        ? await this.db
            .select()
            .from(adsHistory)
            .where(
              inArray(
                adsHistory.requestId,
                requests.map((r) => r.id),
              ),
            )
            .orderBy(desc(adsHistory.createdAt))
            .limit(1000)
        : [],
      history: await this.db
        .select()
        .from(adsBatchHistory)
        .where(eq(adsBatchHistory.batchId, id))
        .orderBy(desc(adsBatchHistory.createdAt)),
    };
  }
  async action(actor: Actor | null, input: unknown) {
    const v = z
      .object({
        id: z.string().uuid(),
        action: z.enum(["pause", "resume", "retry"]),
      })
      .strict()
      .parse(input);
    await this.detail(actor, v.id);
    if (v.action === "retry") {
      const rows = await this.db
        .select()
        .from(adsRequests)
        .where(
          and(
            eq(adsRequests.bulkBatchId, v.id),
            eq(adsRequests.state, "FAILED"),
          ),
        );
      for (const r of rows)
        await this.ads.action(actor, { id: r.id, action: "retry" });
    }
    await this.db.transaction(async (tx) => {
      const [b] = await tx
        .select()
        .from(adsBatches)
        .where(eq(adsBatches.id, v.id))
        .for("update");
      if (v.action === "pause" && b.state !== "RUNNING")
        fail("BULK_ACTION", "Chỉ pause batch RUNNING.");
      if (v.action === "resume" && b.state !== "PAUSED")
        fail("BULK_ACTION", "Chỉ resume batch PAUSED.");
      const state =
        v.action === "pause"
          ? "PAUSED"
          : v.action === "resume"
            ? "RUNNING"
            : v.action === "retry" && b.state === "NEEDS_ACTION"
              ? "RUNNING"
              : b.state;
      await tx
        .update(adsBatches)
        .set({ state, updatedAt: new Date() })
        .where(eq(adsBatches.id, b.id));
      if (v.action === "pause")
        await tx
          .update(adsRequests)
          .set({
            generation: sql`${adsRequests.generation}+1`,
            enqueuedAt: null,
          })
          .where(
            and(
              eq(adsRequests.bulkBatchId, b.id),
              inArray(adsRequests.state, ["QUEUED", "WAITING"]),
            ),
          );
      await tx.insert(adsBatchHistory).values({
        batchId: b.id,
        actorId: actor!.id,
        action: v.action.toUpperCase(),
        details: { unknownNotRetried: true },
      });
    });
    return { id: v.id };
  }
}
