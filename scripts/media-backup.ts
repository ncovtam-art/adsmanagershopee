import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { connectDatabase } from "../src/server/db";
import { videoAssets } from "../src/server/database/schema";
import { VideoStorage } from "../src/server/publisher/storage";
import {
  backupMedia,
  restoreMedia,
  saveMediaPointer,
} from "../src/server/operations/media-backup";
async function main() {
  const command = process.argv[2],
    test = process.argv.includes("--test");
  if (!["backup", "restore"].includes(command))
    throw new Error("Invalid command.");
  const url = test ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (
    !url ||
    (test &&
      (!new URL(url).pathname.endsWith("_test") ||
        url === process.env.DATABASE_URL))
  )
    throw new Error("Invalid database.");
  const { db, pool } = connectDatabase(url);
  try {
    const storage = new VideoStorage(
      test ? process.env.TEST_VIDEO_STORAGE_DIR : undefined,
    );
    if (test && !process.env.TEST_VIDEO_STORAGE_DIR)
      throw new Error("Need separate test storage.");
    const records = await db
      .select({
        id: videoAssets.id,
        storageKey: videoAssets.storageKey,
        sha256: videoAssets.sha256,
        size: videoAssets.size,
      })
      .from(videoAssets)
      .where(eq(videoAssets.state, "READY"));
    const complete = records.map((r) => {
      if (!r.sha256) throw new Error("Missing hash.");
      return { ...r, sha256: r.sha256 };
    });
    const root = join(
      process.cwd(),
      test ? ".cache/test-media-backups" : ".cache/media-backups",
    );
    if (command === "backup") {
      const snapshot = await backupMedia(storage, complete, root);
      await saveMediaPointer(root, snapshot);
      console.log(
        "Đã backup media riêng tư và xác minh checksum; không chứa khóa mã hóa.",
      );
    } else {
      const pointer = JSON.parse(
        await readFile(join(root, "latest.json"), "utf8"),
      );
      if (pointer.version !== 1 || !/^[a-f0-9-]{36}$/.test(pointer.snapshot))
        throw new Error("Invalid pointer.");
      await restoreMedia(storage, complete, join(root, pointer.snapshot));
      console.log("Đã khôi phục/xác minh media; không ghi đè file hiện có.");
    }
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Media backup/restore thất bại. Kiểm tra storage, metadata và checksum; không ghi dữ liệu riêng vào log.",
  );
  process.exitCode = 1;
});
