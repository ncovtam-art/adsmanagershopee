import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const origin = { Origin: "http://localhost:3001" },
  password = () =>
    JSON.parse(readFileSync("artifacts/e2e-fixture.json", "utf8")).password;
async function login(page: Page, email = "owner@e2e.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
}
async function open(page: Page) {
  await page.goto("/ads");
  await page.getByLabel("Nguồn Bulk Ads").selectOption("MOCK");
  await page
    .getByRole("button", { name: "Mở Bulk Ads & Cloning", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Bulk Ads & Cloning");
}
async function selected(page: Page) {
  for (const filename of ["publisher-e2e.mp4", "publisher-comment.mp4"])
    await page
      .getByRole("checkbox", {
        name: `Chọn Bulk video ${filename}`,
        exact: true,
      })
      .check();
  await expect(
    page.getByLabel("Donor version Bulk").getByRole("option").nth(1),
  ).toBeAttached();
  await page.getByLabel("Donor version Bulk").selectOption({ index: 1 });
  await page
    .getByRole("checkbox", {
      name: "Tôi đã kiểm tra normalized targeting cho toàn bộ rows",
      exact: true,
    })
    .check();
}
async function confirm(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "Tôi đã kiểm tra tổng ngân sách theo currency/Daily/Lifetime và cấu trúc",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận tạo toàn bộ MOCK Ads mới PAUSED",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Xác nhận Bulk PAUSED", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("Bulk shared adset preview counts/budget, preset and real queue progress/IDs/lineage", async ({
  page,
}) => {
  await login(page);
  await open(page);
  await selected(page);
  await page.getByLabel("Tên Bulk batch").fill("Bulk shared E2E");
  await page.getByLabel("Cấu trúc Bulk Ads").selectOption("ADSET_PER_PAGE");
  await page.getByLabel("Tên Ads Preset Bulk").fill("Preset Bulk E2E");
  await page
    .getByRole("button", { name: "Lưu Ads Preset", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu preset" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview Bulk / ngân sách", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Batch Validation: READY",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "1 Campaign mới · 1 Ad Sets mới · 2 Creative mới · 2 Ads mới",
  );
  await expect(page.getByRole("dialog")).toContainText("mới 150000");
  await confirm(page);
  const row = page
    .locator("#bulk-ads")
    .getByRole("row")
    .filter({ hasText: "Bulk shared E2E" });
  await expect(row).toContainText("Thành công 2/2", { timeout: 25000 });
  await row.getByRole("button", { name: "Chi tiết / log batch" }).click();
  await expect(page.getByRole("dialog")).toContainText("VERIFIED");
  await page.getByRole("button", { name: "Đóng log batch" }).click();
  await page.screenshot({
    path: "artifacts/bulk-ads-desktop.png",
    fullPage: true,
  });
});
test("Campaign clone preserves both members and creates new paused parents/Ads", async ({
  page,
}) => {
  await login(page);
  const batches = (
    await (await page.request.get("/api/ads/bulk/batches")).json()
  ).data;
  const source = batches.find(
    (b: { name: string }) => b.name === "Bulk shared E2E",
  );
  const detail = (
    await (
      await page.request.get(`/api/ads/bulk/detail?id=${source.id}`)
    ).json()
  ).data;
  await open(page);
  await page
    .getByText("Nhân bản Campaign / Ad Set / Ad", { exact: true })
    .click();
  await page.getByLabel("Clone Source Ads").selectOption(detail.requests[0].id);
  await page.getByLabel("Cấp Clone Ads").selectOption("CAMPAIGN");
  await page
    .getByRole("button", { name: "Đọc Clone Blueprint", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "CLONE CAMPAIGN · 1 bản · 2 rows",
  );
  await page
    .getByRole("checkbox", {
      name: "Tôi đã kiểm tra normalized targeting cho toàn bộ rows",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Preview Bulk / ngân sách", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Batch Validation: READY",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "1 Campaign mới · 1 Ad Sets mới · 2 Creative mới · 2 Ads mới",
  );
  await confirm(page);
  const row = page
    .locator("#bulk-ads")
    .getByRole("row")
    .filter({ hasText: "Clone CAMPAIGN" });
  await expect(row).toContainText("Thành công 2/2", { timeout: 25000 });
});
test("New Creative bulk row-key tracking/link mapping and mobile preview", async ({
  page,
}) => {
  await login(page);
  await open(page);
  await selected(page);
  await page.getByLabel("Tên Bulk batch").fill("Bulk New E2E");
  await page.getByLabel("Cấu trúc Bulk Ads").selectOption("ADSET_PER_PAGE");
  await page.getByLabel("Chế độ Bulk Creative").selectOption("NEW_CREATIVE");
  await page
    .getByRole("button", { name: "Chuẩn bị ADS SubID Bulk", exact: true })
    .click();
  await expect(page.getByLabel("Tracking Bulk row 1")).not.toHaveValue("");
  await expect(page.getByLabel("Tracking Bulk row 2")).not.toHaveValue("");
  const tracks = (await (await page.request.get("/api/shopee/tracking")).json())
    .data;
  for (let index = 1; index <= 2; index++) {
    const id = await page.getByLabel(`Tracking Bulk row ${index}`).inputValue(),
      t = tracks.find((t: { id: string }) => t.id === id);
    const r = await page.request.post("/api/shopee/links", {
      headers: origin,
      data: {
        trackingId: id,
        subId: t.subId,
        url: `https://s.shopee.vn/bulk-e2e-${id}`,
        confirmed: true,
      },
    });
    expect(r.ok()).toBeTruthy();
  }
  await page
    .getByRole("button", { name: "Preview Bulk / ngân sách", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Batch Validation: READY",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "artifacts/bulk-ads-mobile.png",
    fullPage: true,
  });
  await confirm(page);
  await expect(
    page
      .locator("#bulk-ads")
      .getByRole("row")
      .filter({ hasText: "Bulk New E2E" }),
  ).toContainText("Thành công 2/2", { timeout: 25000 });
});
test("Viewer and wrong Origin cannot invoke bulk/preset/clone APIs", async ({
  page,
}) => {
  await login(page);
  expect(
    (
      await page.request.post("/api/ads/bulk/confirm", {
        headers: { Origin: "https://wrong.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await login(page, "viewer@e2e.test");
  await page.goto("/ads");
  await expect(
    page.getByRole("button", { name: "Mở Bulk Ads & Cloning" }),
  ).toHaveCount(0);
  for (const route of ["batches", "presets", "detail"])
    expect((await page.request.get("/api/ads/bulk/" + route)).status()).toBe(
      403,
    );
  for (const route of ["preview", "confirm", "clone", "actions", "tracking"])
    expect(
      (
        await page.request.post("/api/ads/bulk/" + route, {
          headers: origin,
          data: {},
        })
      ).status(),
    ).toBe(403);
});
