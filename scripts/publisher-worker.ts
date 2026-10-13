import { db, pool } from "../src/server/db";
import { startPublishWorkers } from "../src/server/publisher/queue";
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    stopped = true;
  });
async function main() {
  const test = process.env.PUBLISHER_TEST_MODE === "true";
  if (
    test &&
    !new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")
  )
    throw new Error("Publisher test mode cần Database _test.");
  const runtime = startPublishWorkers(db, test);
  try {
    await Promise.all([
      runtime.videoWorker.waitUntilReady(),
      runtime.commentWorker.waitUntilReady(),
    ]);
    console.log(
      "Publisher Worker sẵn sàng; chỉ chạy jobs đã xác nhận, source LIVE/MOCK tách riêng.",
    );
    do {
      await runtime.tick();
      if (process.argv.includes("--once")) break;
      for (let i = 0; i < 2 && !stopped; i++)
        await new Promise((r) => setTimeout(r, 1000));
    } while (!stopped);
  } finally {
    await runtime.close();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Publisher Worker dừng do lỗi Redis/Database/cấu hình. Không tự đăng lại jobs UNKNOWN.",
  );
  process.exitCode = 1;
});
