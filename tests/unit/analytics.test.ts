import { test } from "node:test";
import assert from "node:assert/strict";
import {
  micros,
  decimal,
  ratio,
  localDay,
  days,
  parseAdsCsv,
  csvHeaders,
  querySchema,
} from "../../src/server/analytics/engine";
import { MetaGateway } from "../../src/server/meta/gateway";
const line = (overrides: Record<string, string> = {}) =>
  csvHeaders
    .map(
      (k) =>
        ({
          date: "2026-10-04",
          account_id: "90071992547409935",
          currency: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          campaign_id: "90071992547409931",
          campaign_name: "Campaign",
          adset_id: "90071992547409932",
          adset_name: "Ad Set",
          ad_id: "90071992547409933",
          ad_name: "Ad",
          spend: "9007199254740993.000001",
          impressions: "10000",
          clicks: "250",
          ...overrides,
        })[k] ?? "",
    )
    .join(",");
const csv = (lines: string[]) =>
  Buffer.from(csvHeaders.join(",") + "\n" + lines.join("\n"));
test("Analytics Decimal exact tiền lớn/âm, ROAS làm tròn, không chia 0", () => {
  assert.equal(
    decimal(micros("9007199254740993.000001")),
    "9007199254740993.000001",
  );
  assert.equal(decimal(micros("-0.000001")), "-0.000001");
  assert.equal(ratio(200000n, 300000n), "0.6667");
  assert.equal(ratio(0n, 100n), "0.0000");
  assert.equal(ratio(50n, 0n), null);
  assert.equal(ratio(-1n, 2n), "-0.5000");
});
test("Order date theo reporting timezone, ngày UTC/VN khác nhau", () => {
  const date = new Date("2026-10-03T18:00:00Z");
  assert.equal(localDay(date, "UTC"), "2026-10-03");
  assert.equal(localDay(date, "Asia/Ho_Chi_Minh"), "2026-10-04");
  assert.deepEqual(days("2026-10-04", "2026-10-05"), [
    "2026-10-04",
    "2026-10-05",
  ]);
  assert.throws(() => days("2026-10-05", "2026-10-04"));
  assert(
    !querySchema.safeParse({ since: "2020-01-01", until: "2026-01-01" })
      .success,
  );
});
test("Ads CSV giữ string ID/money, metrics không có trả null", () => {
  const [r] = parseAdsCsv(csv([line()]));
  assert.equal(r.adId, "90071992547409933");
  assert.equal(r.spend, "9007199254740993.000001");
  assert.equal(r.lpv, null);
  assert.equal(r.reach, null);
});
test("Ads CSV chặn trùng Ad/ngày, mixed currency/timezone, negative và cấp Account", () => {
  for (const rows of [
    [line(), line()],
    [line(), line({ date: "2026-10-05", currency: "USD" })],
    [line({ spend: "-1" })],
    [line({ timezone: "Invalid" })],
    [line({ ad_id: "" })],
  ])
    assert.throws(() => parseAdsCsv(csv(rows)));
  assert.throws(() =>
    parseAdsCsv(
      Buffer.from("account_id,date,currency,spend\n1,2026-01-01,VND,1"),
    ),
  );
});
test("Ads CSV chặn BOM encoding lỗi, prototype headers, hàng rỗng/ngày sai", () => {
  assert.throws(() => parseAdsCsv(Buffer.from([0xff, 0xfe, 0x61])));
  assert.throws(() => parseAdsCsv(Buffer.from("__proto__,date\nx,y")));
  assert.throws(() => parseAdsCsv(csv([])));
  assert.throws(() => parseAdsCsv(csv([line({ date: "2026-02-30" })])));
});
test("Gateway Insights chỉ level Ad/ngày, paging giữ time_range/host, đọc actions và trạng thái", async () => {
  Object.assign(process.env, {
    META_APP_ID: "123",
    META_APP_SECRET: "unit-test-secret",
    META_GRAPH_VERSION: "v23.0",
    APP_ORIGIN: "http://localhost:3000",
    META_REDIRECT_URI: "http://localhost:3000/api/meta/callback",
  });
  const requests: URL[] = [];
  const row = {
    account_id: "90071992547409935",
    account_currency: "VND",
    date_start: "2026-10-04",
    date_stop: "2026-10-04",
    campaign_id: "1",
    campaign_name: "C",
    adset_id: "2",
    adset_name: "S",
    ad_id: "3",
    ad_name: "A",
    spend: "123.45",
    impressions: "10",
    clicks: "3",
    reach: "9",
    actions: [
      { action_type: "link_click", value: "2" },
      { action_type: "landing_page_view", value: "1" },
    ],
  };
  const gateway = new MetaGateway((async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.endsWith("/ads"))
      return Response.json({
        data: [
          {
            id: "3",
            effective_status: "PAUSED",
            campaign: { id: "1", effective_status: "ACTIVE" },
            adset: { id: "2", effective_status: "PAUSED" },
            creative: { effective_object_story_id: "41_100" },
          },
        ],
      });
    return url.searchParams.has("after")
      ? Response.json({ data: [] })
      : Response.json({
          data: [row],
          paging: {
            next: "https://evil.invalid/credentials",
            cursors: { after: "next-page" },
          },
        });
  }) as typeof fetch);
  const rows = await gateway.insights(
    "private-token",
    { metaId: row.account_id, currency: "VND", timezone: "Asia/Ho_Chi_Minh" },
    "2026-10-04",
    "2026-10-05",
  );
  assert.equal(rows[0].pageMetaId, "41");
  assert.equal(rows[0].linkClicks, "2");
  assert.equal(rows[0].lpv, "1");
  assert.equal(rows[0].adStatus, "PAUSED");
  assert(requests.every((r) => r.hostname === "graph.facebook.com"));
  assert(
    requests
      .filter((r) => r.pathname.endsWith("/insights"))
      .every(
        (r) =>
          r.searchParams.get("level") === "ad" &&
          r.searchParams.get("time_increment") === "1" &&
          JSON.parse(r.searchParams.get("time_range")!).since === "2026-10-04",
      ),
  );
});

import { moneyText } from "../../src/lib/analytics";
test("Hiển thị Decimal giữ dấu âm phần lẻ và ID/tiền lớn không mất chính xác", () => {
  assert.equal(moneyText("-0.000001", "VND"), "-0,000001 VND");
  assert.equal(
    moneyText("9007199254740993.000001"),
    "9.007.199.254.740.993,000001",
  );
  assert.equal(moneyText(null), "—");
  assert.equal(moneyText("-10.500000"), "-10,5");
});
