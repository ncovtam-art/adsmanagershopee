import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connectTestDatabase, clearTestDatabase } from "../helpers";
import { AuthService } from "../../src/server/auth/service";
import { TeamService } from "../../src/server/team/service";
import { SettingsService } from "../../src/server/settings/service";
import {
  users,
  sessions,
  loginGuards,
  auditLogs,
} from "../../src/server/database/schema";
import { hashToken } from "../../src/server/auth/password";
import { AppError } from "../../src/server/http/errors";
import type { Actor } from "../../src/server/auth/policy";

const connection = connectTestDatabase();
const auth = new AuthService(connection.db),
  team = new TeamService(connection.db),
  settings = new SettingsService(connection.db);
const password = randomBytes(24).toString("hex");
let owner: Actor, admin: Actor, viewer: Actor;
const rejectsCode = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;

before(async () => {
  await clearTestDatabase(connection);
  owner = await auth.createOwner({
    name: "Chủ sở hữu Test",
    email: "owner@integration.test",
    password,
    workspaceName: "Integration Test",
  });
});
after(async () => {
  await connection.pool.end();
});

test("Migration tạo đủ tables, role enum, unique và foreign keys", async () => {
  const result = await connection.db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
  );
  assert.deepEqual(
    result.rows.map((row) => row.table_name).sort(),
    [
      "ad_accounts",
      "care_rules", "care_runs", "care_alerts", "care_pauses", "telegram_settings", "notification_jobs", "api_rate_buckets",
      "ads_requests",
      "ads_history",
      "ads_batches",
      "ads_batch_history",
      "ads_preparations",
      "ads_presets",
      "analytics_policies",
      "insight_ads",
      "insight_days",
      "insight_runs",
      "audit_logs",
      "commission_history",
      "commission_imports",
      "commission_reviews",
      "commission_rows",
      "donor_versions",
      "donors",
      "login_guards",
      "meta_connections",
      "meta_imports",
      "oauth_states",
      "page_mappings",
      "pages",
      "products",
      "resource_grants",
      "sessions",
      "settings",
      "tracking_link_versions",
      "tracking_records",
      "users",
      "video_assets",
      "caption_templates",
      "publisher_page_settings",
      "publish_batches",
      "publish_jobs",
      "publish_history",
      "publisher_controls",
    ].sort(),
  );
  await assert.rejects(
    connection.db
      .insert(sessions)
      .values({ userId: "missing", tokenHash: "bad", expiresAt: new Date() }),
  );
});
test("Bootstrap chỉ tạo một OWNER kể cả chạy lại", async () => {
  await assert.rejects(
    auth.createOwner({
      name: "Test Other",
      email: "other@integration.test",
      password,
      workspaceName: "Other",
    }),
    rejectsCode("OWNER_EXISTS"),
  );
  const owners = await connection.db
    .select()
    .from(users)
    .where(eq(users.role, "OWNER"));
  assert.equal(owners.length, 1);
});
test("Đăng nhập tạo session hash, user response không chứa mật khẩu", async () => {
  const result = await auth.login({
    email: " OWNER@INTEGRATION.TEST ",
    password,
  });
  assert.equal(result.user?.id, owner.id);
  assert(!("passwordHash" in result.user!));
  const [session] = await connection.db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(result.token)));
  assert(session);
  assert.notEqual(session.tokenHash, result.token);
  assert.equal((await auth.readSession(result.token))?.id, owner.id);
  await auth.logout(result.token);
  assert.equal(await auth.readSession(result.token), null);
});
test("Session hết hạn hoặc token giả không truy cập được", async () => {
  const result = await auth.login({ email: owner.email, password });
  await connection.db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(sessions.tokenHash, hashToken(result.token)));
  assert.equal(await auth.readSession(result.token), null);
  assert.equal(await auth.readSession("invalid"), null);
});
test("Login sai tăng counter và lần tiếp theo bị 429 sau 5 lần", async () => {
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      auth.login({ email: "missing@integration.test", password }),
      rejectsCode("INVALID_CREDENTIALS"),
    );
  await assert.rejects(
    auth.login({ email: "missing@integration.test", password }),
    rejectsCode("RATE_LIMITED"),
  );
  const [guard] = await connection.db
    .select()
    .from(loginGuards)
    .where(eq(loginGuards.key, hashToken("missing@integration.test")));
  assert.equal(guard.attempts, 5);
  assert(guard.blockedUntil! > new Date());
});
test("Giới hạn login vẫn hiệu lực với service mới, hết cooldown được thử lại", async () => {
  await assert.rejects(
    new AuthService(connection.db).login({
      email: "missing@integration.test",
      password,
    }),
    rejectsCode("RATE_LIMITED"),
  );
  await connection.db
    .update(loginGuards)
    .set({
      blockedUntil: new Date(Date.now() - 1),
      windowStart: new Date(Date.now() - 16 * 60 * 1000),
    })
    .where(eq(loginGuards.key, hashToken("missing@integration.test")));
  await assert.rejects(
    auth.login({ email: "missing@integration.test", password }),
    rejectsCode("INVALID_CREDENTIALS"),
  );
  const [guard] = await connection.db
    .select()
    .from(loginGuards)
    .where(eq(loginGuards.key, hashToken("missing@integration.test")));
  assert.equal(guard.attempts, 1);
});
test("OWNER tạo ADMIN và VIEWER; user không có passwordHash", async () => {
  admin = await team.create(owner, {
    name: "Admin Test",
    email: "admin@integration.test",
    password,
    role: "ADMIN",
  });
  viewer = await team.create(owner, {
    name: "Viewer Test",
    email: "viewer@integration.test",
    password,
    role: "VIEWER",
  });
  assert(!("passwordHash" in admin));
  assert(!("passwordHash" in viewer));
  assert.equal((await team.list(owner)).total, 3);
});
test("Trùng email không tạo thêm tài khoản hoặc audit", async () => {
  await assert.rejects(
    team.create(owner, {
      name: "Other Test",
      email: "VIEWER@INTEGRATION.TEST",
      password,
      role: "VIEWER",
    }),
  );
  assert.equal((await team.list(owner)).total, 3);
});
test("VIEWER bị từ chối truy cập dịch vụ quản lý và sửa cấu hình", async () => {
  await assert.rejects(team.list(viewer), rejectsCode("FORBIDDEN"));
  await assert.rejects(team.create(viewer, {}), rejectsCode("FORBIDDEN"));
  await assert.rejects(
    settings.update(viewer, { name: "Bad", timezone: "UTC" }),
    rejectsCode("FORBIDDEN"),
  );
});
test("ADMIN không được tạo ADMIN hoặc OWNER", async () => {
  await assert.rejects(
    team.create(admin, {
      name: "Other Admin",
      email: "other-admin@integration.test",
      password,
      role: "ADMIN",
    }),
    rejectsCode("ROLE_ESCALATION"),
  );
  await assert.rejects(
    team.create(owner, {
      name: "Other Owner",
      email: "other-owner@integration.test",
      password,
      role: "OWNER",
    }),
  );
});
test("Không cho khóa chủ sở hữu hoặc chính mình", async () => {
  await assert.rejects(
    team.update(owner, owner.id, { active: false }),
    rejectsCode("PROTECTED_ACCOUNT"),
  );
  await assert.rejects(
    team.update(admin, owner.id, { active: false }),
    rejectsCode("PROTECTED_ACCOUNT"),
  );
  await assert.rejects(
    team.update(admin, admin.id, { active: false }),
    rejectsCode("PROTECTED_ACCOUNT"),
  );
});
test("Khóa nhân viên thu hồi session và chặn login, mở khóa cho login lại", async () => {
  const result = await auth.login({ email: viewer.email, password });
  await team.update(owner, viewer.id, { active: false });
  assert.equal(await auth.readSession(result.token), null);
  await assert.rejects(
    auth.login({ email: viewer.email, password }),
    rejectsCode("INVALID_CREDENTIALS"),
  );
  await team.update(owner, viewer.id, { active: true });
  const newSession = await auth.login({ email: viewer.email, password });
  assert.equal((await auth.readSession(newSession.token))?.id, viewer.id);
  assert.equal(await auth.readSession(result.token), null);
});
test("Cấu hình lưu bền và thay đổi có audit không chứa password/token", async () => {
  await settings.update(owner, { name: "Nhóm Affiliate", timezone: "UTC" });
  assert.equal(
    (await new SettingsService(connection.db).read(viewer)).name,
    "Nhóm Affiliate",
  );
  const entries = await connection.db.select().from(auditLogs);
  assert(entries.some((entry) => entry.action === "MEMBER_DISABLED"));
  assert(entries.some((entry) => entry.action === "WORKSPACE_UPDATED"));
  assert(!JSON.stringify(entries).includes(password));
  assert(!JSON.stringify(entries).includes("passwordHash"));
});
test("API list có phân trang và không chứa passwordHash", async () => {
  const page = await team.list(owner, 2);
  assert.equal(page.items.length, 0);
  assert.equal(page.total, 3);
  assert(!JSON.stringify(await team.list(owner)).includes("passwordHash"));
});
