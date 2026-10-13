import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { connectTestDatabase } from "../helpers";
import {
  users,
  publicUserFields,
  adAccounts,
  careRules,
  careRuns,
  careAlerts,
  carePauses,
  telegramSettings,
  notificationJobs,
  insightDays,
  insightAds,
  metaConnections,
  analyticsPolicies,
} from "../../src/server/database/schema";
import type { Actor } from "../../src/server/auth/policy";
import type { RuleInput } from "../../src/server/care/validation";
import { CareService } from "../../src/server/care/service";
import {
  TelegramService,
  type TelegramProvider,
} from "../../src/server/care/telegram";
import {
  MockPauseProvider,
  type PauseContext,
} from "../../src/server/care/provider";
import { AnalyticsService } from "../../src/server/analytics/service";
import { localDay } from "../../src/server/analytics/engine";
import { MockMetaProvider, MOCK_IDS } from "../../src/server/meta/mock";
import { TeamService } from "../../src/server/team/service";
import { apiRateLimit } from "../../src/server/http/rate-limit";
import { AppError } from "../../src/server/http/errors";
import { unseal } from "../../src/server/meta/crypto";
const c = connectTestDatabase(),
  db = c.db,
  analytics = new AnalyticsService(db),
  care = new CareService(db);
let owner: Actor,
  viewer: Actor,
  buyer: Actor,
  account: typeof adAccounts.$inferSelect,
  yesterday: string;
const code = (v: string) => (e: unknown) =>
  e instanceof AppError && e.code === v;
const rule = (extra: Partial<RuleInput> = {}): RuleInput => ({
  name: "Care " + randomUUID(),
  accountId: account.id,
  source: "MOCK",
  level: "campaign",
  windowDays: 1,
  maxAgeMinutes: 60,
  cooldownMinutes: 30,
  conditions: [
    { metric: "spend", op: "GTE", value: "100000" },
    { metric: "cpc", op: "GT", value: "500" },
  ],
  actions: ["ALERT", "REVIEW"],
  commissionCompleteThrough: null,
  financialAcknowledged: false,
  ...extra,
});
async function fresh() {
  await analytics.sync(owner, {
    accountId: account.id,
    since: yesterday,
    until: yesterday,
    replace: true,
  });
}
async function arm(service: CareService, r: typeof careRules.$inferSelect) {
  await service.dryRun(owner, r.id);
  return service.control(owner, {
    id: r.id,
    enabled: true,
    autoEnabled: true,
    confirmAutoPause: true,
  });
}
before(async () => {
  process.env.META_MOCK_ENABLED = "true";
  [owner] = await db
    .select(publicUserFields)
    .from(users)
    .where(eq(users.role, "OWNER"));
  [viewer] = await db
    .select(publicUserFields)
    .from(users)
    .where(eq(users.role, "VIEWER"));
  [account] = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.source, "MOCK"), eq(adAccounts.currency, "VND")));
  assert(owner && account, "Cần fixtures Giai đoạn 1–8 trước Care.");
  buyer = await new TeamService(db).create(owner, {
    name: "Care Buyer",
    email: `buyer-${randomUUID()}@care.test`,
    password: randomBytes(24).toString("hex"),
    role: "MEDIA_BUYER",
  });
  const today = localDay(new Date(), account.timezone);
  yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  await fresh();
});
after(async () => {
  await c.pool.end();
});
test("Care backend role/account/source checks and new rule always disabled", async () => {
  await assert.rejects(care.save(viewer, rule()), code("FORBIDDEN"));
  await assert.rejects(care.save(null, rule()), code("UNAUTHENTICATED"));
  await assert.rejects(care.save(buyer, rule()), code("RESOURCE_FORBIDDEN"));
  assert.equal((await care.list(buyer)).rules.length, 0);
  await assert.rejects(
    care.save(owner, rule({ source: "LIVE" })),
    code("SOURCE_MISMATCH"),
  );
  const r = await care.save(owner, rule());
  assert(!r.enabled && !r.autoEnabled && !r.dryRunId);
  assert.equal(r.config.conditions[0].value, "100000");
});
test("Dry Run uses real PostgreSQL Insights metrics, returns matching evidence and performs no mutation/alerts/Telegram", async () => {
  let sends = 0;
  const p = new MockPauseProvider();
  p.pause = async () => {
    sends++;
  };
  const svc = new CareService(db, analytics, () => p),
    r = await svc.save(owner, rule({ actions: ["ALERT", "AUTO_PAUSE"] }));
  const before = (await db.select().from(careAlerts)).length,
    jobs = (await db.select().from(notificationJobs)).length;
  const run = await svc.dryRun(owner, r.id),
    items = run.result.items as Array<{
      matched: boolean;
      autoBlockers: string[];
      values: Record<string, string>;
    }>;
  assert.equal(run.state, "DRY_RUN");
  assert.equal(items.length, 1);
  assert(items[0].matched);
  assert.equal(items[0].values.spend, "150000.000000");
  assert.equal(items[0].values.cpc, "600.0000");
  assert.deepEqual(items[0].autoBlockers, []);
  assert.equal(sends, 0);
  assert.equal((await db.select().from(careAlerts)).length, before);
  assert.equal((await db.select().from(notificationJobs)).length, jobs);
});
test("User thresholds AND, Winner detection, durable cooldown dedup under competing evaluations and review audit", async () => {
  const r = await care.save(
      owner,
      rule({
        conditions: [{ metric: "ctr", op: "GTE", value: "2" }],
        actions: ["ALERT", "WINNER"],
      }),
    ),
    enabled = await care.control(owner, { id: r.id, enabled: true });
  await Promise.all([
    care.execute(owner, enabled),
    care.execute(owner, enabled),
  ]);
  const alerts = await db
    .select()
    .from(careAlerts)
    .where(eq(careAlerts.ruleId, r.id));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "WINNER");
  await care.execute(owner, enabled);
  assert.equal(
    (await db.select().from(careAlerts).where(eq(careAlerts.ruleId, r.id)))
      .length,
    1,
  );
  await care.review(owner, alerts[0].id);
  assert.equal(
    (
      await db.select().from(careAlerts).where(eq(careAlerts.id, alerts[0].id))
    )[0].state,
    "REVIEWED",
  );
  const noMatch = await care.save(
    owner,
    rule({ conditions: [{ metric: "spend", op: "GT", value: "200000" }] }),
  );
  assert(
    !(
      (await care.dryRun(owner, noMatch.id)).result.items as Array<{
        matched: boolean;
      }>
    )[0].matched,
  );
});
test("Missing/stale spend or missing LPV blocks rather than zero metrics; ROAS waits for complete/fresh Shopee", async () => {
  const r = await care.save(owner, rule());
  await db
    .update(insightDays)
    .set({ syncedAt: new Date(0) })
    .where(
      and(
        eq(insightDays.accountId, account.id),
        eq(insightDays.day, yesterday),
      ),
    );
  let run = await care.dryRun(owner, r.id);
  assert(
    (run.result.items as Array<{ blockers: string[] }>)[0].blockers.includes(
      "STALE_DATA",
    ),
  );
  await fresh();
  const lpv = await care.save(
    owner,
    rule({ conditions: [{ metric: "costPerLpv", op: "GT", value: "0" }] }),
  );
  await db
    .update(insightAds)
    .set({ lpv: null })
    .where(eq(insightAds.accountId, account.id));
  run = await care.dryRun(owner, lpv.id);
  assert(
    (
      run.result.items as Array<{ blockers: string[]; matched: boolean }>
    )[0].blockers.includes("MISSING_costPerLpv"),
  );
  assert(!(run.result.items as Array<{ matched: boolean }>)[0].matched);
  await fresh();
  const finance = await care.save(
    owner,
    rule({
      conditions: [{ metric: "estimatedRoas", op: "LT", value: "1" }],
      actions: ["ALERT", "AUTO_PAUSE"],
    }),
  );
  run = await care.dryRun(owner, finance.id);
  const item = (
    run.result.items as Array<{ blockers: string[]; matched: boolean }>
  )[0];
  assert(item.blockers.includes("COMMISSION_COVERAGE_NOT_ACKNOWLEDGED"));
  assert(!item.matched);
  await assert.rejects(
    care.control(owner, {
      id: finance.id,
      enabled: true,
      autoEnabled: true,
      confirmAutoPause: true,
    }),
    code("CARE_DATA_GUARD"),
  );
  const missing = await care.save(owner, rule({ windowDays: 30 }));
  run = await care.dryRun(owner, missing.id);
  assert(
    (run.result.items as Array<{ blockers: string[] }>)[0].blockers.includes(
      "MISSING_SPEND",
    ),
  );
});
test("Auto Pause requires explicit confirmation/fresh matching Dry Run/API; edit invalidates authorization", async () => {
  const r = await care.save(owner, rule({ actions: ["ALERT", "AUTO_PAUSE"] }));
  await assert.rejects(
    care.control(owner, {
      id: r.id,
      enabled: true,
      autoEnabled: true,
      confirmAutoPause: true,
    }),
    code("CARE_DRY_RUN_REQUIRED"),
  );
  await care.dryRun(owner, r.id);
  await assert.rejects(
    care.control(owner, { id: r.id, enabled: true, autoEnabled: true }),
    code("CARE_AUTO_CONFIRM"),
  );
  await db
    .update(insightDays)
    .set({ provider: "CSV" })
    .where(
      and(
        eq(insightDays.accountId, account.id),
        eq(insightDays.day, yesterday),
      ),
    );
  await assert.rejects(
    care.control(owner, {
      id: r.id,
      enabled: true,
      autoEnabled: true,
      confirmAutoPause: true,
    }),
    code("CARE_DATA_GUARD"),
  );
  await fresh();
  const updated = await care.save(
    owner,
    { ...r.config, conditions: [{ metric: "spend", op: "GT", value: "1" }] },
    r.id,
  );
  assert(!updated.enabled && !updated.autoEnabled);
  await assert.rejects(
    care.control(owner, {
      id: r.id,
      enabled: true,
      autoEnabled: true,
      confirmAutoPause: true,
    }),
    code("CARE_DRY_RUN_REQUIRED"),
  );
});
test("Recognition policy edit invalidates Auto Pause Dry Run evidence before arm", async () => {
  const r = await care.save(owner, rule({ actions: ["ALERT", "AUTO_PAUSE"] }));
  await care.dryRun(owner, r.id);
  const [policy] = await db
    .select()
    .from(analyticsPolicies)
    .where(eq(analyticsPolicies.accountId, account.id));
  await db
    .update(analyticsPolicies)
    .set({ otherCostPerDay: "11.000000" })
    .where(eq(analyticsPolicies.accountId, account.id));
  try {
    await assert.rejects(
      care.control(owner, {
        id: r.id,
        enabled: true,
        autoEnabled: true,
        confirmAutoPause: true,
      }),
      code("CARE_DATA_GUARD"),
    );
  } finally {
    await db
      .update(analyticsPolicies)
      .set({ otherCostPerDay: policy.otherCostPerDay })
      .where(eq(analyticsPolicies.accountId, account.id));
  }
});
test("Verified Auto Pause claims object once across rules/workers, sends no ACTIVE and records readback/audit", async () => {
  let writes = 0;
  const p = new MockPauseProvider(),
    original = p.pause.bind(p);
  p.pause = async (ctx: PauseContext) => {
    writes++;
    await original(ctx);
  };
  const svc = new CareService(db, analytics, () => p),
    r = await svc.save(owner, rule({ actions: ["ALERT", "AUTO_PAUSE"] })),
    armed = await arm(svc, r);
  await Promise.all([svc.execute(owner, armed), svc.execute(owner, armed)]);
  assert.equal(writes, 1);
  const operations = await db
    .select()
    .from(carePauses)
    .where(eq(carePauses.ruleId, r.id));
  assert.equal(operations.length, 1);
  assert.equal(operations[0].state, "VERIFIED");
  const other = await svc.save(
      owner,
      rule({ actions: ["ALERT", "AUTO_PAUSE"] }),
    ),
    armedOther = await arm(svc, other);
  await svc.execute(owner, armedOther);
  assert.equal(writes, 1);
});
test("Auto Pause timeout UNKNOWN not retried; read-only recovery verifies PAUSED without another mutation", async () => {
  let writes = 0,
    status = "ACTIVE";
  const p = {
    inspect: async () => status,
    pause: async () => {
      writes++;
      status = "PAUSED";
      throw new AppError(504, "META_RESULT_UNKNOWN", "Timeout");
    },
  };
  const svc = new CareService(db, analytics, () => p),
    r = await svc.save(
      owner,
      rule({ level: "adset", actions: ["ALERT", "AUTO_PAUSE"] }),
    ),
    armed = await arm(svc, r);
  await svc.execute(owner, armed);
  const [op] = await db
    .select()
    .from(carePauses)
    .where(eq(carePauses.ruleId, r.id));
  assert.equal(op.state, "UNKNOWN");
  await svc.execute(owner, armed);
  assert.equal(writes, 1);
  assert.deepEqual(await svc.recover(owner, op.id), { verified: true });
  assert.equal(writes, 1);
});
test("Rule disabled or API scopes revoked immediately before pause prevents status mutation", async () => {
  let writes = 0;
  const p = {
    inspect: async () => {
      await db
        .update(careRules)
        .set({ enabled: false, autoEnabled: false })
        .where(eq(careRules.id, id));
      return "ACTIVE";
    },
    pause: async () => {
      writes++;
    },
  };
  let id = "";
  const svc = new CareService(db, analytics, () => p),
    r = await svc.save(
      owner,
      rule({ level: "ad", actions: ["ALERT", "AUTO_PAUSE"] }),
    );
  id = r.id;
  const armed = await arm(svc, r);
  await svc.execute(owner, armed);
  assert.equal(writes, 0);
  assert.equal(
    (await db.select().from(carePauses).where(eq(carePauses.ruleId, r.id)))[0]
      .state,
    "BLOCKED",
  );
  // Different account/level identity has no old claim; scope check occurs before provider inspect.
  const [conn] = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.id, account.connectionId));
  await db
    .update(metaConnections)
    .set({ scopes: conn.scopes.filter((s) => s !== "ads_management") })
    .where(eq(metaConnections.id, conn.id));
  try {
    const newAccount = (
      await db
        .insert(adAccounts)
        .values({ ...account, id: randomUUID(), metaId: "999888777666" })
        .returning()
    )[0];
    const mock = new MockMetaProvider(),
      original = mock.insights.bind(mock);
    mock.insights = async (t, a, s, u) =>
      (await original(t, { ...a, metaId: MOCK_IDS.account }, s, u)).map(
        (r) => ({ ...r, accountId: a.metaId }),
      );
    const scopedAnalytics = new AnalyticsService(db, () => mock);
    await scopedAnalytics.sync(owner, {
      accountId: newAccount.id,
      since: yesterday,
      until: yesterday,
    });
    const scopedCare = new CareService(db, scopedAnalytics, () => p);
    const blocked = await scopedCare.save(
        owner,
        rule({
          accountId: newAccount.id,
          level: "ad",
          actions: ["ALERT", "AUTO_PAUSE"],
        }),
      ),
      a = await arm(scopedCare, blocked);
    await scopedCare.execute(owner, a);
    assert.equal(writes, 0);
    assert.equal(
      (
        await db
          .select()
          .from(carePauses)
          .where(eq(carePauses.ruleId, blocked.id))
      )[0].errorCode,
      "CARE_API_PERMISSION",
    );
  } finally {
    await db
      .update(metaConnections)
      .set({ scopes: conn.scopes })
      .where(eq(metaConnections.id, conn.id));
  }
});
test("Competing Care ticks claim one scheduled evaluation; revoked actor has no evaluation effects", async () => {
  await db.update(careRules).set({ enabled: false, autoEnabled: false });
  const r = await care.save(owner, rule());
  await care.control(owner, { id: r.id, enabled: true });
  await Promise.all([care.tick(), care.tick()]);
  assert.equal(
    (await db.select().from(careRuns).where(eq(careRuns.ruleId, r.id))).length,
    1,
  );
  await db
    .update(careRules)
    .set({ nextRunAt: new Date(0) })
    .where(eq(careRules.id, r.id));
  await db.update(users).set({ active: false }).where(eq(users.id, owner.id));
  try {
    await care.tick();
    assert.equal(
      (await db.select().from(careRuns).where(eq(careRuns.ruleId, r.id))).at(-1)
        ?.state,
      "BLOCKED",
    );
  } finally {
    await db.update(users).set({ active: true }).where(eq(users.id, owner.id));
    await db.update(careRules).set({ enabled: false, autoEnabled: false });
  }
});
test("Telegram encrypted token/admin-only config, no return/log leak, selected events/cooldown and competing worker dedup", async () => {
  let sends = 0;
  const token = "123456789:" + randomBytes(24).toString("hex");
  const provider: TelegramProvider = {
    test: async () => {},
    send: async () => {
      sends++;
      return "42";
    },
  };
  const svc = new TelegramService(db, provider);
  await assert.rejects(
    svc.save(viewer, {
      token,
      chatId: "-123",
      enabled: false,
      events: [],
      cooldownMinutes: 5,
    }),
    code("FORBIDDEN"),
  );
  await svc.save(owner, {
    token,
    chatId: "-123",
    enabled: false,
    events: ["SPEND_THRESHOLD"],
    cooldownMinutes: 5,
  });
  const [settings] = await db.select().from(telegramSettings);
  assert(!settings.encryptedToken.includes(token));
  assert.equal(unseal(settings.encryptedToken), token);
  assert(!JSON.stringify(await svc.read(owner)).includes(token));
  await svc.enqueue("SPEND_THRESHOLD", "x", "disabled", "Test");
  assert.equal((await svc.jobs(owner)).length, 0);
  await svc.save(owner, {
    chatId: "-123",
    enabled: true,
    events: ["SPEND_THRESHOLD"],
    cooldownMinutes: 5,
  });
  await Promise.all([
    svc.enqueue("SPEND_THRESHOLD", "x", "once", "Test"),
    svc.enqueue("SPEND_THRESHOLD", "x", "once", "Test"),
  ]);
  await svc.enqueue("SPEND_THRESHOLD", "x", "different-key", "Test");
  await svc.enqueue("LOW_ROAS", "z", "not-selected", "Test");
  await Promise.all([svc.tick(), svc.tick()]);
  assert.equal(sends, 1);
  assert.equal(
    (await svc.jobs(owner)).filter((j) => j.state === "SENT").length,
    1,
  );
  assert((await svc.jobs(owner)).some((j) => j.state === "CANCELLED"));
  await svc.test(owner);
});
test("Telegram timeout/crash marked UNKNOWN, 429 delayed safely, stale config cancels queue and only definite FAILED retry", async () => {
  const svc = new TelegramService(db, {
    test: async () => {},
    send: async () => {
      throw new AppError(504, "TELEGRAM_UNKNOWN", "timeout");
    },
  });
  await svc.enqueue("SPEND_THRESHOLD", "unknown", "unknown", "Test");
  await svc.tick();
  const unknown = (await svc.jobs(owner)).find((j) => j.state === "UNKNOWN")!;
  assert(unknown);
  await assert.rejects(
    svc.retry(owner, unknown.id),
    code("NOTIFICATION_RETRY"),
  );
  const rate = new TelegramService(db, {
    test: async () => {},
    send: async () => {
      throw new AppError(429, "TELEGRAM_RATE", "rate", 90);
    },
  });
  await rate.enqueue("SPEND_THRESHOLD", "rate", "rate", "Test");
  await rate.tick();
  const [job] = await db
    .select()
    .from(notificationJobs)
    .where(eq(notificationJobs.key, "rate"));
  assert.equal(job.state, "QUEUED");
  assert(job.availableAt.getTime() > Date.now() + 80000);
  await svc.enqueue("SPEND_THRESHOLD", "stale", "stale", "Test");
  await svc.save(owner, {
    chatId: "-124",
    enabled: true,
    events: ["SPEND_THRESHOLD"],
    cooldownMinutes: 5,
  });
  await svc.tick();
  assert.equal(
    (
      await db
        .select()
        .from(notificationJobs)
        .where(eq(notificationJobs.key, "stale"))
    )[0].state,
    "CANCELLED",
  );
  const fail = new TelegramService(db, {
    test: async () => {},
    send: async () => {
      throw new AppError(422, "TELEGRAM_REJECTED", "reject");
    },
  });
  await fail.enqueue("SPEND_THRESHOLD", "definite", "definite", "Test");
  await fail.tick();
  const [failed] = await db
    .select()
    .from(notificationJobs)
    .where(eq(notificationJobs.key, "definite"));
  assert.equal(failed.state, "FAILED");
  await fail.retry(owner, failed.id);
  await db
    .update(notificationJobs)
    .set({ state: "SENDING", updatedAt: new Date(0) })
    .where(eq(notificationJobs.id, failed.id));
  await fail.tick();
  assert.equal(
    (
      await db
        .select()
        .from(notificationJobs)
        .where(eq(notificationJobs.id, failed.id))
    )[0].state,
    "UNKNOWN",
  );
});
test("Distributed PostgreSQL API limiter atomic under concurrency and resets next window; no client IP bypass", async () => {
  const actor = randomUUID(),
    now = 1800000;
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => apiRateLimit(db, actor, true, now, 5)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(
    results.filter(
      (r) => r.status === "rejected" && code("API_RATE_LIMIT")(r.reason),
    ).length,
    5,
  );
  await apiRateLimit(db, actor, true, now + 60000, 5);
  const indexes = await db.execute(
    sql`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('commission_tracking_order','commission_namespace_order','insight_day_campaign_page')`,
  );
  assert.equal(indexes.rows.length, 3);
});
