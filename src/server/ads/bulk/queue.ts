import { Queue, Worker } from "bullmq";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "../../db";
import {
  adsRequests,
  adsBatches,
  adsBatchHistory,
} from "../../database/schema";
import { redisOptions } from "../../publisher/queue";
import { AdsService } from "../service";
export function bulkQueue(test = false) {
  const connection = redisOptions(test),
    prefix = test ? "aacc_test_ads_bulk" : "aacc_ads_bulk";
  return {
    queue: new Queue("ads_create", { connection, prefix }),
    connection,
    prefix,
  };
}
export function startBulkWorker(
  db: AppDatabase,
  test = false,
  service = new AdsService(db),
) {
  const q = bulkQueue(test);
  const worker = new Worker<{ id: string; generation: number }>(
    "ads_create",
    async (job) => {
      await service.run(job.data.id, job.data.generation);
    },
    {
      connection: q.connection,
      prefix: q.prefix,
      concurrency: 2,
      limiter: { max: 2, duration: 5000 },
    },
  );
  worker.on("error", () =>
    console.error("Bulk Ads Redis lỗi; jobs/IDs vẫn giữ trong PostgreSQL."),
  );
  async function tick() {
    const waiting = await db
      .select()
      .from(adsRequests)
      .innerJoin(adsBatches, eq(adsRequests.bulkBatchId, adsBatches.id))
      .where(
        and(eq(adsRequests.state, "WAITING"), eq(adsBatches.state, "RUNNING")),
      )
      .limit(100);
    for (const { ads_requests: j } of waiting) {
      const c = await service.material(j, "campaign"),
        s = await service.material(j, "adSet");
      if (
        [c.owner, s.owner].every(
          (p) => p.id === j.id || p.state === "SUCCEEDED",
        )
      )
        await db
          .update(adsRequests)
          .set({
            state: "QUEUED",
            generation: sql`${adsRequests.generation}+1`,
            enqueuedAt: null,
            availableAt: new Date(),
          })
          .where(
            and(eq(adsRequests.id, j.id), eq(adsRequests.state, "WAITING")),
          );
    }
    const rows = await db
      .select({ id: adsRequests.id, generation: adsRequests.generation })
      .from(adsRequests)
      .innerJoin(adsBatches, eq(adsRequests.bulkBatchId, adsBatches.id))
      .where(
        and(
          eq(adsRequests.state, "QUEUED"),
          eq(adsBatches.state, "RUNNING"),
          lte(adsRequests.availableAt, new Date()),
          or(
            isNull(adsRequests.enqueuedAt),
            lte(adsRequests.enqueuedAt, new Date(Date.now() - 30000)),
          ),
        ),
      )
      .orderBy(adsBatches.createdAt, adsRequests.bulkIndex)
      .limit(100);
    for (const j of rows) {
      const previous = await q.queue.getJob(`${j.id}-${j.generation}`);
      const previousState = previous ? await previous.getState() : null;
      if (previousState === "failed" || previousState === "completed") {
        // PostgreSQL QUEUED is authoritative: no ambiguous mutation is retried.
        await db.update(adsRequests).set({generation:sql`${adsRequests.generation}+1`,enqueuedAt:null}).where(and(eq(adsRequests.id,j.id),eq(adsRequests.generation,j.generation),eq(adsRequests.state,"QUEUED")));
        continue;
      }
      await q.queue.add("CREATE_PAUSED", j, {
        jobId: `${j.id}-${j.generation}`,
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      });
      await db
        .update(adsRequests)
        .set({ enqueuedAt: new Date() })
        .where(
          and(
            eq(adsRequests.id, j.id),
            eq(adsRequests.generation, j.generation),
          ),
        );
    }
    for (const b of await db
      .select()
      .from(adsBatches)
      .where(eq(adsBatches.state, "RUNNING"))
      .limit(100)) {
      const jobs = await db
        .select({ state: adsRequests.state })
        .from(adsRequests)
        .where(eq(adsRequests.bulkBatchId, b.id));
      const state =
        jobs.length &&
        jobs.every((j) => ["SUCCEEDED", "CANCELLED"].includes(j.state))
          ? "COMPLETED"
          : jobs.length &&
              jobs.every((j) =>
                [
                  "SUCCEEDED",
                  "CANCELLED",
                  "FAILED",
                  "UNKNOWN",
                  "WAITING",
                ].includes(j.state),
              ) &&
              jobs.some((j) => ["FAILED", "UNKNOWN"].includes(j.state))
            ? "NEEDS_ACTION"
            : null;
      if (state) {
        const changed = await db
          .update(adsBatches)
          .set({ state, updatedAt: new Date() })
          .where(and(eq(adsBatches.id, b.id), eq(adsBatches.state, "RUNNING")))
          .returning({ id: adsBatches.id });
        if (changed.length)
          await db
            .insert(adsBatchHistory)
            .values({ batchId: b.id, action: state, details: {} });
      }
    }
  }
  return {
    ...q,
    worker,
    tick,
    close: async () => {
      await worker.close();
      await q.queue.close();
    },
  };
}
