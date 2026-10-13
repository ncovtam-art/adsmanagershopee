import { mkdir, open, rename, unlink, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "../http/errors";
import { MAX_VIDEO_BYTES } from "./validation";
const execute = promisify(execFile);
export class VideoStorage {
  readonly root: string;
  constructor(
    root = process.env.VIDEO_STORAGE_DIR ||
      join(process.cwd(), ".cache/video-storage"),
  ) {
    this.root = resolve(root);
    if (this.root.split(/[\\/]/).includes("public"))
      throw new AppError(
        503,
        "VIDEO_STORAGE",
        "Storage video phải riêng tư, ngoài public/.",
      );
  }
  path(key: string) {
    if (!/^(LIVE|MOCK)\/[a-f0-9-]{36}\.mp4$/.test(key))
      throw new AppError(422, "VIDEO_PATH", "Storage key không hợp lệ.");
    return join(this.root, key);
  }
  async securePath(key: string) {
    const target = this.path(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await realpath(this.root)) !== this.root)
      throw new AppError(
        503,
        "VIDEO_STORAGE",
        "Storage root không được là symlink.",
      );
    const namespace = resolve(target, "..");
    await mkdir(namespace, { recursive: true, mode: 0o700 });
    if ((await realpath(namespace)) !== namespace)
      throw new AppError(
        503,
        "VIDEO_STORAGE",
        "Storage namespace không được là symlink.",
      );
    return target;
  }
  async write(
    key: string,
    body: ReadableStream<Uint8Array> | null,
    expected: number,
  ) {
    if (!body) throw new AppError(400, "VIDEO_BODY", "Thiếu nội dung video.");
    const target = await this.securePath(key),
      temporary = target + ".partial";
    await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
    const file = await open(temporary, "wx", 0o600);
    const reader = body.getReader(),
      hash = createHash("sha256");
    let bytes = 0;
    const head: Buffer[] = [];
    let headSize = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > expected || bytes > MAX_VIDEO_BYTES) {
          await reader.cancel();
          throw new AppError(
            413,
            "VIDEO_SIZE",
            "Video vượt dung lượng khai báo/300 MB.",
          );
        }
        hash.update(part.value);
        if (headSize < 32) {
          const b = Buffer.from(part.value).subarray(0, 32 - headSize);
          head.push(b);
          headSize += b.length;
        }
        await file.writeFile(part.value);
      }
      if (bytes !== expected)
        throw new AppError(
          422,
          "VIDEO_TRUNCATED",
          "Video thiếu nội dung; tải lại bằng ticket mới.",
        );
      const magic = Buffer.concat(head);
      if (magic.subarray(4, 8).toString() !== "ftyp")
        throw new AppError(
          415,
          "VIDEO_FORMAT",
          "Nội dung phải là container MP4, không chỉ đổi tên tệp.",
        );
      await file.close();
      const metadata = await this.probe(temporary);
      await rename(temporary, target);
      return { sha256: hash.digest("hex"), ...metadata };
    } catch (e) {
      await file.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw e;
    } finally {
      reader.releaseLock();
    }
  }
  async probe(path: string) {
    let stdout: string;
    try {
      ({ stdout } = await execute(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-select_streams",
          "v:0",
          "-show_entries",
          "format=duration,format_name:stream=codec_name,width,height,duration",
          "-of",
          "json",
          path,
        ],
        { timeout: 20000, maxBuffer: 524288 },
      ));
    } catch {
      throw new AppError(
        422,
        "VIDEO_PROBE",
        "Không đọc được video. Cần ffprobe và MP4/H.264 hợp lệ.",
      );
    }
    const data = JSON.parse(stdout),
      s = data.streams?.[0],
      duration = Number(data.format?.duration ?? s?.duration);
    if (
      !s ||
      s.codec_name !== "h264" ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 28800 ||
      !Number.isInteger(s.width) ||
      !Number.isInteger(s.height) ||
      s.width <= 0 ||
      s.height <= 0 ||
      s.width > 10000 ||
      s.height > 10000
    )
      throw new AppError(
        422,
        "VIDEO_CODEC",
        "Hiện nhận MP4/H.264, ≤8 giờ, kích thước ≤10.000 px mỗi chiều.",
      );
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const g = gcd(s.width, s.height);
    return {
      durationMs: Math.round(duration * 1000),
      width: s.width as number,
      height: s.height as number,
      aspectRatio: `${s.width / g}:${s.height / g}`,
    };
  }
  async verify(key: string, expectedHash: string, size: number) {
    const path = await this.securePath(key);
    const info = await lstat(path).catch(() => null);
    if (!info?.isFile() || info.size !== size)
      throw new AppError(
        422,
        "VIDEO_MISSING",
        "File video thiếu hoặc đổi dung lượng. Khôi phục media gốc trước khi đăng.",
      );
    const hash = createHash("sha256");
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      for await (const part of file.createReadStream()) hash.update(part);
    } finally {
      await file.close().catch(() => {});
    }
    if (hash.digest("hex") !== expectedHash)
      throw new AppError(
        422,
        "VIDEO_INTEGRITY",
        "File hash đã đổi. Không đăng nội dung khác với preview.",
      );
    return path;
  }
}
