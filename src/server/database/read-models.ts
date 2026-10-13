import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, sessions, users, workspaces } from "./schema";
export async function databaseHealth() {
  await db.execute(sql`SELECT 1`);
  await db.select({ id: workspaces.id }).from(workspaces).limit(1);
}
export async function activeUserCount() {
  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.active, true));
  return total;
}
export async function auditCount() {
  const [{ total }] = await db.select({ total: count() }).from(auditLogs);
  return total;
}
export async function activeSessionCount() {
  const [{ total }] = await db
    .select({ total: count() })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(gt(sessions.expiresAt, new Date()), eq(users.active, true)));
  return total;
}
export async function auditPage(page: number) {
  const items = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceId: auditLogs.resourceId,
      createdAt: auditLogs.createdAt,
      metadata: auditLogs.metadata,
      actor: { name: users.name },
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .orderBy(desc(auditLogs.createdAt), asc(auditLogs.id))
    .limit(20)
    .offset((page - 1) * 20);
  return { items, total: await auditCount(), page, pageSize: 20 };
}
