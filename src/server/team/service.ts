import { asc, count, eq } from "drizzle-orm";
import type { AppDatabase } from "../db";
import {
  users,
  sessions,
  auditLogs,
  publicUserFields,
} from "../database/schema";
import { AppError } from "../http/errors";
import { requirePermission, type Actor } from "../auth/policy";
import { memberSchema, memberUpdateSchema } from "../auth/validation";
import { hashPassword } from "../auth/password";

export class TeamService {
  constructor(private db: AppDatabase) {}
  async list(actor: Actor | null, page = 1) {
    requirePermission(actor, "team:manage");
    return this.db.transaction(async (tx) => {
      const items = await tx
        .select(publicUserFields)
        .from(users)
        .orderBy(asc(users.createdAt))
        .offset((page - 1) * 20)
        .limit(20);
      const [{ total }] = await tx.select({ total: count() }).from(users);
      return { items, total, page, pageSize: 20 };
    });
  }
  async create(actor: Actor | null, input: unknown) {
    requirePermission(actor, "team:manage");
    const data = memberSchema.parse(input);
    if (data.role === "ADMIN" && actor.role !== "OWNER")
      throw new AppError(
        403,
        "ROLE_ESCALATION",
        "Chỉ chủ sở hữu được tạo tài khoản quản trị viên.",
      );
    const passwordHash = await hashPassword(data.password);
    return this.db.transaction(async (tx) => {
      const [member] = await tx
        .insert(users)
        .values({
          name: data.name,
          email: data.email,
          role: data.role,
          passwordHash,
        })
        .returning(publicUserFields);
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "MEMBER_CREATED",
        resourceId: member.id,
        metadata: { role: member.role },
      });
      return member;
    });
  }
  async update(actor: Actor | null, id: string, input: unknown) {
    requirePermission(actor, "team:manage");
    const data = memberUpdateSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(eq(users.id, id))
        .for("update");
      if (!target)
        throw new AppError(404, "NOT_FOUND", "Không tìm thấy nhân viên.");
      if (target.id === actor.id || target.role === "OWNER")
        throw new AppError(
          403,
          "PROTECTED_ACCOUNT",
          "Không thể khóa chính bạn hoặc chủ sở hữu.",
        );
      if (target.role === "ADMIN" && actor.role !== "OWNER")
        throw new AppError(
          403,
          "ROLE_ESCALATION",
          "Chỉ chủ sở hữu được thay đổi trạng thái quản trị viên.",
        );
      const [member] = await tx
        .update(users)
        .set(data)
        .where(eq(users.id, id))
        .returning(publicUserFields);
      if (!data.active)
        await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: data.active ? "MEMBER_ENABLED" : "MEMBER_DISABLED",
        resourceId: id,
        metadata: { before: target.active, after: data.active },
      });
      return member;
    });
  }
}
