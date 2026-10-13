import { Queue, Worker, type RedisOptions } from "bullmq";
import { and, eq, lte, inArray, or, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db";
import { publishJobs, publisherControls } from "../database/schema";
import { PublishEngine } from "./engine";
import { VideoStorage } from "./storage";
import { AppError } from "../http/errors";
export function redisOptions(test = false): RedisOptions {
  const value = test ? process.env.TEST_REDIS_URL : process.env.REDIS_URL;
  if (!value)
    throw new AppError(
      503,
      "REDIS_CONFIG",
      "Chưa có REDIS_URL/TEST_REDIS_URL.",
    );
  const url = new URL(value);
  if (!["redis:", "rediss:"].includes(url.protocol))
    throw new AppError(503, "REDIS_CONFIG", "Redis URL không hợp lệ.");
  const database = Number(url.pathname.slice(1) || 0);
  if (!Number.isInteger(database) || database < 0 || database > 15)
    throw new AppError(503, "REDIS_CONFIG", "Redis database phải từ 0 đến 15.");
  if (test) {
    const app = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
    if (
      database === 0 ||
      (app &&
        app.hostname === url.hostname &&
        app.port === url.port &&
        Number(app.pathname.slice(1) || 0) === database)
    )
      throw new Error("Redis test phải riêng biệt, DB khác 0 và khác app.");
  }
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: database,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  };
}
export function createQueues(test = false) {
  const prefix = test ? "aacc_test_publisher" : "aacc_publisher",
    connection = redisOptions(test);
  return {
    video: new Queue("video_publish", { connection, prefix }),
    comment: new Queue("post_comment", { connection, prefix }),
    prefix,
    connection,
  };
}
export async function dispatchDue(
  db: AppDatabase,
  queues: ReturnType<typeof createQueues>,
) {
  const [control] = await db
    .select()
    .from(publisherControls)
    .where(eq(publisherControls.id, "main"));
  if (control?.paused) {
    await Promise.all([queues.video.pause(), queues.comment.pause()]);
    return 0;
  }
  await Promise.all([queues.video.resume(), queues.comment.resume()]);
  const now = new Date();
  const jobs = await db
    .select({
      id: publishJobs.id,
      kind: publishJobs.kind,
      generation: publishJobs.generation,
    })
    .from(publishJobs)
    .where(
      and(
        inArray(publishJobs.state, ["QUEUED", "SCHEDULED"]),
        lte(publishJobs.availableAt, now),
        or(
          isNull(publishJobs.enqueuedAt),
          lte(publishJobs.enqueuedAt, new Date(now.getTime() - 30000)),
        ),
      ),
    )
    .limit(100);
  for (const j of jobs) {
    await (j.kind === "VIDEO" ? queues.video : queues.comment).add(
      j.kind,
      { id: j.id, generation: j.generation },
      {
        jobId: `${j.id}-${j.generation}`,
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    );
    await db
      .update(publishJobs)
      .set({ enqueuedAt: now })
      .where(
        and(eq(publishJobs.id, j.id), eq(publishJobs.generation, j.generation)),
      );
  }
  return jobs.length;
}
export function startPublishWorkers(
  db: AppDatabase,
  test = false,
  storage = new VideoStorage(),
  engine = new PublishEngine(db, storage),
) {
  const queues = createQueues(test);
  const processJob = async (job: {
    data: { id: string; generation: number };
  }) => engine.run(job.data.id, job.data.generation);
  const videoWorker = new Worker("video_publish", processJob, {
    connection: queues.connection,
    prefix: queues.prefix,
    concurrency: 2,
    limiter: { max: 2, duration: 5000 },
  });
  const commentWorker = new Worker("post_comment", processJob, {
    connection: queues.connection,
    prefix: queues.prefix,
    concurrency: 2,
    limiter: { max: 2, duration: 5000 },
  });
  const onError = () =>
    console.error(
      "Redis Publisher bị gián đoạn; jobs còn trong Database. Kiểm tra Redis rồi khởi động lại worker.",
    );
  for (const worker of [videoWorker, commentWorker])
    worker.on("error", onError);
  for (const queue of [queues.video, queues.comment])
    queue.on("error", onError);
  return {
    queues,
    videoWorker,
    commentWorker,
    engine,
    async tick() {
      await engine.recoverExpired();
      await engine.pollProcessing();
      return dispatchDue(db, queues);
    },
    async close() {
      await Promise.all([videoWorker.close(), commentWorker.close()]);
      await Promise.all([queues.video.close(), queues.comment.close()]);
    },
  };
}
