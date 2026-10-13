import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { videoFixture } from "../video-fixture";
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
async function studio(page: Page) {
  await page.goto("/videos");
  await page.getByLabel("Nguồn video", { exact: true }).selectOption("MOCK");
  await expect(
    page.getByLabel("Page video", { exact: true }).getByRole("option",{name:"Page thử nghiệm — Gia dụng",exact:true}),
  ).toHaveCount(1);
  await page
    .getByLabel("Page video", { exact: true })
    .selectOption({ label: "Page thử nghiệm — Gia dụng" });
}
async function upload(page: Page, name: string, tag: string) {
  await page.getByRole("tab", { name: "Video Library", exact: true }).click();
  await page
    .getByLabel("Tệp video MP4", { exact: true })
    .setInputFiles({ name, mimeType: "video/mp4", buffer: videoFixture(tag) });
  await page
    .getByLabel("Sản phẩm file 1")
    .selectOption({ label: "Sản phẩm Shopee E2E" });
  await page.getByLabel("Ngách file 1").fill("Gia dụng");
  await page
    .getByRole("button", { name: "Upload video đã chọn", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Upload hoàn tất" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}
async function assets(page: Page) {
  return (await (await page.request.get("/api/videos?source=MOCK")).json()).data
    .rows as Array<{ id: string; filename: string; pageId: string }>;
}
async function configure(
  page: Page,
  autoComment = false,
  removePreview = false,
) {
  await page
    .getByRole("button", { name: "Cấu hình đăng & comment", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", {
      name: "Cho phép đăng video trên Page này",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("checkbox", { name: /Auto-comment Custom Link/ })
    .setChecked(autoComment);
  await dialog.getByLabel("Comment delay (giây)", { exact: true }).fill("0");
  await dialog
    .getByRole("checkbox", {
      name: "Yêu cầu gỡ preview link trong comment",
      exact: true,
    })
    .setChecked(removePreview);
  await dialog
    .getByRole("button", { name: "Lưu cấu hình Publisher", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}
async function confirm(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Preview trước khi đăng · MOCK" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Xác nhận thêm vào hàng đợi" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Xác nhận thêm vào hàng đợi" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã xác nhận batch" }),
  ).toBeVisible();
}
test("Video Library upload streaming/metadata/player/range và cảnh báo duplicate thật", async ({
  page,
}) => {
  await login(page);
  await studio(page);
  await upload(page, "publisher-e2e.mp4", "publisher-e2e");
  const row = page.getByRole("row").filter({ hasText: "publisher-e2e.mp4" });
  await expect(row).toContainText("64×64");
  await row
    .getByRole("button", { name: "publisher-e2e.mp4", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("video")).toBeVisible();
  await page.keyboard.press("Escape");
  const a = (await assets(page)).find(
    (a) => a.filename === "publisher-e2e.mp4",
  )!;
  const ranged = await page.request.get(`/api/videos/${a.id}/media`, {
    headers: { Range: "bytes=0-31" },
  });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(32);
  expect(ranged.headers()["content-type"]).toContain("video/mp4");
  expect(
    (
      await page.request.get(`/api/videos/${a.id}/media`, {
        headers: { Range: "bytes=999999999-" },
      })
    ).status(),
  ).toBe(416);
  await upload(page, "publisher-duplicate.mp4", "publisher-e2e");
  await expect(
    page.getByRole("row").filter({ hasText: "publisher-duplicate.mp4" }),
  ).toContainText("Trùng hash");
});
test("Caption template/Page policy, preview/confirmation và Redis worker trả Post ID MOCK", async ({
  page,
}) => {
  await login(page);
  await studio(page);
  await configure(page);
  await page
    .getByRole("tab", { name: "Caption Templates", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Thêm template", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên template Publisher").fill("Caption Video E2E");
  await dialog.getByLabel("Phạm vi template Publisher").selectOption("page");
  await dialog
    .getByLabel("Nội dung template Publisher")
    .fill("Nội dung {video_name} · {product_name}");
  await dialog.getByRole("button", { name: "Lưu template Publisher" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu template" }),
  ).toBeVisible();
  await page.getByLabel("Page video", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Sửa template", exact: true }).click();
  await expect(page.getByLabel("Phạm vi template Publisher")).toHaveValue("page");
  await page.getByLabel("Tên template Publisher").fill("Caption Video E2E");
  await page.getByRole("button", { name: "Lưu template Publisher" }).click();
  await page.getByLabel("Page video", { exact: true }).selectOption({ label: "Page thử nghiệm — Gia dụng" });
  await page.getByRole("tab", { name: "Đăng hàng loạt", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Chọn video publisher-e2e.mp4",
      exact: true,
    })
    .check();
  await page
    .getByLabel("Caption Template Publisher")
    .selectOption({ label: "Caption Video E2E" });
  await page
    .getByRole("button", { name: "Xem preview đăng video", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Nội dung publisher-e2e.mp4",
  );
  await confirm(page);
  const row = page.getByRole("row").filter({ hasText: "publisher-e2e.mp4" });
  await expect(row).toContainText("Thành công", { timeout: 15000 });
  await expect(row).toContainText("Post: 90071992547409941_");
  await row.getByRole("button", { name: "Lịch sử job" }).click();
  await expect(page.getByRole("dialog")).toContainText("SUCCEEDED");
  await page.keyboard.press("Escape");
  await page
    .getByRole("tab", { name: "Bài viết đã đăng", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "publisher-e2e.mp4" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/publisher-desktop.png",
    fullPage: true,
  });
});
test("Content/SubID link thật, auto-comment chỉ sau Post ID và giữ Comment ID", async ({
  page,
}) => {
  await login(page);
  await studio(page);
  await upload(page, "publisher-comment.mp4", "publisher-comment");
  const row = page
    .getByRole("row")
    .filter({ hasText: "publisher-comment.mp4" });
  await row.getByRole("button", { name: "Tạo SubID Organic" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã tạo SubID Organic" }),
  ).toBeVisible();
  const a = (await assets(page)).find(
    (a) => a.filename === "publisher-comment.mp4",
  )!;
  const tracks = (await (await page.request.get("/api/shopee/tracking")).json())
    .data;
  const t = tracks.find(
    (t: { contentId: string | null }) => t.contentId === a.id,
  );
  expect(t).toBeTruthy();
  const link = await page.request.post("/api/shopee/links", {
    headers: origin,
    data: {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/publisher-comment-e2e",
      confirmed: true,
    },
  });
  expect(link.ok()).toBeTruthy();
  await configure(page, true);
  await page
    .getByRole("checkbox", {
      name: "Chọn video publisher-comment.mp4",
      exact: true,
    })
    .check();
  await page
    .getByLabel("Tracking cho publisher-comment.mp4", { exact: true })
    .selectOption(t.id);
  await page.getByRole("button", { name: "Xem preview đăng video" }).click();
  await expect(page.getByRole("dialog")).toContainText("publisher-comment-e2e");
  await confirm(page);
  const jobs = page
    .getByRole("row")
    .filter({ hasText: "publisher-comment.mp4" });
  await expect(jobs).toHaveCount(2, { timeout: 15000 });
  const comment = jobs.filter({
    has: page.locator("td:nth-child(2)").filter({ hasText: /^Comment/ }),
  });
  await expect(comment).toContainText(
    "Thành công",
    { timeout: 15000 },
  );
  await expect(comment).toContainText(
    "Comment: 90071992547409941_",
  );
});
test("Schedule, pause/resume/cancel và UNSUPPORTED preview được hiển thị trung thực", async ({
  page,
}) => {
  await login(page);
  await studio(page);
  await configure(page, false);
  await upload(page, "publisher-scheduled.mp4", "publisher-scheduled");
  await page
    .getByRole("checkbox", {
      name: "Chọn video publisher-scheduled.mp4",
      exact: true,
    })
    .check();
  const future = new Date(Date.now() + 3600000);
  const local = new Date(future.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Lịch đăng video", { exact: true }).fill(local);
  await page.getByRole("button", { name: "Xem preview đăng video" }).click();
  await confirm(page);
  const row = page
    .getByRole("row")
    .filter({ hasText: "publisher-scheduled.mp4" });
  await expect(row).toContainText("Đã lên lịch");
  await row.getByRole("button", { name: "Tạm dừng job", exact: true }).click();
  await expect(row).toContainText("Tạm dừng");
  await row.getByRole("button", { name: "Tiếp tục job", exact: true }).click();
  await expect(row).toContainText("Đã lên lịch");
  await row.getByRole("button", { name: "Hủy job", exact: true }).click();
  await expect(row).toContainText("Đã hủy");
  await configure(page, true, true);
  await page.getByRole("tab", { name: "Video Library", exact: true }).click();
  await upload(page, "publisher-unsupported.mp4", "publisher-unsupported");
  const a = (await assets(page)).find(
    (a) => a.filename === "publisher-unsupported.mp4",
  )!;
  const r = await page.request.post("/api/publisher/tracking", {
    headers: origin,
    data: { assetId: a.id, affiliateAccount: "publisher_preview" },
  });
  const t = (await r.json()).data[0];
  await page.request.post("/api/shopee/links", {
    headers: origin,
    data: {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/unsupported-e2e",
      confirmed: true,
    },
  });
  await page
    .getByRole("checkbox", {
      name: "Chọn video publisher-unsupported.mp4",
      exact: true,
    })
    .check();
  await page
    .getByLabel("Tracking cho publisher-unsupported.mp4", { exact: true })
    .selectOption(t.id);
  await page.getByRole("button", { name: "Xem preview đăng video" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Gỡ preview link chưa được API hỗ trợ",
  );
  await confirm(page);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "publisher-unsupported.mp4" })
      .filter({
        has: page.locator("td:nth-child(2)").filter({ hasText: /^Comment/ }),
      }),
  ).toContainText("Không được API hỗ trợ", { timeout: 15000 });
});
test("Mobile không overflow, Viewer không upload/confirm và Origin vẫn được kiểm tra", async ({
  page,
}) => {
  await login(page);
  await studio(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".video-library")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/publisher-mobile.png",
    fullPage: true,
  });
  const a = (await assets(page))[0];
  expect(
    (
      await page.request.post("/api/publisher/actions", {
        headers: { Origin: "https://bad.example" },
        data: { id: a.id, action: "retry" },
      })
    ).status(),
  ).toBe(403);
  await page.request.post("/api/auth/logout", { headers: origin });
  await login(page, "viewer@e2e.test");
  await studio(page);
  await expect(page.getByLabel("Page video",{exact:true}).getByRole("option")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Upload video đã chọn", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/videos", {
        headers: origin,
        data: { pageId: a.pageId, filename: "blocked.mp4", size: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/publisher/confirm", {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/api/commissions")).status()).toBe(403);
});
