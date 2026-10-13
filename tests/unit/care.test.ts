import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ruleSchema,
  matches,
  ruleHash,
  telegramSchema,
  type RuleInput,
} from "../../src/server/care/validation";
import { TelegramGateway } from "../../src/server/care/telegram";
import { LivePauseProvider } from "../../src/server/care/provider";
import { MetaGateway } from "../../src/server/meta/gateway";
import { AppError } from "../../src/server/http/errors";
const rule: RuleInput = {
  name: "Guard rule",
  accountId: randomUUID(),
  source: "MOCK",
  level: "ad",
  windowDays: 1,
  maxAgeMinutes: 60,
  cooldownMinutes: 30,
  conditions: [
    { metric: "spend", op: "GTE", value: "999999999999999999.000001" },
    { metric: "ctr", op: "LT", value: "1.5" },
  ],
  actions: ["ALERT"],
  commissionCompleteThrough: null,
  financialAcknowledged: false,
};
const code = (v: string) => (e: unknown) =>
  e instanceof AppError && e.code === v;
test("Rule thresholds exact BigInt, AND, missing metrics never coerced to zero", () => {
  assert(
    matches(rule.conditions, {
      spend: "999999999999999999.000001",
      ctr: "1.499999",
    }),
  );
  assert(
    !matches(rule.conditions, {
      spend: "999999999999999999.000000",
      ctr: "1.4",
    }),
  );
  assert(
    !matches(rule.conditions, {
      spend: "999999999999999999.000001",
      ctr: null,
    }),
  );
  assert(
    matches([{ metric: "estimatedProfit", op: "LTE", value: "-0.000001" }], {
      estimatedProfit: "-1",
    }),
  );
});
test("Rule schema no hard-coded thresholds, no ACTIVE/custom endpoints; edits invalidate hash", () => {
  assert(ruleSchema.safeParse(rule).success);
  for (const changes of [
    { actions: ["ENABLE_AD"] },
    { windowDays: 0 },
    { conditions: [{ metric: "spend", op: "GTE", value: "" }] },
    { enabled: true },
    { actions: ["ALERT", "ALERT"] },
  ])
    assert(!ruleSchema.safeParse({ ...rule, ...changes }).success);
  assert.notEqual(
    ruleHash(rule),
    ruleHash({
      ...rule,
      conditions: [{ metric: "spend", op: "GTE", value: "1" }],
    }),
  );
  assert(
    !telegramSchema.safeParse({
      token: "https://evil.test",
      chatId: "x",
      events: [],
      enabled: true,
      cooldownMinutes: 10,
    }).success,
  );
});
test("Telegram fixed host/no redirect, structured body and safe errors/unknown/rate contracts", async () => {
  const token = "123456789:" + "A".repeat(30),
    seen: string[] = [];
  const gateway = new TelegramGateway(async (url, init) => {
    seen.push(String(url));
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(init?.body as string);
    assert.equal(body.chat_id, "-123");
    assert(!("parse_mode" in body));
    return new Response(
      JSON.stringify({ ok: true, result: { message_id: 42 } }),
    );
  });
  assert.equal(await gateway.send(token, "-123", "Test <>&"), "42");
  assert(seen[0].startsWith("https://api.telegram.org/bot"));
  await assert.rejects(
    new TelegramGateway(async () => {
      throw Error(token);
    }).send(token, "-123", "x"),
    code("TELEGRAM_UNKNOWN"),
  );
  await assert.rejects(
    new TelegramGateway(
      async () =>
        new Response(JSON.stringify({ ok: false, description: token }), {
          status: 403,
        }),
    ).send(token, "-123", "x"),
    (e) =>
      code("TELEGRAM_REJECTED")(e) && !(e as Error).message.includes(token),
  );
  await assert.rejects(
    new TelegramGateway(
      async () =>
        new Response(JSON.stringify({ parameters: { retry_after: 91 } }), {
          status: 429,
        }),
    ).send(token, "-123", "x"),
    (e) => code("TELEGRAM_RATE")(e) && (e as AppError).retryAfter === 91,
  );
});
test("Official pause adapter verifies account/parents, sends only PAUSED and does not retry mutation timeout", async () => {
  const old = {
    ...Object.fromEntries(
      [
        "META_APP_ID",
        "META_APP_SECRET",
        "META_GRAPH_VERSION",
        "META_REDIRECT_URI",
        "APP_ORIGIN",
      ].map((k) => [k, process.env[k]]),
    ),
  };
  Object.assign(process.env, {
    META_APP_ID: "123",
    META_APP_SECRET: "test-secret",
    META_GRAPH_VERSION: "v99.0",
    META_REDIRECT_URI: "https://aacc.test/api/meta/callback",
    APP_ORIGIN: "https://aacc.test",
  });
  const ctx = {
    token: "private-test-token",
    accountMetaId: "10",
    id: "40",
    level: "ad" as const,
    campaignId: "20",
    adSetId: "30",
  };
  let requests = 0,
    paused = false;
  try {
    const client = new MetaGateway(async (url, init) => {
      requests++;
      assert.equal(new URL(String(url)).pathname, "/v99.0/40");
      if (init?.method === "POST") {
        assert.equal((init.body as FormData).get("status"), "PAUSED");
        paused = true;
        return new Response(JSON.stringify({ success: true }));
      }
      return new Response(
        JSON.stringify({
          id: "40",
          account_id: "10",
          campaign_id: "20",
          adset_id: "30",
          status: paused ? "PAUSED" : "ACTIVE",
        }),
      );
    });
    const p = new LivePauseProvider(client);
    assert.equal(await p.inspect(ctx), "ACTIVE");
    await p.pause(ctx);
    assert.equal(await p.inspect(ctx), "PAUSED");
    assert.equal(requests, 3);
    await assert.rejects(
      p.inspect({ ...ctx, campaignId: "99" }),
      code("CARE_IDENTITY"),
    );
    let writes = 0;
    await assert.rejects(
      new LivePauseProvider(
        new MetaGateway(async () => {
          writes++;
          throw Error("timeout");
        }),
      ).pause(ctx),
      code("META_RESULT_UNKNOWN"),
    );
    assert.equal(writes, 1);
  } finally {
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
