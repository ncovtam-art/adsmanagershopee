import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { VideoStorage } from "../../src/server/publisher/storage";
import {
  renderTemplate,
  prepareSchema,
  pagePolicySchema,
  uploadSchema,
} from "../../src/server/publisher/validation";
import { redisOptions } from "../../src/server/publisher/queue";
import { MetaGateway } from "../../src/server/meta/gateway";
import { LivePublisher } from "../../src/server/publisher/provider";
import { AppError } from "../../src/server/http/errors";
import { videoFixture, bytesStream } from "../video-fixture";
const code = (expected: string) => (e: unknown) =>
  e instanceof AppError && e.code === expected;
test("Publisher templates literal-safe, kiểm biến/missing link và giới hạn", () => {
  assert.equal(
    renderTemplate("{page_name}: {affiliate_url}", {
      page_name: "$& Page",
      affiliate_url: "https://s.shopee.vn/example",
    }),
    "$& Page: https://s.shopee.vn/example",
  );
  assert.throws(
    () => renderTemplate("{api_secret}", {}),
    code("TEMPLATE_VARIABLE"),
  );
  assert.throws(
    () => renderTemplate("{affiliate_url}", { affiliate_url: "" }),
    code("TEMPLATE_DATA"),
  );
  assert.throws(
    () => renderTemplate("{video_name}", { video_name: "x".repeat(8001) }),
    code("CAPTION_SIZE"),
  );
});
test("Publisher upload/schedule/input validation không nhận tệp ngoài MP4, ID trùng hay quá hạn", () => {
  const pageId = randomUUID();
  assert(
    !uploadSchema.safeParse({ pageId, filename: "x.exe", size: 1 }).success,
  );
  assert(
    !uploadSchema.safeParse({
      pageId,
      filename: "x.mp4",
      size: 301 * 1024 * 1024,
    }).success,
  );
  const id = randomUUID();
  assert(!prepareSchema.safeParse({ assetIds: [id, id] }).success);
  assert(
    !prepareSchema.safeParse({
      assetIds: [id],
      publishAt: "2020-01-01T00:00:00Z",
    }).success,
  );
  assert(
    !pagePolicySchema.safeParse({
      pageId,
      enabled: true,
      autoComment: true,
      delaySeconds: -1,
      commentTemplateId: null,
      removePreview: false,
    }).success,
  );
});
test("Storage streaming/hash/ffprobe thật, MP4 H264 metadata và file permission", async () => {
  const root = join(process.cwd(), ".cache/unit-video-storage", randomUUID()),
    storage = new VideoStorage(root),
    key = `MOCK/${randomUUID()}.mp4`,
    buffer = videoFixture("unit");
  try {
    const meta = await storage.write(
      key,
      new ReadableStream<Uint8Array>({
        start(c) {
          for (let n = 0; n < buffer.length; n += 128)
            c.enqueue(buffer.subarray(n, n + 128));
          c.close();
        },
      }),
      buffer.length,
    );
    assert.equal(meta.width, 64);
    assert.equal(meta.height, 64);
    assert.equal(meta.aspectRatio, "1:1");
    assert(meta.durationMs > 0);
    assert.equal(meta.sha256.length, 64);
    assert.equal(
      await storage.verify(key, meta.sha256, buffer.length),
      storage.path(key),
    );
    assert.deepEqual(await readFile(storage.path(key)), buffer);
    await writeFile(storage.path(key), Buffer.alloc(buffer.length));
    await assert.rejects(
      storage.verify(key, meta.sha256, buffer.length),
      code("VIDEO_INTEGRITY"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Storage chặn path traversal, size sai, tệp giả; chỉ xóa partial do upload lỗi tạo", async () => {
  const root = join(process.cwd(), ".cache/unit-video-storage", randomUUID()),
    storage = new VideoStorage(root);
  try {
    assert.throws(() => storage.path("../../.env"), code("VIDEO_PATH"));
    await assert.rejects(
      storage.write(
        `MOCK/${randomUUID()}.mp4`,
        bytesStream(Buffer.from("bad file")),
        8,
      ),
      code("VIDEO_FORMAT"),
    );
    await assert.rejects(
      storage.write(
        `MOCK/${randomUUID()}.mp4`,
        bytesStream(Buffer.from("bad file")),
        7,
      ),
      code("VIDEO_SIZE"),
    );
    await assert.rejects(
      storage.write(
        `MOCK/${randomUUID()}.mp4`,
        bytesStream(Buffer.from("bad file")),
        9,
      ),
      code("VIDEO_TRUNCATED"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Redis URL test guard tách database và không bỏ TLS verify", () => {
  const old = {
    REDIS_URL: process.env.REDIS_URL,
    TEST_REDIS_URL: process.env.TEST_REDIS_URL,
  };
  try {
    process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
    process.env.TEST_REDIS_URL = "redis://127.0.0.1:6379/0";
    assert.throws(() => redisOptions(true));
    process.env.TEST_REDIS_URL = "rediss://127.0.0.1:6379/15";
    assert.deepEqual(redisOptions(true).tls, {});
    assert.equal(redisOptions(true).db, 15);
  } finally {
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
function config() {
  Object.assign(process.env, {
    DRY_RUN: "false",
    META_WRITES_ENABLED: "true",
    META_APP_ID: "123",
    META_APP_SECRET: "publisher-unit-secret",
    META_GRAPH_VERSION: "v23.0",
    APP_ORIGIN: "http://localhost:3000",
    META_REDIRECT_URI: "http://localhost:3000/api/meta/callback",
  });
}
test("Gateway POST không retry khi timeout/5xx, giữ UNKNOWN và không lộ credential URL", async () => {
  config();
  for (const response of [
    null,
    Response.json({ error: { code: 1, is_transient: true } }, { status: 500 }),
  ]) {
    let calls = 0;
    const g = new MetaGateway((async (_input, init) => {
      calls++;
      assert.equal(init?.method, "POST");
      if (response) return response;
      throw Error("private upstream");
    }) as typeof fetch);
    await assert.rejects(
      g.publisherWrite("private-page-token", "41/videos", {
        upload_phase: "start",
        file_size: "10",
      }),
      code("META_RESULT_UNKNOWN"),
    );
    assert.equal(calls, 1);
  }
});
test("Live resumable start/transfer/finish dùng Graph video host và authenticated form", async () => {
  config();
  const calls: Array<{ url: URL; body: FormData }> = [];
  const g = new MetaGateway((async (input, init) => {
    const url = new URL(String(input)),
      body = init?.body as FormData;
    calls.push({ url, body });
    assert(!url.toString().includes("private-token"));
    assert(body.has("appsecret_proof"));
    switch (body.get("upload_phase")) {
      case "start":
        return Response.json({
          video_id: "999",
          upload_session_id: "888",
          start_offset: "0",
          end_offset: "10",
        });
      case "transfer":
        assert(body.get("video_file_chunk") instanceof Blob);
        return Response.json({ start_offset: "10", end_offset: "10" });
      default:
        return Response.json({ success: true });
    }
  }) as typeof fetch);
  const p = new LivePublisher(g),
    start = await p.begin("private-token", "41", 10, "job");
  assert.equal(start.videoId, "999");
  await p.transfer("private-token", "41", start.sessionId, 0, Buffer.alloc(10));
  await p.finish("private-token", "41", start.sessionId, "Caption", "Video");
  assert.equal(calls.length, 3);
  assert(calls.every((c) => c.url.hostname === "graph-video.facebook.com"));
  assert.equal(calls[2].body.get("published"), "true");
});
test("Live Post ID được đọc qua object_id, không suy ID; comment chỉ message, không giả remove-preview", async () => {
  config();
  const writes: FormData[] = [];
  const g = new MetaGateway((async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST") {
      writes.push(init.body as FormData);
      return Response.json({ id: "41_123" });
    }
    if (url.pathname.endsWith("published_posts"))
      return Response.json({ data: [{ id: "41_456", object_id: "999" }] });
    return Response.json({
      id: "999",
      published: true,
      status: { video_status: "ready" },
    });
  }) as typeof fetch);
  const p = new LivePublisher(g);
  const state = await p.inspect("token", "41", "999");
  assert.equal(state.postId, "41_456");
  assert.equal(
    await p.comment(
      "token",
      "41_456",
      "Link https://s.shopee.vn/example",
      "job",
    ),
    "41_123",
  );
  assert.deepEqual([...writes[0].keys()].sort(), [
    "appsecret_proof",
    "message",
  ]);
});
