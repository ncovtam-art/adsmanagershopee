import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectCsv,
  parseCommission,
  parseMoney,
  moneyUnits,
  unitsMoney,
  type ImportOptions,
} from "../../src/server/shopee/csv";
import {
  newSubId,
  normalizeSubId,
  shopeeUrl,
  csvCell,
} from "../../src/server/shopee/validation";
import { can } from "../../src/server/auth/policy";
import { AppError } from "../../src/server/http/errors";
const options: ImportOptions = {
  source: "LIVE",
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
  timezone: "Asia/Ho_Chi_Minh",
};
const csv = (
  row = "ROW1,ORDER1,ITEM1,P07-ABCDEF123456,0.1,PENDING,USD,2026-01-01,2026-01-02,",
) =>
  Buffer.from(
    "commission_id,order_id,order_item_id,sub_id,commission,status,currency,order_date,updated_at,settlement_date\n" +
      row,
  );
const code = (expected: string) => (err: unknown) =>
  err instanceof AppError && err.code === expected;
test("SubID ngắn uppercase, không nhúng thông tin sản phẩm, entropy và normalize", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newSubId("P07")));
  assert.equal(ids.size, 1000);
  assert([...ids].every((id) => /^P07-[0-9A-F]{12}$/.test(id)));
  assert.equal(normalizeSubId(" p07-abcdef123456 "), "P07-ABCDEF123456");
  assert(newSubId("a_very_long_page_code").length <= 21);
});
test("URL Shopee không tự gắn SubID và chặn credentials/hostname giả/HTTP", () => {
  assert.equal(
    shopeeUrl("https://shopee.vn/product/123/456#ignored"),
    "https://shopee.vn/product/123/456",
  );
  assert.equal(
    shopeeUrl("https://s.shopee.vn/example", true),
    "https://s.shopee.vn/example",
  );
  for (const url of [
    "http://shopee.vn/p",
    "https://shopee.vn.attacker.example/p",
    "https://user:password@shopee.vn/p",
    "https://shopee.vn:123/p",
    "https://shopee.vn/",
  ])
    assert.throws(() => shopeeUrl(url), code("SHOPEE_URL"));
});
test("CSV export neutralize spreadsheet formulas và escape dấu quote/newline", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell("line\nnext"), '"line\nnext"');
});
test("Parser nhận UTF-8 BOM/UTF-16 BOM, separator và alias tiếng Việt", () => {
  const text =
    "Mã đơn hàng;Order Item ID;Sub_id1;Hoa hồng;Trạng thái hoa hồng\nORD1;ITEM1;P07-AA;1000;PENDING";
  const a = inspectCsv(Buffer.from("\uFEFF" + text));
  assert.equal(a.delimiter, ";");
  assert.equal(a.columns.orderId, "Mã đơn hàng");
  assert.equal(a.columns.subId, "Sub_id1");
  const b = inspectCsv(
    Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, "utf16le")]),
  );
  assert.equal(b.encoding, "utf-16le");
  assert.deepEqual(a.headers, b.headers);
});
test("Không silent fallback encoding hỏng, header trùng/prototype hoặc tệp quá lớn", () => {
  assert.throws(
    () => inspectCsv(Buffer.from([0xff, 0xff, 0xff])),
    code("CSV_ENCODING"),
  );
  for (const text of ["a,a\n1,2", "__proto__,amount\n1,2"])
    assert.throws(() => inspectCsv(Buffer.from(text)), code("CSV_HEADERS"));
  assert.throws(
    () => inspectCsv(Buffer.alloc(2 * 1024 * 1024 + 1)),
    code("COMMISSION_SIZE"),
  );
});
test("Money BigInt exact, âm điều chỉnh, 6 chữ số và dấu locale rõ", () => {
  assert.equal(
    unitsMoney(moneyUnits("0.100000") + moneyUnits("0.200000")),
    "0.300000",
  );
  assert.equal(parseMoney("1.234,56 ₫", ",", "VND"), "1234.560000");
  assert.equal(parseMoney("1,234.56", ".", "USD"), "1234.560000");
  assert.equal(parseMoney("-0.000001", ".", "VND"), "-0.000001");
  for (const value of ["1e3", "1,23.00", "0.1234567", "NaN"])
    assert.throws(() => parseMoney(value, ".", "VND"));
});
test("ID lớn giữ chuỗi, normalize SubID, tách thời gian UTC, không đoán ngày MM/DD", () => {
  const parsed = parseCommission(
    csv(
      "900719925474099312345,ORDER1,ITEM1, p07-abcdef123456 ,0.1,PENDING,USD,2026-01-01,2026-01-02,",
    ),
    options,
  ).candidates[0];
  assert.equal(parsed.externalRowId, "900719925474099312345");
  assert.equal(parsed.subId, "P07-ABCDEF123456");
  assert.equal(parsed.orderedAt, "2025-12-31T17:00:00.000Z");
  assert.equal(parsed.reportedAt, "2026-01-01T17:00:00.000Z");
  assert.equal(parsed.amount, "0.100000");
  assert.throws(
    () =>
      parseCommission(
        csv("ROW1,ORDER1,ITEM1,P07,1,PAID,VND,2026-02-30,2026-01-02,"),
        options,
      ),
    code("COMMISSION_ROW"),
  );
});
test("Dedup dùng Row ID hoặc order/item; hai sản phẩm cùng đơn khác khóa, OrderID-only vào review", () => {
  const rows = parseCommission(
    csv(
      ",ORDER1,ITEM1,P07,1,PENDING,VND,,2026-01-01,\n,ORDER1,ITEM2,P07,2,PENDING,VND,,2026-01-01,\n,ORDER1,,P07,3,PENDING,VND,,2026-01-01,",
    ),
    options,
  ).candidates;
  assert.notEqual(rows[0].externalKey, rows[1].externalKey);
  assert.equal(rows[2].externalKey, null);
  assert(rows[2].reasons.length);
});
test("Completed không tự thành PAID, thiếu SubID vẫn giữ dòng, statusMap xác nhận rõ", () => {
  const buffer = csv("ROW1,ORDER1,ITEM1,,5,Completed,VND,,2026-01-01,");
  const row = parseCommission(buffer, options).candidates[0];
  assert.equal(row.status, null);
  assert.equal(row.subId, "");
  assert.equal(
    parseCommission(buffer, {
      ...options,
      statusMap: { Completed: "APPROVED" },
    }).candidates[0].status,
    "APPROVED",
  );
});
test("Trùng key khác nội dung trong cùng CSV: cả hai cần review, không tự cộng", () => {
  const candidates = parseCommission(
    csv(
      "ROW1,ORDER1,ITEM1,P07,1,PENDING,VND,,2026-01-01,\nROW1,ORDER1,ITEM1,P07,2,PENDING,VND,,2026-01-01,",
    ),
    options,
  ).candidates;
  assert(
    candidates.every((r) =>
      r.reasons.some((reason) => reason.includes("Nhiều dòng")),
    ),
  );
});
test("Phân quyền sản phẩm/tracking và quản lý commission không mở cho VIEWER/UPLOADER", () => {
  assert(can("UPLOADER", "tracking:write"));
  assert(!can("VIEWER", "products:write"));
  for (const role of ["UPLOADER", "VIEWER", "MEDIA_BUYER", "MANAGER"] as const)
    assert(!can(role, "commissions:manage"));
  assert(can("OWNER", "commissions:manage"));
});
