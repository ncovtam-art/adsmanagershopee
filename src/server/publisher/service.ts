import { and, eq, or, isNull, inArray, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDatabase } from "../db";
import {
  videoAssets,
  pages,
  products,
  captionTemplates,
  publisherPageSettings,
  publishBatches,
  publishJobs,
  publishHistory,
  publisherControls,
  trackingRecords,
  trackingLinkVersions,
  metaConnections,
  auditLogs,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { accessibleIds, requireResource } from "../meta/access";
import { AppError } from "../http/errors";
import { unseal } from "../meta/crypto";
import { ambiguousTrackingIds } from "../shopee/link-ambiguity";
import { TrackingService } from "../shopee/tracking";
import { VideoStorage } from "./storage";
import {
  uploadSchema,
  templateSchema,
  pagePolicySchema,
  prepareSchema,
  confirmSchema,
  renderTemplate,
  validateTemplate,
  previewHash,
  safeFilename,
  metaObjectId,
} from "./validation";
import { publisherFor, type PublisherProvider } from "./provider";
import type { Source } from "../meta/types";
type Reader = Pick<AppDatabase, "select">;
export const assetFields = {
  id: videoAssets.id,
  pageId: videoAssets.pageId,
  source: videoAssets.source,
  filename: videoAssets.filename,
  size: videoAssets.size,
  state: videoAssets.state,
  sha256: videoAssets.sha256,
  durationMs: videoAssets.durationMs,
  width: videoAssets.width,
  height: videoAssets.height,
  aspectRatio: videoAssets.aspectRatio,
  niche: videoAssets.niche,
  productId: videoAssets.productId,
  duplicateOf: videoAssets.duplicateOf,
  errorCode: videoAssets.errorCode,
  createdAt: videoAssets.createdAt,
};
export const jobFields = {
  id: publishJobs.id,
  batchId: publishJobs.batchId,
  kind: publishJobs.kind,
  parentJobId: publishJobs.parentJobId,
  assetId: publishJobs.assetId,
  pageId: publishJobs.pageId,
  source: publishJobs.source,
  trackingId: publishJobs.trackingId,
  caption: publishJobs.caption,
  commentBody: publishJobs.commentBody,
  state: publishJobs.state,
  phase: publishJobs.phase,
  availableAt: publishJobs.availableAt,
  attempts: publishJobs.attempts,
  progress: publishJobs.progress,
  metaVideoId: publishJobs.metaVideoId,
  postId: publishJobs.postId,
  commentId: publishJobs.commentId,
  provenance: publishJobs.provenance,
  errorCode: publishJobs.errorCode,
  createdAt: publishJobs.createdAt,
  updatedAt: publishJobs.updatedAt,
};
export class PublisherService {
  constructor(
    private db: AppDatabase,
    readonly storage = new VideoStorage(),
    private providers: (s: Source) => PublisherProvider = publisherFor,
  ) {}
  async page(actor: Actor | null, pageId: string) {
    requirePermission(actor, "workspace:read");
    await requireResource(this.db, actor, "page", pageId);
    const [p] = await this.db.select().from(pages).where(eq(pages.id, pageId));
    if (!p) throw new AppError(404, "PAGE_NOT_FOUND", "Không tìm thấy Page.");
    return p;
  }
  async asset(actor: Actor | null, id: string) {
    const [a] = await this.db
      .select()
      .from(videoAssets)
      .where(eq(videoAssets.id, id));
    if (!a) throw new AppError(404, "VIDEO_NOT_FOUND", "Không tìm thấy video.");
    await this.page(actor, a.pageId);
    return a;
  }
  async library(actor: Actor | null, input: unknown) {
    requirePermission(actor, "workspace:read");
    const q = z
      .object({
        source: z.enum(["LIVE", "MOCK"]).default("LIVE"),
        pageId: z.string().uuid().optional(),
        search: z.string().max(180).default(""),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(input);
    const ids = await accessibleIds(this.db, actor, "page");
    if (q.pageId) await this.page(actor, q.pageId);
    if (ids?.length === 0) return { rows: [], count: 0, page: q.page };
    const conditions = and(
      eq(videoAssets.source, q.source),
      ids ? inArray(videoAssets.pageId, ids) : undefined,
      q.pageId ? eq(videoAssets.pageId, q.pageId) : undefined,
      q.search
        ? sql`${videoAssets.filename} ILIKE ${"%" + q.search.replace(/[\\%_]/g, "\\$&") + "%"}`
        : undefined,
    );
    const rows = await this.db
      .select({
        ...assetFields,
        pageName: pages.name,
        productName: products.name,
      })
      .from(videoAssets)
      .innerJoin(pages, eq(pages.id, videoAssets.pageId))
      .leftJoin(products, eq(products.id, videoAssets.productId))
      .where(conditions)
      .orderBy(desc(videoAssets.createdAt))
      .limit(50)
      .offset((q.page - 1) * 50);
    const count = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(videoAssets)
      .where(conditions);
    return { rows, count: count[0].n, page: q.page };
  }
  async beginUpload(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    const v = uploadSchema.parse(input),
      page = await this.page(actor, v.pageId);
    if (v.productId) {
      const [p] = await this.db
        .select()
        .from(products)
        .where(eq(products.id, v.productId));
      if (!p?.active)
        throw new AppError(
          422,
          "VIDEO_PRODUCT",
          "Chọn sản phẩm đang hoạt động.",
        );
    }
    const id = randomUUID();
    const [a] = await this.db
      .insert(videoAssets)
      .values({
        id,
        pageId: page.id,
        source: page.source,
        filename: safeFilename(v.filename),
        size: v.size,
        niche: v.niche,
        productId: v.productId,
        storageKey: `${page.source}/${id}.mp4`,
        uploadedBy: actor.id,
      })
      .returning(assetFields);
    return a;
  }
  async upload(
    actor: Actor | null,
    id: string,
    body: ReadableStream<Uint8Array> | null,
  ) {
    requirePermission(actor, "publisher:write");
    const a = await this.asset(actor, id);
    if (a.uploadedBy !== actor.id)
      throw new AppError(
        403,
        "UPLOAD_OWNER",
        "Chỉ người tạo upload ticket được gửi nội dung.",
      );
    if (a.state === "READY")
      return (
        await this.db
          .select(assetFields)
          .from(videoAssets)
          .where(eq(videoAssets.id, id))
      )[0];
    const [claim] = await this.db
      .update(videoAssets)
      .set({ state: "UPLOADING", updatedAt: new Date() })
      .where(and(eq(videoAssets.id, id), eq(videoAssets.state, "NEW")))
      .returning();
    if (!claim)
      throw new AppError(
        409,
        "UPLOAD_BUSY",
        "Ticket đã được dùng/đang tải. Tạo ticket mới nếu tệp lỗi.",
      );
    try {
      const meta = await this.storage.write(a.storageKey, body, a.size);
      return await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${a.pageId + meta.sha256},847307))`,
        );
        const [duplicate] = await tx
          .select({ id: videoAssets.id })
          .from(videoAssets)
          .where(
            and(
              eq(videoAssets.pageId, a.pageId),
              eq(videoAssets.sha256, meta.sha256),
              eq(videoAssets.state, "READY"),
            ),
          )
          .limit(1);
        const [ready] = await tx
          .update(videoAssets)
          .set({
            ...meta,
            state: "READY",
            duplicateOf: duplicate?.id ?? null,
            updatedAt: new Date(),
          })
          .where(eq(videoAssets.id, id))
          .returning(assetFields);
        await tx.insert(auditLogs).values({
          actorId: actor.id,
          action: "VIDEO_UPLOADED",
          resourceId: id,
          metadata: {
            pageId: a.pageId,
            source: a.source,
            size: a.size,
            duplicateOf: duplicate?.id ?? null,
          },
        });
        return ready;
      });
    } catch (e) {
      await this.db
        .update(videoAssets)
        .set({
          state: "FAILED",
          errorCode: e instanceof AppError ? e.code : "UPLOAD_FAILED",
          updatedAt: new Date(),
        })
        .where(eq(videoAssets.id, id));
      throw e;
    }
  }
  async templates(actor: Actor | null) {
    requirePermission(actor, "workspace:read");
    const ids = await accessibleIds(this.db, actor, "page");
    return this.db
      .select()
      .from(captionTemplates)
      .where(
        ids
          ? or(
              isNull(captionTemplates.pageId),
              ids.length ? inArray(captionTemplates.pageId, ids) : sql`false`,
            )
          : undefined,
      )
      .orderBy(captionTemplates.name);
  }
  async saveTemplate(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    const v = templateSchema.parse(input);
    validateTemplate(v.body);
    if (v.pageId) await this.page(actor, v.pageId);
    else requirePermission(actor, "settings:write");
    return this.db.transaction(async (tx) => {
      if (v.id) {
        const [old] = await tx
          .select()
          .from(captionTemplates)
          .where(eq(captionTemplates.id, v.id));
        if (!old)
          throw new AppError(
            404,
            "TEMPLATE_NOT_FOUND",
            "Template không còn tồn tại.",
          );
        if (old.pageId) await this.page(actor, old.pageId);
        else requirePermission(actor, "settings:write");
      }
      const values = {
        name: v.name,
        kind: v.kind,
        pageId: v.pageId,
        niche: v.niche,
        body: v.body,
        updatedAt: new Date(),
      };
      const [saved] = v.id
        ? await tx
            .update(captionTemplates)
            .set(values)
            .where(eq(captionTemplates.id, v.id))
            .returning()
        : await tx
            .insert(captionTemplates)
            .values({ ...values, createdBy: actor.id })
            .returning();
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "PUBLISH_TEMPLATE_SAVED",
        resourceId: saved.id,
        metadata: { kind: v.kind, pageId: v.pageId, niche: v.niche },
      });
      return saved;
    });
  }
  async policy(actor: Actor | null, pageId: string) {
    const page = await this.page(actor, pageId);
    const [p] = await this.db
      .select()
      .from(publisherPageSettings)
      .where(eq(publisherPageSettings.pageId, pageId));
    return {
      pageId,
      enabled: page.publishSettings.enabled,
      autoComment: p?.autoComment ?? false,
      delaySeconds: p?.delaySeconds ?? 60,
      commentTemplateId: p?.commentTemplateId ?? null,
      removePreview: p?.removePreview ?? false,
      previewCapability: "UNSUPPORTED" as const,
    };
  }
  async savePolicy(actor: Actor | null, input: unknown) {
    requirePermission(actor, "meta:manage");
    const v = pagePolicySchema.parse(input);
    await this.page(actor, v.pageId);
    if (v.commentTemplateId) {
      const [t] = await this.db
        .select()
        .from(captionTemplates)
        .where(eq(captionTemplates.id, v.commentTemplateId));
      if (!t || t.kind !== "COMMENT" || (t.pageId && t.pageId !== v.pageId))
        throw new AppError(
          422,
          "COMMENT_TEMPLATE",
          "Chọn Comment template đúng Page/ngách.",
        );
    }
    return this.db.transaction(async (tx) => {
      await tx
        .update(pages)
        .set({ publishSettings: { enabled: v.enabled }, updatedAt: new Date() })
        .where(eq(pages.id, v.pageId));
      const data = {
        pageId: v.pageId,
        autoComment: v.autoComment,
        delaySeconds: v.delaySeconds,
        commentTemplateId: v.commentTemplateId,
        removePreview: v.removePreview,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      await tx.insert(publisherPageSettings).values(data).onConflictDoUpdate({
        target: publisherPageSettings.pageId,
        set: data,
      });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "PUBLISH_PAGE_POLICY",
        resourceId: v.pageId,
        metadata: { ...v },
      });
      return { ok: true };
    });
  }
  async createTracking(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    const v = z
        .object({
          assetId: z.string().uuid(),
          affiliateAccount: z.string().min(2).max(64),
        })
        .strict()
        .parse(input),
      a = await this.asset(actor, v.assetId);
    if (!a.productId)
      throw new AppError(
        422,
        "VIDEO_PRODUCT",
        "Video cần sản phẩm trước khi tạo tracking.",
      );
    return new TrackingService(this.db).create(actor, {
      pageIds: [a.pageId],
      productId: a.productId,
      affiliateAccount: v.affiliateAccount,
      channel: "ORGANIC",
      contentRef: a.filename,
      contentId: a.id,
    });
  }
  private async build(actor: Actor, input: unknown, reader: Reader = this.db) {
    const v = prepareSchema.parse(input),
      prepared = [],
      templates = await reader.select().from(captionTemplates).for("share");
    let source: Source | undefined;
    const ambiguous = await ambiguousTrackingIds(this.db);
    for (const assetId of v.assetIds) {
      const [a] = await reader
        .select()
        .from(videoAssets)
        .where(eq(videoAssets.id, assetId))
        .for("share");
      if (!a || a.state !== "READY" || !a.sha256)
        throw new AppError(422, "VIDEO_NOT_READY", "Video chưa sẵn sàng.");
      await requireResource(this.db, actor, "page", a.pageId);
      const [page] = await reader
        .select()
        .from(pages)
        .where(eq(pages.id, a.pageId))
        .for("share");
      const [conn] = await reader
        .select()
        .from(metaConnections)
        .where(eq(metaConnections.id, page.connectionId))
        .for("share");
      if (!page.publishSettings.enabled)
        throw new AppError(
          422,
          "PUBLISH_DISABLED",
          "OWNER/ADMIN cần bật đăng video cho Page trong Cấu hình Page.",
        );
      if (
        page.source !== a.source ||
        page.status !== "AUTHORIZED" ||
        !page.tasks.includes("CREATE_CONTENT") ||
        !conn.scopes.includes("pages_manage_posts") ||
        conn.expiresAt.getTime() <= Date.now()
      )
        throw new AppError(
          403,
          "PUBLISH_PERMISSION",
          "Page/kết nối thiếu quyền đăng hoặc token đã hết hạn. Kiểm tra quyền rồi kết nối lại.",
        );
      if (source && source !== page.source)
        throw new AppError(
          422,
          "PUBLISH_SOURCE",
          "Không đăng lẫn LIVE/MOCK trong một batch.",
        );
      source = page.source;
      const [policy] = await reader
        .select()
        .from(publisherPageSettings)
        .where(eq(publisherPageSettings.pageId, page.id))
        .for("share");
      const [product] = a.productId
        ? await reader
            .select()
            .from(products)
            .where(eq(products.id, a.productId))
            .for("share")
        : [];
      const trackingId = v.trackingIds[a.id];
      const [track] = trackingId
        ? await reader
            .select()
            .from(trackingRecords)
            .where(eq(trackingRecords.id, trackingId))
            .for("share")
        : [];
      if (
        trackingId &&
        (!track ||
          track.pageId !== a.pageId ||
          track.contentId !== a.id ||
          track.source !== a.source ||
          track.channel === "ADS" ||
          (a.productId && track.productId !== a.productId))
      )
        throw new AppError(
          422,
          "PUBLISH_TRACKING",
          "Tracking phải thuộc đúng Video/Page/Product/source và là Organic/Shared.",
        );
      const [link] = track
        ? await reader
            .select()
            .from(trackingLinkVersions)
            .where(
              and(
                eq(trackingLinkVersions.trackingId, track.id),
                eq(trackingLinkVersions.version, track.linkVersion),
              ),
            )
            .for("share")
        : [];
      const vars = {
        affiliate_url: link?.url ?? "",
        sub_id: track?.subId ?? "",
        product_name: product?.name ?? "",
        page_name: page.name,
        video_name: a.filename,
      };
      const matching = (kind: "CAPTION" | "COMMENT") =>
        templates
          .filter(
            (t) =>
              t.kind === kind &&
              (!t.pageId || t.pageId === page.id) &&
              (!t.niche || t.niche === a.niche),
          )
          .sort(
            (a, b) =>
              Number(!!b.pageId) * 2 +
              Number(!!b.niche) -
              Number(!!a.pageId) * 2 -
              Number(!!a.niche),
          )[0];
      const chosen = v.templateId
        ? templates.find((t) => t.id === v.templateId)
        : matching("CAPTION");
      if (
        v.templateId &&
        (!chosen ||
          chosen.kind !== "CAPTION" ||
          (chosen.pageId && chosen.pageId !== page.id) ||
          (chosen.niche && chosen.niche !== a.niche))
      )
        throw new AppError(
          422,
          "CAPTION_TEMPLATE",
          "Caption template không phù hợp Page/ngách.",
        );
      const caption = renderTemplate(chosen?.body ?? v.caption, vars);
      const commentTemplate = policy?.commentTemplateId
        ? templates.find((t) => t.id === policy.commentTemplateId)
        : matching("COMMENT");
      if (
        commentTemplate &&
        (commentTemplate.kind !== "COMMENT" ||
          (commentTemplate.pageId && commentTemplate.pageId !== page.id) ||
          (commentTemplate.niche && commentTemplate.niche !== a.niche))
      )
        throw new AppError(
          422,
          "COMMENT_TEMPLATE",
          "Comment template không phù hợp Page/ngách.",
        );
      const commentPolicy = {
        enabled: policy?.autoComment ?? false,
        delaySeconds: policy?.delaySeconds ?? 60,
        removePreview: policy?.removePreview ?? false,
      };
      if (
        commentPolicy.enabled &&
        !conn.scopes.includes("pages_manage_engagement")
      )
        throw new AppError(
          403,
          "COMMENT_PERMISSION",
          "Auto-comment cần pages_manage_engagement. Cấp quyền và kết nối Facebook lại.",
        );
      if (commentPolicy.enabled && !link)
        throw new AppError(
          422,
          "COMMENT_LINK",
          "Auto-comment cần Custom Link đã khai báo cho đúng SubID/video.",
        );
      const commentBody = commentPolicy.enabled
        ? renderTemplate(
            commentTemplate?.body ?? "Link sản phẩm 👇 {affiliate_url}",
            vars,
          )
        : null;
      const old = await reader
        .select({ id: publishJobs.id, state: publishJobs.state })
        .from(publishJobs)
        .innerJoin(videoAssets, eq(videoAssets.id, publishJobs.assetId))
        .where(
          and(
            eq(publishJobs.pageId, page.id),
            eq(publishJobs.kind, "VIDEO"),
            eq(videoAssets.sha256, a.sha256),
            inArray(publishJobs.state, [
              "QUEUED",
              "SCHEDULED",
              "PROCESSING",
              "PROCESSING_META",
              "UNKNOWN",
              "PAUSED",
              "SUCCEEDED",
            ]),
          ),
        );
      const active = old.some((j) => j.state !== "SUCCEEDED");
      if (active)
        throw new AppError(
          409,
          "PUBLISH_DUPLICATE_ACTIVE",
          "Video cùng hash đã có job đang chờ/đang xử lý/UNKNOWN. Kiểm tra job hiện có, không đăng lại.",
        );
      if (old.length && !v.allowRepost)
        throw new AppError(
          409,
          "PUBLISH_ALREADY_POSTED",
          "Video cùng hash đã đăng. Chỉ đăng lại nếu chọn rõ Cho phép đăng lại.",
        );
      prepared.push({
        assetId: a.id,
        pageId: page.id,
        pageName: page.name,
        filename: a.filename,
        sha256: a.sha256,
        source: a.source,
        caption,
        commentBody,
        commentPolicy,
        trackingId: track?.id ?? null,
        subId: track?.subId ?? null,
        linkVersionId: link?.id ?? null,
        affiliateUrl: link?.url ?? null,
        policyUpdatedAt: policy?.updatedAt.toISOString() ?? null,
        connectionCheckedAt: conn.checkedAt.toISOString(),
        warnings: [
          ...(a.duplicateOf ? ["VIDEO_DUPLICATE_HASH"] : []),
          ...(track && (track.channel === "SHARED" || ambiguous.has(track.id))
            ? ["SHARED_LINK"]
            : []),
          ...(link ? ["USER_DECLARED_LINK"] : []),
          ...(commentPolicy.removePreview ? ["PREVIEW_UNSUPPORTED"] : []),
        ],
      });
    }
    const fingerprint = previewHash({
      publishAt: v.publishAt,
      allowRepost: v.allowRepost,
      prepared,
    });
    return {
      fingerprint,
      source: source!,
      publishAt: v.publishAt,
      rows: prepared,
    };
  }
  async preview(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    return this.build(actor, input);
  }
  async confirm(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    const v = confirmSchema.parse(input);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847306)`);
      const [old] = await tx
        .select()
        .from(publishBatches)
        .where(
          and(
            eq(publishBatches.actorId, actor.id),
            eq(publishBatches.requestKey, v.requestKey),
          ),
        );
      if (old) {
        if (old.fingerprint !== v.fingerprint)
          throw new AppError(
            409,
            "BATCH_CHANGED",
            "Request key đã dùng cho preview khác.",
          );
        const jobs = await tx
          .select(jobFields)
          .from(publishJobs)
          .where(eq(publishJobs.batchId, old.id));
        for (const job of jobs) await this.page(actor, job.pageId);
        return { batchId: old.id, duplicate: true, jobs };
      }
      const { fingerprint, rows } = await this.build(
        actor,
        {
          assetIds: v.assetIds,
          trackingIds: v.trackingIds,
          caption: v.caption,
          templateId: v.templateId,
          publishAt: v.publishAt,
          allowRepost: v.allowRepost,
        },
        tx,
      );
      if (fingerprint !== v.fingerprint)
        throw new AppError(
          409,
          "PUBLISH_PREVIEW_CHANGED",
          "Video/link/template/quyền đã đổi. Xem lại preview trước khi đăng.",
        );
      const [batch] = await tx
        .insert(publishBatches)
        .values({ requestKey: v.requestKey, fingerprint, actorId: actor.id })
        .returning();
      const jobs = await tx
        .insert(publishJobs)
        .values(
          rows.map((r) => ({
            batchId: batch.id,
            assetId: r.assetId,
            pageId: r.pageId,
            source: r.source,
            kind: "VIDEO",
            trackingId: r.trackingId,
            linkVersionId: r.linkVersionId,
            caption: r.caption,
            commentBody: r.commentBody,
            commentPolicy: r.commentPolicy,
            state: v.publishAt ? ("SCHEDULED" as const) : ("QUEUED" as const),
            availableAt: v.publishAt ? new Date(v.publishAt) : new Date(),
            createdBy: actor.id,
          })),
        )
        .returning(jobFields);
      await tx.insert(publishHistory).values(
        jobs.map((j) => ({
          jobId: j.id,
          actorId: actor.id,
          action: "CONFIRMED",
          details: { source: j.source, state: j.state, fingerprint },
        })),
      );
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "PUBLISH_BATCH_CONFIRMED",
        resourceId: batch.id,
        metadata: {
          count: jobs.length,
          source: rows[0].source,
          publishAt: v.publishAt,
        },
      });
      return { batchId: batch.id, duplicate: false, jobs };
    });
  }
  async jobs(actor: Actor | null, input: unknown) {
    requirePermission(actor, "workspace:read");
    const q = z
      .object({
        source: z.enum(["LIVE", "MOCK"]).default("LIVE"),
        pageId: z.string().uuid().optional(),
        state: z.string().max(30).optional(),
      })
      .parse(input);
    const ids = await accessibleIds(this.db, actor, "page");
    if (q.pageId) await this.page(actor, q.pageId);
    if (ids?.length === 0) return [];
    return this.db
      .select({
        ...jobFields,
        filename: videoAssets.filename,
        pageName: pages.name,
      })
      .from(publishJobs)
      .innerJoin(videoAssets, eq(videoAssets.id, publishJobs.assetId))
      .innerJoin(pages, eq(pages.id, publishJobs.pageId))
      .where(
        and(
          eq(publishJobs.source, q.source),
          ids ? inArray(publishJobs.pageId, ids) : undefined,
          q.pageId ? eq(publishJobs.pageId, q.pageId) : undefined,
          q.state ? sql`${publishJobs.state}::text = ${q.state}` : undefined,
        ),
      )
      .orderBy(desc(publishJobs.createdAt))
      .limit(500);
  }
  async job(actor: Actor | null, id: string) {
    const [j] = await this.db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.id, id));
    if (!j) throw new AppError(404, "PUBLISH_JOB", "Job không tồn tại.");
    await this.page(actor, j.pageId);
    return j;
  }
  async history(actor: Actor | null, id: string) {
    await this.job(actor, id);
    return this.db
      .select()
      .from(publishHistory)
      .where(eq(publishHistory.jobId, id))
      .orderBy(desc(publishHistory.createdAt))
      .limit(100);
  }
  async control(actor: Actor | null, paused?: boolean) {
    requirePermission(actor, "workspace:read");
    if (paused !== undefined) {
      requirePermission(actor, "meta:manage");
      await this.db.transaction(async (tx) => {
        await tx
          .insert(publisherControls)
          .values({ id: "main", paused, updatedBy: actor.id })
          .onConflictDoUpdate({
            target: publisherControls.id,
            set: { paused, updatedBy: actor.id, updatedAt: new Date() },
          });
        await tx.insert(auditLogs).values({
          actorId: actor.id,
          action: paused ? "PUBLISH_QUEUE_PAUSED" : "PUBLISH_QUEUE_RESUMED",
          resourceId: "main",
          metadata: { paused },
        });
      });
    }
    const [row] = await this.db
      .select({ paused: publisherControls.paused })
      .from(publisherControls)
      .where(eq(publisherControls.id, "main"));
    return { paused: row?.paused ?? false };
  }
  async action(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    const v = z
      .object({
        id: z.string().uuid(),
        action: z.enum(["pause", "resume", "cancel", "retry"]),
      })
      .strict()
      .parse(input);
    await this.job(actor, v.id);
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(publishJobs)
        .where(eq(publishJobs.id, v.id))
        .for("update");
      let state: typeof publishJobs.$inferSelect.state;
      if (v.action === "pause" && ["QUEUED", "SCHEDULED"].includes(job.state))
        state = "PAUSED";
      else if (
        v.action === "cancel" &&
        ["QUEUED", "SCHEDULED", "PAUSED", "FAILED", "DEAD_LETTER"].includes(
          job.state,
        ) &&
        ((job.kind === "VIDEO" && !job.postId) ||
          (job.kind === "COMMENT" && !job.commentId))
      )
        state = "CANCELLED";
      else if (v.action === "resume" && job.state === "PAUSED")
        state = job.availableAt > new Date() ? "SCHEDULED" : "QUEUED";
      else if (
        v.action === "retry" &&
        ["FAILED", "DEAD_LETTER"].includes(job.state) &&
        ((job.kind === "COMMENT" && !job.commentId) ||
          (job.kind === "VIDEO" &&
            !job.postId &&
            !["POST_LOOKUP", "DONE"].includes(job.phase)))
      )
        state = "QUEUED";
      else
        throw new AppError(
          409,
          "PUBLISH_STATE",
          "Không thể đổi trạng thái này. UNKNOWN phải kiểm tra/kết nối Post/Comment ID; không retry mù.",
        );
      const [row] = await tx
        .update(publishJobs)
        .set({
          state,
          generation: job.generation + 1,
          ...(v.action === "retry"
            ? {
                attempts: 0,
                availableAt: new Date(),
                phase:
                  job.metaVideoId && job.kind === "VIDEO"
                    ? job.phase
                    : "CREATED",
                progress: job.metaVideoId ? job.progress : 0,
              }
            : {}),
          enqueuedAt: null,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(publishJobs.id, job.id))
        .returning(jobFields);
      await tx.insert(publishHistory).values({
        jobId: job.id,
        actorId: actor.id,
        action: v.action.toUpperCase(),
        details: { from: job.state, state },
      });
      return row;
    });
  }
  async recover(actor: Actor | null, input: unknown) {
    requirePermission(actor, "publisher:write");
    const v = z
        .object({
          id: z.string().uuid(),
          externalId: metaObjectId.optional(),
          confirmed: z.boolean().default(false),
          reason: z.string().trim().min(5).max(500).optional(),
        })
        .strict()
        .parse(input),
      j = await this.job(actor, v.id);
    if (!["UNKNOWN", "PROCESSING_META"].includes(j.state))
      throw new AppError(
        409,
        "RECOVERY_STATE",
        "Chỉ kiểm tra job UNKNOWN/đang chờ Meta xử lý.",
      );
    const page = await this.page(actor, j.pageId);
    if (page.source !== j.source)
      throw new AppError(409, "PUBLISH_SOURCE", "Nguồn Page đã đổi.");
    const p = this.providers(j.source),
      token = unseal(page.encryptedToken);
    let postId: string | null = j.postId,
      videoId = j.metaVideoId,
      commentId: string | null = null;
    if (j.kind === "VIDEO") {
      if (v.externalId) {
        if (!v.confirmed || !v.reason)
          throw new AppError(
            422,
            "RECOVERY_CONFIRM",
            "Xác nhận Post ID đúng video và ghi lý do trước khi nối kết quả thủ công.",
          );
        const proof = await p.inspectPost(token, page.metaId, v.externalId);
        if (videoId && proof.videoId !== videoId)
          throw new AppError(
            422,
            "RECOVERY_VIDEO",
            "Post không tham chiếu Video ID đã biết.",
          );
        postId = proof.postId;
        videoId = proof.videoId;
      } else {
        if (!videoId)
          throw new AppError(
            422,
            "RECOVERY_MANUAL",
            "Chưa có Video ID; kiểm tra Page và nối Post ID đúng video. Không đăng lại.",
          );
        const proof = await p.inspect(token, page.metaId, videoId);
        postId = proof.postId;
        if (!postId)
          return {
            state: j.state,
            code: "META_STILL_PROCESSING",
            message:
              "Meta chưa trả Post ID. Giữ trạng thái, không gửi lại video.",
          };
      }
    } else {
      if (!v.externalId || !v.confirmed || !v.reason || !j.postId)
        throw new AppError(
          422,
          "COMMENT_RECOVERY",
          "Kiểm tra bình luận đã có, nhập Comment ID và lý do xác nhận. Không gửi comment mới khi chưa rõ kết quả.",
        );
      commentId = await p.inspectComment(
        token,
        page.metaId,
        j.postId,
        v.externalId,
        j.commentBody ?? "",
      );
    }
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(publishJobs)
        .where(eq(publishJobs.id, j.id))
        .for("update");
      if (!["UNKNOWN", "PROCESSING_META"].includes(current.state))
        throw new AppError(
          409,
          "RECOVERY_CHANGED",
          "Job đã đổi trạng thái. Tải lại.",
        );
      await tx
        .update(publishJobs)
        .set({
          state: "SUCCEEDED",
          postId,
          metaVideoId: videoId,
          commentId,
          progress: 100,
          provenance: v.externalId ? "USER_CONFIRMED" : "META_READ",
          errorCode: null,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(publishJobs.id, j.id));
      await tx.insert(publishHistory).values({
        jobId: j.id,
        actorId: actor.id,
        action: "RECOVERED",
        details: {
          postId,
          videoId,
          commentId,
          provenance: v.externalId ? "USER_CONFIRMED" : "META_READ",
          reason: v.reason ?? "Meta read",
        },
      });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "PUBLISH_RECOVERED",
        resourceId: j.id,
        metadata: {
          postId,
          videoId,
          commentId,
          reason: v.reason ?? "Meta read",
        },
      });
      if (j.kind === "VIDEO")
        await createCommentJob(tx, {
          ...j,
          postId,
          metaVideoId: videoId,
          state: "SUCCEEDED",
        });
      return { state: "SUCCEEDED", postId, videoId, commentId };
    });
  }
}
type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export async function createCommentJob(
  tx: Tx,
  job: typeof publishJobs.$inferSelect,
) {
  if (!job.commentPolicy.enabled || !job.postId) return;
  const [child] = await tx
    .insert(publishJobs)
    .values({
      batchId: job.batchId,
      kind: "COMMENT",
      parentJobId: job.id,
      assetId: job.assetId,
      pageId: job.pageId,
      source: job.source,
      trackingId: job.trackingId,
      linkVersionId: job.linkVersionId,
      caption: job.caption,
      commentBody: job.commentBody,
      commentPolicy: job.commentPolicy,
      state: job.commentPolicy.removePreview ? "UNSUPPORTED" : "SCHEDULED",
      phase: "CREATED",
      availableAt: new Date(Date.now() + job.commentPolicy.delaySeconds * 1000),
      postId: job.postId,
      metaVideoId: job.metaVideoId,
      createdBy: job.createdBy,
      errorCode: job.commentPolicy.removePreview
        ? "LINK_PREVIEW_UNSUPPORTED"
        : null,
    })
    .onConflictDoNothing()
    .returning({ id: publishJobs.id });
  if (child)
    await tx.insert(publishHistory).values({
      jobId: child.id,
      action: "COMMENT_PREPARED",
      details: {
        delaySeconds: job.commentPolicy.delaySeconds,
        removePreview: job.commentPolicy.removePreview,
      },
    });
}
