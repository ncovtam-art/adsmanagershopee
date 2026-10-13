import { and, eq, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db";
import {
  analyticsPolicies,
  adAccounts,
  users,
  insightDays,
} from "../database/schema";
import { AnalyticsService } from "./service";
import { days, localDay } from "./engine";
import { AppError } from "../http/errors";
// Worker chỉ đọc Meta. Claim bằng UPDATE có điều kiện; tiến trình cạnh tranh không chạy cùng job.
export async function runInsightsTick(
  db: AppDatabase,
  service = new AnalyticsService(db),
  now = new Date(),
) {
  const due = await db
    .select({ policy: analyticsPolicies, account: adAccounts, actor: users })
    .from(analyticsPolicies)
    .innerJoin(adAccounts, eq(adAccounts.id, analyticsPolicies.accountId))
    .innerJoin(users, eq(users.id, analyticsPolicies.updatedBy))
    .where(
      and(
        eq(analyticsPolicies.autoSync, true),
        lte(analyticsPolicies.nextSyncAt, now),
      ),
    )
    .limit(100);
  const result: Array<{ accountId: string; state: string; code?: string }> = [];
  for (const job of due) {
    const [claim] = await db
      .update(analyticsPolicies)
      .set({ nextSyncAt: new Date(now.getTime() + 3600000) })
      .where(
        and(
          eq(analyticsPolicies.accountId, job.account.id),
          eq(analyticsPolicies.autoSync, true),
          lte(analyticsPolicies.nextSyncAt, now),
        ),
      )
      .returning({ accountId: analyticsPolicies.accountId });
    if (!claim) continue;
    if (!job.actor.active || !["OWNER", "ADMIN"].includes(job.actor.role)) {
      result.push({
        accountId: job.account.id,
        state: "SKIPPED",
        code: "ACTOR_INACTIVE",
      });
      continue;
    }
    const until = localDay(
        new Date(now.getTime() - 86400000),
        job.account.timezone,
      ),
      since = localDay(
        new Date(now.getTime() - 3 * 86400000),
        job.account.timezone,
      );
    // Bảo toàn snapshot CSV đã được chọn; không tự thay bằng API.
    const csv = await db
      .select({ day: insightDays.day })
      .from(insightDays)
      .where(
        and(
          eq(insightDays.accountId, job.account.id),
          eq(insightDays.provider, "CSV"),
          sql`${insightDays.day} BETWEEN ${since} AND ${until}`,
        ),
      );
    try {
      for (const day of days(since, until).filter(
        (d) => !csv.some((c) => c.day === d),
      ))
        await service.sync(job.actor, {
          accountId: job.account.id,
          since: day,
          until: day,
          replace: false,
        });
      result.push({ accountId: job.account.id, state: "DONE" });
    } catch (e) {
      const code = e instanceof AppError ? e.code : "WORKER_ERROR";
      if (e instanceof AppError && e.status === 429)
        await db
          .update(analyticsPolicies)
          .set({
            nextSyncAt: new Date(
              now.getTime() + Math.max(3600, e.retryAfter ?? 3600) * 1000,
            ),
          })
          .where(eq(analyticsPolicies.accountId, job.account.id));
      result.push({ accountId: job.account.id, state: "FAILED", code });
    }
  }
  return result;
}
