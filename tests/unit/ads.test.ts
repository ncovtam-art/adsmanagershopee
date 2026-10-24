import { test } from "node:test";
import assert from "node:assert/strict";
import { adsInput, compatible, subset } from "../../src/server/ads/validation";
import {
  LiveAdsProvider,
  MockAdsProvider,
  verificationShape,
} from "../../src/server/ads/provider";
import { MetaGateway } from "../../src/server/meta/gateway";
import { AppError } from "../../src/server/http/errors";
import { randomUUID } from "node:crypto";
const template = {
  campaign: {
    objective: "OUTCOME_TRAFFIC",
    buying_type: "AUCTION",
    special_ad_categories: [],
  },
  adSet: {
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    daily_budget: "150000",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: {
      geo_locations: { countries: ["VN"] },
      publisher_platforms: ["facebook"],
      facebook_positions: ["feed"],
    },
  },
  creative: { cta: "LEARN_MORE" },
};
const input = adsInput.parse({
  publishJobId: randomUUID(),
  donorVersionId: randomUUID(),
  name: "Ads",
  mode: "NEW_CREATIVE",
});
test("Ads strict input rejects ACTIVE status, numeric/malformed IDs and unknown source payloads", () => {
  assert.throws(() => adsInput.parse({ ...input, status: "ACTIVE" }));
  assert.throws(() => adsInput.parse({ ...input, budget: "150.5" }));
  assert.throws(() => adsInput.parse({ ...input, publishJobId: 123 }));
});
test("Donor compatibility emits only creation allowlist with PAUSED and exact integer budget", () => {
  const c = compatible(input, template);
  assert.deepEqual(c.findings, []);
  assert.equal(c.campaign.status, "PAUSED");
  assert.equal(c.adSet.status, "PAUSED");
  assert.equal(c.adSet.daily_budget, "150000");
  assert.equal(c.adSet.campaign_id, undefined);
});
test("Existing Post requires Engagement/Post Engagement and disallows claiming traffic CTA", () => {
  assert(
    compatible({ ...input, mode: "EXISTING_POST" }, template).findings.some(
      (f) => f.state === "UNSUPPORTED",
    ),
  );
  assert.deepEqual(
    compatible(
      {
        ...input,
        mode: "EXISTING_POST",
        objective: "OUTCOME_ENGAGEMENT",
        optimization: "POST_ENGAGEMENT",
      },
      template,
    ).findings,
    [],
  );
});
test("Unknown categories, ambiguous budget and Instagram identity never pass Ready", () => {
  assert(compatible(input,{...template,creative:{}}).findings.some(f=>f.field==="creative.cta" && f.state==="UNKNOWN"));
  const t = structuredClone(template);
  delete (t.campaign as Record<string, unknown>).special_ad_categories;
  t.adSet.targeting.publisher_platforms = ["instagram"];
  assert(compatible(input, t).findings.some((f) => f.state === "UNKNOWN"));
  assert(
    compatible(input, t).findings.some(
      (f) => f.field === "targeting.placements",
    ),
  );
  assert(
    compatible(input, {
      ...template,
      campaign: { ...template.campaign, daily_budget: "100" },
    }).findings.some((f) => f.field === "budget"),
  );
});
test("Lifetime requires fresh end date and never copies old schedules", () => {
  const t = {
    ...template,
    adSet: {
      ...template.adSet,
      daily_budget: undefined,
      lifetime_budget: "200000",
    },
  };
  assert(compatible(input, t).findings.some((f) => f.field === "schedule.end"));
  assert.equal(compatible(input, template).adSet.start_time, undefined);
});
test("Verification requires matching parents/status/content with unordered target lists and explicit mock namespace", async () => {
  assert(
    !subset(
      { status: "PAUSED", campaign_id: "123" },
      { status: "ACTIVE", campaign_id: "123" },
    ),
  );
  assert(subset(["VN", "US"], ["US", "VN"]));
  assert(subset({start_time:"2026-10-20T09:00:00+07:00"},{start_time:"2026-10-20T02:00:00+0000"}));
  assert(!subset({start_time:"2026-10-20T09:00:00+07:00"},{start_time:"2026-10-20T03:00:00+0000"}));
  assert(!subset(["VN"], ["VN", "US"]));
  assert.deepEqual(
    verificationShape("ad", {
      creative: { creative_id: "123" },
      status: "PAUSED",
    }),
    { creative: { id: "123" }, status: "PAUSED" },
  );
  const mock = new MockAdsProvider();
  const ctx = {
    accountMetaId: "123",
    pageMetaId: "45",
    postId: "45_678",
    videoId: "678",
    currency: "VND",
    timezone: "Asia/Ho_Chi_Minh",
    token: "test",
    pageToken: "test",
  };
  const id = await mock.create(ctx, "ad", {}, "test-request");
  await mock.verify(ctx, "ad", id, {}, "test-request");
  await assert.rejects(() => mock.verify(ctx, "ad", "123", {}, "test-request"));
});
test("Live Marketing create uses official account edge, no retry after timeout and checks returned ID", async () => {
  const old = {
    DRY_RUN: process.env.DRY_RUN,
    META_WRITES_ENABLED: process.env.META_WRITES_ENABLED,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_GRAPH_VERSION: process.env.META_GRAPH_VERSION,
    META_REDIRECT_URI: process.env.META_REDIRECT_URI,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  Object.assign(process.env, {
    DRY_RUN: "false",
    META_WRITES_ENABLED: "true",
    META_APP_ID: "123",
    META_APP_SECRET: "unit-test-secret",
    META_GRAPH_VERSION: "v99.0",
    META_REDIRECT_URI: "http://localhost:3000/api/meta/callback",
    APP_ORIGIN: "http://localhost:3000",
  });
  try {
    let calls = 0;
    const ctx = {
      accountMetaId: "123",
      pageMetaId: "45",
      postId: "45_678",
      videoId: "678",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      token: "test",
      pageToken: "test",
    };
    const fetcher: typeof fetch = async (url, opts) => {
      calls++;
      assert(String(url).includes("/act_123/campaigns"));
      assert(!String(url).includes("test"));
      assert.equal(opts?.method, "POST");
      assert.equal((opts?.body as FormData).get("status"), "PAUSED");
      throw new Error("timeout");
    };
    await assert.rejects(
      () =>
        new LiveAdsProvider(new MetaGateway(fetcher)).create(
          ctx,
          "campaign",
          { status: "PAUSED" },
          "req",
        ),
      (e: unknown) => e instanceof AppError && e.code === "META_RESULT_UNKNOWN",
    );
    assert.equal(calls, 1);
    await assert.rejects(
      () =>
        new LiveAdsProvider(
          new MetaGateway(async () => Response.json({ success: true })),
        ).create(ctx, "campaign", { status: "PAUSED" }, "req"),
      (e: unknown) => e instanceof AppError && e.code === "META_RESULT_UNKNOWN",
    );
  } finally {
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
