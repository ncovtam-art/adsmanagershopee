import { sql } from "drizzle-orm";
import { db, pool } from "../src/server/db";
async function main() {
  try {
    if (!process.argv.includes("--apply")) {
      console.log(
        "Dùng --apply để xóa sessions/OAuth states/API buckets đã hết hạn. Không xóa dữ liệu tài chính, jobs hoặc audit.",
      );
      return;
    }
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM sessions WHERE expires_at < now()`);
      await tx.execute(sql`DELETE FROM oauth_states WHERE expires_at < now()`);
      await tx.execute(
        sql`DELETE FROM api_rate_buckets WHERE expires_at < now()`,
      );
    });
    console.log(
      "Đã dọn trạng thái xác thực/rate limit hết hạn; giữ dữ liệu nghiệp vụ và audit.",
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("Maintenance thất bại. Kiểm tra Database.");
  process.exitCode = 1;
});
