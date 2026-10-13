import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

function password() {
  return (
    JSON.parse(readFileSync("artifacts/e2e-fixture.json", "utf8")) as {
      password: string;
    }
  ).password;
}
async function login(page: Page, email = "owner@e2e.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
}

test("Route bảo vệ, login sai và API chưa đăng nhập trả 401", async ({
  page,
  request,
}) => {
  await page.goto("/settings/team");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/team")).status()).toBe(401);
  await page.getByLabel("Email", { exact: true }).fill("bad@e2e.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Wrong password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Email hoặc mật khẩu không đúng",
  );
});
test("Login, cookie bảo vệ, 6 menu và dữ liệu chưa có không giả số", async ({
  page,
  context,
}) => {
  await login(page);
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "aacc_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  await expect(
    page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link"),
  ).toHaveCount(6);
  await expect(
    page.getByText("Chưa có báo cáo Shopee", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const [name, path] of [
    ["Quản lý Page", "/pages"],
    ["Đăng video", "/videos"],
    ["Quảng cáo", "/ads"],
    ["Doanh thu & ROAS", "/revenue"],
  ]) {
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole("heading", {
        name:
          path === "/pages"
            ? "Chưa có Page phù hợp"
            : path === "/ads"
              ? "Chưa có Donor phù hợp"
              : path === "/revenue"
                ? "Chưa có dữ liệu hoa hồng"
                : "Chưa có Page cho nguồn này",
      }),
    ).toBeVisible();
  }
});
test("Tạo nhân viên thật, trùng email báo lỗi và khóa có xác nhận", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings/team");
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Họ và tên").fill("Nhân viên Kiểm thử");
  await dialog.getByLabel("Email", { exact: true }).fill("member@e2e.test");
  await dialog.getByLabel("Mật khẩu ban đầu").fill(password());
  await dialog
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "member@e2e.test" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Khóa tài khoản" }).click();
  await expect(page.getByRole("dialog")).toContainText("sẽ bị đăng xuất");
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(row.getByText("Đang hoạt động", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Khóa tài khoản" }).click();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(row.getByText("Đã khóa", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Mở khóa" }).click();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(row.getByText("Đang hoạt động", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Thêm nhân viên" }).click();
  await dialog.getByLabel("Họ và tên").fill("Trùng Email");
  await dialog.getByLabel("Email", { exact: true }).fill("member@e2e.test");
  await dialog.getByLabel("Mật khẩu ban đầu").fill(password());
  await dialog
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Email đã được sử dụng",
  );
});
test("Lưu cấu hình bền qua reload, health và audit", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=advanced");
  await page
    .getByLabel("Tên không gian làm việc")
    .fill("Đội ngũ Affiliate E2E");
  await page.getByLabel("Múi giờ hiển thị").selectOption("UTC");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
  await page.reload();
  await expect(page.getByLabel("Tên không gian làm việc")).toHaveValue(
    "Đội ngũ Affiliate E2E",
  );
  await page.goto("/settings?tab=system");
  await expect(
    page.getByText("Database sẵn sàng", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Xem nhật ký thao tác" }).click();
  await expect(
    page.getByText("Thay đổi cấu hình", { exact: true }),
  ).toBeVisible();
});
test("VIEWER bị chặn backend và route nhân viên/tài chính", async ({
  page,
}) => {
  await login(page, "viewer@e2e.test");
  await page.goto("/settings/team");
  await expect(
    page.getByRole("heading", { name: "Bạn chưa có quyền quản lý nhân viên" }),
  ).toBeVisible();
  const response = await page.request.get("/api/team");
  expect(response.status()).toBe(403);
  expect(JSON.stringify(await response.json())).not.toContain("owner@e2e.test");
  const mutation = await page.request.post("/api/team", {
    headers: { Origin: "http://localhost:3001" },
    data: {
      name: "Bad",
      email: "bad@e2e.test",
      password: password(),
      role: "ADMIN",
    },
  });
  expect(mutation.status()).toBe(403);
  await page.goto("/revenue");
  await expect(
    page.getByRole("heading", {
      name: "Bạn chưa có quyền xem dữ liệu tài chính",
    }),
  ).toBeVisible();
});
test("Mutation khác Origin bị chặn; response không lộ hash", async ({
  page,
}) => {
  await login(page);
  const bad = await page.request.patch("/api/settings", {
    headers: { Origin: "https://attacker.example" },
    data: { name: "Wrong", timezone: "UTC" },
  });
  expect(bad.status()).toBe(403);
  const missing = await page.request.patch("/api/settings", {
    data: { name: "Wrong", timezone: "UTC" },
  });
  expect(missing.status()).toBe(403);
  const response = await page.request.get("/api/team");
  expect(response.status()).toBe(200);
  expect(JSON.stringify(await response.json())).not.toContain("passwordHash");
  const invalid = await page.request.post("/api/team", {
    headers: { Origin: "http://localhost:3001" },
    data: {
      name: "Wrong",
      email: "new@e2e.test",
      password: password(),
      role: "OWNER",
    },
  });
  expect(invalid.status()).toBe(422);
});
test("Logout thu hồi session và không thể tái sử dụng cookie", async ({
  page,
  request,
  context,
}) => {
  await login(page);
  const session = (await context.cookies()).find(
    (cookie) => cookie.name === "aacc_session",
  )!;
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const response = await request.get("/api/auth/me", {
    headers: { Cookie: `aacc_session=${session.value}` },
  });
  expect(response.status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
test("Giao diện mobile, reduced motion và tìm điều hướng", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("link", { name: "Cài đặt", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByLabel("Tìm mục điều hướng").fill("Quảng cáo");
  await page
    .locator(".search-results")
    .getByRole("link", { name: "Quảng cáo" })
    .click();
  await expect(page).toHaveURL(/\/ads$/);
  await expect(
    page.getByRole("heading", { name: "Chưa có Donor phù hợp" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/module-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("Hộp thoại giữ focus và hỗ trợ Escape bằng bàn phím", async ({ page }) => {
  await login(page);
  await page.goto("/settings/team");
  const trigger = page.getByRole("button", { name: "Thêm nhân viên" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Họ và tên")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Đóng", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
