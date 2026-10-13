import { db, pool } from "../src/server/db";
import { CareService } from "../src/server/care/service";
import { TelegramService } from "../src/server/care/telegram";
const pollSeconds = Number(process.env.CARE_POLL_SECONDS ?? 30);
if (!Number.isInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 300)
  throw new Error("Invalid CARE_POLL_SECONDS.");
let stopped = false;
process.once("SIGINT", () => {
  stopped = true;
});
process.once("SIGTERM", () => {
  stopped = true;
});
async function main() {
  const care = new CareService(db),
    telegram = new TelegramService(db);
  try {
    await pool.query("SELECT 1");
    console.log(
      "Worker Ads Care sẵn sàng; chỉ xử lý rules/thông báo đã bật rõ.",
    );
    do {
      await care.tick();
      await telegram.scanEvents();
      await telegram.tick();
      if (process.argv.includes("--once")) break;
      for (let i = 0; i < pollSeconds && !stopped; i++)
        await new Promise((r) => setTimeout(r, 1000));
    } while (!stopped);
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Worker Ads Care không thể tiếp tục. Kiểm tra Database và lịch sử; không ghi token vào log.",
  );
  process.exitCode = 1;
});
