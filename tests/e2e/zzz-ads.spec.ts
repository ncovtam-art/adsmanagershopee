import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const password = () =>
  JSON.parse(readFileSync("artifacts/e2e-fixture.json", "utf8")).password;
const origin = { Origin: "http://localhost:3001" };
async function login(page: Page, email = "owner@e2e.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
}
async function wizard(page: Page) {
  await page.goto("/ads");
  await page.getByLabel("Nguồn Ads từ Donor").selectOption("MOCK");
  await page
    .getByRole("button", { name: "Tạo Ads PAUSED", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Video đã đăng cho Ads")
      .getByRole("option")
      .filter({ hasText: "publisher-e2e.mp4" }),
  ).toHaveCount(1);
  const value = await page
    .getByLabel("Video đã đăng cho Ads")
    .getByRole("option")
    .filter({ hasText: "publisher-e2e.mp4" })
    .getAttribute("value");
  await page.getByLabel("Video đã đăng cho Ads").selectOption(value!);
  await expect(
    page.getByLabel("Donor version cho Ads").getByRole("option").nth(1),
  ).toBeAttached();
  await page.getByLabel("Donor version cho Ads").selectOption({ index: 1 });
  await page
    .getByRole("checkbox", {
      name: "Tôi đã kiểm tra targeting chuẩn hóa, audience/pixel và lịch cũ bị loại",
      exact: true,
    })
    .check();
}
async function confirm(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận tạo MOCK Campaign, Ad Set, Creative và Ad mới PAUSED",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Xác nhận tạo Ads PAUSED", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("Video Studio Chạy quảng cáo opens posted selection; Existing Post findings, preview and PAUSED IDs", async ({
  page,
}) => {
  await login(page);
  await page.goto("/videos");
  await page.getByLabel("Nguồn video", { exact: true }).selectOption("MOCK");
  await page
    .getByRole("tab", { name: "Bài viết đã đăng", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "publisher-e2e.mp4" });
  await row.getByRole("link", { name: "Chạy quảng cáo", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ads Wizard");
  await expect(page.getByLabel("Video đã đăng cho Ads")).not.toHaveValue("");
  await page.getByRole("button", { name: "Đóng wizard Ads" }).click();
  await wizard(page);
  await page.getByLabel("Chế độ Ads Creative").selectOption("EXISTING_POST");
  await page
    .getByRole("button", { name: "Kiểm tra compatibility / Preview Ads" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Compatibility: UNSUPPORTED",
  );
  await expect(
    page.getByRole("button", { name: "Xác nhận tạo Ads PAUSED" }),
  ).toBeDisabled();
  await page
    .getByLabel("Objective Ads override")
    .selectOption("OUTCOME_ENGAGEMENT");
  await page
    .getByLabel("Optimization Ads override")
    .selectOption("POST_ENGAGEMENT");
  await page
    .getByRole("button", { name: "Kiểm tra compatibility / Preview Ads" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Compatibility: READY");
  await expect(page.getByRole("dialog")).toContainText(
    "attribution mức SubID/SHARED",
  );
  await confirm(page);
  const job = page
    .locator("#ads-from-donor")
    .getByRole("row")
    .filter({ hasText: "EXISTING_POST" });
  await expect(job).toContainText("Đã xác minh PAUSED", { timeout: 15000 });
  await expect(job).toContainText("Campaign: 980");
  await job.getByRole("button", { name: "Lịch sử Ads" }).click();
  await expect(page.getByRole("dialog")).toContainText("VERIFIED_PAUSED");
  await page.getByRole("button", { name: "Đóng lịch sử Ads" }).click();
  await page.screenshot({
    path: "artifacts/ads-create-desktop.png",
    fullPage: true,
  });
});
test("New Creative creates independent ADS tracking/link and verified mapping; mobile wizard fits", async ({
  page,
}) => {
  await login(page);
  await wizard(page);
  await page
    .getByRole("button", { name: "Tạo ADS SubID riêng", exact: true })
    .click();
  await expect(page.getByLabel("Tracking ADS cho Creative")).not.toHaveValue(
    "",
  );
  const trackingId = await page
    .getByLabel("Tracking ADS cho Creative")
    .inputValue();
  expect(trackingId).toBeTruthy();
  const tracking = (
    await (await page.request.get("/api/shopee/tracking")).json()
  ).data.find((t: { id: string }) => t.id === trackingId);
  const response = await page.request.post("/api/shopee/links", {
    headers: origin,
    data: {
      trackingId,
      subId: tracking.subId,
      url: "https://s.shopee.vn/ads-e2e-independent",
      confirmed: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Kiểm tra compatibility / Preview Ads" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Compatibility: READY");
  await expect(page.getByRole("dialog")).toContainText("ads-e2e-independent");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "artifacts/ads-create-mobile.png",
    fullPage: true,
  });
  await confirm(page);
  const row = page
    .locator("#ads-from-donor")
    .getByRole("row")
    .filter({ hasText: "NEW_CREATIVE" });
  await expect(row).toContainText("Đã xác minh PAUSED", { timeout: 15000 });
  const mapped = (
    await (await page.request.get("/api/shopee/tracking")).json()
  ).data.find((t: { id: string }) => t.id === trackingId);
  expect(mapped.adId).toMatch(/^980/);
  expect(mapped.campaignId).toMatch(/^980/);
});
test("Viewer cannot create/read Ads request and Origin prevents mutation", async ({
  page,
}) => {
  await login(page);
  expect(
    (
      await page.request.post("/api/ads/confirm", {
        headers: { Origin: "https://wrong.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await login(page, "viewer@e2e.test");
  await page.goto("/ads");
  await expect(
    page.getByRole("button", { name: "Tạo Ads PAUSED", exact: true }),
  ).toHaveCount(0);
  for (const route of ["options", "requests", "history"])
    expect((await page.request.get("/api/ads/" + route)).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/ads/confirm", { headers: origin, data: {} })
    ).status(),
  ).toBe(403);
});
