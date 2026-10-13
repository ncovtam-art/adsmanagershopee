import { test } from "node:test";
import assert from "node:assert/strict";
import {
  can,
  requirePermission,
  type Actor,
} from "../../src/server/auth/policy";
import {
  hashPassword,
  verifyPassword,
  hashToken,
} from "../../src/server/auth/password";
import { memberSchema, loginSchema } from "../../src/server/auth/validation";
import {
  assertOrigin,
  readJson,
  sessionCookieOptions,
} from "../../src/server/http/security";
import { AppError, errorPayload } from "../../src/server/http/errors";

test("Mật khẩu được salt riêng và xác minh đúng/sai", async () => {
  const first = await hashPassword("Secure test password 123");
  const second = await hashPassword("Secure test password 123");
  assert.notEqual(first, second);
  assert(!first.includes("Secure test password"));
  assert.equal(await verifyPassword("Secure test password 123", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
});
test("Hash hỏng không được chấp nhận", async () => {
  for (const hash of [
    "plaintext",
    "scrypt-v1$00$00",
    `scrypt-v1$${"x".repeat(32)}$${"z".repeat(128)}`,
  ])
    assert.equal(await verifyPassword("password", hash), false);
});
test("Session token hash xác định và không lộ token", () => {
  const token = "a".repeat(64);
  assert.equal(hashToken(token).length, 64);
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
});
test("Ma trận quyền cơ bản đúng cả 6 vai trò", () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    assert(can(role, "team:manage"));
    assert(can(role, "settings:write"));
  }
  for (const role of [
    "MANAGER",
    "MEDIA_BUYER",
    "UPLOADER",
    "VIEWER",
  ] as const) {
    assert(!can(role, "team:manage"));
    assert(!can(role, "settings:write"));
    assert(can(role, "workspace:read"));
  }
  assert(can("MANAGER", "finance:read"));
  assert(can("MEDIA_BUYER", "finance:read"));
  assert(!can("UPLOADER", "finance:read"));
  assert(!can("VIEWER", "finance:read"));
});
test("Chưa đăng nhập, bị khóa và thiếu quyền bị từ chối", () => {
  const actor: Actor = {
    id: "id",
    name: "Test",
    email: "test@example.com",
    role: "VIEWER",
    active: true,
  };
  assert.throws(
    () => requirePermission(null, "workspace:read"),
    (error: unknown) => error instanceof AppError && error.status === 401,
  );
  assert.throws(() =>
    requirePermission({ ...actor, active: false }, "workspace:read"),
  );
  assert.throws(
    () => requirePermission(actor, "team:manage"),
    (error: unknown) => error instanceof AppError && error.status === 403,
  );
});
test("Email chuẩn hóa và không cho role OWNER hoặc trường thừa", () => {
  const data = {
    name: "Test User",
    email: "  USER@EXAMPLE.COM ",
    password: "Long password 123",
    role: "VIEWER",
  };
  assert.equal(memberSchema.parse(data).email, "user@example.com");
  assert.throws(() => memberSchema.parse({ ...data, role: "OWNER" }));
  assert.throws(() => memberSchema.parse({ ...data, active: true }));
  assert.throws(() => memberSchema.parse({ ...data, password: "short" }));
  assert.throws(() => loginSchema.parse({ email: "bad", password: "123" }));
});
test("Mutation cần Origin đúng, không tin Host header", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://localhost:3000";
  try {
    assertOrigin(
      new Request("http://localhost:3000/api", {
        headers: { origin: "http://localhost:3000" },
      }),
    );
    for (const origin of [
      "https://attacker.example",
      "null",
      "http://localhost:3001",
    ])
      assert.throws(() =>
        assertOrigin(
          new Request("http://localhost:3000/api", {
            headers: { origin, host: "localhost:3000" },
          }),
        ),
      );
    assert.throws(() => assertOrigin(new Request("http://localhost:3000/api")));
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
test("Cookie HttpOnly, SameSite, path và Secure theo cấu hình", () => {
  const previous = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = "true";
  try {
    const options = sessionCookieOptions();
    assert(options.httpOnly);
    assert(options.secure);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
  } finally {
    if (previous === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previous;
  }
});
test("JSON hợp lệ được đọc, lỗi JSON và Content-Type bị từ chối", async () => {
  const request = (body: string, type = "application/json") =>
    new Request("http://localhost:3000", {
      method: "POST",
      headers: { "content-type": type },
      body,
    });
  assert.deepEqual(await readJson(request('{"name":"Test"}')), {
    name: "Test",
  });
  await assert.rejects(
    readJson(request("{")),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
  await assert.rejects(
    readJson(request("{}", "text/plain")),
    (error: unknown) => error instanceof AppError && error.status === 415,
  );
});
test("JSON quá lớn bị chặn kể cả không có Content-Length", async () => {
  await assert.rejects(
    readJson(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: " ".repeat(17000),
      }),
    ),
    (error: unknown) => error instanceof AppError && error.status === 413,
  );
});
test("Lỗi Database unique được chuẩn hóa và không lộ query", () => {
  assert.equal(
    errorPayload({ cause: { code: "23505", query: "secret" } }).status,
    409,
  );
  assert.equal(
    errorPayload(new AppError(403, "FORBIDDEN", "Không đủ quyền.")).body.error
      .message,
    "Không đủ quyền.",
  );
});
