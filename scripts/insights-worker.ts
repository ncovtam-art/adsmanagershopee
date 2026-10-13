import { db, pool } from "../src/server/db";
import { runInsightsTick } from "../src/server/analytics/worker";
let stopped = false;
process.once("SIGINT", () => {
  stopped = true;
});
process.once("SIGTERM", () => {
  stopped = true;
});
console.log(
  "Worker Insights đã khởi động; chỉ cập nhật các TKQC được bật lịch.",
);
async function main() {
  try {
    do {
      const jobs = await runInsightsTick(db);
      if (jobs.length) console.log(JSON.stringify(jobs));
      if (process.argv.includes("--once")) break;
      for (let i = 0; i < 30 && !stopped; i++)
        await new Promise((r) => setTimeout(r, 1000));
    } while (!stopped);
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Worker Insights không thể tiếp tục. Kiểm tra Database/cấu hình và lịch sử đồng bộ.",
  );
  process.exitCode = 1;
});
