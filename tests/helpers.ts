import { connectDatabase } from "../src/server/db";
import { sql } from "drizzle-orm";

export function testDatabaseUrl() {
  const target = process.env.TEST_DATABASE_URL;
  if (!target || !new URL(target).pathname.endsWith("_test"))
    throw new Error(
      "Chỉ được chạy kiểm thử với TEST_DATABASE_URL kết thúc bằng _test.",
    );
  if (
    process.env.DATABASE_URL &&
    new URL(target).pathname === new URL(process.env.DATABASE_URL).pathname
  )
    throw new Error("Database kiểm thử phải khác Database ứng dụng.");
  return target;
}
export function connectTestDatabase() {
  return connectDatabase(testDatabaseUrl());
}
export async function clearTestDatabase(
  connection: ReturnType<typeof connectTestDatabase>,
) {
  testDatabaseUrl();
  await connection.db.execute(
    sql`TRUNCATE TABLE notification_jobs, api_rate_buckets, audit_logs, sessions, login_guards, users, settings CASCADE`,
  );
}
