import { eq } from "drizzle-orm";
import { resourceGrants } from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { AppError } from "../http/errors";
import type { AppDatabase } from "../db";
export const isAdmin = (actor: Actor) =>
  ["OWNER", "ADMIN"].includes(actor.role);
export async function accessibleIds(
  db: AppDatabase,
  actor: Actor | null,
  type: "page" | "account",
) {
  requirePermission(actor, "workspace:read");
  if (isAdmin(actor)) return null;
  if (type === "account" && actor.role === "UPLOADER") return [];
  const rows = await db
    .select()
    .from(resourceGrants)
    .where(eq(resourceGrants.userId, actor.id));
  return rows.flatMap((row) => {
    const id = type === "page" ? row.pageId : row.accountId;
    return id ? [id] : [];
  });
}
export async function requireResource(
  db: AppDatabase,
  actor: Actor | null,
  type: "page" | "account",
  id: string,
) {
  const ids = await accessibleIds(db, actor, type);
  if (ids !== null && !ids.includes(id))
    throw new AppError(
      403,
      "RESOURCE_FORBIDDEN",
      "Bạn chưa được cấp quyền cho Page hoặc tài khoản quảng cáo này. Liên hệ quản trị viên.",
    );
}
