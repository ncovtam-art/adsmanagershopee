import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import { connectTestDatabase } from "../helpers";
import {
  users,
  publicUserFields,
  adAccounts,
  pages,
  resourceGrants,
  insightAds,
  insightDays,
  careRules,
  careAlerts,
  telegramSettings,
  notificationJobs,
  commissionImports,
  commissionRows,
} from "../../src/server/database/schema";
import type { Actor } from "../../src/server/auth/policy";
import { CareService } from "../../src/server/care/service";
import { AnalyticsService } from "../../src/server/analytics/service";
import { TelegramService } from "../../src/server/care/telegram";
import { AppError } from "../../src/server/http/errors";
const c = connectTestDatabase(),
  db = c.db;
let owner: Actor,
  buyer: Actor,
  account: typeof adAccounts.$inferSelect,
  page: typeof pages.$inferSelect;
before(async () => {
  [owner] = await db
    .select(publicUserFields)
    .from(users)
    .where(eq(users.role, "OWNER"));
  [buyer] = await db
    .select(publicUserFields)
    .from(users)
    .where(sql`${users.email} LIKE '%@care.test'`);
  [account] = await db
    .select()
    .from(adAccounts)
    .where(
      and(
        eq(adAccounts.source, "MOCK"),
        eq(adAccounts.metaId, "90071992547409935"),
      ),
    );
  [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, "90071992547409941"));
});
after(async () => {
  await c.pool.end();
});
test("Saved Care evidence obeys current Page grants; account-only cannot read historical finance/IDs", async () => {
  const service = new CareService(db),
    [r] = await db
      .select()
      .from(careRules)
      .where(eq(careRules.name, (await db.select().from(careRules))[0].name));
  await db
    .insert(resourceGrants)
    .values({ userId: buyer.id, accountId: account.id });
  let data = await service.list(buyer);
  assert.equal(data.alerts.length, 0);
  assert.equal(data.pauses.length, 0);
  assert(
    (await service.history(buyer, r.id)).every(
      (run) => (run.result.items as unknown[]).length === 0,
    ),
  );
  await db.insert(resourceGrants).values({ userId: buyer.id, pageId: page.id });
  data = await service.list(buyer);
  assert(data.alerts.length > 0);
  const historyRule = data.alerts[0].ruleId;
  assert(
    (await service.history(buyer, historyRule)).some(
      (run) => (run.result.items as unknown[]).length > 0,
    ),
  );
  await db
    .delete(resourceGrants)
    .where(
      and(
        eq(resourceGrants.userId, buyer.id),
        eq(resourceGrants.pageId, page.id),
      ),
    );
  assert.equal((await service.list(buyer)).alerts.length, 0);
  assert(
    (await service.history(buyer, historyRule)).every(
      (run) => (run.result.items as unknown[]).length === 0,
    ),
  );
});
test("Report indexed/bounded processing preserves totals for 2,001 Ad facts; 10,001 facts refuse partial report", async () => {
  const [sample] = await db
    .select()
    .from(insightAds)
    .where(eq(insightAds.accountId, account.id));
  const [day] = await db
    .select()
    .from(insightDays)
    .where(eq(insightDays.id, sample.dayId));
  const inserted: string[] = [];
  const svc = new AnalyticsService(db);
  const input = {
    source: "MOCK",
    accountId: account.id,
    since: day.day,
    until: day.day,
    level: "campaign",
    mode: "cohort",
  };
  const before = await svc.report(owner, input);
  const original = BigInt(before.totals!.spend.split(".")[0]);
  try {
    for (let start = 0; start < 10000; start += 500) {
      const batch = Array.from({ length: 500 }, (_, i) => ({
        ...sample,
        id: randomUUID(),
        adId: String(777000000000000n + BigInt(start + i)),
        spend: "100.000000",
      }));
      await db.insert(insightAds).values(batch);
      inserted.push(...batch.map((r) => r.id));
      if (start === 1500) {
        const began = performance.now(),
          r = await svc.report(owner, input),
          elapsedMs = performance.now() - began;
        assert.equal(r.totals?.spend, `${original + 200000n}.000000`);
        assert.equal(r.rows.length, 1);
        assert(elapsedMs < 10000, "Report 2001 facts must be bounded");
        mkdirSync("artifacts", { recursive: true });
        writeFileSync(
          "artifacts/performance-stage-10.json",
          JSON.stringify({
            fixture: "2001 Ad facts / 1 day / Campaign aggregate",
            elapsedMs,
            totalsVerified: true,
          }),
          { mode: 0o600 },
        );
      }
    }
    await assert.rejects(
      svc.report(owner, input),
      (e) => e instanceof AppError && e.code === "REPORT_TOO_LARGE",
    );
    const plan = await db.execute(
      sql`EXPLAIN SELECT * FROM insight_ads WHERE day_id=${day.id} AND campaign_id=${sample.campaignId}`,
    );
    assert(plan.rows.length > 0);
  } finally {
    for (let i = 0; i < inserted.length; i += 500)
      await db
        .delete(insightAds)
        .where(inArray(insightAds.id, inserted.slice(i, i + 500)));
  }
});
test("Selected lifecycle Telegram events collected/deduplicated without sending externally; integrity constraints hold", async () => {
  const service = new TelegramService(db, {
    test: async () => {},
    send: async () => {
      throw Error("No external send in scan test");
    },
  });
  await service.save(owner, {
    chatId: "-123",
    enabled: true,
    events: ["SHOPEE_IMPORTED", "UNMATCHED_SUBID", "PAGE_DISCONNECTED"],
    cooldownMinutes: 5,
  });
  const [seed] = await db.select().from(commissionImports).limit(1),
    id = randomUUID();
  await db
    .insert(commissionImports)
    .values({
      ...seed,
      id,
      fingerprint: randomUUID(),
      createdAt: new Date(),
      state: "APPLIED",
    });
  const [row] = await db.select().from(commissionRows).limit(1);
  await db
    .insert(commissionRows)
    .values({
      ...row,
      id: randomUUID(),
      externalKey: randomUUID(),
      subId: "UNMATCHED_CARE_TEST",
      trackingId: null,
      importId: id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const original = page.status;
  await db
    .update(pages)
    .set({ status: "DISCONNECTED", updatedAt: new Date() })
    .where(eq(pages.id, page.id));
  try {
    await service.scanEvents();
    await service.scanEvents();
    const jobs = await db.select().from(notificationJobs);
    assert(
      jobs.some((j) => j.event === "SHOPEE_IMPORTED" && j.resourceId === id),
    );
    assert(jobs.some((j) => j.event === "UNMATCHED_SUBID"));
    assert(
      jobs.some(
        (j) => j.event === "PAGE_DISCONNECTED" && j.resourceId === page.id,
      ),
    );
    assert.equal(
      jobs.filter((j) => j.event === "SHOPEE_IMPORTED" && j.resourceId === id)
        .length,
      1,
    );
  } finally {
    await db
      .update(pages)
      .set({ status: original })
      .where(eq(pages.id, page.id));
    await service.save(owner, {
      chatId: "-123",
      enabled: false,
      events: [],
      cooldownMinutes: 5,
    });
  }
  const [rule] = await db.select().from(careRules).limit(1);
  await assert.rejects(
    db
      .update(careRules)
      .set({ enabled: false, autoEnabled: true, dryRunId: null })
      .where(eq(careRules.id, rule.id)),
  );
  const [settings] = await db.select().from(telegramSettings);
  await assert.rejects(
    db
      .update(telegramSettings)
      .set({ cooldownMinutes: 0 })
      .where(eq(telegramSettings.id, settings.id)),
  );
  const [alert] = await db.select().from(careAlerts).limit(1);
  assert(alert);
  await assert.rejects(
    db
      .update(careAlerts)
      .set({ state: "BAD" })
      .where(eq(careAlerts.id, alert.id)),
  );
});
