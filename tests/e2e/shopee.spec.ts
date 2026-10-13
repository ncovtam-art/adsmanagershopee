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
async function records(page: Page) {
  return (await (await page.request.get("/api/shopee/tracking")).json())
    .data as Array<{ id: string; subId: string; pageName: string }>;
}
function commissionCsv(rows: string[]) {
  return (
    "commission_id,order_id,order_item_id,sub_id,commission,status,currency,order_date,updated_at,settlement_date\n" +
    rows.join("\n")
  );
}
async function previewCsv(page: Page, name: string, csv: string) {
  await page
    .getByLabel("Tệp hoa hồng Shopee", { exact: true })
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page
    .getByRole("combobox", { name: "Nguồn báo cáo", exact: true })
    .selectOption("MOCK");
  await page.getByRole("button", { name: "Đọc & nhận diện cột" }).click();
  await expect(
    page.getByRole("combobox", { name: "Cột Commission Row ID", exact: true }),
  ).toHaveValue("commission_id");
  await page.getByRole("button", { name: "Kiểm tra preview hoa hồng" }).click();
  await expect(
    page.getByRole("heading", { name: "Preview trước khi nhập" }),
  ).toBeVisible();
}
async function confirmCsv(page: Page) {
  await page.getByRole("button", { name: "Xác nhận nhập báo cáo" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã nhập:" }),
  ).toBeVisible();
}
const origin = { Origin: "http://localhost:3001" };
test("Product Center và bulk SubID: tạo sản phẩm, hai Page, source thật/thử nghiệm rõ", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings?tab=shopee");
  await page.getByRole("button", { name: "Sản phẩm", exact: true }).click();
  await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Tên sản phẩm", { exact: true }),
  ).toBeFocused();
  await dialog
    .getByLabel("Tên sản phẩm", { exact: true })
    .fill("Sản phẩm Shopee E2E");
  await dialog
    .getByLabel("URL sản phẩm", { exact: true })
    .fill("https://shopee.vn/product/123/456");
  await dialog.getByLabel("Ngách sản phẩm", { exact: true }).fill("Gia dụng");
  await dialog.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu sản phẩm");
  await page.getByRole("button", { name: "Tracking & Custom Link" }).click();
  await page.getByRole("button", { name: "Tạo tracking", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Sản phẩm tracking", exact: true })
    .selectOption({ label: "Sản phẩm Shopee E2E" });
  await page
    .getByRole("dialog")
    .getByLabel("Tham chiếu nội dung")
    .fill("Clip Shopee E2E");
  await page.getByRole("button", { name: "Chọn tất cả Page" }).click();
  await page.getByRole("button", { name: "Tạo SubID", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã tạo 2 SubID");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const rows = await records(page);
  expect(rows[0].subId).not.toBe(rows[1].subId);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Dữ liệu thử nghiệm",
  );
});
test("Manual/Assisted Custom Link lưu version và nhập lại bằng ID dù CSV đổi thứ tự", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings?tab=shopee");
  const rows = await records(page);
  const row = page.getByRole("row").filter({ hasText: rows[0].subId });
  await row.getByRole("button", { name: "Gắn Custom Link" }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Affiliate URL", { exact: true })
    .fill("https://s.shopee.vn/manual-e2e");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Lưu Custom Link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Đã lưu phiên bản Custom Link",
  );
  await row.getByRole("button", { name: "Lịch sử link" }).click();
  await expect(page.getByRole("dialog")).toContainText("Version 1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Chọn tất cả đang hiển thị" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất danh sách chuẩn bị" }).click();
  expect((await download).suggestedFilename()).toBe(
    "shopee-link-preparation.csv",
  );
  const csv =
    "tracking_id,sub_id,affiliate_url\n" +
    rows
      .slice()
      .reverse()
      .map((r, i) => `${r.id},${r.subId},https://s.shopee.vn/bulk-e2e-${i}`)
      .join("\n");
  await page.getByLabel("CSV kết quả Custom Link").setInputFiles({
    name: "links.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page
    .getByRole("checkbox", { name: /Tôi đã tạo các Custom Link/ })
    .check();
  await page.getByRole("button", { name: "Nhập kết quả link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Đã lưu 2 phiên bản link",
  );
  await row.getByRole("button", { name: "Lịch sử link" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Version 2");
  await expect(dialog).toContainText("manual-e2e");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/shopee-links-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("Commission CSV preview/commit, hai item cùng Order, exact totals và dedup file rename", async ({
  page,
}) => {
  await login(page);
  const rows = await records(page),
    sub = rows.find((r) => r.pageName.includes("Gia dụng"))!.subId;
  await page.goto("/revenue");
  await page
    .getByRole("combobox", { name: "Nguồn hoa hồng", exact: true })
    .selectOption("MOCK");
  const csv = commissionCsv([
    `E2E_ROW1,E2E_ORDER1,ITEM1,${sub},0.1,PENDING,USD,2026-01-01,2026-01-02,`,
    `E2E_ROW2,E2E_ORDER1,ITEM2,${sub},0.2,PENDING,USD,2026-01-01,2026-01-02,`,
  ]);
  await previewCsv(page, "commission-e2e.csv", csv);
  await expect(page.locator(".commission-preview tbody tr")).toHaveCount(2);
  const before = (
    await (await page.request.get("/api/commissions?source=MOCK")).json()
  ).data;
  expect(before.count).toBe(0);
  await confirmCsv(page);
  await expect(page.locator(".commission-totals")).toContainText("0.300000");
  await previewCsv(page, "renamed-e2e.csv", csv);
  await expect(page.locator(".commission-preview")).toContainText(
    "Báo cáo đã nhập",
  );
  expect(
    (await (await page.request.get("/api/commissions?source=MOCK")).json()).data
      .count,
  ).toBe(2);
});
test("Commission cập nhật trạng thái giữ history, report cũ không ghi đè", async ({
  page,
}) => {
  await login(page);
  const sub = (await records(page)).find((r) =>
    r.pageName.includes("Gia dụng"),
  )!.subId;
  await page.goto("/revenue");
  await page
    .getByRole("combobox", { name: "Nguồn hoa hồng", exact: true })
    .selectOption("MOCK");
  await previewCsv(
    page,
    "updated-e2e.csv",
    commissionCsv([
      `E2E_ROW1,E2E_ORDER1,ITEM1,${sub},0.15,APPROVED,USD,2026-01-01,2026-01-03,`,
    ]),
  );
  await confirmCsv(page);
  await expect(page.getByRole("status")).toContainText("1 cập nhật");
  const row = page.locator("tbody tr").filter({ hasText: "ITEM1" });
  await row.getByRole("button", { name: "Lịch sử hoa hồng" }).click();
  await expect(page.getByRole("dialog")).toContainText("Cập nhật báo cáo");
  await expect(page.getByRole("dialog")).toContainText(
    "0.100000 → APPROVED / 0.150000",
  );
  await page.keyboard.press("Escape");
  await previewCsv(
    page,
    "older-e2e.csv",
    commissionCsv([
      `E2E_ROW1,E2E_ORDER1,ITEM1,${sub},9,REJECTED,USD,2026-01-01,2026-01-01,`,
    ]),
  );
  await confirmCsv(page);
  await expect(page.getByRole("status")).toContainText("1 cũ");
  await expect(row).toContainText("Đã duyệt");
});
test("Unmatched và thiếu identity/unknown status được giữ lại, mapping/review thủ công có audit", async ({
  page,
}) => {
  await login(page);
  const recordsList = await records(page),
    record = recordsList.find((r) => r.pageName.includes("Gia dụng"))!;
  await page.goto("/revenue");
  await page
    .getByRole("combobox", { name: "Nguồn hoa hồng", exact: true })
    .selectOption("MOCK");
  await previewCsv(
    page,
    "unmatched-e2e.csv",
    commissionCsv([
      `E2E_UNKNOWN,E2E_ORDER_UNKNOWN,ITEM1,UNKNOWN_E2E,100,PAID,VND,2026-01-01,2026-01-02,2026-01-03`,
      `,E2E_ORDER_REVIEW,,${record.subId},50,Completed,VND,2026-01-01,2026-01-02,`,
    ]),
  );
  await expect(page.locator(".commission-preview")).toContainText(
    "Thiếu Commission Row ID",
  );
  await confirmCsv(page);
  await expect(page.getByRole("status")).toContainText("1 cần xem xét");
  await page
    .getByRole("button", { name: "Unmatched SubID", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "UNKNOWN_E2E" })
    .getByRole("button", { name: "Gán tracking" })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Tracking đích", exact: true })
    .selectOption(record.id);
  await dialog
    .getByLabel("Lý do mapping")
    .fill("Đã kiểm tra SubID và record trên Shopee");
  await dialog.getByRole("button", { name: "Xác nhận mapping" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu mapping thủ công" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Cần xem xét/ }).click();
  await page.getByRole("button", { name: "Xem xét dòng" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Trạng thái đã xác minh", exact: true })
    .selectOption("APPROVED");
  await dialog.getByLabel("Định danh dòng thủ công").fill("E2E_REVIEW-ITEM1");
  await dialog
    .getByLabel("Lý do đối soát")
    .fill("Đối chiếu bản gốc đúng dòng sản phẩm và trạng thái");
  await dialog.getByRole("button", { name: "Xác nhận xử lý" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã xử lý dòng" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Xem xét dòng" })).toHaveCount(
    0,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/shopee-reconciliation-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("Viewer không đọc financial API, link edit hoặc raw import; Page scope và mobile UI", async ({
  page,
  browser,
}) => {
  await login(page);
  const rows = await records(page);
  const viewer = await browser.newPage();
  try {
    await login(viewer, "viewer@e2e.test");
    await viewer.goto("/settings?tab=shopee");
    await expect(
      viewer.getByRole("button", { name: "Tạo tracking", exact: true }),
    ).toHaveCount(0);
    await expect(viewer.locator("tbody tr")).toHaveCount(1);
    expect(
      (await viewer.request.get("/api/commissions?source=MOCK")).status(),
    ).toBe(403);
    expect(
      (await viewer.request.get("/api/commissions/imports")).status(),
    ).toBe(403);
    expect(
      (
        await viewer.request.post("/api/shopee/links", {
          headers: origin,
          data: {
            trackingId: rows[0].id,
            subId: rows[0].subId,
            url: "https://s.shopee.vn/bad",
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await viewer.close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/revenue");
  await page
    .getByRole("combobox", { name: "Nguồn hoa hồng", exact: true })
    .selectOption("MOCK");
  await expect(page.locator(".commission-totals")).toContainText("0.150000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/shopee-commission-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
