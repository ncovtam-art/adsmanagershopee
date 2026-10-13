import { and, eq, inArray, desc, sql, lte, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db";
import {
  adsRequests,
  adsBatches,
  adsBatchHistory,
  adsHistory,
  adAccounts,
  pages,
  metaConnections,
  donors,
  donorVersions,
  publishJobs,
  videoAssets,
  trackingRecords,
  trackingLinkVersions,
  users,
  publicUserFields,
  auditLogs,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { requireResource, accessibleIds } from "../meta/access";
import { unseal } from "../meta/crypto";
import { AppError } from "../http/errors";
import { previewFingerprint } from "../donors/normalize";
import { TrackingService } from "../shopee/tracking";
import {
  adsInput,
  confirmInput,
  compatible,
  kinds,
  type Snapshot,
  type Finding,
  type Kind,
} from "./validation";
import { adsProvider, type AdsProvider, type Context } from "./provider";
import { z } from "zod";
type Request = typeof adsRequests.$inferSelect;
const ids = {
  campaign: "campaignId",
  adSet: "adSetId",
  creative: "creativeId",
  ad: "adId",
} as const;
const publicFields = {
  bulkBatchId: adsRequests.bulkBatchId,
  cloneSourceId: adsRequests.cloneSourceId,
  cloneLevel: adsRequests.cloneLevel,
  id: adsRequests.id,
  publishJobId: adsRequests.publishJobId,
  donorVersionId: adsRequests.donorVersionId,
  pageId: adsRequests.pageId,
  accountId: adsRequests.accountId,
  source: adsRequests.source,
  mode: adsRequests.mode,
  state: adsRequests.state,
  phase: adsRequests.phase,
  campaignId: adsRequests.campaignId,
  adSetId: adsRequests.adSetId,
  creativeId: adsRequests.creativeId,
  adId: adsRequests.adId,
  trackingId: adsRequests.trackingId,
  errorCode: adsRequests.errorCode,
  attempts: adsRequests.attempts,
  verifiedAt: adsRequests.verifiedAt,
  createdAt: adsRequests.createdAt,
};
function fail(code: string, message: string, status = 422): never {
  throw new AppError(status, code, message);
}
export class AdsService {
  constructor(
    private db: AppDatabase,
    private resolve: (source: "LIVE" | "MOCK") => AdsProvider = adsProvider,
  ) {}
  async authorize(actor: Actor | null, pageId: string, accountId: string) {
    requirePermission(actor, "ads:write");
    const [fresh] = await this.db
      .select(publicUserFields)
      .from(users)
      .where(eq(users.id, actor.id));
    requirePermission(fresh ?? null, "ads:write");
    await requireResource(this.db, fresh, "page", pageId);
    await requireResource(this.db, fresh, "account", accountId);
    return fresh;
  }
  async resources(actor: Actor | null, publishJobId: string) {
    requirePermission(actor, "ads:write");
    const [pub] = await this.db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.id, publishJobId));
    if (!pub) fail("ADS_POST", "Không tìm thấy bài video.", 404);
    const [page] = await this.db
      .select()
      .from(pages)
      .where(eq(pages.id, pub.pageId));
    if (!page?.primaryAccountId)
      fail(
        "ADS_ACCOUNT",
        "Page chưa có TKQC chính. Chọn mapping trong Quản lý Page.",
      );
    await this.authorize(actor, page.id, page.primaryAccountId);
    const [account] = await this.db
      .select()
      .from(adAccounts)
      .where(eq(adAccounts.id, page.primaryAccountId));
    const [asset] = await this.db
      .select()
      .from(videoAssets)
      .where(eq(videoAssets.id, pub.assetId));
    const [connection] = await this.db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.id, account.connectionId));
    const [pageConnection] = await this.db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.id, page.connectionId));
    if (
      pub.kind !== "VIDEO" ||
      pub.state !== "SUCCEEDED" ||
      !pub.postId ||
      !pub.metaVideoId ||
      !asset ||
      asset.state !== "READY" ||
      asset.pageId !== page.id ||
      pub.source !== page.source ||
      account.source !== page.source
    )
      fail(
        "ADS_POST",
        "Cần video đã đăng thành công, đúng Page/Post ID và nguồn.",
      );
    if (
      page.status !== "AUTHORIZED" ||
      account.status !== "AUTHORIZED" ||
      !page.tasks.includes("ADVERTISE") ||
      !account.tasks.some((t) => ["ADVERTISE", "MANAGE"].includes(t))
    )
      fail("ADS_PERMISSION", "Page/TKQC chưa được cấp quyền ADVERTISE.", 403);
    if (
      !connection ||
      !pageConnection ||
      connection.source !== page.source ||
      pageConnection.source !== page.source ||
      connection.expiresAt <= new Date() ||
      pageConnection.expiresAt <= new Date() ||
      !connection.scopes.includes("ads_management") ||
      !pageConnection.scopes.includes("pages_read_engagement")
    )
      fail(
        "ADS_PERMISSION",
        "Thiếu ads_management/pages_read_engagement hoặc kết nối hết hạn; kết nối lại.",
        403,
      );
    const ctx: Context = {
      accountMetaId: account.metaId,
      pageMetaId: page.metaId,
      postId: pub.postId,
      videoId: pub.metaVideoId,
      currency: account.currency,
      timezone: account.timezone,
      token: unseal(connection.encryptedToken),
      pageToken: unseal(page.encryptedToken),
    };
    return {
      pub,
      page,
      account,
      asset,
      ctx,
      provider: this.resolve(page.source),
    };
  }
  async options(actor: Actor | null) {
    requirePermission(actor, "ads:write");
    const pageIds = await accessibleIds(this.db, actor, "page"),
      accountIds = await accessibleIds(this.db, actor, "account");
    if (pageIds?.length === 0 || accountIds?.length === 0) return [];
    return this.db
      .select({
        id: publishJobs.id,
        assetId: videoAssets.id,
        filename: videoAssets.filename,
        pageId: pages.id,
        pageName: pages.name,
        accountId: adAccounts.id,
        accountName: adAccounts.name,
        source: pages.source,
        postId: publishJobs.postId,
        videoId: publishJobs.metaVideoId,
        currency: adAccounts.currency,
        timezone: adAccounts.timezone,
        trackingId: publishJobs.trackingId,
      })
      .from(publishJobs)
      .innerJoin(pages, eq(publishJobs.pageId, pages.id))
      .innerJoin(adAccounts, eq(pages.primaryAccountId, adAccounts.id))
      .innerJoin(videoAssets, eq(publishJobs.assetId, videoAssets.id))
      .where(
        and(
          eq(publishJobs.kind, "VIDEO"),
          eq(publishJobs.state, "SUCCEEDED"),
          ...(pageIds ? [inArray(pages.id, pageIds)] : []),
          ...(accountIds ? [inArray(adAccounts.id, accountIds)] : []),
        ),
      )
      .orderBy(desc(publishJobs.createdAt))
      .limit(200);
  }
  async prepareTracking(actor: Actor | null, input: unknown) {
    const v = z
      .object({ publishJobId: z.string().uuid(), affiliateAccount: z.string() })
      .strict()
      .parse(input);
    const { asset, page } = await this.resources(actor, v.publishJobId);
    if (!asset.productId)
      fail("ADS_PRODUCT", "Video cần gắn sản phẩm trước khi tạo Ads tracking.");
    return new TrackingService(this.db).create(actor, {
      pageIds: [page.id],
      productId: asset.productId,
      contentId: asset.id,
      contentRef: asset.filename,
      affiliateAccount: v.affiliateAccount,
      channel: "ADS",
    });
  }
  async preview(actor: Actor | null, input: unknown) {
    const v = adsInput.parse(input),
      r = await this.resources(actor, v.publishJobId);
    const [version] = await this.db
      .select()
      .from(donorVersions)
      .where(eq(donorVersions.id, v.donorVersionId));
    if (!version) fail("ADS_DONOR", "Không tìm thấy version Donor.", 404);
    const [donor] = await this.db
      .select()
      .from(donors)
      .where(eq(donors.id, version.donorId));
    await requireResource(this.db, actor, "account", donor.accountId);
    if (donor.source !== r.page.source)
      fail("ADS_SOURCE", "Donor/Post/TKQC phải cùng LIVE hoặc MOCK.");
    const [sourceAccount] = await this.db
      .select()
      .from(adAccounts)
      .where(eq(adAccounts.id, donor.accountId));
    const template = version.normalized as {
      campaign: Record<string, unknown>;
      adSet: Record<string, unknown>;
      creative: Record<string, unknown>;
    };
    const { campaign, adSet, findings } = compatible(v, template);
    const add = (
      field: string,
      reason: string,
      fix: string,
      state: Finding["state"] = "NEEDS_FIX",
    ) => findings.push({ state, field, reason, fix });
    if (sourceAccount.currency !== r.account.currency && !v.budget)
      add(
        "budget.currency",
        "Currency TKQC nguồn/đích khác nhau.",
        "Nhập ngân sách mới theo currency đích; không quy đổi tự động.",
      );
    if (!v.acknowledgeDonorChanges)
      add(
        "donor.normalization",
        "Template đã bỏ source IDs, audience/pixel và lịch cũ.",
        "Kiểm tra targeting trong preview, tick xác nhận đã kiểm tra Donor.",
      );
    let tracking: typeof trackingRecords.$inferSelect | undefined,
      link: typeof trackingLinkVersions.$inferSelect | undefined;
    if (v.mode === "NEW_CREATIVE") {
      if (v.trackingId)
        [tracking] = await this.db
          .select()
          .from(trackingRecords)
          .where(eq(trackingRecords.id, v.trackingId));
      if (
        !tracking ||
        tracking.pageId !== r.page.id ||
        tracking.accountId !== r.account.id ||
        tracking.contentId !== r.asset.id ||
        tracking.productId !== r.asset.productId ||
        tracking.source !== r.page.source ||
        tracking.channel !== "ADS" ||
        tracking.status !== "READY" ||
        tracking.adId ||
        tracking.campaignId ||
        tracking.adSetId
      )
        add(
          "tracking",
          "Cần ADS tracking mới, đúng video/Page/TKQC/sản phẩm và link đã xác nhận.",
          "Tạo ADS SubID trong wizard, tạo Custom Link bên Shopee rồi dán tại Link Center.",
        );
      else {
        [link] = await this.db
          .select()
          .from(trackingLinkVersions)
          .where(
            and(
              eq(trackingLinkVersions.trackingId, tracking.id),
              eq(trackingLinkVersions.version, tracking.linkVersion),
            ),
          );
        if (!link || link.confirmation !== "USER_DECLARED")
          add(
            "tracking.link",
            "Link chưa được xác nhận.",
            "Xác nhận Custom Link đúng SubID bên Shopee.",
          );
        else {
          const others = await this.db
            .select({ id: trackingLinkVersions.trackingId })
            .from(trackingLinkVersions)
            .where(
              and(
                eq(trackingLinkVersions.urlHash, link.urlHash),
                sql`${trackingLinkVersions.trackingId}<>${tracking.id}`,
              ),
            )
            .limit(1);
          if (others.length)
            add(
              "tracking.shared",
              "URL đã được dùng bởi tracking khác.",
              "Tạo Custom Link riêng cho SubID này.",
            );
        }
        const used = await this.db
          .select({ id: adsRequests.id })
          .from(adsRequests)
          .where(
            and(
              eq(adsRequests.trackingId, tracking.id),
              eq(adsRequests.mode, "NEW_CREATIVE"),
              sql`${adsRequests.state}<>'CANCELLED'`,
            ),
          )
          .limit(1);
        if (used.length)
          add(
            "tracking.used",
            "SubID đã có Ads request.",
            "Theo dõi/retry/recovery request cũ; dùng SubID mới cho Ads khác.",
          );
      }
    } else {
      if (v.cta || v.message)
        add(
          "creative.existing",
          "Existing Post không cho thay CTA/message ở flow này.",
          "Dùng New Creative hoặc giữ nguyên bài.",
          "UNSUPPORTED",
        );
      if (v.trackingId && v.trackingId !== r.pub.trackingId)
        add(
          "tracking.existing",
          "Existing Post không hỗ trợ thay link/SubID độc lập trong luồng này.",
          "Chọn New Creative với tracking riêng.",
          "UNSUPPORTED",
        );
      if (r.pub.trackingId) {
        [tracking] = await this.db
          .select()
          .from(trackingRecords)
          .where(eq(trackingRecords.id, r.pub.trackingId));
        if (r.pub.linkVersionId)
          [link] = await this.db
            .select()
            .from(trackingLinkVersions)
            .where(eq(trackingLinkVersions.id, r.pub.linkVersionId));
      }
    }
    let thumbnailUrl: string | null = null;
    try {
      thumbnailUrl = (await r.provider.preflight(r.ctx)).thumbnailUrl;
    } catch (e) {
      if (e instanceof AppError)
        add(
          "meta.preflight",
          e.message,
          "Làm mới kết nối/quyền hoặc kiểm tra Meta rồi preview lại.",
          "UNKNOWN",
        );
      else throw e;
    }
    if (v.mode === "NEW_CREATIVE" && !thumbnailUrl)
      add(
        "creative.thumbnail",
        "Meta chưa trả thumbnail video hợp lệ.",
        "Kiểm tra video đã xử lý hoàn tất.",
        "UNKNOWN",
      );
    const creative: Record<string, unknown> =
      v.mode === "EXISTING_POST"
        ? { object_story_id: r.ctx.postId }
        : {
            object_story_spec: {
              page_id: r.ctx.pageMetaId,
              video_data: {
                video_id: r.ctx.videoId,
                image_url: thumbnailUrl,
                message:
                  v.message ?? template.creative.message ?? r.pub.caption,
                call_to_action: {
                  type: v.cta ?? template.creative.cta ?? "LEARN_MORE",
                  value: { link: link?.url ?? "" },
                },
              },
            },
          };
    const cta = (
      creative.object_story_spec as {
        video_data?: { call_to_action?: { type: unknown } };
      }
    )?.video_data?.call_to_action?.type;
    if (
      v.mode === "NEW_CREATIVE" &&
      !["LEARN_MORE", "SHOP_NOW"].includes(String(cta))
    )
      add(
        "creative.cta",
        "CTA của Donor chưa được hỗ trợ.",
        "Chọn Learn More hoặc Shop Now.",
        "UNSUPPORTED",
      );
    if (v.mode === "EXISTING_POST")
      adSet.promoted_object = { page_id: r.ctx.pageMetaId };
    const snapshot: Snapshot = {
      campaign,
      adSet,
      creative,
      ad: { status: "PAUSED", name: v.name },
      accountMetaId: r.ctx.accountMetaId,
      pageMetaId: r.ctx.pageMetaId,
      postId: r.ctx.postId,
      videoId: r.ctx.videoId,
      currency: r.ctx.currency,
      timezone: r.ctx.timezone,
      mode: v.mode,
      affiliateUrl: link?.url ?? null,
      subId: tracking?.subId ?? null,
      thumbnailUrl,
    };
    const warnings = [
      ...version.warnings,
      "Custom Link/SubID là USER_DECLARED, không phải Shopee API verified.",
      ...(v.mode === "EXISTING_POST"
        ? [
            "Existing Post giữ bài/link cũ: attribution mức SubID/SHARED; không tự gán hoa hồng riêng từng Ad.",
          ]
        : []),
      ...(r.page.source === "MOCK"
        ? ["MOCK chỉ mô phỏng, không tạo Ads Facebook thật."]
        : []),
    ];
    const base = {
      input: v,
      publishJobId: r.pub.id,
      donorVersionId: version.id,
      pageId: r.page.id,
      accountId: r.account.id,
      source: r.page.source,
      trackingId: tracking?.id ?? null,
      linkVersionId: link?.id ?? null,
      snapshot,
    };
    const state = findings.some((f) => f.state === "NEEDS_FIX")
      ? "NEEDS_FIX"
      : findings.some((f) => f.state === "UNSUPPORTED")
        ? "UNSUPPORTED"
        : findings.length
          ? "UNKNOWN"
          : "READY";
    return {
      ...base,
      state,
      findings,
      warnings,
      pageName: r.page.name,
      accountName: r.account.name,
      donorName: donor.name,
      donorVersion: version.version,
      fingerprint: previewFingerprint(base),
    };
  }
  async confirm(actor: Actor | null, input: unknown) {
    requirePermission(actor, "ads:write");
    const v = confirmInput.parse(input);
    const key = previewFingerprint(adsInput.parse(vWithoutConfirm(v)));
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847307)`);
      const [old] = await tx
        .select()
        .from(adsRequests)
        .where(
          and(
            eq(adsRequests.createdBy, actor.id),
            eq(adsRequests.requestKey, v.requestKey),
          ),
        );
      if (old) {
        await this.authorize(actor, old.pageId, old.accountId);
        if (
          old.fingerprint !== v.fingerprint ||
          old.snapshot.ad.inputFingerprint !== key
        )
          fail("ADS_REQUEST_KEY", "Request key đã được dùng cho preview khác.");
        return { id: old.id, replayed: true };
      }
      const service = new AdsService(
        tx as unknown as AppDatabase,
        this.resolve,
      );
      const preview = await service.preview(actor, vWithoutConfirm(v));
      if (preview.state !== "READY")
        fail(
          "ADS_NOT_READY",
          "Compatibility chưa READY. Sửa theo findings rồi preview lại.",
        );
      if (preview.fingerprint !== v.fingerprint)
        fail(
          "ADS_PREVIEW_CHANGED",
          "Dữ liệu/link/quyền/cấu hình đã đổi sau preview. Preview lại.",
        );
      const snapshot = structuredClone(preview.snapshot);
      snapshot.ad.inputFingerprint = key;
      const [job] = await tx
        .insert(adsRequests)
        .values({
          requestKey: v.requestKey,
          fingerprint: v.fingerprint,
          publishJobId: preview.publishJobId,
          donorVersionId: preview.donorVersionId,
          pageId: preview.pageId,
          accountId: preview.accountId,
          source: preview.source,
          mode: preview.input.mode,
          trackingId: preview.trackingId,
          linkVersionId: preview.linkVersionId,
          snapshot,
          createdBy: actor.id,
        })
        .returning({ id: adsRequests.id });
      await tx.insert(adsHistory).values({
        requestId: job.id,
        actorId: actor.id,
        action: "CONFIRMED_PAUSED",
        details: { mode: preview.input.mode, source: preview.source },
      });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "ADS_CREATE_CONFIRMED",
        resourceId: job.id,
        metadata: {
          source: preview.source,
          accountId: preview.accountId,
          mode: preview.input.mode,
        },
      });
      return { id: job.id, replayed: false };
    });
  }
  async list(actor: Actor | null) {
    requirePermission(actor, "ads:write");
    const p = await accessibleIds(this.db, actor, "page"),
      a = await accessibleIds(this.db, actor, "account");
    if (p?.length === 0 || a?.length === 0) return [];
    return this.db
      .select(publicFields)
      .from(adsRequests)
      .where(
        and(
          ...(p ? [inArray(adsRequests.pageId, p)] : []),
          ...(a ? [inArray(adsRequests.accountId, a)] : []),
        ),
      )
      .orderBy(desc(adsRequests.createdAt))
      .limit(200);
  }
  async history(actor: Actor | null, id: string) {
    const j = await this.get(actor, id);
    return {
      request: { ...publicProjection(j), snapshot: j.snapshot },
      history: await this.db
        .select()
        .from(adsHistory)
        .where(eq(adsHistory.requestId, id))
        .orderBy(desc(adsHistory.createdAt)),
    };
  }
  private async get(actor: Actor | null, id: string) {
    z.string().uuid().parse(id);
    const [j] = await this.db
      .select()
      .from(adsRequests)
      .where(eq(adsRequests.id, id));
    if (!j) fail("ADS_NOT_FOUND", "Không tìm thấy Ads request.", 404);
    await this.authorize(actor, j.pageId, j.accountId);
    return j;
  }
  async action(actor: Actor | null, input: unknown) {
    const v = z
      .object({ id: z.string().uuid(), action: z.enum(["retry", "cancel"]) })
      .strict()
      .parse(input);
    const j = await this.get(actor, v.id);
    if (j.bulkBatchId && v.action === "cancel")
      fail("ADS_BULK_CONTROL", "Dùng Pause Batch để giữ dependency graph; không hủy riêng parent/child.");
    if (
      v.action === "cancel" &&
      (j.state !== "QUEUED" || j.campaignId || j.phase !== "NONE")
    )
      fail(
        "ADS_ACTION",
        "Chỉ hủy request chưa tạo đối tượng. Không xóa đối tượng Meta đã tạo.",
      );
    if (v.action === "retry" && j.state !== "FAILED")
      fail(
        "ADS_ACTION",
        "Chỉ retry lỗi chắc chắn; UNKNOWN phải kiểm tra/nối ID.",
      );
    const state = v.action === "cancel" ? "CANCELLED" : "QUEUED";
    await this.db.transaction(async (tx) => {
      const changed = await tx
        .update(adsRequests)
        .set({
          state,
          generation: sql`${adsRequests.generation}+1`,
          enqueuedAt: null,
          errorCode: null,
          availableAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(adsRequests.id, j.id), eq(adsRequests.state, j.state)))
        .returning({ id: adsRequests.id });
      if (!changed.length)
        fail("ADS_CHANGED", "Request vừa đổi trạng thái. Tải lại.");
      if (j.bulkBatchId && v.action === "retry")
        await tx
          .update(adsBatches)
          .set({ state: "RUNNING", updatedAt: new Date() })
          .where(
            and(
              eq(adsBatches.id, j.bulkBatchId),
              eq(adsBatches.state, "NEEDS_ACTION"),
            ),
          );
      await tx.insert(adsHistory).values({
        requestId: j.id,
        actorId: actor!.id,
        action: v.action.toUpperCase(),
        details: {},
      });
    });
    return { id: j.id, state };
  }
  payload(j: Request, kind: Kind, thumbnail?: string | null) {
    const name = `${String(j.snapshot.ad.name ?? "Ads")} · [AACC-${j.id}-${kind}]`;
    if (kind === "campaign") return { ...j.snapshot.campaign, name };
    if (kind === "adSet")
      return { ...j.snapshot.adSet, name, campaign_id: j.campaignId };
    if (kind === "creative") {
      const body = structuredClone(j.snapshot.creative);
      if (thumbnail && body.object_story_spec)
        (
          body.object_story_spec as { video_data: Record<string, unknown> }
        ).video_data.image_url = thumbnail;
      return { ...body, name };
    }
    return {
      name,
      status: "PAUSED",
      adset_id: j.adSetId,
      creative: { creative_id: j.creativeId },
    };
  }
  private async context(j: Request) {
    const [actor] = await this.db
      .select(publicUserFields)
      .from(users)
      .where(eq(users.id, j.createdBy));
    const r = await this.resources(actor ?? null, j.publishJobId);
    if (
      r.page.id !== j.pageId ||
      r.account.id !== j.accountId ||
      r.page.source !== j.source ||
      r.ctx.postId !== j.snapshot.postId ||
      r.ctx.videoId !== j.snapshot.videoId ||
      r.ctx.currency !== j.snapshot.currency ||
      r.ctx.timezone !== j.snapshot.timezone
    )
      fail(
        "ADS_CONTEXT_CHANGED",
        "Page/mapping/currency/timezone/bài viết đổi sau confirm. Không tiếp tục tạo.",
      );
    return r;
  }
  async recover(actor: Actor | null, input: unknown) {
    const v = z
      .object({
        id: z.string().uuid(),
        externalId: z
          .string()
          .regex(/^\d{1,64}$/)
          .optional(),
        reason: z.string().trim().min(5).max(500).optional(),
        confirmed: z.literal(true).optional(),
      })
      .strict()
      .parse(input);
    const j = await this.get(actor, v.id);
    if (j.state !== "UNKNOWN" || !kinds.includes(j.phase as Kind))
      fail("ADS_RECOVERY", "Chỉ kiểm tra UNKNOWN tại bước đã gửi.");
    const kind = j.phase as Kind,
      field = ids[kind],
      id = j[field] ?? v.externalId;
    if (!id)
      fail(
        "ADS_RECOVERY_ID",
        "Kiểm tra Ads Manager, nhập ID đối tượng đúng bước và lý do.",
      );
    if (!j[field] && (!v.confirmed || !v.reason))
      fail("ADS_RECOVERY_CONFIRM", "Nối ID cần xác nhận và lý do.");
    const r = await this.context(j);
    await r.provider.preflight(r.ctx);
    const material = await this.material(j, kind);
    await r.provider.verify(
      r.ctx,
      kind,
      id,
      this.payload(material.owner, kind),
      material.owner.id,
    );
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(adsRequests)
        .set({
          [field]: id,
          generation: sql`${adsRequests.generation}+1`,
          enqueuedAt: null,
          state: "QUEUED",
          errorCode: null,
          leaseToken: null,
          leaseUntil: null,
          availableAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(adsRequests.id, j.id), eq(adsRequests.state, "UNKNOWN")))
        .returning({ id: adsRequests.id });
      if (!rows.length) fail("ADS_CHANGED", "Request vừa thay đổi.");
      if (j.bulkBatchId) {
        await tx
          .update(adsBatches)
          .set({ state: "RUNNING", updatedAt: new Date() })
          .where(
            and(
              eq(adsBatches.id, j.bulkBatchId),
              eq(adsBatches.state, "NEEDS_ACTION"),
            ),
          );
        await tx
          .insert(adsBatchHistory)
          .values({
            batchId: j.bulkBatchId,
            actorId: actor!.id,
            action: "VERIFIED_RECOVERY",
            details: { requestId: j.id, kind, id },
          });
      }
      await tx.insert(adsHistory).values({
        requestId: j.id,
        actorId: actor!.id,
        action: "VERIFIED_RECOVERY",
        details: { kind, id, reason: v.reason ?? "Read-only verification" },
      });
    });
    return { id: j.id, state: "QUEUED" };
  }
  async tick() {
    await this.db
      .update(adsRequests)
      .set({
        state: sql`CASE WHEN ${adsRequests.phase}='NONE' THEN 'QUEUED' ELSE 'UNKNOWN' END`,
        errorCode: "ADS_LEASE_EXPIRED",
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adsRequests.state, "PROCESSING"),
          lte(adsRequests.leaseUntil, new Date()),
        ),
      );
    const due = await this.db
      .select({ id: adsRequests.id })
      .from(adsRequests)
      .where(
        and(
          eq(adsRequests.state, "QUEUED"),
          isNull(adsRequests.bulkBatchId),
          lte(adsRequests.availableAt, new Date()),
        ),
      )
      .orderBy(adsRequests.createdAt)
      .limit(10);
    for (const j of due) await this.run(j.id);
  }
  async material(job: typeof adsRequests.$inferSelect, kind: Kind) {
    const field =
      kind === "campaign"
        ? "campaignRefId"
        : kind === "adSet"
          ? "adSetRefId"
          : null;
    let owner = job;
    const visited = new Set<string>();
    while (field && owner[field]) {
      if (visited.has(owner.id) || visited.size >= 100)
        fail("ADS_PARENT_CYCLE", "Parent reference không hợp lệ.");
      visited.add(owner.id);
      const [p] = await this.db
        .select()
        .from(adsRequests)
        .where(eq(adsRequests.id, owner[field]!));
      if (
        !p ||
        p.pageId !== job.pageId ||
        p.accountId !== job.accountId ||
        p.source !== job.source
      )
        fail("ADS_PARENT_SCOPE", "Parent không cùng Page/TKQC/source.");
      owner = p;
    }
    return { owner, id: owner[ids[kind]] };
  }
  async run(id: string, generation?: number) {
    const lease = randomUUID();
    let job: Request | undefined = await this.db.transaction(async (tx) => {
      const [j] = await tx
        .select()
        .from(adsRequests)
        .where(eq(adsRequests.id, id))
        .for("update");
      if (
        !j ||
        j.state !== "QUEUED" ||
        j.availableAt > new Date() ||
        (generation !== undefined && generation !== j.generation)
      )
        return undefined;
      return (
        await tx
          .update(adsRequests)
          .set({
            state: "PROCESSING",
            leaseToken: lease,
            leaseUntil: new Date(Date.now() + 180000),
            attempts: j.attempts + 1,
            updatedAt: new Date(),
          })
          .where(eq(adsRequests.id, id))
          .returning()
      )[0];
    });
    if (!job) return;
    const patch = async (values: Partial<typeof adsRequests.$inferInsert>) => {
      const [r] = await this.db
        .update(adsRequests)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(adsRequests.id, id),
            eq(adsRequests.state, "PROCESSING"),
            eq(adsRequests.leaseToken, lease),
          ),
        )
        .returning();
      if (!r) fail("ADS_LEASE", "Request lease đã đổi. Không gửi tiếp.", 409);
      job = r;
    };
    const heartbeat = setInterval(() => {
      void this.db
        .update(adsRequests)
        .set({ leaseUntil: new Date(Date.now() + 180000) })
        .where(
          and(
            eq(adsRequests.id, id),
            eq(adsRequests.state, "PROCESSING"),
            eq(adsRequests.leaseToken, lease),
          ),
        )
        .catch(() => {});
    }, 30000);
    let mutation = false;
    try {
      for (const kind of kinds) {
        if (job.bulkBatchId) {
          const [b] = await this.db
            .select()
            .from(adsBatches)
            .where(eq(adsBatches.id, job.bulkBatchId));
          if (!b || b.state !== "RUNNING") {
            await patch({
              state: "QUEUED",
              generation: job.generation + 1,
              enqueuedAt: null,
              leaseToken: null,
              leaseUntil: null,
            });
            return;
          }
        }
        const material = await this.material(job, kind);
        if (
          material.owner.id !== job.id &&
          material.owner.state !== "SUCCEEDED"
        ) {
          await patch({
            state: "WAITING",
            generation: job.generation + 1,
            enqueuedAt: null,
            leaseToken: null,
            leaseUntil: null,
          });
          await this.db
            .insert(adsHistory)
            .values({
              requestId: id,
              action: "WAITING_PARENT",
              details: { kind, parentRequestId: material.owner.id },
            });
          return;
        }
        const r = await this.context(job);
        const proof = await r.provider.preflight(r.ctx);
        if (job.mode === "NEW_CREATIVE" && !proof.thumbnailUrl)
          fail("ADS_THUMBNAIL", "Thumbnail chưa sẵn sàng.");
        const field = ids[kind],
          payload = this.payload(job, kind, proof.thumbnailUrl);
        if (material.owner.id !== job.id) {
          if (!material.id) fail("ADS_PARENT_ID", "Parent chưa có ID.");
          await r.provider.verify(
            r.ctx,
            kind,
            material.id,
            this.payload(material.owner, kind),
            material.owner.id,
          );
          if (job[field] && job[field] !== material.id)
            fail("ADS_PARENT_CHANGED", "Parent ID đổi, không gửi tiếp.");
          await patch({ [field]: material.id, phase: kind });
        } else if (!job[field]) {
          await patch({ phase: kind });
          mutation = true;
          const externalId = await r.provider.create(
            r.ctx,
            kind,
            payload,
            job.id,
          );
          await patch({ [field]: externalId });
          mutation = false;
          await this.db.insert(adsHistory).values({
            requestId: id,
            action: "CREATED",
            details: { kind, id: externalId, source: job.source },
          });
        }
        await patch({ phase: kind });
        await r.provider.verify(
          r.ctx,
          kind,
          job[field]!,
          material.owner.id === job.id
            ? payload
            : this.payload(material.owner, kind),
          material.owner.id,
        );
      }
      const finalContext = await this.context(job);
      for (const kind of kinds) {
        const material = await this.material(job, kind);
        await finalContext.provider.verify(
          finalContext.ctx,
          kind,
          job[ids[kind]]!,
          this.payload(material.owner, kind),
          material.owner.id,
        );
      }
      await this.db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(adsRequests)
          .where(eq(adsRequests.id, id))
          .for("update");
        if (locked.state !== "PROCESSING" || locked.leaseToken !== lease)
          fail("ADS_LEASE", "Lease đã đổi.");
        if (locked.mode === "NEW_CREATIVE" && locked.trackingId) {
          const [t] = await tx
            .select()
            .from(trackingRecords)
            .where(eq(trackingRecords.id, locked.trackingId))
            .for("update");
          if (t.adId && t.adId !== locked.adId)
            fail("ADS_TRACKING_USED", "Tracking đã thuộc Ad khác.");
          await tx
            .update(trackingRecords)
            .set({
              campaignId: locked.campaignId,
              adSetId: locked.adSetId,
              adId: locked.adId,
            })
            .where(eq(trackingRecords.id, t.id));
        }
        await tx
          .update(adsRequests)
          .set({
            state: "SUCCEEDED",
            phase: "DONE",
            verifiedAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            errorCode: null,
            updatedAt: new Date(),
          })
          .where(eq(adsRequests.id, id));
        await tx.insert(adsHistory).values({
          requestId: id,
          action: "VERIFIED_PAUSED",
          details: {
            source: locked.source,
            campaignId: locked.campaignId,
            adSetId: locked.adSetId,
            creativeId: locked.creativeId,
            adId: locked.adId,
            attribution:
              locked.mode === "EXISTING_POST"
                ? "SHARED_SUBID"
                : "USER_DECLARED_ADS_MAPPING",
          },
        });
        await tx.insert(auditLogs).values({
          actorId: locked.createdBy,
          action: "ADS_CREATED_PAUSED",
          resourceId: id,
          metadata: { source: locked.source, accountId: locked.accountId },
        });
      });
    } catch (e) {
      const code = e instanceof AppError ? e.code : "ADS_STORAGE_OR_NETWORK";
      const ambiguous =
        (mutation &&
          (!(e instanceof AppError) || e.code === "META_RESULT_UNKNOWN")) ||
        !!job[ids[job.phase as Kind]];
      const retry =
        e instanceof AppError &&
        e.code === "META_RATE_LIMIT" &&
        !ambiguous &&
        job.attempts < 5;
      const state = ambiguous ? "UNKNOWN" : retry ? "QUEUED" : "FAILED";
      await this.db.transaction(async (tx) => {
        const changed = await tx
          .update(adsRequests)
          .set({
            state,
            errorCode: code,
            availableAt: new Date(
              Date.now() +
                Math.max(
                  30,
                  e instanceof AppError ? (e.retryAfter ?? 30) : 30,
                ) *
                  1000,
            ),
            leaseToken: null,
            leaseUntil: null,
            updatedAt: new Date(),
          })
          .where(and(eq(adsRequests.id, id), eq(adsRequests.leaseToken, lease)))
          .returning({ id: adsRequests.id });
        if (changed.length)
          await tx.insert(adsHistory).values({
            requestId: id,
            action: state,
            details: { code, phase: job!.phase },
          });
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
}
function vWithoutConfirm(v: z.infer<typeof confirmInput>) {
  const { fingerprint, requestKey, confirmed, ...input } = v;
  void fingerprint;
  void requestKey;
  void confirmed;
  return input;
}
function publicProjection(j: Request) {
  return Object.fromEntries(
    Object.keys(publicFields).map((k) => [k, j[k as keyof Request]]),
  );
}
