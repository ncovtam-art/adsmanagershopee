import { randomBytes } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db";
import {
  users,
  sessions,
  loginGuards,
  workspaces,
  auditLogs,
  publicUserFields,
} from "../database/schema";
import { AppError } from "../http/errors";
import { hashPassword, verifyPassword, hashToken, dummyHash } from "./password";
import { loginSchema, ownerSchema } from "./validation";

export const SESSION_SECONDS = 60 * 60 * 12;
export class AuthService {
  constructor(private db: AppDatabase) {}
  async createOwner(input: unknown) {
    const data = ownerSchema.parse(input);
    const passwordHash = await hashPassword(data.password);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847201)`);
      if (
        (
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, "OWNER"))
            .limit(1)
        ).length
      )
        throw new AppError(
          409,
          "OWNER_EXISTS",
          "Đã có chủ sở hữu. Không thể tạo lại bằng lệnh khởi tạo.",
        );
      const [owner] = await tx
        .insert(users)
        .values({
          name: data.name,
          email: data.email,
          passwordHash,
          role: "OWNER",
        })
        .returning(publicUserFields);
      await tx
        .insert(workspaces)
        .values({ id: "main", name: data.workspaceName });
      await tx.insert(auditLogs).values({
        actorId: owner.id,
        action: "OWNER_CREATED",
        resourceId: owner.id,
        metadata: { role: "OWNER" },
      });
      return owner;
    });
  }
  async login(input: unknown) {
    const data = loginSchema.parse(input);
    const key = hashToken(data.email);
    const token = randomBytes(32).toString("hex");
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
      );
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000);
      const [guard] = await tx
        .select()
        .from(loginGuards)
        .where(eq(loginGuards.key, key));
      if (guard?.blockedUntil && guard.blockedUntil > now)
        return { error: "RATE_LIMITED" as const };
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .for("share");
      const valid = await verifyPassword(
        data.password,
        user?.passwordHash ?? dummyHash,
      );
      if (!user || !user.active || !valid) {
        const freshWindow =
          !guard ||
          now.getTime() - guard.windowStart.getTime() > 15 * 60 * 1000;
        const attempts = freshWindow ? 1 : guard.attempts + 1;
        const update = {
          attempts,
          windowStart: freshWindow ? now : guard.windowStart,
          blockedUntil:
            attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
        };
        await tx
          .insert(loginGuards)
          .values({ key, ...update })
          .onConflictDoUpdate({ target: loginGuards.key, set: update });
        return { error: "INVALID_CREDENTIALS" as const };
      }
      await tx.delete(loginGuards).where(eq(loginGuards.key, key));
      await tx
        .delete(sessions)
        .where(and(eq(sessions.userId, user.id), lte(sessions.expiresAt, now)));
      await tx
        .insert(sessions)
        .values({ userId: user.id, tokenHash: hashToken(token), expiresAt });
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "LOGIN",
        resourceId: user.id,
        metadata: {},
      });
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt,
      };
      return { user: safeUser, expiresAt };
    });
    if (result.error === "RATE_LIMITED")
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Đã có quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.",
      );
    if (result.error)
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.",
      );
    return { user: result.user, token, expiresAt: result.expiresAt! };
  }
  async readSession(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const [session] = await this.db
      .select({ user: publicUserFields, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, hashToken(token)));
    return session && session.expiresAt > new Date() && session.user.active
      ? session.user
      : null;
  }
  async logout(token?: string) {
    if (token)
      await this.db
        .delete(sessions)
        .where(eq(sessions.tokenHash, hashToken(token)));
  }
}
