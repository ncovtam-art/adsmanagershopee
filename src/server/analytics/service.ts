import { z } from "zod";
import { and, eq, inArray, gte, lte, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db";
import {
  adAccounts,
  metaConnections,
  insightDays,
  insightAds,
  insightRuns,
  analyticsPolicies,
  trackingRecords,
  commissionRows,
  commissionReviews,
  commissionImports,
  pages,
  auditLogs,
  donors,
  donorVersions,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { accessibleIds, requireResource } from "../meta/access";
import { AppError } from "../http/errors";
import { providerFor } from "../meta/service";
import { seal, unseal } from "../meta/crypto";
import type { MetaProvider, Source } from "../meta/types";
import { ambiguousTrackingIds } from "../shopee/link-ambiguity";
import {
  days,
  rangeSchema,
  querySchema,
  parseAdsCsv,
  fingerprint,
  insightSchema,
  micros,
  decimal,
  ratio,
  localDay,
  type Insight,
} from "./engine";
const policySchema = z
  .object({
    accountId: z.string().uuid(),
    estimatedStatuses: z
      .array(z.enum(["PENDING", "APPROVED", "PAID"]))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    mappingAcknowledged: z.boolean(),
    otherCostPerDay: z.string().regex(/^\d{1,24}(\.\d{1,6})?$/),
    autoSync: z.boolean(),
    lifetimeStart: z.iso.date().nullable(),
  })
  .strict();
const syncSchema = z
  .object({
    accountId: z.string().uuid(),
    since: z.iso.date(),
    until: z.iso.date(),
    replace: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, c) => {
    if (!rangeSchema.safeParse(v).success)
      c.addIssue({ code: "custom", message: "Kỳ đồng bộ không hợp lệ." });
  });
const csvOptions = syncSchema.safeExtend({
  complete: z.literal(true),
  expectedFingerprint: z.string().length(64).optional(),
});
type Account = typeof adAccounts.$inferSelect;
type Aggregate = {
  key: string;
  name: string;
  campaignId: string;
  adSetId: string | null;
  adId: string | null;
  pageNames: string[];
  pageIds: string[];
  subIds: string[];
  contentRefs: string[];
  donorNames: string[];
  postIds: string[];
  adNames: string[];
  statuses: string[];
  days: Array<{ day: string; spend: string }>;
  spend: bigint;
  impressions: bigint;
  clicks: bigint;
  linkClicks: bigint | null;
  lpv: bigint | null;
  commissions: Record<"PENDING" | "APPROVED" | "PAID" | "REJECTED", bigint>;
  flags: Set<string>;
  eligibleRows: number;
  lastSyncedAt: string | null;
  providers: Set<string>;
};
const emptyMoney = () => ({
  PENDING: 0n,
  APPROVED: 0n,
  PAID: 0n,
  REJECTED: 0n,
});
const defaultPolicy = {
  estimatedStatuses: ["PENDING", "APPROVED", "PAID"] as Array<
    "PENDING" | "APPROVED" | "PAID"
  >,
  mappingAcknowledged: false,
  otherCostPerDay: "0.000000",
  autoSync: false,
  lifetimeStart: null as string | null,
};
export class AnalyticsService {
  constructor(
    private db: AppDatabase,
    private providers: (source: Source) => MetaProvider = providerFor,
  ) {}
  async accounts(actor: Actor | null, source: Source) {
    requirePermission(actor, "finance:read");
    const ids = await accessibleIds(this.db, actor, "account");
    if (ids?.length === 0) return [];
    return this.db
      .select({
        id: adAccounts.id,
        name: adAccounts.name,
        metaId: adAccounts.metaId,
        currency: adAccounts.currency,
        timezone: adAccounts.timezone,
        source: adAccounts.source,
        status: adAccounts.status,
      })
      .from(adAccounts)
      .where(
        and(
          eq(adAccounts.source, source),
          ids ? inArray(adAccounts.id, ids) : undefined,
        ),
      );
  }
  private async account(actor: Actor | null, id: string) {
    requirePermission(actor, "finance:read");
    await requireResource(this.db, actor, "account", id);
    const [a] = await this.db
      .select()
      .from(adAccounts)
      .where(eq(adAccounts.id, id));
    if (!a)
      throw new AppError(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy TKQC.");
    return a;
  }
  async policy(actor: Actor | null, id: string) {
    await this.account(actor, id);
    const [p] = await this.db
      .select()
      .from(analyticsPolicies)
      .where(eq(analyticsPolicies.accountId, id));
    return p ?? { accountId: id, ...defaultPolicy };
  }
  async savePolicy(actor: Actor | null, input: unknown) {
    requirePermission(actor, "settings:write");
    const v = policySchema.parse(input);
    await this.account(actor, v.accountId);
    return this.db.transaction(async (tx) => {
      const data = {
        ...v,
        otherCostPerDay: decimal(micros(v.otherCostPerDay)),
        updatedBy: actor.id,
        updatedAt: new Date(),
        nextSyncAt: v.autoSync ? new Date() : null,
      };
      const [p] = await tx
        .insert(analyticsPolicies)
        .values(data)
        .onConflictDoUpdate({ target: analyticsPolicies.accountId, set: data })
        .returning();
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "ANALYTICS_POLICY_CHANGED",
        resourceId: v.accountId,
        metadata: { ...v },
      });
      return p;
    });
  }
  private checkRows(
    account: Account,
    rows: Insight[],
    since: string,
    until: string,
  ) {
    const keys = new Set<string>();
    const hierarchy = new Map<string, string>();
    for (const raw of rows) {
      const r = insightSchema.parse(raw);
      if (
        r.accountId !== account.metaId ||
        r.currency !== account.currency ||
        r.timezone !== account.timezone ||
        r.day < since ||
        r.day > until
      )
        throw new AppError(
          422,
          "INSIGHTS_DIMENSIONS",
          "TKQC/currency/timezone/ngày không khớp snapshot đã chọn.",
        );
      const key = `${r.day}:${r.adId}`;
      if (keys.has(key))
        throw new AppError(
          422,
          "INSIGHTS_DUPLICATE",
          "Trùng Ad/ngày hoặc breakdown; chưa lưu.",
        );
      keys.add(key);
      const relation = `${r.campaignId}:${r.adSetId}:${r.pageMetaId}`;
      if (hierarchy.has(r.adId) && hierarchy.get(r.adId) !== relation)
        throw new AppError(
          422,
          "INSIGHTS_HIERARCHY",
          "Một Ad có quan hệ cha/Page khác nhau trong cùng kỳ; chưa lưu.",
        );
      hierarchy.set(r.adId, relation);
    }
  }
  private async store(
    actor: Actor,
    account: Account,
    rows: Insight[],
    v: { since: string; until: string; replace: boolean },
    provider: "API" | "CSV",
    raw?: Buffer,
  ) {
    this.checkRows(account, rows, v.since, v.until);
    const hash = fingerprint(rows, v),
      runId = randomUUID();
    return this.db.transaction(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${account.id},847305)) AS locked`,
      );
      if (!lock.rows[0].locked)
        throw new AppError(
          409,
          "SYNC_BUSY",
          "TKQC đang được cập nhật. Chờ rồi thử lại.",
        );
      const [current] = await tx
        .select()
        .from(adAccounts)
        .where(eq(adAccounts.id, account.id))
        .for("share");
      if (
        !current ||
        current.connectionId !== account.connectionId ||
        current.currency !== account.currency ||
        current.timezone !== account.timezone ||
        current.source !== account.source
      )
        throw new AppError(
          409,
          "ACCOUNT_CHANGED",
          "TKQC đã thay đổi. Kiểm tra và đồng bộ lại.",
        );
      const existing = await tx
        .select()
        .from(insightDays)
        .where(
          and(
            eq(insightDays.accountId, account.id),
            gte(insightDays.day, v.since),
            lte(insightDays.day, v.until),
          ),
        );
      if (existing.some((d) => d.provider !== provider) && !v.replace)
        throw new AppError(
          409,
          "SPEND_CONFLICT",
          "Kỳ này đã có chi phí từ nguồn khác. Xem preview và xác nhận thay toàn bộ snapshot theo ngày; không cộng hai nguồn.",
        );
      const now = new Date();
      await tx.insert(insightRuns).values({
        id: runId,
        accountId: account.id,
        provider,
        since: v.since,
        until: v.until,
        state: "APPLIED",
        fingerprint: hash,
        encryptedRaw: raw ? seal(raw.toString("base64")) : null,
        actorId: actor.id,
      });
      let changed = 0,
        duplicate = 0;
      for (const day of days(v.since, v.until)) {
        const selected = rows.filter((r) => r.day === day);
        const dayHash = fingerprint(selected, { since: day, until: day });
        const old = existing.find((d) => d.day === day);
        if (old?.fingerprint === dayHash && old.provider === provider) {
          await tx
            .update(insightDays)
            .set({ syncedAt: now, runId })
            .where(eq(insightDays.id, old.id));
          duplicate++;
          continue;
        }
        if (old) await tx.delete(insightDays).where(eq(insightDays.id, old.id));
        const [d] = await tx
          .insert(insightDays)
          .values({
            accountId: account.id,
            day,
            provider,
            fingerprint: dayHash,
            currency: account.currency,
            timezone: account.timezone,
            syncedAt: now,
            runId,
          })
          .returning();
        // Chia lô nhỏ để giữ số tham số PostgreSQL trong giới hạn; ghi nguyên tử.
        for (let offset = 0; offset < selected.length; offset += 250)
          await tx
            .insert(insightAds)
            .values(
              selected
                .slice(offset, offset + 250)
                .map((r) => ({ ...r, dayId: d.id, accountId: account.id })),
            );
        changed++;
      }
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "INSIGHTS_SNAPSHOT_APPLIED",
        resourceId: account.id,
        metadata: {
          provider,
          source: account.source,
          since: v.since,
          until: v.until,
          changed,
          duplicate,
          replace: v.replace,
          fingerprint: hash,
        },
      });
      return {
        runId,
        changed,
        duplicate,
        rows: rows.length,
        source: account.source,
        provider,
      };
    });
  }
  async previewCsv(actor: Actor | null, buffer: Buffer, input: unknown) {
    requirePermission(actor, "meta:manage");
    const v = syncSchema.parse(input),
      a = await this.account(actor, v.accountId),
      rows = parseAdsCsv(buffer);
    this.checkRows(a, rows, v.since, v.until);
    const existing = await this.db
      .select()
      .from(insightDays)
      .where(
        and(
          eq(insightDays.accountId, a.id),
          gte(insightDays.day, v.since),
          lte(insightDays.day, v.until),
        ),
      );
    return {
      fingerprint: fingerprint(rows, v),
      rows: rows.length,
      days: days(v.since, v.until).length,
      spend: decimal(rows.reduce((s, r) => s + micros(r.spend), 0n)),
      currency: a.currency,
      source: a.source,
      conflictingDays: existing
        .filter((d) => d.provider !== "CSV")
        .map((d) => d.day),
      sample: rows.slice(0, 10),
      reportingLevel: "ad",
      emptyDays: days(v.since, v.until).filter(
        (d) => !rows.some((r) => r.day === d),
      ),
    };
  }
  async importCsv(actor: Actor | null, buffer: Buffer, input: unknown) {
    requirePermission(actor, "meta:manage");
    const v = csvOptions.parse(input),
      a = await this.account(actor, v.accountId),
      rows = parseAdsCsv(buffer);
    if (
      !v.expectedFingerprint ||
      v.expectedFingerprint !== fingerprint(rows, v)
    )
      throw new AppError(
        409,
        "PREVIEW_CHANGED",
        "Cần xem preview đúng tệp và kỳ báo cáo trước khi lưu.",
      );
    return this.store(actor, a, rows, v, "CSV", buffer);
  }
  async sync(actor: Actor | null, input: unknown) {
    requirePermission(actor, "meta:manage");
    const v = syncSchema.parse(input),
      a = await this.account(actor, v.accountId);
    try {
      const [c] = await this.db
        .select()
        .from(metaConnections)
        .where(eq(metaConnections.id, a.connectionId));
      if (
        a.status !== "AUTHORIZED" ||
        !c ||
        c.expiresAt.getTime() <= Date.now()
      )
        throw new AppError(
          401,
          "META_TOKEN_EXPIRED",
          "Kết nối/TKQC không còn hoạt động. Kết nối Facebook lại.",
        );
      if (!c.scopes.some((s) => ["ads_read", "ads_management"].includes(s)))
        throw new AppError(
          403,
          "META_PERMISSION",
          "Kết nối thiếu quyền đọc Ads Insights.",
        );
      const p = this.providers(a.source);
      if (!p.insights)
        throw new AppError(
          503,
          "INSIGHTS_PROVIDER",
          "Provider chưa hỗ trợ Insights.",
        );
      const rows = await p.insights(
        unseal(c.encryptedToken),
        a,
        v.since,
        v.until,
      );
      return await this.store(actor, a, rows, v, "API");
    } catch (e) {
      if (e instanceof AppError)
        await this.db.insert(insightRuns).values({
          accountId: a.id,
          provider: "API",
          since: v.since,
          until: v.until,
          state: "FAILED",
          errorCode: e.code,
          actorId: actor.id,
        });
      throw e;
    }
  }
  async history(actor: Actor | null, accountId: string) {
    await this.account(actor, accountId);
    return this.db
      .select({
        id: insightRuns.id,
        provider: insightRuns.provider,
        since: insightRuns.since,
        until: insightRuns.until,
        state: insightRuns.state,
        errorCode: insightRuns.errorCode,
        createdAt: insightRuns.createdAt,
      })
      .from(insightRuns)
      .where(eq(insightRuns.accountId, accountId))
      .orderBy(desc(insightRuns.createdAt))
      .limit(30);
  }
  async report(actor: Actor | null, input: unknown) {
    requirePermission(actor, "finance:read");
    const q = querySchema.parse(input);
    if (!q.accountId)
      return {
        query: q,
        rows: [],
        totals: null,
        quality: [] as string[],
        coverage: { expected: 0, present: 0 },
        policy: null,
        account: null,
      };
    const account = await this.account(actor, q.accountId);
    if (account.source !== q.source)
      throw new AppError(
        422,
        "SOURCE_MISMATCH",
        "TKQC không thuộc nguồn đang xem.",
      );
    const pageIds = await accessibleIds(this.db, actor, "page");
    if (q.pageId) await requireResource(this.db, actor, "page", q.pageId);
    const [savedPolicy] = await this.db
      .select()
      .from(analyticsPolicies)
      .where(eq(analyticsPolicies.accountId, account.id));
    const policy = savedPolicy ?? { accountId: account.id, ...defaultPolicy };
    const pageList =
      pageIds?.length === 0
        ? []
        : await this.db
            .select({ id: pages.id, metaId: pages.metaId, name: pages.name })
            .from(pages)
            .where(
              and(
                eq(pages.source, q.source),
                pageIds ? inArray(pages.id, pageIds) : undefined,
                q.pageId ? eq(pages.id, q.pageId) : undefined,
              ),
            );
    const pageMap = new Map(pageList.map((p) => [p.metaId, p]));
    const snapshots = await this.db
      .select()
      .from(insightDays)
      .where(
        and(
          eq(insightDays.accountId, account.id),
          gte(insightDays.day, q.since),
          lte(insightDays.day, q.until),
        ),
      );
    if (
      snapshots.some(
        (s) =>
          s.currency !== account.currency || s.timezone !== account.timezone,
      )
    )
      throw new AppError(
        409,
        "REPORTING_DIMENSIONS_CHANGED",
        "Currency/timezone của TKQC đã đổi. Đồng bộ hoặc nhập lại toàn bộ kỳ trước khi xem báo cáo; không cộng các đơn vị khác nhau.",
      );
    const facts = snapshots.length
      ? await this.db
          .select({ fact: insightAds, day: insightDays })
          .from(insightAds)
          .innerJoin(insightDays, eq(insightDays.id, insightAds.dayId))
          .where(
            inArray(
              insightAds.dayId,
              snapshots.map((s) => s.id),
            ),
          )
          .limit(10001)
      : [];
    if (facts.length > 10000)
      throw new AppError(
        413,
        "REPORT_TOO_LARGE",
        "Kỳ báo cáo vượt 10.000 Ad/ngày. Chọn kỳ ngắn hơn; không hiển thị dữ liệu cắt thiếu.",
      );
    const records = await this.db
      .select()
      .from(trackingRecords)
      .where(
        and(
          eq(trackingRecords.accountId, account.id),
          eq(trackingRecords.source, q.source),
          pageIds
            ? pageIds.length
              ? inArray(trackingRecords.pageId, pageIds)
              : sql`false`
            : undefined,
          q.pageId ? eq(trackingRecords.pageId, q.pageId) : undefined,
        ),
      )
      .limit(10001);
    if (records.length > 10000)
      throw new AppError(
        413,
        "REPORT_TOO_LARGE",
        "TKQC vượt 10.000 tracking records; cần phân vùng dữ liệu trước khi báo cáo.",
      );
    const ledger = records.length
      ? await this.db
          .select()
          .from(commissionRows)
          .where(
            and(
              eq(commissionRows.source, q.source),
              inArray(
                commissionRows.trackingId,
                records.map((r) => r.id),
              ),
              sql`(${commissionRows.orderedAt} IS NULL OR (${commissionRows.orderedAt} AT TIME ZONE ${account.timezone})::date BETWEEN ${q.since}::date AND ${q.until}::date)`,
            ),
          )
          .limit(50001)
      : [];
    if (ledger.length > 50000)
      throw new AppError(
        413,
        "REPORT_TOO_LARGE",
        "Kỳ báo cáo vượt 50.000 commission rows. Chọn kỳ ngắn hơn.",
      );
    const ambiguous = await ambiguousTrackingIds(this.db);
    const historyDonors = await this.db
      .select({ name: donors.name, adId: donorVersions.adId })
      .from(donors)
      .innerJoin(donorVersions, eq(donorVersions.donorId, donors.id))
      .where(eq(donors.accountId, account.id));
    const flags = new Set<string>();
    const expected = days(q.since, q.until);
    if (expected.some((d) => !snapshots.some((s) => s.day === d)))
      flags.add("MISSING_SPEND");
    if (
      snapshots.some(
        (s) =>
          s.currency !== account.currency || s.timezone !== account.timezone,
      )
    )
      flags.add("MISSING_SPEND");
    if (snapshots.some((s) => Date.now() - s.syncedAt.getTime() > 86400000))
      flags.add("STALE_DATA");
    if (!policy.mappingAcknowledged) flags.add("MAPPING_NOT_ACKNOWLEDGED");
    if (q.until >= localDay(new Date(), account.timezone))
      flags.add("PARTIAL_DAY");
    if (
      q.mode === "lifetime" &&
      (policy.lifetimeStart !== q.since ||
        q.until < localDay(new Date(Date.now() - 86400000), account.timezone))
    )
      flags.add("LIFETIME_INCOMPLETE");
    const affiliateKeys = [...new Set(records.map((r) => r.affiliateAccount))];
    if (affiliateKeys.length) {
      const reviews = await this.db
        .select({ id: commissionReviews.id })
        .from(commissionReviews)
        .innerJoin(
          commissionImports,
          eq(commissionImports.id, commissionReviews.importId),
        )
        .where(
          and(
            eq(commissionReviews.state, "OPEN"),
            eq(commissionImports.source, q.source),
            inArray(commissionImports.affiliateAccount, affiliateKeys),
          ),
        )
        .limit(1);
      if (reviews.length) flags.add("OPEN_REVIEW");
      const unmatched = await this.db
        .select({ orderedAt: commissionRows.orderedAt })
        .from(commissionRows)
        .where(
          and(
            eq(commissionRows.source, q.source),
            inArray(commissionRows.affiliateAccount, affiliateKeys),
            sql`${commissionRows.trackingId} IS NULL`,
            sql`(${commissionRows.orderedAt} IS NULL OR (${commissionRows.orderedAt} AT TIME ZONE ${account.timezone})::date BETWEEN ${q.since}::date AND ${q.until}::date)`,
          ),
        )
        .limit(1);
      if (
        unmatched.some(
          (r) =>
            !r.orderedAt ||
            (localDay(r.orderedAt, account.timezone) >= q.since &&
              localDay(r.orderedAt, account.timezone) <= q.until),
        )
      )
        flags.add("UNATTRIBUTED_COMMISSION");
    }
    const byAd = new Map<string, Aggregate>(),
      groups = new Map<string, Aggregate>();
    const recordsById = new Map(records.map((r) => [r.id, r]));
    const recordsByAd = new Map<string, typeof records>();
    for (const r of records) {
      if (r.adId) {
        const list = recordsByAd.get(r.adId) ?? [];
        list.push(r);
        recordsByAd.set(r.adId, list);
      }
    }
    const factsByAd = new Map<string, typeof facts>();
    const factsByAdDay = new Map<string, (typeof facts)[number]>();
    for (const f of facts) {
      const list = factsByAd.get(f.fact.adId) ?? [];
      list.push(f);
      factsByAd.set(f.fact.adId, list);
      factsByAdDay.set(`${f.fact.adId}:${f.day.day}`, f);
    }
    const pagesById = new Map(pageList.map((p) => [p.id, p]));
    const donorNamesByAd = new Map<string, string[]>();
    for (const d of historyDonors) {
      const list = donorNamesByAd.get(d.adId) ?? [];
      list.push(d.name);
      donorNamesByAd.set(d.adId, list);
    }
    for (const { fact: f, day: d } of facts) {
      const pg = f.pageMetaId ? pageMap.get(f.pageMetaId) : undefined;
      if ((pageIds !== null || q.pageId) && !pg) continue;
      const related = recordsByAd.get(f.adId) ?? [];
      const adKey = q.mode === "daily" ? `${d.day}:${f.adId}` : f.adId;
      let g = byAd.get(adKey);
      if (!g) {
        g = {
          key: f.adId,
          name: f.adName,
          campaignId: f.campaignId,
          adSetId: f.adSetId,
          adId: f.adId,
          pageNames: pg ? [pg.name] : [],
          pageIds: pg ? [pg.id] : [],
          subIds: related.map((r) => r.subId),
          contentRefs: [
            ...new Set(related.map((r) => r.contentRef).filter(Boolean)),
          ],
          donorNames: [...new Set(donorNamesByAd.get(f.adId) ?? [])],
          postIds: f.postId ? [f.postId] : [],
          adNames: [f.adName],
          statuses: [
            q.level === "campaign"
              ? f.campaignStatus
              : q.level === "adset"
                ? f.adSetStatus
                : f.adStatus,
          ],
          days: [],
          spend: 0n,
          impressions: 0n,
          clicks: 0n,
          linkClicks: 0n,
          lpv: 0n,
          commissions: emptyMoney(),
          flags: new Set(),
          eligibleRows: 0,
          lastSyncedAt: d.syncedAt.toISOString(),
          providers: new Set(),
        };
        byAd.set(adKey, g);
      }
      g.spend += micros(f.spend);
      g.impressions += BigInt(f.impressions);
      g.clicks += BigInt(f.clicks);
      g.linkClicks =
        g.linkClicks !== null && f.linkClicks !== null
          ? g.linkClicks + BigInt(f.linkClicks)
          : null;
      g.lpv = g.lpv !== null && f.lpv !== null ? g.lpv + BigInt(f.lpv) : null;
      g.days.push({ day: d.day, spend: f.spend });
      g.lastSyncedAt = [g.lastSyncedAt!, d.syncedAt.toISOString()].sort()[0];
      g.providers.add(d.provider);
      g.statuses = [
        ...new Set([
          ...g.statuses,
          q.level === "campaign"
            ? f.campaignStatus
            : q.level === "adset"
              ? f.adSetStatus
              : f.adStatus,
        ]),
      ];
      if (g.campaignId !== f.campaignId || g.adSetId !== f.adSetId)
        g.flags.add("UNVERIFIED_MAPPING");
      // Page lấy từ snapshot Ad; không suy Page chỉ từ TKQC.
      if (!f.pageMetaId) g.flags.add("UNVERIFIED_MAPPING");
    }
    for (const row of ledger) {
      const t = recordsById.get(row.trackingId!)!;
      const ordered = row.orderedAt
        ? localDay(row.orderedAt, account.timezone)
        : null;
      if (ordered && (ordered < q.since || ordered > q.until)) continue;
      const g = t.adId
        ? byAd.get(
            q.mode === "daily" && ordered ? `${ordered}:${t.adId}` : t.adId,
          )
        : undefined;
      if (!g) {
        flags.add("UNATTRIBUTED_COMMISSION");
        continue;
      }
      if (!ordered) {
        g.flags.add("MISSING_ORDER_DATE");
        continue;
      }
      if (row.currency !== account.currency) {
        g.flags.add("CURRENCY_MISMATCH");
        continue;
      }
      if (t.channel !== "ADS" || !t.linkVersion || ambiguous.has(t.id)) {
        g.flags.add(
          ambiguous.has(t.id) || t.channel === "SHARED"
            ? "SHARED_LINK"
            : "UNVERIFIED_MAPPING",
        );
        continue;
      }
      const mappedPage = pagesById.get(t.pageId);
      const adFacts = factsByAd.get(t.adId!) ?? [];
      if (
        g.campaignId !== t.campaignId ||
        g.adSetId !== t.adSetId ||
        !mappedPage ||
        adFacts.some((x) => x.fact.pageMetaId !== mappedPage.metaId) ||
        row.affiliateAccount !== t.affiliateAccount
      ) {
        g.flags.add("UNVERIFIED_MAPPING");
        continue;
      }
      if (row.matchMethod === "MANUAL") g.flags.add("MANUAL_MAPPING");
      g.eligibleRows++;
      g.commissions[row.status] += micros(row.amount);
    }
    // Groups are disjoint: an Ad's spend belongs to one row at the selected level.
    for (const [, a] of byAd) {
      const adId = a.adId!;
      const f = factsByAd.get(adId)![0].fact;
      if (
        (q.level === "subid" && a.subIds.length !== 1) ||
        (q.level === "content" && a.contentRefs.length !== 1)
      )
        a.flags.add("UNVERIFIED_MAPPING");
      const groupKey =
        q.level === "campaign"
          ? f.campaignId
          : q.level === "adset"
            ? f.adSetId
            : q.level === "subid"
              ? a.subIds.length === 1
                ? a.subIds[0]
                : `unknown:${adId}`
              : q.level === "content"
                ? a.contentRefs.length === 1
                  ? a.contentRefs[0]
                  : `unknown:${adId}`
                : adId;
      const name =
        q.level === "campaign"
          ? f.campaignName
          : q.level === "adset"
            ? f.adSetName
            : q.level === "subid"
              ? a.subIds.length === 1
                ? a.subIds[0]
                : "SubID chưa tách chi phí"
              : q.level === "content"
                ? a.contentRefs.length === 1
                  ? a.contentRefs[0]
                  : "Nội dung chưa tách chi phí"
                : f.adName;
      const key =
        q.mode === "daily" ? `${a.days[0].day}:${groupKey}` : groupKey;
      let g = groups.get(key);
      if (!g) {
        g = {
          ...a,
          key,
          name: q.mode === "daily" ? `${name} · ${a.days[0].day}` : name,
          adId: q.level === "ad" ? adId : null,
          adSetId: q.level === "adset" ? f.adSetId : null,
          spend: 0n,
          impressions: 0n,
          clicks: 0n,
          linkClicks: 0n,
          lpv: 0n,
          commissions: emptyMoney(),
          flags: new Set(),
          eligibleRows: 0,
          pageNames: [],
          pageIds: [],
          subIds: [],
          contentRefs: [],
          donorNames: [],
          postIds: [],
          adNames: [],
          statuses: [],
          days: [],
          providers: new Set(),
        };
        groups.set(key, g);
      }
      g.eligibleRows += a.eligibleRows;
      g.spend += a.spend;
      g.impressions += a.impressions;
      g.clicks += a.clicks;
      g.linkClicks =
        g.linkClicks !== null && a.linkClicks !== null
          ? g.linkClicks + a.linkClicks
          : null;
      g.lpv = g.lpv !== null && a.lpv !== null ? g.lpv + a.lpv : null;
      for (const status of ["PENDING", "APPROVED", "PAID", "REJECTED"] as const)
        g.commissions[status] += a.commissions[status];
      for (const k of [
        "pageNames",
        "pageIds",
        "subIds",
        "contentRefs",
        "donorNames",
        "postIds",
        "adNames",
        "statuses",
      ] as const)
        g[k] = [...new Set([...g[k], ...a[k]])];
      g.days.push(...a.days);
      a.flags.forEach((v) => g!.flags.add(v));
      a.providers.forEach((v) => g!.providers.add(v));
      g.lastSyncedAt = [g.lastSyncedAt!, a.lastSyncedAt!].sort()[0];
    }
    if (groups.size > 2000)
      throw new AppError(
        413,
        "REPORT_TOO_LARGE",
        "Báo cáo vượt 2.000 nhóm. Chọn kỳ/cấp báo cáo khác; chưa cắt bớt dữ liệu.",
      );
    if (pageIds !== null || q.pageId) flags.add("PARTIAL_PAGE_SCOPE");
    const allowedWarnings = new Set([
      "MANUAL_MAPPING",
      "PARTIAL_PAGE_SCOPE",
      "CSV_DECLARED",
      "REACH_NON_ADDITIVE",
    ]);
    const allSpend = [...groups.values()].reduce((s, g) => s + g.spend, 0n);
    const accountCost =
      micros(policy.otherCostPerDay) * BigInt(expected.length);
    let assigned = 0n;
    const allRows = [...groups.values()].map((g, index) => {
      if (g.eligibleRows === 0) g.flags.add("NO_COMMISSION");
      if (allSpend === 0n && accountCost > 0n)
        g.flags.add("UNALLOCATED_OTHER_COSTS");
      const other =
        allSpend > 0n
          ? index === groups.size - 1
            ? accountCost - assigned
            : (accountCost * g.spend) / allSpend
          : 0n;
      assigned += other;
      const quality = [...new Set([...flags, ...g.flags])];
      if (g.providers.has("CSV")) quality.push("CSV_DECLARED");
      // Chưa phân bổ chi phí khác của cả TKQC vào một phần Page.
      if ((pageIds !== null || q.pageId) && accountCost > 0n)
        quality.push("UNALLOCATED_OTHER_COSTS");
      const eligible = quality.every((v) => allowedWarnings.has(v));
      const estimated = policy.estimatedStatuses.reduce(
        (s, k) => s + g.commissions[k],
        0n,
      );
      const realized = g.commissions.PAID;
      const daily = expected.map((day) => ({
        day,
        spend: snapshots.some((d) => d.day === day)
          ? decimal(
              g.days
                .filter((d) => d.day === day)
                .reduce((s, d) => s + micros(d.spend), 0n),
            )
          : null,
        reach:
          q.level === "ad"
            ? (factsByAdDay.get(`${g.adId}:${day}`)?.fact.reach ?? null)
            : null,
      }));
      return {
        key: g.key,
        name: g.name,
        campaignId: g.campaignId,
        adSetId: g.adSetId,
        adId: g.adId,
        pageNames: g.pageNames,
        pageIds: g.pageIds,
        subIds: g.subIds,
        contentRefs: g.contentRefs,
        donorNames: g.donorNames,
        postIds: g.postIds,
        adNames: g.adNames,
        statuses: g.statuses,
        spend: decimal(g.spend),
        commissions: Object.fromEntries(
          Object.entries(g.commissions).map(([k, v]) => [
            k,
            g.eligibleRows ? decimal(v) : null,
          ]),
        ),
        estimatedCommission: g.eligibleRows ? decimal(estimated) : null,
        realizedCommission: g.eligibleRows ? decimal(realized) : null,
        otherCosts: decimal(other),
        estimatedRoas: eligible ? ratio(estimated, g.spend) : null,
        realizedRoas: eligible ? ratio(realized, g.spend) : null,
        estimatedProfit: eligible ? decimal(estimated - g.spend - other) : null,
        realizedProfit: eligible ? decimal(realized - g.spend - other) : null,
        cpc: ratio(g.spend, g.clicks * 1000000n),
        ctr: ratio(g.clicks * 100n, g.impressions),
        cpm: ratio(g.spend * 1000n, g.impressions * 1000000n),
        impressions: g.impressions.toString(),
        clicks: g.clicks.toString(),
        linkClicks: g.linkClicks?.toString() ?? null,
        lpv: g.lpv?.toString() ?? null,
        reach: null,
        quality,
        lastSyncedAt: g.lastSyncedAt,
        providers: [...g.providers],
        daily,
      };
    });
    const rows = allRows.filter(
      (r) =>
        (q.status === "all" || r.statuses.includes(q.status)) &&
        (!q.search ||
          [r.name, ...r.subIds, ...r.pageNames, ...r.adNames]
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(q.search.toLocaleLowerCase("vi"))),
    );
    const sums = (
      field:
        | "spend"
        | "estimatedCommission"
        | "realizedCommission"
        | "otherCosts",
    ) => rows.reduce((s, r) => s + micros(r[field] ?? "0"), 0n);
    const valid =
      rows.length > 0 && rows.every((r) => r.estimatedProfit !== null);
    const spend = sums("spend"),
      estimated = sums("estimatedCommission"),
      paid = sums("realizedCommission"),
      other = sums("otherCosts");
    return {
      query: q,
      account: {
        id: account.id,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone,
        source: account.source,
      },
      policy,
      coverage: { expected: expected.length, present: snapshots.length },
      quality: [...new Set([...flags, ...rows.flatMap((r) => r.quality)])],
      rows,
      totals: snapshots.length
        ? {
            spend: decimal(spend),
            estimatedCommission: rows.some(
              (r) => r.estimatedCommission !== null,
            )
              ? decimal(estimated)
              : null,
            realizedCommission: rows.some((r) => r.realizedCommission !== null)
              ? decimal(paid)
              : null,
            otherCosts: decimal(other),
            estimatedRoas: valid ? ratio(estimated, spend) : null,
            realizedRoas: valid ? ratio(paid, spend) : null,
            estimatedProfit: valid ? decimal(estimated - spend - other) : null,
            realizedProfit: valid ? decimal(paid - spend - other) : null,
          }
        : null,
      timeline: expected.map((day) => ({
        day,
        spend: snapshots.some((d) => d.day === day)
          ? decimal(
              rows.reduce(
                (s, r) =>
                  s + micros(r.daily.find((d) => d.day === day)?.spend ?? "0"),
                0n,
              ),
            )
          : null,
      })),
    };
  }
}
