import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connectTestDatabase, clearTestDatabase } from "../helpers";
import { AuthService } from "../../src/server/auth/service";
import { TeamService } from "../../src/server/team/service";
import { MetaService } from "../../src/server/meta/service";
import { MockMetaProvider, MOCK_IDS } from "../../src/server/meta/mock";
import { TrackingService } from "../../src/server/shopee/tracking";
import { CommissionService } from "../../src/server/shopee/commissions";
import { AnalyticsService } from "../../src/server/analytics/service";
import { runInsightsTick } from "../../src/server/analytics/worker";
import { csvHeaders, localDay } from "../../src/server/analytics/engine";
import {
  adAccounts,
  pages,
  resourceGrants,
  insightDays,
  insightAds,
  insightRuns,
  analyticsPolicies,
  commissionRows,
  metaConnections,
} from "../../src/server/database/schema";
import { unseal } from "../../src/server/meta/crypto";
import { AppError } from "../../src/server/http/errors";
import type { Actor } from "../../src/server/auth/policy";
const connection = connectTestDatabase(),
  db = connection.db,
  meta = new MetaService(db),
  analytics = new AnalyticsService(db),
  tracking = new TrackingService(db),
  commissions = new CommissionService(db);
let owner: Actor,
  buyer: Actor,
  viewer: Actor,
  account: typeof adAccounts.$inferSelect,
  page: typeof pages.$inferSelect,
  track: Awaited<ReturnType<TrackingService["create"]>>[number],
  productId: string;
process.env.META_MOCK_ENABLED = "true";
const code = (name: string) => (e: unknown) =>
  e instanceof AppError && e.code === name;
const q = (extra: Record<string, unknown> = {}) => ({
  source: "MOCK",
  accountId: account.id,
  since: "2026-10-04",
  until: "2026-10-05",
  ...extra,
});
const syncInput = (extra: Record<string, unknown> = {}) => ({
  accountId: account.id,
  since: "2026-10-04",
  until: "2026-10-05",
  ...extra,
});
const policy = (extra: Record<string, unknown> = {}) => ({
  accountId: account.id,
  estimatedStatuses: ["PENDING", "APPROVED", "PAID"],
  mappingAcknowledged: true,
  otherCostPerDay: "0",
  autoSync: false,
  lifetimeStart: "2026-10-04",
  ...extra,
});
const csv = (spend = "150000", days = ["2026-10-04", "2026-10-05"]) =>
  Buffer.from(
    csvHeaders.join(",") +
      "\n" +
      days
        .map((day) => {
          const values: Record<string, string> = {
            date: day,
            account_id: MOCK_IDS.account,
            currency: "VND",
            timezone: "Asia/Ho_Chi_Minh",
            campaign_id: MOCK_IDS.campaign,
            campaign_name: "Campaign CSV",
            adset_id: MOCK_IDS.adSet,
            adset_name: "Ad Set CSV",
            ad_id: MOCK_IDS.ad,
            ad_name: "Ad CSV",
            page_id: "90071992547409941",
            campaign_status: "ACTIVE",
            adset_status: "ACTIVE",
            ad_status: "PAUSED",
            spend,
            impressions: "10000",
            clicks: "250",
            link_clicks: "200",
            landing_page_views: "160",
            reach: "8000",
          };
          return csvHeaders.map((k) => values[k] ?? "").join(",");
        })
        .join("\n"),
  );
async function importCsv(buffer = csv(), extra: Record<string, unknown> = {}) {
  const preview = await analytics.previewCsv(owner, buffer, syncInput());
  return analytics.importCsv(owner, buffer, {
    ...syncInput(),
    complete: true,
    expectedFingerprint: preview.fingerprint,
    ...extra,
  });
}
async function commission(
  id: string,
  amount: string,
  status = "PAID",
  currency = "VND",
  ordered = "2026-10-03T18:00:00Z",
) {
  const buffer = Buffer.from(
    "commission_id,sub_id,commission,status,currency,order_date,updated_at,settlement_date\n" +
      `${id},${track.subId},${amount},${status},${currency},${ordered},2026-10-10T00:00:00Z,2026-10-11T00:00:00Z`,
  );
  const p = await commissions.preview(owner, buffer, `${id}.csv`, {
    source: "MOCK",
    affiliateAccount: "analytics",
    columns: {
      rowId: "commission_id",
      subId: "sub_id",
      amount: "commission",
      status: "status",
      currency: "currency",
      orderedAt: "order_date",
      reportedAt: "updated_at",
      settledAt: "settlement_date",
    },
    timezone: "UTC",
  });
  return commissions.commit(owner, { id: p.id, fingerprint: p.fingerprint });
}
before(async () => {
  await clearTestDatabase(connection);
  const password = randomBytes(24).toString("hex");
  owner = await new AuthService(db).createOwner({
    name: "Analytics Owner",
    email: "owner@analytics.test",
    password,
    workspaceName: "Analytics Test",
  });
  const team = new TeamService(db);
  buyer = await team.create(owner, {
    name: "Analytics Buyer",
    email: "buyer@analytics.test",
    password,
    role: "MEDIA_BUYER",
  });
  viewer = await team.create(owner, {
    name: "Analytics Viewer",
    email: "viewer@analytics.test",
    password,
    role: "VIEWER",
  });
  const inv = await meta.mock(owner);
  await meta.complete(owner, {
    connectionId: inv.id,
    pageIds: inv.pages.map((p) => p.id),
    accountIds: inv.accounts.map((a) => a.id),
    mappings: { [inv.pages[0].id]: MOCK_IDS.account },
  });
  [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.metaId, MOCK_IDS.account));
  [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, "90071992547409941"));
  productId = (
    await tracking.createProduct(owner, {
      name: "Analytics product",
      url: "https://shopee.vn/product/789/123",
      niche: "Test",
    })
  ).id;
  [track] = await tracking.create(owner, {
    pageIds: [page.id],
    productId,
    affiliateAccount: "analytics",
    channel: "ADS",
    contentRef: "Analytics Video Reference",
    campaignId: MOCK_IDS.campaign,
    adSetId: MOCK_IDS.adSet,
    adId: MOCK_IDS.ad,
  });
  await tracking.links(owner, [
    {
      trackingId: track.id,
      subId: track.subId,
      url: "https://s.shopee.vn/analytics-exclusive",
      confirmed: true,
    },
  ]);
});
after(async () => {
  await connection.pool.end();
});
test("Analytics backend RBAC: VIEWER/anonymous denied; BUYER chưa grant không thấy TKQC", async () => {
  await assert.rejects(analytics.report(viewer, q()), code("FORBIDDEN"));
  await assert.rejects(analytics.report(null, q()), code("UNAUTHENTICATED"));
  assert.deepEqual(await analytics.accounts(buyer, "MOCK"), []);
  await assert.rejects(
    analytics.report(buyer, q()),
    code("RESOURCE_FORBIDDEN"),
  );
  await assert.rejects(analytics.sync(buyer, syncInput()), code("FORBIDDEN"));
});
test("Mock Insights daily snapshot + coverage, missing hoa hồng/quy tắc ROAS null; reload không gọi Meta", async () => {
  const s = await analytics.sync(owner, syncInput());
  assert.equal(s.changed, 2);
  assert.equal(s.source, "MOCK");
  assert.equal((await db.select().from(insightAds)).length, 2);
  const throwing = new AnalyticsService(db, () => {
    throw Error("Dashboard không được gọi provider");
  });
  const r = await throwing.report(owner, q());
  assert.equal(r.rows[0].spend, "300000.000000");
  assert.equal(r.rows[0].estimatedRoas, null);
  assert(r.quality.includes("NO_COMMISSION"));
  assert.equal(r.coverage.present, 2);
});
test("Nhập API lại giữ canonical rows, không doublecount", async () => {
  const s = await analytics.sync(owner, syncInput());
  assert.equal(s.duplicate, 2);
  assert.equal((await db.select().from(insightAds)).length, 2);
  assert.equal(
    (await analytics.report(owner, q())).totals?.spend,
    "300000.000000",
  );
});
test("CSV preview không ghi; đòi preview đúng fingerprint, đúng account/timezone, complete", async () => {
  const count = (await db.select().from(insightDays)).length;
  const p = await analytics.previewCsv(owner, csv(), syncInput());
  assert.equal(p.conflictingDays.length, 2);
  assert.equal((await db.select().from(insightDays)).length, count);
  await assert.rejects(
    analytics.importCsv(owner, csv(), {
      ...syncInput(),
      complete: true,
      expectedFingerprint: "a".repeat(64),
    }),
    code("PREVIEW_CHANGED"),
  );
  await assert.rejects(
    analytics.importCsv(owner, csv(), {
      ...syncInput(),
      complete: false,
      expectedFingerprint: p.fingerprint,
    }),
  );
  await assert.rejects(
    analytics.previewCsv(
      owner,
      Buffer.from(csv().toString().replaceAll("Asia/Ho_Chi_Minh", "UTC")),
      syncInput(),
    ),
    code("INSIGHTS_DIMENSIONS"),
  );
});
test("API/CSV xung đột từ chối nguyên tử; explicit replace thay snapshot không cộng spend", async () => {
  await assert.rejects(importCsv(csv()), code("SPEND_CONFLICT"));
  assert.equal(
    (await analytics.report(owner, q())).totals?.spend,
    "300000.000000",
  );
  await importCsv(csv("200000"), { replace: true });
  const r = await analytics.report(owner, q());
  assert.equal(r.totals?.spend, "400000.000000");
  assert.equal((await db.select().from(insightAds)).length, 2);
  assert(r.quality.includes("CSV_DECLARED"));
  const [run] = await db
    .select()
    .from(insightRuns)
    .where(eq(insightRuns.provider, "CSV"));
  assert(run.encryptedRaw && !run.encryptedRaw.includes("Campaign CSV"));
  assert.equal(unseal(run.encryptedRaw!), csv("200000").toString("base64"));
});
test("CSV lặp giữ 2 rows; API không âm thầm thay CSV", async () => {
  const s = await importCsv(csv("200000"));
  assert.equal(s.duplicate, 2);
  await assert.rejects(
    analytics.sync(owner, syncInput()),
    code("SPEND_CONFLICT"),
  );
  assert.equal((await db.select().from(insightAds)).length, 2);
  await analytics.sync(owner, syncInput({ replace: true }));
});
test("ROAS/Profit tách Pending Approved PAID Rejected, cohort dùng order date không settlement", async () => {
  await analytics.savePolicy(owner, policy());
  await commission("pending", "100000", "PENDING");
  await commission("approved", "150000", "APPROVED");
  await commission("paid", "200000");
  await commission("rejected", "999999", "REJECTED");
  const r = await analytics.report(owner, q());
  assert.equal(r.rows[0].commissions.REJECTED, "999999.000000");
  assert.equal(r.totals?.estimatedCommission, "450000.000000");
  assert.equal(r.totals?.realizedCommission, "200000.000000");
  assert.equal(r.totals?.estimatedRoas, "1.5000");
  assert.equal(r.totals?.realizedRoas, "0.6667");
  assert.equal(r.totals?.estimatedProfit, "150000.000000");
  assert.equal(r.totals?.realizedProfit, "-100000.000000");
  assert.equal(r.rows[0].cpc, "600.0000");
  assert.equal(r.rows[0].ctr, "2.5000");
  assert.equal(r.rows[0].cpm, "15000.0000");
  assert.equal(r.rows[0].reach, null);
});
test("Lọc trạng thái áp dụng cùng tập dữ liệu cho bảng, KPI và export service", async () => {
  let r = await analytics.report(owner, q({ status: "PAUSED" }));
  assert.equal(r.rows.length, 0);
  assert.equal(r.totals?.estimatedRoas, null);
  r = await analytics.report(owner, q({ status: "ACTIVE" }));
  assert.equal(r.rows.length, 1);
  assert.equal(r.totals?.estimatedRoas, "1.5000");
});
test("Quy tắc dự kiến configurable, OtherCost Decimal được trừ; không cộng REJECTED", async () => {
  await analytics.savePolicy(
    owner,
    policy({
      estimatedStatuses: ["APPROVED", "PAID"],
      otherCostPerDay: "10.000001",
    }),
  );
  const r = await analytics.report(owner, q());
  assert.equal(r.totals?.estimatedCommission, "350000.000000");
  assert.equal(r.totals?.otherCosts, "20.000002");
  assert.equal(r.totals?.estimatedProfit, "49979.999998");
  await analytics.savePolicy(owner, policy());
});
test("Cấp Campaign/Ad Set/Ad/SubID/content không doublecount; daily/currency/Reach rõ", async () => {
  for (const level of ["campaign", "adset", "ad", "subid", "content"]) {
    const r = await analytics.report(owner, q({ level }));
    assert.equal(r.totals?.spend, "300000.000000");
    assert.equal(r.totals?.estimatedRoas, "1.5000");
  }
  const daily = await analytics.report(
    owner,
    q({ mode: "daily", level: "ad" }),
  );
  assert.equal(daily.rows.length, 2);
  assert.equal(daily.rows[0].daily[0].reach, "8000");
  const noCommissionDay=daily.rows.find(row=>row.key.startsWith("2026-10-05:"));
  assert(noCommissionDay);
  assert.equal(noCommissionDay.estimatedRoas, null);
  assert(noCommissionDay.quality.includes("NO_COMMISSION"));
  assert.equal(daily.totals?.spend, "300000.000000");
});
test("Thiếu kỳ, STALE_DATA, thiếu order date hoặc khác currency giữ ROAS null", async () => {
  const missing = await analytics.report(owner, q({ since: "2026-10-03" }));
  assert(missing.quality.includes("MISSING_SPEND"));
  assert.equal(missing.totals?.estimatedRoas, null);
  const none = await analytics.report(
    owner,
    q({ since: "2025-01-01", until: "2025-01-02" }),
  );
  assert.equal(none.totals, null);
  assert(none.timeline?.every((d) => d.spend === null));
  await db.update(insightDays).set({ syncedAt: new Date(0) });
  assert((await analytics.report(owner, q())).quality.includes("STALE_DATA"));
  await analytics.sync(owner, syncInput());
  await commission("missing-date", "1", "PAID", "VND", "");
  assert(
    (await analytics.report(owner, q())).quality.includes("MISSING_ORDER_DATE"),
  );
  await db
    .update(commissionRows)
    .set({ orderedAt: new Date("2025-01-01") })
    .where(eq(commissionRows.externalRowId, "missing-date"));
  await commission("usd", "1", "PAID", "USD");
  const r = await analytics.report(owner, q());
  assert(r.quality.includes("CURRENCY_MISMATCH"));
  assert.equal(r.totals?.estimatedRoas, null);
  await db
    .update(commissionRows)
    .set({ orderedAt: new Date("2025-01-01") })
    .where(eq(commissionRows.externalRowId, "usd"));
});
test("Zero spend snapshot là thật: ROAS null không chia 0; không gộp nguồn LIVE/MOCK", async () => {
  await importCsv(csv("0"), { replace: true });
  assert.equal((await analytics.report(owner, q())).totals?.realizedRoas, null);
  await assert.rejects(
    analytics.report(owner, q({ source: "LIVE" })),
    code("SOURCE_MISMATCH"),
  );
  await analytics.sync(owner, syncInput({ replace: true }));
});
test("BUYER account-only thấy spend, không thấy hoa hồng Page chưa grant; đủ hai grants mới thấy ROAS", async () => {
  await db
    .insert(resourceGrants)
    .values({ userId: buyer.id, accountId: account.id });
  let r = await analytics.report(buyer, q());
  assert.equal(r.rows.length, 0);
  await db.insert(resourceGrants).values({ userId: buyer.id, pageId: page.id });
  r = await analytics.report(buyer, q());
  assert.equal(r.totals?.realizedCommission, "200000.000000");
  assert.equal(r.totals?.estimatedRoas, "1.5000");
  await analytics.savePolicy(owner, policy({ otherCostPerDay: "10" }));
  r = await analytics.report(buyer, q());
  assert(r.quality.includes("UNALLOCATED_OTHER_COSTS"));
  assert.equal(r.totals?.estimatedProfit, null);
  await analytics.savePolicy(owner, policy());
});
test("Lifetime cần xác nhận ngày bắt đầu và coverage đến hôm qua", async () => {
  const r = await analytics.report(owner, q({ mode: "lifetime" }));
  assert(r.quality.includes("LIFETIME_INCOMPLETE"));
  assert.equal(r.totals?.estimatedRoas, null);
});
test("Worker claim chạy mỗi giờ, giữ CSV ngày chọn; không có duplicate job khi chạy cạnh tranh", async () => {
  const now = new Date("2026-10-06T02:00:00Z");
  await importCsv(csv("200000"), { replace: true });
  await analytics.savePolicy(owner, policy({ autoSync: true }));
  await db.update(analyticsPolicies).set({ nextSyncAt: now });
  const [a, b] = await Promise.all([
    runInsightsTick(db, analytics, now),
    runInsightsTick(db, analytics, now),
  ]);
  assert.equal(a.length + b.length, 1);
  const d = await db.select().from(insightDays);
  assert.equal(d.find((d) => d.day === "2026-10-04")!.provider, "CSV");
  assert.equal(d.find((d) => d.day === "2026-10-03")!.provider, "API");
  await analytics.savePolicy(owner, policy());
});
test("Expired token/permission và invalid hierarchy không ghi snapshot thiếu; history chỉ safe fields", async () => {
  const [c] = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.id, account.connectionId));
  await db
    .update(metaConnections)
    .set({ expiresAt: new Date(0) })
    .where(eq(metaConnections.id, c.id));
  await assert.rejects(
    analytics.sync(owner, syncInput()),
    code("META_TOKEN_EXPIRED"),
  );
  await db
    .update(metaConnections)
    .set({ expiresAt: c.expiresAt })
    .where(eq(metaConnections.id, c.id));
  const p = new MockMetaProvider();
  const bad = new AnalyticsService(db, () => ({
    ...p,
    inventory: p.inventory,
    read: p.read,
    insights: async (token, a, s, u) => {
      const rows = await p.insights(token, a, s, u);
      return [...rows, rows[0]];
    },
  }));
  await assert.rejects(
    bad.sync(owner, syncInput()),
    code("INSIGHTS_DUPLICATE"),
  );
  assert(
    !JSON.stringify(await analytics.history(owner, account.id)).includes(
      "encryptedRaw",
    ),
  );
  await analytics.sync(owner, syncInput({ replace: true }));
});
test("Currency/timezone thay đổi không được cộng vào snapshot cũ", async () => {
  await db
    .update(adAccounts)
    .set({ currency: "USD" })
    .where(eq(adAccounts.id, account.id));
  await assert.rejects(
    analytics.report(owner, q()),
    code("REPORTING_DIMENSIONS_CHANGED"),
  );
  await db
    .update(adAccounts)
    .set({ currency: "VND", timezone: "UTC" })
    .where(eq(adAccounts.id, account.id));
  await assert.rejects(
    analytics.report(owner, q()),
    code("REPORTING_DIMENSIONS_CHANGED"),
  );
  await db
    .update(adAccounts)
    .set({ timezone: account.timezone })
    .where(eq(adAccounts.id, account.id));
});
test("Unmatched cùng namespace chặn ROAS, mapping thủ công có cảnh báo nhưng không tự bỏ đơn", async () => {
  const buffer = Buffer.from(
    "commission_id,sub_id,commission,status,currency,order_date,updated_at\nanalytics-unmatched,UNKNOWN_SUBID,9,PAID,VND,2026-10-04T00:00:00Z,2026-10-10T00:00:00Z",
  );
  const p = await commissions.preview(owner, buffer, "unmatched.csv", {
    source: "MOCK",
    affiliateAccount: "analytics",
    columns: {
      rowId: "commission_id",
      subId: "sub_id",
      amount: "commission",
      status: "status",
      currency: "currency",
      orderedAt: "order_date",
      reportedAt: "updated_at",
    },
    timezone: "UTC",
  });
  await commissions.commit(owner, { id: p.id, fingerprint: p.fingerprint });
  let r = await analytics.report(owner, q());
  assert(r.quality.includes("UNATTRIBUTED_COMMISSION"));
  assert.equal(r.totals?.estimatedRoas, null);
  const [row] = await db
    .select()
    .from(commissionRows)
    .where(eq(commissionRows.externalRowId, "analytics-unmatched"));
  await commissions.match(owner, {
    id: row.id,
    trackingId: track.id,
    reason: "Xác nhận mapping trong kiểm thử",
  });
  r = await analytics.report(owner, q());
  assert(r.quality.includes("MANUAL_MAPPING"));
  assert.equal(r.totals?.realizedCommission, "200009.000000");
});
test("Lifetime đầy đủ có ROAS, ngày hiện tại chưa kết thúc chặn tính", async () => {
  const yesterday = localDay(new Date(Date.now() - 86400000), account.timezone),
    today = localDay(new Date(), account.timezone);
  await analytics.sync(owner, syncInput({ until: yesterday, replace: true }));
  let r = await analytics.report(
    owner,
    q({ until: yesterday, mode: "lifetime" }),
  );
  assert(!r.quality.includes("LIFETIME_INCOMPLETE"));
  assert.notEqual(r.totals?.estimatedRoas, null);
  await analytics.sync(owner, {
    accountId: account.id,
    since: today,
    until: today,
  });
  r = await analytics.report(owner, q({ since: today, until: today }));
  assert(r.quality.includes("PARTIAL_DAY"));
  assert.equal(r.totals?.estimatedRoas, null);
});
test("Link từng dùng chung không nâng attribution; hai SubID cùng Ad không tự tách spend", async () => {
  const [second] = await tracking.create(owner, {
    pageIds: [page.id],
    productId,
    affiliateAccount: "analytics",
    channel: "ADS",
    contentRef: "",
    campaignId: MOCK_IDS.campaign,
    adSetId: MOCK_IDS.adSet,
    adId: MOCK_IDS.ad,
  });
  await tracking.links(owner, [
    {
      trackingId: second.id,
      subId: second.subId,
      url: "https://s.shopee.vn/analytics-exclusive",
      confirmed: true,
    },
  ]);
  let r = await analytics.report(owner, q());
  assert(r.quality.includes("SHARED_LINK"));
  assert.equal(r.totals?.estimatedRoas, null);
  await tracking.links(owner, [
    {
      trackingId: track.id,
      subId: track.subId,
      url: "https://s.shopee.vn/analytics-new",
      confirmed: true,
    },
  ]);
  r = await analytics.report(owner, q({ level: "subid" }));
  assert(r.quality.includes("UNVERIFIED_MAPPING"));
  assert.equal(r.totals?.estimatedRoas, null);
  const persisted = await db.execute(
    sql`SELECT count(*)::int AS n FROM insight_ads`,
  );
  assert(Number(persisted.rows[0].n) > 0);
});
