import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
export function videoFixture(tag = "fixture") {
  const root = join(process.cwd(), ".cache/test-video-fixtures");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, "sample.mp4");
  if (!existsSync(path))
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:r=2",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        path,
      ],
      { timeout: 30000, stdio: "ignore" },
    );
  const atom = Buffer.alloc(8 + Buffer.byteLength(tag));
  atom.writeUInt32BE(atom.length);
  atom.write("free", 4);
  atom.write(tag, 8);
  return Buffer.concat([readFileSync(path), atom]);
}
export function bytesStream(buffer: Buffer) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(buffer);
      c.close();
    },
  });
}
