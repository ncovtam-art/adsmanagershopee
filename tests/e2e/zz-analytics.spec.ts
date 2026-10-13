import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { csvHeaders } from "../../src/server/analytics/engine";
import { MOCK_IDS } from "../../src/server/meta/mock";
const password = () =>
  JSON.parse(readFileSync("artifacts/e2e-fixture.json", "utf8")).password;
async function login(page: Page, email = "owner@e2e.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
}
const origin = { Origin: "http://localhost:3001" };
async function choose(page: Page) {
  await page.goto("/revenue");
  await page
    .getByLabel("Nguồn Analytics", { exact: true })
    .selectOption("MOCK");
  await expect(
    page.getByLabel("TKQC Analytics", { exact: true }),
  ).not.toHaveValue("");
  await page
    .getByLabel("TKQC Analytics", { exact: true })
    .selectOption({ label: "TKQC thử nghiệm VND · VND" });
  await page
    .getByLabel("Từ ngày Analytics", { exact: true })
    .fill("2026-10-04");
  await page
    .getByLabel("Đến ngày Analytics", { exact: true })
    .fill("2026-10-05");
}
async function post(page: Page, url: string, data: unknown) {
  const r = await page.request.post(url, { headers: origin, data });
  expect(r.ok(), JSON.stringify(await r.json())).toBeTruthy();
  return (await r.json()).data;
}
test("Analytics Insights/finance policy: SubID→Ad, ROAS/Profit thật từ fixture MOCK", async ({
  page,
}) => {
  await login(page);
  const pages = (await (await page.request.get("/api/pages")).json()).data;
  const products = (await (await page.request.get("/api/products")).json())
    .data;
  const pg = pages.find(
    (p: { metaId: string }) => p.metaId === "90071992547409941",
  );
  const accounts = (await (await page.request.get("/api/ad-accounts")).json())
    .data;
  const account = accounts.find(
    (a: { metaId: string }) => a.metaId === MOCK_IDS.account,
  );
  const mapped = await page.request.patch(`/api/pages/${pg.id}`, {
    headers: origin,
    data: { code: pg.code, niche: pg.niche, primaryAccountId: account.id },
  });
  expect(mapped.ok()).toBeTruthy();
  const tracks = await post(page, "/api/shopee/tracking", {
    pageIds: [pg.id],
    productId: products[0].id,
    affiliateAccount: "analytics_e2e",
    channel: "ADS",
    contentRef: "Video Analytics E2E",
    campaignId: MOCK_IDS.campaign,
    adSetId: MOCK_IDS.adSet,
    adId: MOCK_IDS.ad,
  });
  const t = tracks[0];
  await post(page, "/api/shopee/links", {
    trackingId: t.id,
    subId: t.subId,
    url: "https://s.shopee.vn/analytics-e2e-exclusive",
    confirmed: true,
  });
  const csv = Buffer.from(
    `commission_id,sub_id,commission,status,currency,order_date,updated_at\nanalytics-paid,${t.subId},300000,PAID,VND,2026-10-03T18:00:00Z,2026-10-10T00:00:00Z\nanalytics-pending,${t.subId},150000,PENDING,VND,2026-10-04T00:00:00Z,2026-10-10T00:00:00Z`,
  );
  const r = await page.request.post("/api/commissions/preview", {
    headers: origin,
    multipart: {
      file: { name: "analytics.csv", mimeType: "text/csv", buffer: csv },
      options: JSON.stringify({
        source: "MOCK",
        affiliateAccount: "analytics_e2e",
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
      }),
    },
  });
  expect(r.ok()).toBeTruthy();
  const preview = (await r.json()).data;
  await post(page, "/api/commissions/commit", {
    id: preview.id,
    fingerprint: preview.fingerprint,
  });
  await choose(page);
  await page
    .getByRole("button", { name: "Đồng bộ Insights", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã cập nhật snapshot" }),
  ).toBeVisible();
  const section = page.getByRole("region", { name: "Ads Analytics và ROAS" });
  await expect(section).toContainText("Chưa xác nhận quy tắc mapping");
  await page
    .getByRole("button", { name: "Quy tắc tài chính & lịch cập nhật" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Chi phí khác của TKQC mỗi ngày/).fill("10");
  await dialog
    .getByRole("checkbox", { name: /Tôi xác nhận mapping SubID/ })
    .check();
  await dialog
    .getByRole("button", { name: "Lưu quy tắc", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu quy tắc" }),
  ).toBeVisible();
  await expect(section).toContainText("1.5000");
  await expect(section).toContainText("1.0000");
  await expect(section.locator(".analytics-kpis")).toContainText("-20 VND");
  await page.screenshot({
    path: "artifacts/analytics-desktop.png",
    fullPage: true,
  });
});
test("Campaign drilldown/cột/filter/export/savedview, switching source không giữ KPI MOCK", async ({
  page,
}) => {
  await login(page);
  await choose(page);
  const section = page.getByRole("region", { name: "Ads Analytics và ROAS" });
  await expect(section.locator(".analytics-table")).toBeVisible();
  await section
    .getByRole("button", { name: "Campaign thử nghiệm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("SubIDs:");
  await expect(page.getByRole("dialog")).toContainText("Video Analytics E2E");
  await page.keyboard.press("Escape");
  await section.getByLabel("Cấp báo cáo", { exact: true }).selectOption("ad");
  await expect(section.locator(".analytics-table")).toContainText(
    "Ad thử nghiệm",
  );
  await section
    .getByRole("button", { name: "Ad thử nghiệm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("8000");
  await page.keyboard.press("Escape");
  await section
    .getByText("Tùy chỉnh cột & bộ lọc đã lưu", { exact: true })
    .click();
  await section.getByRole("checkbox", { name: "cpc", exact: true }).check();
  await expect(section.locator(".analytics-table")).toContainText("600");
  await section.getByLabel("Tên bộ lọc Analytics").fill("Ads VND");
  await section
    .getByRole("button", { name: "Lưu bộ lọc", exact: true })
    .click();
  await expect(section.getByLabel("Bộ lọc Analytics đã lưu")).toContainText(
    "Ads VND",
  );
  const download = page.waitForEvent("download");
  await section.getByRole("button", { name: "Xuất CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("ads-analytics.csv");
  await section
    .getByLabel("Nguồn Analytics", { exact: true })
    .selectOption("LIVE");
  await expect(section.locator(".analytics-kpis")).toHaveCount(0);
  await expect(section).toContainText(
    "Chưa có tài khoản quảng cáo để phân tích",
  );
});
test("Ads CSV preview xác nhận và replace API, import lặp không tăng chi phí", async ({
  page,
}) => {
  await login(page);
  await choose(page);
  await page.getByRole("button", { name: "Nhập Ads CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const csv =
    csvHeaders.join(",") +
    "\n" +
    ["2026-10-04", "2026-10-05"]
      .map((day) => {
        const values: Record<string, string> = {
          date: day,
          account_id: MOCK_IDS.account,
          currency: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          campaign_id: MOCK_IDS.campaign,
          campaign_name: "Campaign CSV E2E",
          adset_id: MOCK_IDS.adSet,
          adset_name: "Ad Set CSV",
          ad_id: MOCK_IDS.ad,
          ad_name: "Ad CSV",
          page_id: "90071992547409941",
          spend: "200000",
          impressions: "10000",
          clicks: "250",
          reach: "8000",
        };
        return csvHeaders.map((k) => values[k] ?? "").join(",");
      })
      .join("\n");
  await dialog.getByLabel("Tệp CSV UTF-8", { exact: true }).setInputFiles({
    name: "ads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await dialog.getByRole("button", { name: "Xem preview Ads CSV" }).click();
  await expect(dialog).toContainText("2 dòng");
  await expect(
    dialog.getByRole("button", { name: "Lưu snapshot Ads CSV" }),
  ).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /Tôi xác nhận báo cáo gồm tất cả Ads/ })
    .check();
  await dialog
    .getByRole("checkbox", { name: /Tôi xác nhận thay snapshot API/ })
    .check();
  await dialog.getByRole("button", { name: "Lưu snapshot Ads CSV" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu CSV theo snapshot" }),
  ).toBeVisible();
  const section = page.getByRole("region", { name: "Ads Analytics và ROAS" });
  await expect(section.locator(".analytics-kpis")).toContainText("400.000 VND");
  await expect(section).toContainText("1.1250");
  // Import identical file via API still requires preview and explicit complete acknowledgment.
  const id = await page
    .getByLabel("TKQC Analytics", { exact: true })
    .inputValue();
  const options = {
    accountId: id,
    since: "2026-10-04",
    until: "2026-10-05",
    replace: false,
  };
  const r = await page.request.post("/api/analytics/import", {
    headers: origin,
    multipart: {
      file: { name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
      options: JSON.stringify(options),
    },
  });
  expect(r.ok()).toBeTruthy();
  const p = (await r.json()).data;
  const commit = await page.request.post("/api/analytics/import", {
    headers: origin,
    multipart: {
      file: { name: "ads.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
      action: "commit",
      options: JSON.stringify({
        ...options,
        complete: true,
        expectedFingerprint: p.fingerprint,
      }),
    },
  });
  expect((await commit.json()).data.duplicate).toBe(2);
});
test("Analytics mobile không overflow, Viewer API/UI bị chặn và CSRF vẫn kiểm tra", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page);
  await expect(page.locator(".analytics-table")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/analytics-mobile.png",
    fullPage: true,
  });
  const id = await page
    .getByLabel("TKQC Analytics", { exact: true })
    .inputValue();
  expect(
    (
      await page.request.post("/api/analytics/sync", {
        headers: { Origin: "https://invalid.example" },
        data: { accountId: id, since: "2026-10-04", until: "2026-10-05" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.post("/api/auth/logout", { headers: origin })).ok(),
  ).toBeTruthy();
  await login(page, "viewer@e2e.test");
  await page.goto("/revenue");
  await expect(
    page.getByRole("region", { name: "Ads Analytics và ROAS" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Bạn chưa có quyền xem dữ liệu tài chính",
    }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(
        `/api/analytics?source=MOCK&accountId=${id}&since=2026-10-04&until=2026-10-05`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        `/api/analytics/export?accountId=${id}&since=2026-10-04&until=2026-10-05`,
      )
    ).status(),
  ).toBe(403);
});
