import { sql } from "drizzle-orm";
import { db, pool } from "../src/server/db";
import { startBulkWorker } from "../src/server/ads/bulk/queue";
import { AdsService } from "../src/server/ads/service";
let stopped = false;
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.once(s, () => {
    stopped = true;
  });
async function main() {
  if (
    process.env.ADS_TEST_MODE === "true" &&
    !new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")
  )
    throw new Error("Ads worker test cần DB _test.");
  const service = new AdsService(db);
  const bulk = startBulkWorker(
    db,
    process.env.ADS_TEST_MODE === "true",
    service,
  );
  try {
    await bulk.worker.waitUntilReady();
    await db.execute(sql`select 1`);
    console.log(
      "Ads Worker sẵn sàng: chỉ tạo request đã xác nhận, Campaign/Ad Set/Ad PAUSED.",
    );
    do {
      await service.tick();
      await bulk.tick();
      if (process.argv.includes("--once")) break;
      for (let i = 0; i < 2 && !stopped; i++)
        await new Promise((r) => setTimeout(r, 1000));
    } while (!stopped);
  } finally {
    await bulk.close();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Ads Worker lỗi Database/cấu hình; giữ UNKNOWN, không tự tạo lại.",
  );
  process.exitCode = 1;
});
