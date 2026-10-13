import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { AppDatabase } from "../db";
import { AppError } from "./errors";
// Bền và nguyên tử giữa web processes; không dựa IP header do client tự gửi.
export async function apiRateLimit(
  db: AppDatabase,
  actorId: string,
  mutation: boolean,
  now = Date.now(),
  limit = mutation ? 300 : 600,
) {
  const window = Math.floor(now / 60000),
    key = createHash("sha256")
      .update(`${actorId}:${mutation ? "write" : "read"}:${window}`)
      .digest("hex");
  const result = await db.execute(
    sql`INSERT INTO api_rate_buckets(key,hits,expires_at) VALUES (${key},1,${new Date((window + 2) * 60000)}) ON CONFLICT(key) DO UPDATE SET hits=api_rate_buckets.hits+1 RETURNING hits`,
  );
  if (Number(result.rows[0].hits) > limit)
    throw new AppError(
      429,
      "API_RATE_LIMIT",
      "Quá nhiều yêu cầu. Chờ rồi thử lại.",
      Math.max(1, Math.ceil(((window + 1) * 60000 - now) / 1000)),
    );
}
