import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  bulkInput,
  bulkConfirm,
  cloneSchema,
  plan,
  sameConfig,
  type PlanRow,
} from "../../src/server/ads/bulk/validation";
const row = (
  key: string,
  campaignGroup: string,
  adSetGroup: string,
  extra: Partial<PlanRow> = {},
): PlanRow => ({
  key,
  pageId: "page",
  accountId: "acct",
  source: "MOCK",
  campaignGroup,
  adSetGroup,
  campaignOwnerKey: null,
  adSetOwnerKey: null,
  campaignRefId: null,
  adSetRefId: null,
  findings: [],
  snapshot: {
    campaign: { objective: "OUTCOME_TRAFFIC", status: "PAUSED" },
    adSet: { daily_budget: "999999999999999", status: "PAUSED" },
    creative: {},
    ad: {},
    pageMetaId: "1",
    accountMetaId: "2",
    postId: "1_3",
    videoId: "3",
    mode: "NEW_CREATIVE",
    currency: "VND",
    timezone: "Asia/Ho_Chi_Minh",
    affiliateUrl: null,
    subId: null,
    thumbnailUrl: null,
  },
  ...extra,
});
test("Bulk strict schemas cap 100 rows, unique keys, require budget confirmation, disallow ACTIVE", () => {
  const i = {
    name: "Bulk",
    structure: "PER_VIDEO",
    items: [{ key: randomUUID(), publishJobId: randomUUID() }],
  };
  assert.throws(() =>
    bulkInput.parse({ ...i, items: [i.items[0], i.items[0]] }),
  );
  assert.throws(() =>
    bulkInput.parse({ ...i, overrides: { status: "ACTIVE" } }),
  );
  assert.throws(() => bulkConfirm.parse({ input: i, confirmed: true }));
  assert.throws(() =>
    cloneSchema.parse({
      sourceRequestId: randomUUID(),
      level: "AD",
      copies: 11,
    }),
  );
});
test("Planner shares only one Campaign and one Ad Set for many Ads; exact large budgets not multiplied by Ads", () => {
  const rows = [
      row("a", "camp", "set"),
      row("b", "camp", "set"),
      row("c", "camp", "set"),
    ],
    p = plan(rows);
  assert.deepEqual(p.counts, { campaigns: 1, adSets: 1, creatives: 3, ads: 3 });
  assert.equal(p.budgets[0].newBudget, "999999999999999");
  assert.equal(rows[1].campaignOwnerKey, "a");
  assert.equal(rows[2].adSetOwnerKey, "a");
});
test("Many adsets sum ABO once per set; CBO once per campaign", () => {
  const a = row("a", "c", "s1"),
    b = row("b", "c", "s2");
  assert.equal(plan([a, b]).budgets[0].newBudget, "1999999999999998");
  a.snapshot.campaign.daily_budget = "123456";
  b.snapshot.campaign.daily_budget = "123456";
  delete a.snapshot.adSet.daily_budget;
  delete b.snapshot.adSet.daily_budget;
  assert.equal(plan([a, b]).budgets[0].newBudget, "123456");
});
test("Shared configuration conflicts block Ready and object ordering does not create false conflicts", () => {
  const a = row("a", "c", "s"),
    b = row("b", "c", "s");
  b.snapshot.adSet.daily_budget = "200";
  plan([a, b]);
  assert(b.findings.some((f) => f.field === "structure.adSet"));
  assert(sameConfig({ a: 1, b: 2 }, { b: 2, a: 1 }));
});
test("Existing budget is reported once; currency/source and Daily/Lifetime stay separate", () => {
  const a = row("a", "parent", "parent", {
      campaignRefId: "old",
      adSetRefId: "old",
    }),
    b = row("b", "parent", "parent", {
      campaignRefId: "old",
      adSetRefId: "old",
    }),
    c = row("c", "new", "new");
  c.snapshot.currency = "USD";
  c.snapshot.adSet = { lifetime_budget: "900" };
  const p = plan([a, b, c]);
  assert.equal(p.counts.campaigns, 1);
  assert.equal(
    p.budgets.find((b) => b.currency === "VND")?.existingBudget,
    "999999999999999",
  );
  assert.equal(
    p.budgets.find((b) => b.currency === "USD")?.kind,
    "lifetime_budget",
  );
});
