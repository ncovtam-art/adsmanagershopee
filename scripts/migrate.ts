import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
async function main() {
  const testMode = process.argv.includes("--test");
  const connectionString = testMode
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Chưa cấu hình Database. Chạy npm run env:init hoặc cấu hình .env.",
    );
  if (testMode && !new URL(connectionString).pathname.endsWith("_test"))
    throw new Error("Database kiểm thử phải có tên kết thúc bằng _test.");
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(847202)");
    const journal = JSON.parse(
      readFileSync("migrations/meta/_journal.json", "utf8"),
    ) as { entries: { tag: string; when: number }[] };
    const exists = await client.query<{ present: string | null }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS present",
    );
    const applied = exists.rows[0].present
      ? (
          await client.query<{ hash: string; created_at: string }>(
            "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
          )
        ).rows
      : [];
    for (let i = 0; i < applied.length; i++) {
      const entry = journal.entries[i];
      if (!entry)
        throw new Error("Database có migration không thuộc checkout này.");
      const hash = createHash("sha256")
        .update(readFileSync(`migrations/${entry.tag}.sql`, "utf8"))
        .digest("hex");
      if (
        hash !== applied[i].hash ||
        String(entry.when) !== String(applied[i].created_at)
      )
        throw new Error(
          "Migration đã áp dụng bị thay đổi. Hãy khôi phục file gốc; không xóa Database.",
        );
    }
    if (process.argv.includes("--status")) {
      console.log(
        `Migration: ${applied.length}/${journal.entries.length} đã áp dụng; ${journal.entries.length - applied.length} đang chờ.`,
      );
      if (applied.length !== journal.entries.length) process.exitCode = 1;
    } else {
      await migrate(drizzle(client), { migrationsFolder: "migrations" });
      console.log(
        `Database ${testMode ? "kiểm thử" : "development"}: migration đã áp dụng; không reset dữ liệu.`,
      );
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(847202)").catch(() => {});
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Migration thất bại. Kiểm tra .env, kết nối Database và lịch sử migration; không xóa dữ liệu.",
  );
  process.exitCode = 1;
});
