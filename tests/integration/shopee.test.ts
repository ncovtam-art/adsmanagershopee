import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { connectTestDatabase, clearTestDatabase } from "../helpers";
import { AuthService } from "../../src/server/auth/service";
import { TeamService } from "../../src/server/team/service";
import { MetaService } from "../../src/server/meta/service";
import { MOCK_IDS } from "../../src/server/meta/mock";
import { TrackingService } from "../../src/server/shopee/tracking";
import { CommissionService } from "../../src/server/shopee/commissions";
import {
  commissionRows,
  commissionHistory,
  commissionImports,
  trackingRecords,
  trackingLinkVersions,
  pages,
  adAccounts,
  auditLogs,
} from "../../src/server/database/schema";
import { unseal } from "../../src/server/meta/crypto";
import { AppError } from "../../src/server/http/errors";
import type { Actor } from "../../src/server/auth/policy";
import type { ImportOptions } from "../../src/server/shopee/csv";
const connection = connectTestDatabase(),
  db = connection.db,
  tracking = new TrackingService(db),
  commissions = new CommissionService(db),
  meta = new MetaService(db);
let owner: Actor,
  buyer: Actor,
  uploader: Actor,
  viewer: Actor,
  page: typeof pages.$inferSelect,
  otherPage: typeof pages.$inferSelect,
  account: typeof adAccounts.$inferSelect,
  productId: string,
  first: typeof trackingRecords.$inferSelect,
  second: typeof trackingRecords.$inferSelect,
  rowId: string;
process.env.META_MOCK_ENABLED = "true";
const code = (expected: string) => (err: unknown) =>
  err instanceof AppError && err.code === expected;
const options: ImportOptions = {
  source: "MOCK",
  affiliateAccount: "shopee_vn",
  encoding: "auto",
  delimiter: "auto",
  columns: {
    rowId: "commission_id",
    orderId: "order_id",
    orderItemId: "order_item_id",
    subId: "sub_id",
    amount: "commission",
    status: "status",
    currency: "currency",
    orderedAt: "order_date",
    reportedAt: "updated_at",
    settledAt: "settlement_date",
  },
  statusMap: {},
  currency: "VND",
  decimal: ".",
  dateFormat: "YMD",
  timezone: "UTC",
};
const report = (rows: string[]) =>
  Buffer.from(
    "commission_id,order_id,order_item_id,sub_id,commission,status,currency,order_date,updated_at,settlement_date\n" +
      rows.join("\n"),
  );
const input = () => ({
  pageIds: [page.id],
  productId,
  affiliateAccount: "shopee_vn",
  channel: "ORGANIC",
  contentRef: "Video tham chiếu",
});
const ingest = async (buffer: Buffer, config = options) => {
  const preview = await commissions.preview(
    owner,
    buffer,
    "AffiliateCommissionReport.csv",
    config,
  );
  return commissions.commit(owner, {
    id: preview.id,
    fingerprint: preview.fingerprint,
  });
};
before(async () => {
  await clearTestDatabase(connection);
  const password = randomBytes(24).toString("hex");
  owner = await new AuthService(db).createOwner({
    name: "Chủ sở hữu Shopee Test",
    email: "owner@shopee.test",
    password,
    workspaceName: "Shopee Test",
  });
  const team = new TeamService(db);
  buyer = await team.create(owner, {
    name: "Media Buyer Shopee",
    email: "buyer@shopee.test",
    password,
    role: "MEDIA_BUYER",
  });
  uploader = await team.create(owner, {
    name: "Uploader Shopee",
    email: "uploader@shopee.test",
    password,
    role: "UPLOADER",
  });
  viewer = await team.create(owner, {
    name: "Viewer Shopee",
    email: "viewer@shopee.test",
    password,
    role: "VIEWER",
  });
  const inventory = await meta.mock(owner);
  await meta.complete(owner, {
    connectionId: inventory.id,
    pageIds: inventory.pages.map((p) => p.id),
    accountIds: inventory.accounts.map((a) => a.id),
    mappings: { [inventory.pages[0].id]: MOCK_IDS.account },
  });
  [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, inventory.pages[0].id));
  [otherPage] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, inventory.pages[1].id));
  [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.metaId, MOCK_IDS.account));
});
after(async () => {
  await connection.pool.end();
});
test("Product lưu PostgreSQL, URL duplicate và Viewer mutation bị chặn", async () => {
  productId = (
    await tracking.createProduct(owner, {
      name: "Sản phẩm Shopee Test",
      url: "https://shopee.vn/product/123/456",
      niche: "Gia dụng",
    })
  ).id;
  assert.equal((await tracking.products(viewer)).length, 1);
  await assert.rejects(
    tracking.createProduct(owner, {
      name: "Trùng",
      url: "https://shopee.vn/product/123/456",
      niche: "",
    }),
    code("PRODUCT_EXISTS"),
  );
  await assert.rejects(
    tracking.createProduct(viewer, {
      name: "Bad",
      url: "https://shopee.vn/product/1/2",
      niche: "",
    }),
    code("FORBIDDEN"),
  );
});
test("Bulk SubID unique constraint, source/account snapshots và Page ACL", async () => {
  await assert.rejects(
    tracking.create(buyer, input()),
    code("RESOURCE_FORBIDDEN"),
  );
  const records = await tracking.create(owner, {
    ...input(),
    pageIds: [page.id, otherPage.id],
  });
  [first] = await db
    .select()
    .from(trackingRecords)
    .where(eq(trackingRecords.id, records[0].id));
  [second] = await db
    .select()
    .from(trackingRecords)
    .where(eq(trackingRecords.id, records[1].id));
  assert.notEqual(first.subId, second.subId);
  assert.equal(first.source, "MOCK");
  assert.equal(first.productUrl, "https://shopee.vn/product/123/456");
  assert.equal(first.status, "MANUAL_ACTION_REQUIRED");
  await assert.rejects(
    db
      .insert(trackingRecords)
      .values({ ...first, id: randomBytes(8).toString("hex") }),
  );
});
test("Uploader chỉ Organic trên Page grant; Ads cần account grant và 3 ID đúng", async () => {
  await meta.grant(owner, {
    userId: uploader.id,
    pageId: page.id,
    accountId: null,
    enabled: true,
  });
  await tracking.create(uploader, input());
  await assert.rejects(
    tracking.create(uploader, { ...input(), channel: "ADS" }),
    code("ADS_TRACKING_FORBIDDEN"),
  );
  await meta.grant(owner, {
    userId: buyer.id,
    pageId: page.id,
    accountId: null,
    enabled: true,
  });
  await assert.rejects(
    tracking.create(buyer, { ...input(), channel: "ADS" }),
    code("RESOURCE_FORBIDDEN"),
  );
  await meta.grant(owner, {
    userId: buyer.id,
    pageId: null,
    accountId: account.id,
    enabled: true,
  });
  await assert.rejects(
    tracking.create(buyer, {
      ...input(),
      channel: "ADS",
      campaignId: "123",
      adSetId: MOCK_IDS.adSet,
      adId: MOCK_IDS.ad,
    }),
    code("DONOR_MISMATCH"),
  );
  const created = await tracking.create(buyer, {
    ...input(),
    channel: "ADS",
    campaignId: MOCK_IDS.campaign,
    adSetId: MOCK_IDS.adSet,
    adId: MOCK_IDS.ad,
  });
  assert(created.length);
});
test("Gắn link cần xác nhận/SubID đúng; lưu version, repeat idempotent, không sửa version cũ", async () => {
  await assert.rejects(
    tracking.links(owner, [
      {
        trackingId: first.id,
        subId: first.subId,
        url: "https://s.shopee.vn/one",
        confirmed: false,
      },
    ]),
  );
  await assert.rejects(
    tracking.links(owner, [
      {
        trackingId: first.id,
        subId: second.subId,
        url: "https://s.shopee.vn/one",
        confirmed: true,
      },
    ]),
    code("LINK_SUBID"),
  );
  const link = {
    trackingId: first.id,
    subId: first.subId,
    url: "https://s.shopee.vn/one",
    confirmed: true,
  };
  assert.equal((await tracking.links(owner, [link])).changed, 1);
  assert.equal((await tracking.links(owner, [link])).changed, 0);
  const before = await tracking.detail(owner, first.id);
  await tracking.links(owner, [{ ...link, url: "https://s.shopee.vn/two" }]);
  const after = await tracking.detail(owner, first.id);
  assert.equal(after.versions.length, 2);
  assert.deepEqual(after.versions[1], before.versions[0]);
  await assert.rejects(
    db
      .update(trackingLinkVersions)
      .set({ url: "https://s.shopee.vn/fake" })
      .where(eq(trackingLinkVersions.id, after.versions[0].id)),
  );
});
test("Assisted CSV dùng ID/SubID, đảo dòng vẫn đúng, sai một dòng rollback toàn batch", async () => {
  await tracking.importLinks(
    owner,
    Buffer.from(
      `tracking_id,sub_id,affiliate_url\n${second.id},${second.subId},https://s.shopee.vn/second\n${first.id},${first.subId},https://s.shopee.vn/first`,
    ),
  );
  assert.equal(
    (await tracking.detail(owner, second.id)).versions[0].url,
    "https://s.shopee.vn/second",
  );
  const before = (await tracking.detail(owner, first.id)).versions.length;
  await assert.rejects(
    tracking.importLinks(
      owner,
      Buffer.from(
        `tracking_id,sub_id,affiliate_url\n${first.id},${first.subId},https://s.shopee.vn/should-not-save\n${second.id},WRONG,https://s.shopee.vn/other`,
      ),
    ),
    code("LINK_SUBID"),
  );
  assert.equal(
    (await tracking.detail(owner, first.id)).versions.length,
    before,
  );
  await assert.rejects(
    tracking.export(buyer, [second.id]),
    code("EXPORT_SCOPE"),
  );
});
test("Preview chưa ghi ledger, raw CSV mã hóa, commit 1 lần và file rename không double count", async () => {
  const raw = report([
    `ROW1,ORDER1,ITEM1, ${first.subId.toLowerCase()} ,0.1,PENDING,USD,2026-01-01,2026-01-02,`,
    `ROW2,ORDER1,ITEM2,${first.subId},0.2,PENDING,USD,2026-01-01,2026-01-02,`,
  ]);
  const preview = await commissions.preview(owner, raw, "report.csv", options);
  assert.equal((await db.select().from(commissionRows)).length, 0);
  const [batch] = await db
    .select()
    .from(commissionImports)
    .where(eq(commissionImports.id, preview.id));
  assert(!batch.encryptedRaw.includes("ORDER1"));
  assert.equal(unseal(batch.encryptedRaw), raw.toString("base64"));
  const committed = await commissions.commit(owner, {
    id: preview.id,
    fingerprint: preview.fingerprint,
  });
  assert.equal(committed.created, 2);
  const repeat = await commissions.preview(owner, raw, "rename.csv", options);
  assert.equal(repeat.applied, true);
  assert.equal(
    (
      await commissions.commit(owner, {
        id: repeat.id,
        fingerprint: repeat.fingerprint,
      })
    ).duplicateFile,
    true,
  );
  const data = await commissions.list(owner, { source: "MOCK" });
  assert.equal(data.count, 2);
  assert.equal(data.totals[0].amount, "0.300000");
  [rowId] = data.rows
    .filter((r) => r.externalRowId === "ROW1")
    .map((r) => r.id);
});
test("Update revision mới giữ lịch sử, báo cáo cũ skip; missing revision xếp review", async () => {
  const result = await ingest(
    report([
      `ROW1,ORDER1,ITEM1,${first.subId},0.15,APPROVED,USD,2026-01-01,2026-01-03,`,
    ]),
  );
  assert.equal(result.updated, 1);
  assert.equal((await commissions.detail(owner, rowId)).history.length, 2);
  const old = await ingest(
    report([
      `ROW1,ORDER1,ITEM1,${first.subId},9,REJECTED,USD,2026-01-01,2026-01-01,`,
    ]),
  );
  assert.equal(old.stale, 1);
  assert.equal((await commissions.detail(owner, rowId)).row.status, "APPROVED");
  const conflict = await ingest(
    report([`ROW1,ORDER1,ITEM1,${first.subId},0.15,PAID,USD,2026-01-01,,`]),
  );
  assert.equal(conflict.review, 1);
  assert.equal((await commissions.detail(owner, rowId)).row.status, "APPROVED");
});
test("Thiếu identity/unknown status giữ review; không cộng đến khi owner xác nhận stable key/status", async () => {
  await ingest(
    report([
      `,ORDER_NO_ITEM,,${first.subId},100,Completed,VND,2026-01-01,2026-01-02,`,
    ]),
  );
  const review = (await commissions.reviews(owner)).find(
    (r) => r.candidate.orderId === "ORDER_NO_ITEM",
  )!;
  assert(review.reasons.length >= 2);
  await assert.rejects(
    commissions.resolve(owner, {
      id: review.id,
      action: "APPLY",
      status: "APPROVED",
      reason: "Đã kiểm tra dòng",
    }),
    code("REVIEW_IDENTITY"),
  );
  await commissions.resolve(owner, {
    id: review.id,
    action: "APPLY",
    status: "APPROVED",
    manualKey: "ORDER_NO_ITEM-LINE1",
    reason: "Đối chiếu CSV nguồn đúng dòng sản phẩm",
  });
  assert.equal((await commissions.list(owner, { source: "MOCK" })).count, 3);
  await assert.rejects(
    commissions.resolve(owner, {
      id: review.id,
      action: "IGNORE",
      reason: "Đã xử lý rồi",
    }),
    code("REVIEW_CLOSED"),
  );
});
test("Unmatched không bị bỏ; manual mapping audit, không trộn source/account", async () => {
  await ingest(
    report([
      `ROW_UNKNOWN,ORDER3,ITEM1,UNKNOWN_SUBID,2,PAID,VND,2026-01-01,2026-01-02,2026-01-03`,
    ]),
  );
  const unmatched = await commissions.list(owner, {
    source: "MOCK",
    unmatched: "true",
  });
  assert.equal(unmatched.count, 1);
  const id = unmatched.rows[0].id;
  await commissions.match(owner, {
    id,
    trackingId: first.id,
    reason: "Đối chiếu SubID bên Shopee xác nhận record",
  });
  assert.equal(
    (await commissions.list(owner, { source: "MOCK", unmatched: "true" }))
      .count,
    0,
  );
  assert.equal(
    (await commissions.detail(owner, id)).row.subId,
    "UNKNOWN_SUBID",
  );
  assert.equal((await commissions.detail(owner, id)).row.matchMethod, "MANUAL");
  const logs = await db.select().from(auditLogs);
  assert(logs.some((l) => l.action === "COMMISSION_MANUAL_MAPPED"));
  const other = await tracking.create(owner, {
    ...input(),
    affiliateAccount: "other_account",
  });
  await assert.rejects(
    commissions.match(owner, {
      id,
      trackingId: other[0].id,
      reason: "Sai tài khoản cần bị từ chối",
    }),
    code("MATCH_SOURCE"),
  );
});
test("RBAC finance list/detail/export: buyer chỉ Page grant, Viewer/Uploader không đọc commission", async () => {
  await ingest(
    report([
      `ROW_OTHER,ORDER4,ITEM1,${second.subId},999,PAID,VND,2026-01-01,2026-01-02,2026-01-03`,
    ]),
  );
  const ownerRows = await commissions.list(owner, { source: "MOCK" });
  const other = ownerRows.rows.find((r) => r.externalRowId === "ROW_OTHER")!;
  assert(
    !(await commissions.list(buyer, { source: "MOCK" })).rows.some(
      (r) => r.id === other.id,
    ),
  );
  await assert.rejects(
    commissions.detail(buyer, other.id),
    code("RESOURCE_FORBIDDEN"),
  );
  await assert.rejects(
    commissions.list(viewer, { source: "MOCK" }),
    code("FORBIDDEN"),
  );
  await assert.rejects(commissions.imports(buyer), code("FORBIDDEN"));
  await assert.rejects(
    commissions.preview(uploader, report([]), "bad.csv", options),
    code("FORBIDDEN"),
  );
});
test("Link dùng chung làm attribution chỉ SubID; tổng không lẫn source/currency và history immutable", async () => {
  await tracking.links(owner, [
    {
      trackingId: first.id,
      subId: first.subId,
      url: "https://s.shopee.vn/shared",
      confirmed: true,
    },
    {
      trackingId: second.id,
      subId: second.subId,
      url: "https://s.shopee.vn/shared",
      confirmed: true,
    },
  ]);
  assert(
    (await tracking.list(owner))
      .filter((r) => [first.id, second.id].includes(r.id))
      .every((r) => r.sharedLink),
  );
  const mock = await commissions.list(owner, { source: "MOCK" });
  assert(
    mock.rows
      .filter((r) => r.trackingId === first.id)
      .every((r) => r.attribution === "SUBID_ONLY"),
  );
  await tracking.links(owner, [
    {
      trackingId: first.id,
      subId: first.subId,
      url: "https://s.shopee.vn/new-unique-after-shared",
      confirmed: true,
    },
  ]);
  assert(
    (await commissions.list(owner, { source: "MOCK" })).rows
      .filter((r) => r.trackingId === first.id)
      .every((r) => r.attribution === "SUBID_ONLY"),
    "Không nâng attribution đơn cũ sau khi đổi URL mới.",
  );
  assert.equal((await commissions.list(owner, { source: "LIVE" })).count, 0);
  assert(
    mock.totals.some((t) => t.currency === "USD") &&
      mock.totals.some((t) => t.currency === "VND"),
  );
  const [history] = await db.select().from(commissionHistory);
  await assert.rejects(
    db.delete(commissionHistory).where(eq(commissionHistory.id, history.id)),
  );
});
test("Fingerprint preview chống đổi cấu hình giữa đọc/lưu và thu hồi grant có hiệu lực ngay", async () => {
  const preview = await commissions.preview(
    owner,
    report([
      `ROW_NEW,ORDER_NEW,ITEM1,${first.subId},1,PENDING,VND,,2026-01-01,`,
    ]),
    "new.csv",
    options,
  );
  await assert.rejects(
    commissions.commit(owner, { id: preview.id, fingerprint: "0".repeat(64) }),
    code("PREVIEW_CHANGED"),
  );
  await meta.grant(owner, {
    userId: buyer.id,
    pageId: page.id,
    accountId: null,
    enabled: false,
  });
  assert.equal((await commissions.list(buyer, { source: "MOCK" })).count, 0);
  await assert.rejects(
    tracking.detail(buyer, first.id),
    code("RESOURCE_FORBIDDEN"),
  );
});

test("Report đổi cách định danh bổ sung Row ID vẫn một dòng, không double count và giữ dates", async () => {
  const sub = first.subId;
  await ingest(
    report([
      `,ORDER_UPGRADE,ITEM_UPGRADE,${sub},7,PENDING,VND,2026-01-01,2026-01-02,`,
    ]),
  );
  const initial = (await commissions.list(owner, { source: "MOCK" })).rows.find(
    (r) => r.orderId === "ORDER_UPGRADE",
  )!;
  const count = (await commissions.list(owner, { source: "MOCK" })).count;
  const upgraded = await ingest(
    report([
      `ROW_UPGRADE,ORDER_UPGRADE,ITEM_UPGRADE,${sub},7,PENDING,VND,2026-01-01,2026-01-02,`,
    ]),
  );
  assert.equal(upgraded.created, 0);
  assert.equal(upgraded.updated, 1);
  await ingest(report([`ROW_UPGRADE,,,${sub},8,APPROVED,VND,,2026-01-03,`]));
  const detail = await commissions.detail(owner, initial.id);
  assert.equal(detail.row.externalRowId, "ROW_UPGRADE");
  assert.equal(detail.row.amount, "8.000000");
  assert.equal(detail.row.orderId, "ORDER_UPGRADE");
  assert(detail.row.orderedAt);
  assert.equal(
    (await commissions.list(owner, { source: "MOCK" })).count,
    count,
  );
});
