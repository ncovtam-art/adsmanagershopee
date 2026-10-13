import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const origin = { Origin: "http://localhost:3001" };
async function login(page: Page, email = "owner@e2e.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(
      JSON.parse(readFileSync("artifacts/e2e-fixture.json", "utf8")).password,
    );
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
}
async function open(page: Page) {
  await page.goto("/settings?tab=automation");
  await page.getByRole("button", { name: "Mở Ads Care", exact: true }).click();
}
test("Care user thresholds, Dry Run no effects, Winner alert from actual worker and review", async ({
  page,
}) => {
  await login(page);
  const accounts = (
    await (await page.request.get("/api/analytics/accounts?source=MOCK")).json()
  ).data;
  const account = accounts.find(
    (a: { currency: string }) => a.currency === "VND",
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const yesterday = new Date(Date.parse(today) - 86400000)
    .toISOString()
    .slice(0, 10);
  expect(
    (
      await page.request.post("/api/analytics/sync", {
        headers: origin,
        data: {
          accountId: account.id,
          since: yesterday,
          until: yesterday,
          replace: true,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await open(page);
  await page.getByLabel("Tên rule", { exact: true }).fill("Winner E2E");
  await page.getByLabel("Nguồn Ads Care").selectOption("MOCK");
  await expect(
    page.getByLabel("TKQC Ads Care").getByRole("option").nth(1),
  ).toBeAttached();
  await page.getByLabel("TKQC Ads Care").selectOption(account.id);
  await page.getByLabel("Chỉ số 1", { exact: true }).selectOption("ctr");
  await page.getByLabel("Ngưỡng 1", { exact: true }).fill("2");
  await page.getByLabel("Winner Detection", { exact: true }).check();
  await page.getByRole("button", { name: "Lưu rule tắt", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Winner E2E", { exact: true }) });
  await expect(row).toContainText("Đang tắt");
  await row
    .getByRole("button", { name: "Dry Run Winner E2E", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kết quả Dry Run" }),
  ).toBeVisible();
  await expect(page.locator(".care-evidence")).toContainText("Đạt ngưỡng");
  await expect(page.locator(".care-evidence")).toContainText("2.5000");
  let data = (await (await page.request.get("/api/care/rules")).json()).data;
  expect(data.alerts).toHaveLength(0);
  await row.getByRole("button", { name: "Bật cảnh báo", exact: true }).click();
  await expect(row).toContainText("Cảnh báo đã bật");
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "WINNER", exact: true }) })
      .filter({ hasText: "Winner E2E" }),
  ).toBeVisible({ timeout: 25000 });
  await page.getByRole("button", { name: "Đã kiểm tra", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "WINNER", exact: true }) })
      .filter({ hasText: "Winner E2E" }),
  ).toContainText("REVIEWED");
  data = (await (await page.request.get("/api/care/rules")).json()).data;
  expect(data.pauses).toHaveLength(0);
  await page.screenshot({ path: "artifacts/care-desktop.png", fullPage: true });
  await row.getByRole("button", { name: "Tắt rule", exact: true }).click();
});
test("Auto Pause checkbox explicit and missing fresh Dry Run blocks enabling, mobile UI fits", async ({
  page,
}) => {
  await login(page);
  await open(page);
  await page.getByLabel("Tên rule", { exact: true }).fill("Auto guard E2E");
  await page.getByLabel("Nguồn Ads Care").selectOption("MOCK");
  await expect(
    page.getByLabel("TKQC Ads Care").getByRole("option").nth(1),
  ).toBeAttached();
  await page.getByLabel("TKQC Ads Care").selectOption({ index: 1 });
  await page.getByLabel("Ngưỡng 1", { exact: true }).fill("100000");
  await page
    .getByLabel("Đề xuất Auto Pause (chưa bật)", { exact: true })
    .check();
  await page.getByRole("button", { name: "Lưu rule tắt", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Auto guard E2E", { exact: true }) });
  await expect(
    row.getByRole("button", { name: "Bật Auto Pause", exact: true }),
  ).toBeDisabled();
  await row
    .getByLabel("Tôi cho phép dừng campaign đạt ngưỡng sau Dry Run")
    .check();
  await row
    .getByRole("button", { name: "Bật Auto Pause", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Chạy Dry Run" }),
  ).toContainText("Dry Run");
  await expect(row).toContainText("Đang tắt");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Tên rule", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "artifacts/care-mobile.png", fullPage: true });
});
test("Telegram config password input/server encryption and no token in reads; disabled sends nothing", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings?tab=telegram");
  const token = "123456789:" + "T".repeat(30);
  await page.getByLabel("Bot Token mới").fill(token);
  await page.getByLabel("Chat ID", { exact: true }).fill("-123");
  await page.getByLabel("ROAS thấp", { exact: true }).check();
  await page.getByRole("button", { name: "Lưu Telegram", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu Telegram" }),
  ).toBeVisible();
  await expect(page.getByLabel("Bot Token mới")).toHaveValue("");
  await expect(
    page.getByLabel("Bật gửi các thông báo đã chọn"),
  ).not.toBeChecked();
  const raw = await (await page.request.get("/api/telegram/settings")).text();
  expect(raw).not.toContain(token);
  expect(raw).not.toContain("encryptedToken");
  expect(
    (await (await page.request.get("/api/telegram/jobs")).json()).data,
  ).toHaveLength(0);
});
test("Viewer/wrong Origin denied and production CSP uses nonce without unsafe-inline scripts", async ({
  page,
}) => {
  await login(page);
  const response = await page.request.get("/login");
  const csp = response.headers()["content-security-policy"];
  expect(csp).toContain("'nonce-");
  expect(csp.split(";").find((v) => v.includes("script-src"))).not.toContain(
    "unsafe-inline",
  );
  expect(
    (
      await page.request.post("/api/care/dry-run", {
        headers: { Origin: "https://evil.test" },
        data: { id: "invalid" },
      })
    ).status(),
  ).toBe(403);
  await page.request.post("/api/auth/logout", { headers: origin });
  await login(page, "viewer@e2e.test");
  await page.goto("/ads");
  await expect(
    page.getByRole("region", { name: "Ads Care", exact: true }),
  ).toHaveCount(0);
  for (const path of [
    "/api/care/rules",
    "/api/telegram/settings",
    "/api/telegram/jobs",
  ])
    expect((await page.request.get(path)).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/care/rules", { headers: origin, data: {} })
    ).status(),
  ).toBe(403);
});
