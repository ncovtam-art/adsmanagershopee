import { Pool } from "pg";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

async function run() {
  const command = process.argv[2];
  if (!["backup", "restore"].includes(command))
    throw new Error("Lệnh không hợp lệ.");
  const test = process.argv.includes("--test");
  const url = new URL(
    (test ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL) ?? "",
  );
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error(
      "Script backup development chỉ dùng cho Database Docker local.",
    );
  const sourceName = url.pathname.slice(1);
  if (
    test &&
    (!sourceName.endsWith("_test") ||
      sourceName === new URL(process.env.DATABASE_URL!).pathname.slice(1))
  )
    throw new Error("Database kiểm thử phải riêng biệt.");
  if (!test && sourceName !== process.env.POSTGRES_DB)
    throw new Error("Database không khớp cấu hình Docker development.");
  const root = test ? ".cache/test-database" : ".cache/database";
  const service = test ? "test-database" : "database";
  const manifestPath = join(root, "latest.json");
  mkdirSync(root, { recursive: true, mode: 0o700 });

  if (command === "backup") {
    const file = `backup-${Date.now()}-${randomBytes(4).toString("hex")}.dump`;
    const path = join(root, file);
    const child = spawn(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        service,
        "sh",
        "-c",
        'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl',
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const done = new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error("pg_dump thất bại.")),
      );
    });
    child.stderr.resume();
    try {
      await Promise.all([
        pipeline(
          child.stdout,
          createWriteStream(path, { mode: 0o600, flags: "wx" }),
        ),
        done,
      ]);
      const bytes = readFileSync(path);
      if (bytes.subarray(0, 5).toString() !== "PGDMP")
        throw new Error("Backup không hợp lệ.");
      const manifest = {
        version: 1,
        file,
        hash: createHash("sha256").update(bytes).digest("hex"),
        createdAt: new Date().toISOString(),
        database: sourceName,
      };
      if (
        existsSync(manifestPath) &&
        JSON.parse(readFileSync(manifestPath, "utf8")).version !== 1
      )
        throw new Error("Manifest không thuộc script này.");
      writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });
      const { renameSync } = await import("node:fs");
      renameSync(`${manifestPath}.tmp`, manifestPath);
      console.log(
        "Đã lưu backup development trong thư mục cache riêng; không ghi dữ liệu vào log.",
      );
    } catch (error) {
      if (existsSync(path)) unlinkSync(path);
      throw error;
    }
    return;
  }

  if (!existsSync(manifestPath)) {
    console.log("Chưa có backup development; giữ nguyên Database.");
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    version: number;
    file: string;
    hash: string;
    database: string;
  };
  if (
    manifest.version !== 1 ||
    !/^backup-\d+-[a-f0-9]{8}\.dump$/.test(manifest.file) ||
    manifest.database !== sourceName
  )
    throw new Error("Manifest không hợp lệ.");
  const path = join(root, manifest.file);
  if (
    createHash("sha256").update(readFileSync(path)).digest("hex") !==
    manifest.hash
  )
    throw new Error("Checksum backup không khớp.");
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const targetName = targetArg?.slice(9) ?? sourceName;
  if (targetArg && (!test || !/^restore_[a-f0-9]{12}_test$/.test(targetName)))
    throw new Error("Target riêng chỉ dành cho Database kiểm thử do test tạo.");
  url.pathname = `/${targetName}`;
  const pool = new Pool({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(847202)");
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle') AND table_type='BASE TABLE'",
    );
    if (tables.rowCount) {
      console.log("Database đã có bảng; bỏ qua restore để bảo toàn dữ liệu.");
      return;
    }
    const child = spawn(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "-e",
        `RESTORE_DB=${targetName}`,
        service,
        "sh",
        "-c",
        'pg_restore -U "$POSTGRES_USER" -d "$RESTORE_DB" --no-owner --no-acl --single-transaction --exit-on-error',
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    const done = new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error("pg_restore thất bại.")),
      );
    });
    child.stderr.resume();
    await Promise.all([pipeline(createReadStream(path), child.stdin), done]);
    console.log(
      "Đã khôi phục Database development trống từ backup có checksum.",
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock(847202)").catch(() => {});
    client.release();
    await pool.end();
  }
}
run().catch(() => {
  console.error(
    "Backup/restore không thành công. Kiểm tra Docker, cấu hình Database và checksum; không ghi đè Database có dữ liệu.",
  );
  process.exitCode = 1;
});
