import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
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
test("Wizard thử nghiệm: tìm/lọc/chọn Page, TKQC, mapping tường minh, kiểm quyền và lưu bền", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings?tab=meta");
  await page.getByRole("button", { name: "Mở kết nối thử nghiệm" }).click();
  await expect(
    page.getByRole("heading", { name: "Thiết lập Page & TKQC" }),
  ).toBeVisible();
  await page.getByLabel("Tìm Page được cấp quyền").fill("Gia dụng");
  await page.getByRole("button", { name: "Chọn tất cả đang hiển thị" }).click();
  await page.getByLabel("Tìm Page được cấp quyền").fill("");
  await page.getByLabel("Lọc quyền Page").selectOption("limited");
  await expect(page.locator(".selection-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Chọn tất cả đang hiển thị" }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page
    .locator(".selection-item")
    .filter({ hasText: "TKQC thử nghiệm VND" })
    .getByRole("checkbox")
    .check();
  await page
    .locator(".selection-item")
    .filter({ hasText: "TKQC thử nghiệm USD" })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByLabel("TKQC cho Page thử nghiệm — Gia dụng"),
  ).toHaveValue("");
  await page
    .getByLabel("TKQC cho Page thử nghiệm — Gia dụng")
    .selectOption("90071992547409935");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.locator(".health-row").filter({ hasText: "Đăng bài" }),
  ).toContainText("Thiếu quyền");
  await page.getByRole("button", { name: "Hoàn tất thiết lập" }).click();
  await expect(page.getByRole("status").filter({hasText:"Đã lưu Page"})).toBeVisible();
  await page.goto("/pages");
  await expect(page.locator(".page-tile")).toHaveCount(2);
  await expect(page.locator(".page-tile").first()).toContainText(
    "Dữ liệu thử nghiệm",
  );
  await page.getByRole("button", { name: "Bảng", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Tìm Page", { exact: true }).fill("Gia dụng");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const response = await page.request.get("/api/meta");
  expect(JSON.stringify(await response.json())).not.toContain("access_token");
  await page.screenshot({
    path: "artifacts/meta-pages-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("Page Workspace lưu niche/code và lịch sử đổi TKQC, metric chưa có giữ dấu —", async ({
  page,
}) => {
  await login(page);
  await page.goto("/pages");
  await page.locator(".page-tile").filter({ hasText: "Gia dụng" }).click();
  await expect(
    page.getByRole("heading", { name: "Quyền & trạng thái kết nối" }),
  ).toBeVisible();
  await expect(page.locator(".workspace-metrics strong")).toHaveText([
    "—",
    "—",
    "—",
    "—",
    "—",
  ]);
  await page.getByLabel("Page Code", { exact: true }).fill("giadung_e2e");
  await page.getByLabel("Ngách", { exact: true }).fill("Gia dụng nhà bếp");
  const primary = page.getByRole("combobox", {
    name: "TKQC chính",
    exact: true,
  });
  await expect(primary.locator("option")).toHaveText([
    "Chưa ghép",
    "TKQC thử nghiệm USD · USD",
    "TKQC thử nghiệm VND · VND",
  ]);
  await primary.selectOption({ label: "TKQC thử nghiệm USD · USD" });
  await page.getByRole("button", { name: "Lưu cấu hình Page" }).click();
  await expect(page.getByRole("status").filter({hasText:"Đã lưu Page"})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Ngách", { exact: true })).toHaveValue(
    "Gia dụng nhà bếp",
  );
  await expect(
    page.getByText("TKQC thử nghiệm VND → TKQC thử nghiệm USD"),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/page-workspace-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("Donor: mismatch lỗi, Ad ID truy cha, preview rồi lưu, version mới giữ version cũ", async ({
  page,
}) => {
  await login(page);
  await page.goto("/ads");
  await page.getByRole("button", { name: "Tạo Donor", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Tên Donor")).toBeFocused();
  await dialog.getByLabel("Tên Donor").fill("Donor Gia dụng E2E");
  await dialog
    .getByLabel("TKQC nguồn")
    .selectOption({ label: "TKQC thử nghiệm VND · Thử nghiệm" });
  await dialog.getByRole("button", { name: "Điền ID thử nghiệm" }).click();
  await dialog.getByLabel("Campaign ID", { exact: true }).fill("123");
  await dialog.getByRole("button", { name: "Đọc & kiểm tra preview" }).click();
  await expect(dialog.getByRole("alert")).toContainText("không cùng cấu trúc");
  await dialog.getByLabel("Campaign ID", { exact: true }).fill("");
  await dialog.getByLabel("Ad Set ID", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Đọc & kiểm tra preview" }).click();
  await expect(dialog.locator(".preview-facts")).toContainText(
    "90071992547409931",
  );
  await expect(dialog.locator(".preview-facts")).toContainText(
    "OUTCOME_TRAFFIC",
  );
  await dialog.getByText("Normalized Template", { exact: true }).click();
  await expect(dialog.locator("pre").first()).not.toContainText("old-pixel");
  await page.screenshot({
    path: "artifacts/donor-preview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Lưu Donor", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("version 1");
  const library = (await (await page.request.get("/api/donors")).json()).data;
  const id = library.find(
    (row: { name: string }) => row.name === "Donor Gia dụng E2E",
  ).id;
  const before = (await (await page.request.get(`/api/donors/${id}`)).json())
    .data;
  await page.getByRole("button", { name: "Tạo version mới" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Đọc & kiểm tra preview" }).click();
  await dialog.getByRole("button", { name: "Lưu Donor", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("version 2");
  const after = (await (await page.request.get(`/api/donors/${id}`)).json())
    .data;
  expect(after.versions[1]).toEqual(before.versions[0]);
  await page.getByRole("button", { name: "Xem preview" }).click();
  await page.getByLabel("Phiên bản").selectOption("1");
  await expect(
    page.getByRole("dialog").locator(".preview-facts"),
  ).toContainText("90071992547409933");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Cấp quyền Page riêng: VIEWER chỉ thấy Page đó, API TKQC/Donor và chỉnh Page bị chặn", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/pages");
  await page
    .getByRole("button", { name: "Tài khoản quảng cáo", exact: true })
    .click();
  await page
    .getByLabel("Nhân viên nhận quyền")
    .selectOption({ label: "Nhân viên Chỉ xem · VIEWER" });
  await page
    .getByLabel("Tài nguyên được cấp")
    .selectOption({ label: "Page: Page thử nghiệm — Gia dụng" });
  await page.getByRole("button", { name: "Cấp quyền", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã cấp quyền");
  const viewer = await browser.newPage();
  try {
    await login(viewer, "viewer@e2e.test");
    await viewer.goto("/pages");
    await expect(viewer.locator(".page-tile")).toHaveCount(1);
    await expect(viewer.locator(".page-tile")).not.toContainText(
      "TKQC thử nghiệm USD",
    );
    expect((await viewer.request.get("/api/meta")).status()).toBe(403);
    const pages = (await (await page.request.get("/api/pages")).json()).data;
    const unauthorized = pages.find((p: { name: string }) =>
      p.name.includes("Làm đẹp"),
    );
    expect(
      (await viewer.request.get(`/api/pages/${unauthorized.id}`)).status(),
    ).toBe(403);
    expect(
      (
        await viewer.request.patch(`/api/pages/${pages[0].id}`, {
          headers: origin,
          data: { code: "bad", niche: "", primaryAccountId: null },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await (await viewer.request.get("/api/ad-accounts")).json()).data,
    ).toEqual([]);
    expect(
      (await (await viewer.request.get("/api/donors")).json()).data,
    ).toEqual([]);
  } finally {
    await viewer.close();
  }
});
test("Import CSV và XLSX thật, chống nhập trùng, không biến thành kết nối Ads", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings?tab=meta");
  const file = page.getByLabel("Tệp báo cáo Meta");
  await file.setInputFiles({
    name: "report-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "account_id,date,currency,spend\n90071992547409935,2026-01-01,VND,150000",
    ),
  });
  await page.getByRole("button", { name: "Nhập báo cáo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu 1 dòng");
  await page.getByRole("button", { name: "Nhập báo cáo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("không nhập trùng");
  await file.setInputFiles("tests/fixtures/meta-report.xlsx");
  await page.getByRole("button", { name: "Nhập báo cáo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu 1 dòng");
  await expect(page.getByText("Nguồn nhập tệp", { exact: true })).toHaveCount(
    2,
  );
  expect(
    (
      await page.request.post("/api/meta/mock", {
        data: {},
        headers: { Origin: "https://attacker.example" },
      })
    ).status(),
  ).toBe(403);
});
test("Page/Donor trên mobile: tìm/lọc, dialog và không tràn màn hình", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.goto("/pages");
  await page.getByLabel("Nguồn Page").selectOption("MOCK");
  await expect(page.locator(".page-tile")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/meta-pages-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/ads");
  await page.getByRole("button", { name: "Xem preview" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/donor-preview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
