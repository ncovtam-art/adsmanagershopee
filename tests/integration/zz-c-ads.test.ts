import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { connectTestDatabase } from "../helpers";
import {
  publicUserFields,
  users,
  pages,
  products,
  adAccounts,
  donorVersions,
  adsRequests,
  trackingRecords,
  metaConnections,
} from "../../src/server/database/schema";
import { AdsService } from "../../src/server/ads/service";
import {
  MockAdsProvider,
  mockAdsId,
  type Context,
} from "../../src/server/ads/provider";
import { PublisherService } from "../../src/server/publisher/service";
import { PublishEngine } from "../../src/server/publisher/engine";
import { VideoStorage } from "../../src/server/publisher/storage";
import { MockPublisher } from "../../src/server/publisher/provider";
import { DonorService } from "../../src/server/donors/service";
import { MOCK_IDS } from "../../src/server/meta/mock";
import { TrackingService } from "../../src/server/shopee/tracking";
import { TeamService } from "../../src/server/team/service";
import { videoFixture, bytesStream } from "../video-fixture";
import { AppError } from "../../src/server/http/errors";
import type { Actor } from "../../src/server/auth/policy";
import type { AdsInput, Kind } from "../../src/server/ads/validation";
const c = connectTestDatabase(),
  db = c.db,
  provider = new MockAdsProvider(),
  svc = new AdsService(db, () => provider),
  tracking = new TrackingService(db);
let owner: Actor,
  page: typeof pages.$inferSelect,
  version: string,
  publishJobId: string,
  assetId: string,
  uploader: Actor;
const code = (name: string) => (e: unknown) =>
  e instanceof AppError && e.code === name;
const base = () => ({
  publishJobId,
  donorVersionId: version,
  name: "Integration Ads",
  mode: "EXISTING_POST" as const,
  objective: "OUTCOME_ENGAGEMENT" as const,
  optimization: "POST_ENGAGEMENT" as const,
  facebookOnly: false,
  acknowledgeDonorChanges: true,
});
async function confirm(service = svc, input: AdsInput = base()) {
  const p = await service.preview(owner, input);
  assert.equal(p.state, "READY", JSON.stringify(p.findings));
  return service.confirm(owner, {
    ...input,
    fingerprint: p.fingerprint,
    requestKey: randomUUID(),
    confirmed: true,
  });
}
async function get(id: string) {
  return (await db.select().from(adsRequests).where(eq(adsRequests.id, id)))[0];
}
before(async () => {
  process.env.META_MOCK_ENABLED = "true";
  [owner] = await db
    .select(publicUserFields)
    .from(users)
    .where(and(eq(users.role, "OWNER"), eq(users.active, true)));
  [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, "90071992547409941"));
  const [product] = await db.select().from(products).limit(1);
  const storage = new VideoStorage(
      process.cwd() + "/.cache/test-video-storage",
    ),
    pub = new PublisherService(db, storage, () => new MockPublisher()),
    engine = new PublishEngine(db, storage, () => new MockPublisher());
  await pub.savePolicy(owner, {
    pageId: page.id,
    enabled: true,
    autoComment: false,
    delaySeconds: 0,
    commentTemplateId: null,
    removePreview: false,
  });
  const bytes = videoFixture("ads-integration-" + randomUUID());
  const a = await pub.beginUpload(owner, {
    pageId: page.id,
    filename: "ads-integration.mp4",
    size: bytes.length,
    productId: product.id,
    niche: "Gia dụng",
  });
  await pub.upload(owner, a.id, bytesStream(bytes));
  assetId = a.id;
  const input = { assetIds: [assetId], caption: "Ads integration" },
    p = await pub.preview(owner, input),
    b = await pub.confirm(owner, {
      ...input,
      fingerprint: p.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    });
  publishJobId = b.jobs[0].id;
  await engine.run(publishJobId, 0);
  const donor = new DonorService(db),
    dInput = {
      name: "Ads test donor",
      accountId: page.primaryAccountId!,
      campaignId: MOCK_IDS.campaign,
      adSetId: MOCK_IDS.adSet,
      adId: MOCK_IDS.ad,
    },
    d = await donor.preview(owner, dInput),
    saved = await donor.save(owner, {
      input: dInput,
      fingerprint: d.fingerprint,
    });
  [version] = (
    await db
      .select({ id: donorVersions.id })
      .from(donorVersions)
      .where(eq(donorVersions.donorId, saved.id))
  ).map((v) => v.id);
  uploader = await new TeamService(db).create(owner, {
    name: "No Ads rights",
    email: `ads-${randomUUID()}@test.invalid`,
    password: randomBytes(20).toString("hex"),
    role: "UPLOADER",
  });
});
after(async () => {
  await c.pool.end();
});
test("Ads resource/role security, explicit Mock switch and readiness findings", async () => {
  await assert.rejects(() => svc.options(uploader), code("FORBIDDEN"));
  await assert.rejects(() => svc.preview(uploader, base()), code("FORBIDDEN"));
  assert((await svc.options(owner)).some((o) => o.id === publishJobId));
  const p = await svc.preview(owner, {
    ...base(),
    acknowledgeDonorChanges: false,
  });
  assert.equal(p.state, "NEEDS_FIX");
  const q = await svc.preview(owner, {
    ...base(),
    objective: undefined,
    optimization: undefined,
  });
  assert.equal(q.state, "UNSUPPORTED");
  process.env.META_MOCK_ENABLED = "false";
  await assert.rejects(
    () => new AdsService(db).preview(owner, base()),
    code("MOCK_DISABLED"),
  );
  process.env.META_MOCK_ENABLED = "true";
});
test("Existing Post creates 4 new IDs PAUSED, frozen source snapshot and shared attribution without assigning Organic IDs", async () => {
  const j = await confirm();
  await svc.run(j.id);
  const row = await get(j.id);
  assert.equal(row.state, "SUCCEEDED");
  for (const key of ["campaignId", "adSetId", "creativeId", "adId"] as const)
    assert(row[key] && !Object.values(MOCK_IDS).includes(row[key]!));
  assert.equal(row.snapshot.creative.object_story_id, row.snapshot.postId);
  assert.equal(row.snapshot.campaign.status, "PAUSED");
  assert.equal(row.snapshot.adSet.status, "PAUSED");
  assert.equal(row.snapshot.ad.status, "PAUSED");
  assert(row.verifiedAt);
  assert(
    (await svc.history(owner, row.id)).history.some(
      (h) => h.action === "VERIFIED_PAUSED",
    ),
  );
});
test("Confirm replay is idempotent, changed fingerprint/request key and stale preview blocked", async () => {
  const input = base(),
    p = await svc.preview(owner, input),
    args = {
      ...input,
      fingerprint: p.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    };
  const a = await svc.confirm(owner, args);
  const b = await svc.confirm(owner, args);
  assert.equal(a.id, b.id);
  assert(b.replayed);
  await assert.rejects(
    () => svc.confirm(owner, { ...args, name: "Changed" }),
    code("ADS_REQUEST_KEY"),
  );
  await assert.rejects(
    () =>
      svc.confirm(owner, {
        ...args,
        requestKey: randomUUID(),
        budget: "999999",
      }),
    code("ADS_PREVIEW_CHANGED"),
  );
  await svc.action(owner, { id: a.id, action: "cancel" });
});
test("New Creative needs independent link/SubID then binds actual new IDs and freezes destination", async () => {
  const t = (
    await svc.prepareTracking(owner, {
      publishJobId,
      affiliateAccount: "ads_test",
    })
  )[0];
  const input: AdsInput = {
    ...base(),
    mode: "NEW_CREATIVE",
    objective: undefined,
    optimization: undefined,
    trackingId: t.id,
  };
  assert.equal((await svc.preview(owner, input)).state, "NEEDS_FIX");
  await tracking.links(owner, [
    {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/ads-" + randomUUID(),
      confirmed: true,
    },
  ]);
  const j = await confirm(svc, input);
  await assert.rejects(
    () =>
      tracking.links(owner, [
        {
          trackingId: t.id,
          subId: t.subId,
          url: "https://s.shopee.vn/changed",
          confirmed: true,
        },
      ]),
    code("ADS_LINK_FROZEN"),
  );
  await svc.run(j.id);
  const row = await get(j.id);
  assert.equal(row.state, "SUCCEEDED");
  const [mapped] = await db
    .select()
    .from(trackingRecords)
    .where(eq(trackingRecords.id, t.id));
  assert.equal(mapped.adId, row.adId);
  assert.equal(mapped.campaignId, row.campaignId);
  assert.equal((await svc.preview(owner, input)).state, "NEEDS_FIX");
});
test("Unknown after Campaign create never retries, manual ID adoption verifies then resumes remaining objects", async () => {
  class Ambiguous extends MockAdsProvider {
    count = 0;
    async create(
      ctx: Context,
      kind: Kind,
      payload: Record<string, unknown>,
      key: string,
    ) {
      this.count++;
      if (kind === "campaign")
        throw new AppError(504, "META_RESULT_UNKNOWN", "timeout");
      return super.create(ctx, kind, payload, key);
    }
  }
  const provider = new Ambiguous(),
    service = new AdsService(db, () => provider),
    j = await confirm(service);
  await service.run(j.id);
  assert.equal((await get(j.id)).state, "UNKNOWN");
  await service.run(j.id);
  assert.equal(provider.count, 1);
  await assert.rejects(
    () => service.action(owner, { id: j.id, action: "retry" }),
    code("ADS_ACTION"),
  );
  await assert.rejects(
    () =>
      svc.recover(owner, {
        id: j.id,
        externalId: "123",
        reason: "Checked real object",
        confirmed: true,
      }),
    code("ADS_VERIFY"),
  );
  await svc.recover(owner, {
    id: j.id,
    externalId: mockAdsId(j.id, "campaign"),
    reason: "Checked source MOCK identity",
    confirmed: true,
  });
  await svc.run(j.id);
  assert.equal((await get(j.id)).state, "SUCCEEDED");
});
test("Known failure after parent does not lose IDs; retry creates no duplicate parent", async () => {
  class Failed extends MockAdsProvider {
    counts: Record<string, number> = {};
    fail = true;
    async create(
      ctx: Context,
      kind: Kind,
      payload: Record<string, unknown>,
      key: string,
    ) {
      this.counts[kind] = (this.counts[kind] ?? 0) + 1;
      if (kind === "adSet" && this.fail)
        throw new AppError(422, "META_OBJECT", "definite");
      return super.create(ctx, kind, payload, key);
    }
  }
  const p = new Failed(),
    s = new AdsService(db, () => p),
    j = await confirm(s);
  await s.run(j.id);
  const failed = await get(j.id);
  assert.equal(failed.state, "FAILED");
  assert(failed.campaignId);
  p.fail = false;
  await s.action(owner, { id: j.id, action: "retry" });
  await s.run(j.id);
  assert.equal((await get(j.id)).state, "SUCCEEDED");
  assert.equal(p.counts.campaign, 1);
});
test("Read verification failure after stored ID keeps UNKNOWN and only read recovery can continue", async () => {
  class VerifyFailed extends MockAdsProvider {
    fail = true;
    count = 0;
    async create(
      ctx: Context,
      kind: Kind,
      payload: Record<string, unknown>,
      key: string,
    ) {
      this.count++;
      return super.create(ctx, kind, payload, key);
    }
    async verify(
      ctx: Context,
      kind: Kind,
      id: string,
      payload: Record<string, unknown>,
      key: string,
    ) {
      if (this.fail) throw new AppError(502, "META_NETWORK", "read failed");
      return super.verify(ctx, kind, id, payload, key);
    }
  }
  const p = new VerifyFailed(),
    s = new AdsService(db, () => p),
    j = await confirm(s);
  await s.run(j.id);
  assert.equal((await get(j.id)).state, "UNKNOWN");
  assert.equal(p.count, 1);
  p.fail = false;
  await s.recover(owner, { id: j.id });
  await s.run(j.id);
  assert.equal((await get(j.id)).state, "SUCCEEDED");
  assert.equal(p.count, 4);
});
test("Lease expiry, disabled actor/scope revocation and cancelled request cannot create", async () => {
  const j = await confirm();
  await db
    .update(adsRequests)
    .set({ state: "PROCESSING", phase: "campaign", leaseUntil: new Date(0) })
    .where(eq(adsRequests.id, j.id));
  await svc.tick();
  assert.equal((await get(j.id)).state, "UNKNOWN");
  const k = await confirm();
  const [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.id, page.primaryAccountId!));
  const [conn] = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.id, account.connectionId));
  await db
    .update(metaConnections)
    .set({ scopes: conn.scopes.filter((s) => s !== "ads_management") })
    .where(eq(metaConnections.id, conn.id));
  try {
    await svc.run(k.id);
    assert.equal((await get(k.id)).state, "FAILED");
    assert.equal((await get(k.id)).campaignId, null);
  } finally {
    await db
      .update(metaConnections)
      .set({ scopes: conn.scopes })
      .where(eq(metaConnections.id, conn.id));
  }
  const n = await confirm();
  await svc.action(owner, { id: n.id, action: "cancel" });
  await svc.run(n.id);
  assert.equal((await get(n.id)).campaignId, null);
});
