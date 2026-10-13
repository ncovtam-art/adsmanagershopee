import { and, eq, lte, ne, gt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import type { AppDatabase } from "../db";
import {
  publishJobs,
  publishHistory,
  publisherControls,
  publisherPageSettings,
  pages,
  metaConnections,
  videoAssets,
  users,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { requireResource } from "../meta/access";
import { AppError } from "../http/errors";
import { seal, unseal } from "../meta/crypto";
import { publisherFor, type PublisherProvider } from "./provider";
import { VideoStorage } from "./storage";
import { createCommentJob, PublisherService } from "./service";
import type { Source } from "../meta/types";
export class PublishEngine {
  constructor(
    private db: AppDatabase,
    private storage = new VideoStorage(),
    private providers: (source: Source) => PublisherProvider = publisherFor,
  ) {}
  private async permissions(job: typeof publishJobs.$inferSelect) {
    const [actor] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, job.createdBy));
    requirePermission(actor ?? null, "publisher:write");
    await requireResource(this.db, actor, "page", job.pageId);
    const [page] = await this.db
      .select()
      .from(pages)
      .where(eq(pages.id, job.pageId));
    const [conn] = page
      ? await this.db
          .select()
          .from(metaConnections)
          .where(eq(metaConnections.id, page.connectionId))
      : [];
    if (
      !page ||
      page.source !== job.source ||
      page.status !== "AUTHORIZED" ||
      !page.publishSettings.enabled ||
      !page.tasks.includes("CREATE_CONTENT") ||
      !conn ||
      !conn.scopes.includes("pages_manage_posts") ||
      conn.expiresAt.getTime() <= Date.now()
    )
      throw new AppError(
        403,
        "PUBLISH_PERMISSION",
        "Page/token/quyền không còn cho phép đăng. Kiểm tra Cấu hình Page.",
      );
    if (job.kind === "COMMENT") {
      if (!conn.scopes.includes("pages_manage_engagement"))
        throw new AppError(
          403,
          "COMMENT_PERMISSION",
          "Token thiếu quyền pages_manage_engagement; không gửi comment.",
        );
      const [p] = await this.db
        .select()
        .from(publisherPageSettings)
        .where(eq(publisherPageSettings.pageId, page.id));
      if (!p?.autoComment)
        throw new AppError(
          403,
          "COMMENT_DISABLED",
          "Auto-comment đã tắt trên Page.",
        );
    }
    return { actor: actor as Actor, page };
  }
  async run(id: string, generation: number) {
    const token = randomUUID(),
      now = new Date();
    const job = await this.db.transaction(async (tx) => {
      const [j] = await tx
        .select()
        .from(publishJobs)
        .where(eq(publishJobs.id, id))
        .for("update");
      if (
        !j ||
        j.generation !== generation ||
        !["QUEUED", "SCHEDULED"].includes(j.state) ||
        j.availableAt > now
      )
        return null;
      const [control] = await tx
        .select()
        .from(publisherControls)
        .where(eq(publisherControls.id, "main"));
      if (control?.paused) return null;
      const lock = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${j.pageId},847308)) AS locked`,
      );
      const busy = await tx
        .select({ id: publishJobs.id })
        .from(publishJobs)
        .where(
          and(
            eq(publishJobs.pageId, j.pageId),
            eq(publishJobs.state, "PROCESSING"),
            gt(publishJobs.leaseUntil, now),
            ne(publishJobs.id, id),
          ),
        )
        .limit(1);
      if (!lock.rows[0].locked || busy.length) {
        await tx
          .update(publishJobs)
          .set({
            availableAt: new Date(Date.now() + 3000),
            enqueuedAt: null,
            generation: j.generation + 1,
          })
          .where(eq(publishJobs.id, j.id));
        return null;
      }
      const [claimed] = await tx
        .update(publishJobs)
        .set({
          state: "PROCESSING",
          leaseToken: token,
          leaseUntil: new Date(now.getTime() + 180000),
          attempts: j.attempts + 1,
          errorCode: null,
          updatedAt: now,
        })
        .where(eq(publishJobs.id, id))
        .returning();
      await tx.insert(publishHistory).values({
        jobId: id,
        action: "WORKER_CLAIM",
        details: { attempt: claimed.attempts, kind: claimed.kind },
      });
      return claimed;
    });
    if (!job) return { state: "NOOP" };
    let mutationStarted = false;
    const patch = async (values: Partial<typeof publishJobs.$inferInsert>) => {
      const [current] = await this.db
        .update(publishJobs)
        .set({
          ...values,
          leaseUntil:
            values.leaseToken === null ? null : new Date(Date.now() + 180000),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(publishJobs.id, id),
            eq(publishJobs.leaseToken, token),
            eq(publishJobs.state, "PROCESSING"),
          ),
        )
        .returning();
      if (!current)
        throw new AppError(
          409,
          "PUBLISH_LEASE_LOST",
          "Job lease không còn thuộc worker này. Dừng thao tác.",
        );
      Object.assign(job, current);
    };
    const guard = async () => {
      await this.permissions(job);
      await patch({});
    };
    const heartbeat = setInterval(() => {
      void patch({}).catch(() => {});
    }, 30000);
    try {
      const { page } = await this.permissions(job),
        provider = this.providers(job.source),
        pageToken = unseal(page.encryptedToken);
      if (job.kind === "COMMENT") {
        if (!job.postId || !job.commentBody)
          throw new AppError(
            422,
            "COMMENT_DATA",
            "Comment thiếu Post ID/nội dung.",
          );
        await guard();
        await patch({ phase: "COMMENT_SEND", progress: 10 });
        mutationStarted = true;
        const commentId = await provider.comment(
          pageToken,
          job.postId,
          job.commentBody,
          job.id,
        );
        await this.complete(job, token, {
          commentId,
          provenance: "META_RESPONSE",
        });
        return { state: "SUCCEEDED", commentId };
      }
      const [asset] = await this.db
        .select()
        .from(videoAssets)
        .where(eq(videoAssets.id, job.assetId));
      if (
        !asset?.sha256 ||
        asset.state !== "READY" ||
        asset.pageId !== job.pageId ||
        asset.source !== job.source
      )
        throw new AppError(
          422,
          "VIDEO_NOT_READY",
          "Video không còn phù hợp job đã xác nhận.",
        );
      const path = await this.storage.verify(
        asset.storageKey,
        asset.sha256,
        asset.size,
      );
      let session = job.encryptedSession ? unseal(job.encryptedSession) : null;
      let start = job.offset,
        end = job.endOffset;
      if (!session) {
        await guard();
        await patch({ phase: "UPLOAD_START", progress: 1 });
        mutationStarted = true;
        const begun = await provider.begin(
          pageToken,
          page.metaId,
          asset.size,
          id,
        );
        await patch({
          metaVideoId: begun.videoId,
          encryptedSession: seal(begun.sessionId),
          offset: begun.start,
          endOffset: begun.end,
          phase: "TRANSFER",
        });
        session = begun.sessionId;
        start = begun.start;
        end = begun.end;
      }
      if (job.phase !== "FINISH") {
        const file = await open(path, "r");
        try {
          for (let chunks = 0; start < end; chunks++) {
            if (
              chunks >= 1000 ||
              start < 0 ||
              end > asset.size ||
              end - start > 32 * 1024 * 1024
            )
              throw new AppError(
                504,
                "META_RESULT_UNKNOWN",
                "Meta upload offset/chunk không nằm trong giới hạn; kiểm tra trạng thái.",
              );
            const bytes = Buffer.alloc(end - start);
            const read = await file.read(bytes, 0, bytes.length, start);
            if (read.bytesRead !== bytes.length)
              throw new AppError(
                422,
                "VIDEO_TRUNCATED",
                "Media đã thay đổi trong khi upload.",
              );
            await guard();
            await patch({ phase: "TRANSFER" });
            mutationStarted = true;
            const next = await provider.transfer(
              pageToken,
              page.metaId,
              session,
              start,
              bytes,
            );
            if (
              next.start !== end ||
              next.end < next.start ||
              next.end > asset.size
            )
              throw new AppError(
                504,
                "META_RESULT_UNKNOWN",
                "Meta trả offset không tiếp nối chunk đã gửi.",
              );
            start = next.start;
            end = next.end;
            await patch({
              offset: start,
              endOffset: end,
              progress: Math.min(85, Math.floor((start / asset.size) * 85)),
            });
          }
        } finally {
          await file.close();
        }
        if (start !== asset.size || end !== asset.size)
          throw new AppError(
            504,
            "META_RESULT_UNKNOWN",
            "Meta chưa nhận đủ nội dung; không gửi finish.",
          );
      }
      await guard();
      await patch({ phase: "FINISH", progress: 90 });
      mutationStarted = true;
      await provider.finish(
        pageToken,
        page.metaId,
        session,
        job.caption,
        asset.filename,
      );
      await patch({ phase: "POST_LOOKUP", progress: 95 });
      const proof = await provider.inspect(
        pageToken,
        page.metaId,
        job.metaVideoId!,
      );
      if (proof.postId) {
        await this.complete(job, token, {
          postId: proof.postId,
          metaVideoId: proof.videoId,
          provenance: "META_READ",
        });
        return { state: "SUCCEEDED", postId: proof.postId };
      }
      if (proof.status === "ERROR" && !proof.published)
        throw new AppError(
          422,
          "META_VIDEO_ERROR",
          "Meta xử lý video lỗi. Kiểm tra Page/video thủ công; không tạo video mới tự động.",
        );
      await patch({
        state: "PROCESSING_META",
        leaseToken: null,
        leaseUntil: null,
        availableAt: new Date(Date.now() + 30000),
      });
      return { state: "PROCESSING_META" };
    } catch (error) {
      if (error instanceof AppError && error.code === "PUBLISH_LEASE_LOST")
        return { state: "LEASE_LOST" };
      const code = error instanceof AppError ? error.code : "WORKER_ERROR";
      const explicit =
        error instanceof AppError &&
        ![
          "META_RESULT_UNKNOWN",
          "VIDEO_TRUNCATED",
          "PUBLISH_LEASE_LOST",
        ].includes(code);
      const unknown =
        code === "META_RESULT_UNKNOWN" ||
        (!explicit && mutationStarted) ||
        code === "META_VIDEO_ERROR" ||
        job.phase === "POST_LOOKUP";
      const retry =
        explicit &&
        !unknown &&
        error instanceof AppError &&
        error.status === 429 &&
        job.attempts < 5;
      const state = unknown
        ? ("UNKNOWN" as const)
        : retry
          ? ("QUEUED" as const)
          : job.attempts >= 5
            ? ("DEAD_LETTER" as const)
            : ("FAILED" as const);
      const delay =
        error instanceof AppError
          ? Math.max(
              error.retryAfter ?? 0,
              Math.min(3600, 2 ** job.attempts * 15),
            )
          : 30;
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .update(publishJobs)
          .set({
            state,
            errorCode: code,
            leaseToken: null,
            leaseUntil: null,
            enqueuedAt: null,
            ...(retry
              ? {
                  availableAt: new Date(Date.now() + delay * 1000),
                  generation: job.generation + 1,
                }
              : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(publishJobs.id, id), eq(publishJobs.leaseToken, token)))
          .returning({ id: publishJobs.id });
        if (rows.length)
          await tx.insert(publishHistory).values({
            jobId: id,
            action: state,
            details: {
              code,
              phase: job.phase,
              attempt: job.attempts,
              ...(retry ? { retryAfter: delay } : {}),
            },
          });
      });
      return { state, code };
    } finally {
      clearInterval(heartbeat);
    }
  }
  private async complete(
    job: typeof publishJobs.$inferSelect,
    token: string,
    result: Partial<typeof publishJobs.$inferInsert>,
  ) {
    await this.db.transaction(async (tx) => {
      const [saved] = await tx
        .update(publishJobs)
        .set({
          ...result,
          state: "SUCCEEDED",
          phase: "DONE",
          progress: 100,
          leaseToken: null,
          leaseUntil: null,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(publishJobs.id, job.id),
            eq(publishJobs.leaseToken, token),
            eq(publishJobs.state, "PROCESSING"),
          ),
        )
        .returning();
      if (!saved)
        throw new AppError(
          409,
          "PUBLISH_LEASE_LOST",
          "Job đã mất lease sau phản hồi Meta. Không tự gửi lại.",
        );
      await tx.insert(publishHistory).values({
        jobId: job.id,
        action: "SUCCEEDED",
        details: {
          postId: saved.postId,
          videoId: saved.metaVideoId,
          commentId: saved.commentId,
          source: saved.source,
        },
      });
      if (saved.kind === "VIDEO") await createCommentJob(tx, saved);
    });
  }
  async recoverExpired(now = new Date()) {
    return this.db.transaction(async (tx) => {
      const expired = await tx
        .select()
        .from(publishJobs)
        .where(
          and(
            eq(publishJobs.state, "PROCESSING"),
            lte(publishJobs.leaseUntil, now),
          ),
        )
        .for("update");
      for (const j of expired) {
        const safe = j.phase === "CREATED" && !j.metaVideoId && !j.commentId;
        await tx
          .update(publishJobs)
          .set({
            state: safe ? "QUEUED" : "UNKNOWN",
            errorCode: safe ? null : "WORKER_LEASE_EXPIRED",
            generation: j.generation + 1,
            leaseToken: null,
            leaseUntil: null,
            enqueuedAt: null,
            updatedAt: now,
          })
          .where(eq(publishJobs.id, j.id));
        await tx.insert(publishHistory).values({
          jobId: j.id,
          action: "LEASE_EXPIRED",
          details: { phase: j.phase, state: safe ? "QUEUED" : "UNKNOWN" },
        });
      }
      return expired.length;
    });
  }
  async pollProcessing(limit = 10) {
    const jobs = await this.db
      .select()
      .from(publishJobs)
      .where(
        and(
          eq(publishJobs.state, "PROCESSING_META"),
          lte(publishJobs.availableAt, new Date()),
        ),
      )
      .limit(limit);
    const service = new PublisherService(this.db, this.storage, this.providers);
    for (const j of jobs) {
      try {
        const { actor } = await this.permissions(j);
        await service.recover(actor, { id: j.id });
        await this.db
          .update(publishJobs)
          .set({ availableAt: new Date(Date.now() + 30000) })
          .where(
            and(
              eq(publishJobs.id, j.id),
              eq(publishJobs.state, "PROCESSING_META"),
            ),
          );
      } catch (e) {
        await this.db
          .update(publishJobs)
          .set({
            availableAt: new Date(Date.now() + 60000),
            errorCode: e instanceof AppError ? e.code : "META_READ_ERROR",
          })
          .where(
            and(
              eq(publishJobs.id, j.id),
              eq(publishJobs.state, "PROCESSING_META"),
            ),
          );
      }
    }
    return jobs.length;
  }
}
