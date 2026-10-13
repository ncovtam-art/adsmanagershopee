import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db";
import { workspaces, auditLogs } from "../database/schema";
import { nameSchema } from "../auth/validation";
import { requirePermission, type Actor } from "../auth/policy";
import { AppError } from "../http/errors";
const schema = z
  .object({
    name: nameSchema,
    timezone: z.enum(["Asia/Ho_Chi_Minh", "UTC"], {
      error: "Múi giờ không được hỗ trợ.",
    }),
  })
  .strict();
export class SettingsService {
  constructor(private db: AppDatabase) {}
  async read(actor: Actor | null) {
    requirePermission(actor, "workspace:read");
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, "main"));
    if (!workspace)
      throw new AppError(
        503,
        "WORKSPACE_REQUIRED",
        "Không gian làm việc chưa được khởi tạo. Vui lòng liên hệ quản trị viên.",
      );
    return workspace;
  }
  async update(actor: Actor | null, input: unknown) {
    requirePermission(actor, "settings:write");
    const data = schema.parse(input);
    return this.db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, "main"))
        .for("update");
      if (!previous)
        throw new AppError(
          503,
          "WORKSPACE_REQUIRED",
          "Không gian làm việc chưa được khởi tạo.",
        );
      const [setting] = await tx
        .update(workspaces)
        .set(data)
        .where(eq(workspaces.id, "main"))
        .returning();
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "WORKSPACE_UPDATED",
        resourceId: "main",
        metadata: {
          before: { name: previous.name, timezone: previous.timezone },
          after: data,
        },
      });
      return setting;
    });
  }
}
