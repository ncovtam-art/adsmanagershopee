import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { connectTestDatabase } from "../helpers";
import {
  adsRequests,
  adsBatches,
  users,
  publicUserFields,
  trackingRecords,
} from "../../src/server/database/schema";
import { AdsService } from "../../src/server/ads/service";
import { BulkAdsService } from "../../src/server/ads/bulk/service";
import { MockAdsProvider, mockAdsId, type Context } from "../../src/server/ads/provider";
import type { Kind } from "../../src/server/ads/validation";
import { TrackingService } from "../../src/server/shopee/tracking";
import { startBulkWorker } from "../../src/server/ads/bulk/queue";
import type { BulkInput } from "../../src/server/ads/bulk/validation";
import { AppError } from "../../src/server/http/errors";
import type { Actor } from "../../src/server/auth/policy";
const c = connectTestDatabase(),
  db = c.db,
  provider = new MockAdsProvider(),
  ads = new AdsService(db, () => provider),
  bulk = new BulkAdsService(db, () => provider);
let owner: Actor,
  seed: typeof adsRequests.$inferSelect,
  version: string,
  viewer: Actor;
const code = (name: string) => (e: unknown) =>
  e instanceof AppError && e.code === name;
const input = (
  structure: BulkInput["structure"] = "PER_VIDEO",
  n = 2,
): BulkInput => ({
  name: "Bulk Integration",
  donorVersionId: version,
  structure,
  overrides: {
    mode: "EXISTING_POST",
    objective: "OUTCOME_ENGAGEMENT",
    optimization: "POST_ENGAGEMENT",
    facebookOnly: false,
    acknowledgeDonorChanges: true,
  },
  items: Array.from({ length: n }, () => ({
    key: randomUUID(),
    publishJobId: seed.publishJobId,
  })),
});
async function confirm(v = input(), service = bulk) {
  const p = await service.preview(owner, v);
  assert.equal(p.state, "READY", JSON.stringify(p.rows.map((r) => r.findings)));
  return service.confirm(owner, {
    input: v,
    requestKey: randomUUID(),
    fingerprint: p.fingerprint,
    confirmed: true,
    budgetAcknowledged: true,
  });
}
async function execute(id: string, service = ads) {
  const d = await bulk.detail(owner, id);
  for (const r of d.requests) await service.run(r.id);
  return bulk.detail(owner, id);
}
before(async () => {
  process.env.META_MOCK_ENABLED = "true";
  [owner] = await db
    .select(publicUserFields)
    .from(users)
    .where(and(eq(users.role, "OWNER"), eq(users.active, true)));
  [viewer] = await db
    .select(publicUserFields)
    .from(users)
    .where(eq(users.role, "VIEWER"));
  [seed] = await db
    .select()
    .from(adsRequests)
    .where(
      and(
        eq(adsRequests.state, "SUCCEEDED"),
        eq(adsRequests.mode, "EXISTING_POST"),
      ),
    );
  version = seed.donorVersionId;
});
after(async () => {
  await c.pool.end();
});
test("Batch resource/RBAC, full preview counts and fingerprint/idempotency before any API create", async () => {
  await assert.rejects(() => bulk.preview(viewer, input()), code("FORBIDDEN"));
  const v = input(),
    p = await bulk.preview(owner, v);
  assert.deepEqual(p.counts, { campaigns: 2, adSets: 2, creatives: 2, ads: 2 });
  assert.equal(p.budgets[0].newBudget, "300000");
  const args = {
      input: v,
      requestKey: randomUUID(),
      fingerprint: p.fingerprint,
      confirmed: true,
      budgetAcknowledged: true,
    },
    a = await bulk.confirm(owner, args),
    b = await bulk.confirm(owner, args);
  assert.equal(a.id, b.id);
  assert(b.replayed);
  await assert.rejects(
    () => bulk.confirm(owner, { ...args, input: { ...v, name: "Changed" } }),
    code("BULK_REQUEST_KEY"),
  );
  const fresh = input(),
    f = await bulk.preview(owner, fresh);
  await assert.rejects(
    () =>
      bulk.confirm(owner, {
        input: {
          ...fresh,
          overrides: { ...fresh.overrides, budget: "999999" },
        },
        requestKey: randomUUID(),
        fingerprint: f.fingerprint,
        confirmed: true,
        budgetAcknowledged: true,
      }),
    code("BULK_PREVIEW_CHANGED"),
  );
  await execute(a.id);
});
test("One campaign/many adsets and one adset/many ads preserve distinct IDs and correct budgets", async () => {
  const a = await confirm(input("CAMPAIGN_PER_PAGE", 3)),
    d = await execute(a.id);
  assert(d.requests.every((r) => r.state === "SUCCEEDED"));
  assert.equal(new Set(d.requests.map((r) => r.campaignId)).size, 1);
  assert.equal(new Set(d.requests.map((r) => r.adSetId)).size, 3);
  const b = await confirm(input("ADSET_PER_PAGE", 3)),
    e = await execute(b.id);
  assert(e.requests.every((r) => r.state === "SUCCEEDED"));
  assert.equal(new Set(e.requests.map((r) => r.campaignId)).size, 1);
  assert.equal(new Set(e.requests.map((r) => r.adSetId)).size, 1);
  assert.equal(new Set(e.requests.map((r) => r.adId)).size, 3);
  assert.equal(e.batch.budgets[0].newBudget, "150000");
});
test("Append verified PAUSED parents never creates or changes parent budgets", async () => {
  const v = { ...input("APPEND_ADS"), parentRequestId: seed.id },
    p = await bulk.preview(owner, v);
  assert.equal(p.counts.campaigns, 0);
  assert.equal(p.counts.adSets, 0);
  assert.equal(p.budgets[0].existingBudget, "150000");
  const b = await confirm(v),
    d = await execute(b.id);
  assert(d.requests.every((r) => r.state === "SUCCEEDED"));
  assert(
    d.requests.every(
      (r) => r.campaignId === seed.campaignId && r.adSetId === seed.adSetId,
    ),
  );
  const conflict = await bulk.preview(owner, {
    ...v,
    overrides: { ...v.overrides, budget: "300000" },
  });
  assert.equal(conflict.state, "NEEDS_FIX");
  const a = { ...input("APPEND_ADSETS"), parentRequestId: seed.id },
    c = await confirm(a),
    e = await execute(c.id);
  assert(e.requests.every((r) => r.campaignId === seed.campaignId));
  assert.equal(new Set(e.requests.map((r) => r.adSetId)).size, 2);
});
test("Queue generation/PG recovery and pause/resume do not create while paused or duplicate parent", async () => {
  const b = await confirm(input("ADSET_PER_PAGE")),
    d = await bulk.detail(owner, b.id);
  await assert.rejects(()=>ads.action(owner,{id:d.requests[0].id,action:"cancel"}),code("ADS_BULK_CONTROL"));
  await bulk.action(owner, { id: b.id, action: "pause" });
  await ads.run(d.requests[0].id, d.requests[0].generation);
  assert.equal((await bulk.detail(owner, b.id)).progress.success, 0);
  await bulk.action(owner, { id: b.id, action: "resume" });
  const runtime = startBulkWorker(db, true, ads);
  await runtime.worker.waitUntilReady();
  try {
    for (let i = 0; i < 35; i++) {
      await runtime.tick();
      const s = await bulk.detail(owner, b.id);
      if (s.progress.success === 2) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const state = await bulk.detail(owner, b.id);
    assert.equal(state.progress.success, 2);
    const counts = state.requests.map((r) => r.attempts);
    await runtime.tick();
    assert.deepEqual(
      (await bulk.detail(owner, b.id)).requests.map((r) => r.attempts),
      counts,
    );
  } finally {
    await runtime.close();
  }
});
test("Independent tracking preparations replay by row key and New Creative clones require actual new URLs", async () => {
  const items = input().items,
    params = {
      requestKey: randomUUID(),
      affiliateAccount: "bulk_test",
      items: items.map((i) => ({ key: i.key, publishJobId: i.publishJobId })),
    },
    first = await bulk.prepareTracking(owner, params),
    again = await bulk.prepareTracking(owner, params);
  assert.deepEqual(first, again);
  assert.equal(new Set(first.map((t) => t.subId)).size, 2);
  const v = input("ADSET_PER_PAGE");
  v.items = items.map((i) => ({
    ...i,
    trackingId: first.find((t) => t.key === i.key)!.trackingId,
  }));
  v.overrides = {
    ...v.overrides,
    mode: "NEW_CREATIVE",
    objective: "OUTCOME_TRAFFIC",
    optimization: "LINK_CLICKS",
  };
  assert.equal((await bulk.preview(owner, v)).state, "NEEDS_FIX");
  const tracking = new TrackingService(db);
  await tracking.links(
    owner,
    first.map((t) => ({
      trackingId: t.trackingId,
      subId: t.subId,
      url: "https://s.shopee.vn/bulk-" + randomUUID(),
      confirmed: true,
    })),
  );
  const b = await confirm(v),
    d = await execute(b.id);
  assert(d.requests.every((r) => r.state === "SUCCEEDED"));
  for (const r of d.requests) {
    const [t] = await db
      .select()
      .from(trackingRecords)
      .where(eq(trackingRecords.id, r.trackingId!));
    assert.equal(t.adId, r.adId);
  }
});
test("Campaign/Ad Set/Ad clone expansion preserves membership, lineage and new object IDs", async () => {
  const original = await confirm(input("ADSET_PER_PAGE")),
    d = await execute(original.id),
    parent = d.requests[0];
  for (const level of ["CAMPAIGN", "ADSET", "AD"] as const) {
    const blueprint = await bulk.cloneBlueprint(owner, {
      sourceRequestId: parent.id,
      level,
      copies: 2,
      newParents: false,
    });
    const v: BulkInput = {
      ...input(),
      clone: blueprint.clone,
      items: blueprint.items,
      structure: blueprint.structure,
      name: blueprint.name,
    };
    const b = await confirm(v),
      cloned = await execute(b.id);
    assert(cloned.requests.every((r) => r.state === "SUCCEEDED"));
    assert(
      cloned.requests.every((r) => r.cloneSourceId && r.cloneLevel === level),
    );
    assert(
      cloned.requests.every(
        (r) => !d.requests.some((old) => old.adId === r.adId),
      ),
    );
    if (level === "CAMPAIGN")
      assert.equal(new Set(cloned.requests.map((r) => r.campaignId)).size, 2);
    if (level === "ADSET")
      assert(
        cloned.requests.every(
          (r) =>
            r.campaignId === parent.campaignId && r.adSetId !== parent.adSetId,
        ),
      );
    if (level === "AD")
      assert(
        cloned.requests.every(
          (r) =>
            r.campaignId === parent.campaignId && r.adSetId === parent.adSetId,
        ),
      );
  }
  const blueprint = await bulk.cloneBlueprint(owner, {
    sourceRequestId: parent.id,
    level: "CAMPAIGN",
    copies: 1,
    newParents: false,
  });
  await assert.rejects(
    () =>
      bulk.preview(owner, {
        ...input(),
        clone: blueprint.clone,
        items: blueprint.items.slice(0, 1),
      }),
    code("CLONE_MEMBERS_CHANGED"),
  );
});
test("Preset stays scoped/strict and never stores auto acknowledgement or old schedule", async () => {
  const p = await bulk.savePreset(owner, {
    name: "Bulk Preset",
    donorVersionId: version,
    structure: "ADSET_PER_PAGE",
    overrides: {
      mode: "EXISTING_POST",
      objective: "OUTCOME_ENGAGEMENT",
      optimization: "POST_ENGAGEMENT",
      acknowledgeDonorChanges: true,
    },
  });
  const rows = await bulk.presets(owner);
  assert.equal(
    rows.find((x) => x.id === p.id)?.overrides.acknowledgeDonorChanges,
    false,
  );
  await assert.rejects(() => bulk.presets(viewer), code("FORBIDDEN"));
  const v = { ...input(), presetId: p.id };
  assert.equal((await bulk.preview(owner, v)).state, "READY");
});
test("Unknown create keeps dependencies waiting, batch retry cannot resend it, verified recovery releases batch", async () => {
  class Unknown extends MockAdsProvider {
    calls = 0;
    async create(
      ctx: Context,
      kind: Kind,
      payload: Record<string, unknown>,
      key: string,
    ) {
      this.calls++;
      if (kind === "campaign")
        throw new AppError(504, "META_RESULT_UNKNOWN", "timeout");
      return super.create(ctx, kind, payload, key);
    }
  }
  const p = new Unknown(),
    s = new AdsService(db, () => p),
    bsvc = new BulkAdsService(db, () => p),
    b = await confirm(input("ADSET_PER_PAGE"), bsvc),
    d = await bulk.detail(owner, b.id);
  await s.run(d.requests[0].id);
  await s.run(d.requests[1].id);
  assert.equal(p.calls, 1);
  await bulk.action(owner, { id: b.id, action: "retry" });
  await s.run(d.requests[0].id);
  assert.equal(p.calls, 1);
  const state = await bulk.detail(owner, b.id);
  assert.equal(state.progress.unknown, 1);
  assert.equal(state.progress.waiting, 1);
  await db
    .update(adsBatches)
    .set({ state: "NEEDS_ACTION" })
    .where(eq(adsBatches.id, b.id));
  await ads.recover(owner, {
    id: d.requests[0].id,
    externalId: mockAdsId(d.requests[0].id, "campaign"),
    reason: "Đã đối chiếu source MOCK",
    confirmed: true,
  });
  assert.equal((await bulk.detail(owner, b.id)).batch.state, "RUNNING");
  await ads.run(d.requests[0].id);
  const runtime = startBulkWorker(db, true, ads);
  await runtime.worker.waitUntilReady();
  try {
    for (let i = 0; i < 35; i++) {
      await runtime.tick();
      if ((await bulk.detail(owner, b.id)).progress.success === 2) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal((await bulk.detail(owner, b.id)).progress.success, 2);
  } finally {
    await runtime.close();
  }
});

test('Redis retained failure before PG claim is repopulated with new generation, without duplicate Ads',async()=>{
 class BeforeClaim extends AdsService{failed=false;override async run(id:string,generation?:number){if(!this.failed){this.failed=true;throw new Error('simulated DB error before claim');}return super.run(id,generation);}}
 const service=new BeforeClaim(db,()=>provider),b=await confirm(input('PER_VIDEO',1)),d=await bulk.detail(owner,b.id),row=d.requests[0],runtime=startBulkWorker(db,true,service);await runtime.worker.waitUntilReady();
 try{
  await runtime.tick();let failed=false;
  for(let i=0;i<30;i++){const job=await runtime.queue.getJob(`${row.id}-${row.generation}`);if(await job?.getState()==='failed'){failed=true;break;}await new Promise(r=>setTimeout(r,200));}
  assert(failed);assert.equal((await bulk.detail(owner,b.id)).requests[0].campaignId,null);
  await db.update(adsRequests).set({enqueuedAt:new Date(0)}).where(eq(adsRequests.id,row.id));
  for(let i=0;i<35;i++){await runtime.tick();if((await bulk.detail(owner,b.id)).progress.success===1)break;await new Promise(r=>setTimeout(r,250));}
  const current=(await bulk.detail(owner,b.id)).requests[0];assert.equal(current.state,'SUCCEEDED');assert(current.generation>row.generation);assert.equal(current.attempts,1);
 }finally{await runtime.close();}
});
