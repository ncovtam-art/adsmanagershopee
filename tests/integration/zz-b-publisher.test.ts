import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { connectTestDatabase } from "../helpers";
import { videoFixture, bytesStream } from "../video-fixture";
import { PublisherService } from "../../src/server/publisher/service";
import { PublishEngine } from "../../src/server/publisher/engine";
import {
  createQueues,
  dispatchDue,
  startPublishWorkers,
} from "../../src/server/publisher/queue";
import { VideoStorage } from "../../src/server/publisher/storage";
import { MockPublisher } from "../../src/server/publisher/provider";
import { TeamService } from "../../src/server/team/service";
import { AppError } from "../../src/server/http/errors";
import {
  publicUserFields,
  users,
  pages,
  products,
  videoAssets,
  resourceGrants,
  publishJobs,
  publishHistory,
  trackingRecords,
  metaConnections,
} from "../../src/server/database/schema";
import { TrackingService } from "../../src/server/shopee/tracking";
import type { Actor } from "../../src/server/auth/policy";
const connection = connectTestDatabase(),
  db = connection.db,
  storage = new VideoStorage(join(process.cwd(), ".cache/test-video-storage")),
  provider = new MockPublisher(),
  service = new PublisherService(db, storage, () => provider),
  engine = new PublishEngine(db, storage, () => provider);
let owner: Actor,
  uploader: Actor,
  viewer: Actor,
  page: typeof pages.$inferSelect,
  otherPage: typeof pages.$inferSelect,
  productId: string,
  assetId: string;
process.env.META_MOCK_ENABLED = "true";
const code = (expected: string) => (e: unknown) =>
  e instanceof AppError && e.code === expected;
const policy = (extra: Record<string, unknown> = {}) => ({
  pageId: page.id,
  enabled: true,
  autoComment: false,
  delaySeconds: 0,
  commentTemplateId: null,
  removePreview: false,
  ...extra,
});
async function asset(tag: string) {
  const buffer = videoFixture(tag + randomUUID());
  const a = await service.beginUpload(owner, {
    pageId: page.id,
    filename: `${tag}.mp4`,
    size: buffer.length,
    productId,
    niche: "Test",
  });
  return service.upload(owner, a.id, bytesStream(buffer));
}
async function batch(tag: string, extra: Record<string, unknown> = {}) {
  const a = await asset(tag);
  const input = { assetIds: [a.id], caption: "Caption {video_name}", ...extra };
  const p = await service.preview(owner, input);
  const result = await service.confirm(owner, {
    ...input,
    fingerprint: p.fingerprint,
    requestKey: randomUUID(),
    confirmed: true,
  });
  return { asset: a, job: result.jobs[0], input, preview: p };
}
async function run(job: { id: string }) {
  const [current] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.id, job.id));
  return engine.run(job.id, current.generation);
}
before(async () => {
  [owner] = await db
    .select(publicUserFields)
    .from(users)
    .where(eq(users.role, "OWNER"));
  assert(
    owner,
    "Chạy suite Analytics trước Publisher để giữ fixtures finance cho backup.",
  );
  [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, "90071992547409941"));
  [otherPage] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, "90071992547409942"));
  [productId] = (
    await db.select({ id: products.id }).from(products).limit(1)
  ).map((p) => p.id);
  const team = new TeamService(db),
    password = randomBytes(24).toString("hex"),
    suffix = randomUUID();
  uploader = await team.create(owner, {
    name: "Publisher Uploader",
    email: `upload-${suffix}@publisher.test`,
    password,
    role: "UPLOADER",
  });
  viewer = await team.create(owner, {
    name: "Publisher Viewer",
    email: `view-${suffix}@publisher.test`,
    password,
    role: "VIEWER",
  });
  await db.insert(resourceGrants).values([
    { userId: uploader.id, pageId: page.id },
    { userId: viewer.id, pageId: page.id },
  ]);
  await service.savePolicy(owner, policy());
  const queues = createQueues(true);
  try {
    await queues.video.obliterate({ force: true });
    await queues.comment.obliterate({ force: true });
  } finally {
    await queues.video.close();
    await queues.comment.close();
  }
});
after(async () => {
  await connection.pool.end();
});
test("Publisher RBAC upload/template/policy, Page ACL và không lộ storage/session", async () => {
  await assert.rejects(
    service.beginUpload(viewer, {
      pageId: page.id,
      filename: "clip.mp4",
      size: 10,
    }),
    code("FORBIDDEN"),
  );
  await assert.rejects(
    service.beginUpload(uploader, {
      pageId: otherPage.id,
      filename: "clip.mp4",
      size: 10,
    }),
    code("RESOURCE_FORBIDDEN"),
  );
  await assert.rejects(
    service.savePolicy(uploader, policy()),
    code("FORBIDDEN"),
  );
  await assert.rejects(
    service.saveTemplate(uploader, {
      name: "Global",
      kind: "CAPTION",
      body: "Caption",
    }),
    code("FORBIDDEN"),
  );
  const t = await service.saveTemplate(uploader, {
    name: "Page caption",
    kind: "CAPTION",
    pageId: page.id,
    body: "{video_name}",
  });
  assert.equal(t.pageId, page.id);
});
test("Streaming upload metadata/hash trên ffprobe thật, duplicate warning không xóa", async () => {
  const b = videoFixture("duplicate" + randomUUID());
  const a = await service.beginUpload(owner, {
    pageId: page.id,
    filename: "first.mp4",
    size: b.length,
    productId,
    niche: "Test",
  });
  const first = await service.upload(owner, a.id, bytesStream(b));
  assetId = first.id;
  const second = await service.beginUpload(owner, {
    pageId: page.id,
    filename: "second.mp4",
    size: b.length,
  });
  const duplicate = await service.upload(owner, second.id, bytesStream(b));
  assert.equal(first.state, "READY");
  assert.equal(first.width, 64);
  assert.equal(duplicate.duplicateOf, first.id);
  const listed = await service.library(viewer, { source: "MOCK" });
  assert(listed.rows.some((a) => a.id === first.id));
  assert(!JSON.stringify(listed).includes("storageKey"));
  assert(
    await storage.verify(`MOCK/${first.id}.mp4`, first.sha256!, first.size),
  );
  await assert.rejects(
    service.upload(uploader, first.id, bytesStream(b)),
    code("UPLOAD_OWNER"),
  );
});
test("Tệp giả không READY; quyền thu hồi chặn library và media metadata ngay", async () => {
  const b = Buffer.from("invalid-file"),
    ticket = await service.beginUpload(owner, {
      pageId: page.id,
      filename: "fake.mp4",
      size: b.length,
    });
  await assert.rejects(
    service.upload(owner, ticket.id, bytesStream(b)),
    code("VIDEO_FORMAT"),
  );
  const [a] = await db
    .select()
    .from(videoAssets)
    .where(eq(videoAssets.id, ticket.id));
  assert.equal(a.state, "FAILED");
  await db.delete(resourceGrants).where(eq(resourceGrants.userId, viewer.id));
  assert.equal(
    (await service.library(viewer, { source: "MOCK" })).rows.length,
    0,
  );
  await assert.rejects(
    service.asset(viewer, assetId),
    code("RESOURCE_FORBIDDEN"),
  );
  await db
    .insert(resourceGrants)
    .values({ userId: viewer.id, pageId: page.id });
});
test("Tracking Content FK thực, sai Page/Product bị chặn; preview cần link khi auto-comment", async () => {
  const a = await asset("tracking");
  const [t] = await service.createTracking(owner, {
    assetId: a.id,
    affiliateAccount: "publisher_test",
  });
  const [record] = await db
    .select()
    .from(trackingRecords)
    .where(eq(trackingRecords.id, t.id));
  assert.equal(record.contentId, a.id);
  await service.savePolicy(owner, policy({ autoComment: true }));
  await assert.rejects(
    service.preview(owner, { assetIds: [a.id], trackingIds: { [a.id]: t.id } }),
    code("COMMENT_LINK"),
  );
  await new TrackingService(db).links(owner, [
    {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/publisher-exclusive",
      confirmed: true,
    },
  ]);
  const p = await service.preview(owner, {
    assetIds: [a.id],
    trackingIds: { [a.id]: t.id },
    caption: "{affiliate_url}",
  });
  assert(p.rows[0].commentBody?.includes("publisher-exclusive"));
  await service.savePolicy(owner, policy());
});
test("Preview/confirm fingerprint và idempotency, schema bắt xác nhận, duplicate active không tạo batch", async () => {
  const a = await asset("confirmed");
  const input = { assetIds: [a.id], caption: "Caption" };
  const p = await service.preview(owner, input),
    requestKey = randomUUID();
  await assert.rejects(
    service.confirm(owner, {
      ...input,
      fingerprint: p.fingerprint,
      requestKey,
      confirmed: false,
    }),
  );
  await assert.rejects(
    service.confirm(owner, {
      ...input,
      fingerprint: "a".repeat(64),
      requestKey,
      confirmed: true,
    }),
    code("PUBLISH_PREVIEW_CHANGED"),
  );
  const result = await service.confirm(owner, {
    ...input,
    fingerprint: p.fingerprint,
    requestKey,
    confirmed: true,
  });
  assert.equal(
    (
      await service.confirm(owner, {
        ...input,
        fingerprint: p.fingerprint,
        requestKey,
        confirmed: true,
      })
    ).duplicate,
    true,
  );
  await assert.rejects(
    service.preview(owner, input),
    code("PUBLISH_DUPLICATE_ACTIVE"),
  );
  await service.action(owner, { id: result.jobs[0].id, action: "cancel" });
});
test("Link/policy/template đổi sau preview phải preview lại trước khi confirm", async () => {
  const a = await asset("changed");
  const t = await service.saveTemplate(owner, {
    name: "Change template",
    kind: "CAPTION",
    pageId: page.id,
    body: "Old",
  });
  const input = { assetIds: [a.id], templateId: t.id };
  const p = await service.preview(owner, input);
  await service.saveTemplate(owner, {
    id: t.id,
    name: t.name,
    kind: "CAPTION",
    pageId: page.id,
    body: "New",
  });
  await assert.rejects(
    service.confirm(owner, {
      ...input,
      fingerprint: p.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    }),
    code("PUBLISH_PREVIEW_CHANGED"),
  );
});
test("Worker upload/IDs/history, duplicate dispatch không tạo bài thứ hai, explicit repost", async () => {
  const b = await batch("publish");
  assert.equal((await run(b.job)).state, "SUCCEEDED");
  const [job] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.id, b.job.id));
  assert(job.metaVideoId && job.postId);
  assert.equal(job.progress, 100);
  assert.equal((await run(b.job)).state, "NOOP");
  await assert.rejects(
    service.preview(owner, { assetIds: [b.asset.id] }),
    code("PUBLISH_ALREADY_POSTED"),
  );
  const p = await service.preview(owner, {
    assetIds: [b.asset.id],
    allowRepost: true,
  });
  assert.equal(p.rows.length, 1);
  assert(
    !JSON.stringify(await service.jobs(owner, { source: "MOCK" })).includes(
      "encryptedSession",
    ),
  );
  await assert.rejects(
    db
      .update(publishHistory)
      .set({ action: "tamper" })
      .where(eq(publishHistory.jobId, job.id)),
  );
});
test("Schedule UTC/pause/resume/cancel, global queue pause là bền trong DB", async () => {
  const b = await batch("schedule", {
    publishAt: new Date(Date.now() + 600000).toISOString(),
  });
  assert.equal(b.job.state, "SCHEDULED");
  assert.equal((await run(b.job)).state, "NOOP");
  await service.action(owner, { id: b.job.id, action: "pause" });
  await service.action(owner, { id: b.job.id, action: "resume" });
  await service.action(owner, { id: b.job.id, action: "cancel" });
  assert.equal((await run(b.job)).state, "NOOP");
  await assert.rejects(service.control(uploader, true), code("FORBIDDEN"));
  await service.control(owner, true);
  assert.equal(
    (await new PublisherService(db, storage).control(owner)).paused,
    true,
  );
  await service.control(owner, false);
});
test("Auto-comment sau Post ID chỉ một child, snapshot link và Comment ID", async () => {
  const a = await asset("comment");
  const [t] = await service.createTracking(owner, {
    assetId: a.id,
    affiliateAccount: "publisher_comment",
  });
  await new TrackingService(db).links(owner, [
    {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/comment-old",
      confirmed: true,
    },
  ]);
  await service.savePolicy(owner, policy({ autoComment: true }));
  const input = {
    assetIds: [a.id],
    trackingIds: { [a.id]: t.id },
    caption: "{sub_id}",
  };
  const p = await service.preview(owner, input),
    b = await service.confirm(owner, {
      ...input,
      fingerprint: p.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    });
  await new TrackingService(db).links(owner, [
    {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/comment-new",
      confirmed: true,
    },
  ]);
  await run(b.jobs[0]);
  const children = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.parentJobId, b.jobs[0].id));
  assert.equal(children.length, 1);
  assert(children[0].commentBody?.includes("comment-old"));
  await run(children[0]);
  const [child] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.id, children[0].id));
  assert.equal(child.state, "SUCCEEDED");
  assert(child.commentId);
  await assert.rejects(
    service.action(owner, { id: child.id, action: "retry" }),
    code("PUBLISH_STATE"),
  );
  await service.savePolicy(owner, policy());
});
test("Gỡ link preview UNSUPPORTED không gửi comment API", async () => {
  const a = await asset("unsupported"),
    [t] = await service.createTracking(owner, {
      assetId: a.id,
      affiliateAccount: "publisher_unsupported",
    });
  await new TrackingService(db).links(owner, [
    {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/no-preview",
      confirmed: true,
    },
  ]);
  await service.savePolicy(
    owner,
    policy({ autoComment: true, removePreview: true }),
  );
  const input = { assetIds: [a.id], trackingIds: { [a.id]: t.id } },
    p = await service.preview(owner, input),
    b = await service.confirm(owner, {
      ...input,
      fingerprint: p.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    });
  await run(b.jobs[0]);
  const [child] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.parentJobId, b.jobs[0].id));
  assert.equal(child.state, "UNSUPPORTED");
  assert.equal((await run(child)).state, "NOOP");
  await service.savePolicy(owner, policy());
});
test("Timeout finish UNKNOWN, không retry; Meta read recovery nối Post ID và giữ lịch sử", async () => {
  const b = await batch("unknown"),
    p = new MockPublisher();
  p.finish = async () => {
    throw new AppError(504, "META_RESULT_UNKNOWN", "Timeout fixture");
  };
  const failing = new PublishEngine(db, storage, () => p);
  assert.equal((await failing.run(b.job.id, 0)).state, "UNKNOWN");
  await assert.rejects(
    service.action(owner, { id: b.job.id, action: "retry" }),
    code("PUBLISH_STATE"),
  );
  await assert.rejects(
    service.preview(owner, { assetIds: [b.asset.id], allowRepost: true }),
    code("PUBLISH_DUPLICATE_ACTIVE"),
  );
  const result = await service.recover(owner, { id: b.job.id });
  assert.equal(result.state, "SUCCEEDED");
});
test("Finish thành công nhưng đọc Post lỗi không được finish lần hai", async () => {
  const b = await batch("lookup"),
    p = new MockPublisher();
  let finishes = 0;
  p.finish = async () => {
    finishes++;
  };
  p.inspect = async () => {
    throw new AppError(502, "META_NETWORK", "Read failure");
  };
  const failing = new PublishEngine(db, storage, () => p);
  assert.equal((await failing.run(b.job.id, 0)).state, "UNKNOWN");
  assert.equal(finishes, 1);
  assert.equal((await failing.run(b.job.id, 0)).state, "NOOP");
  await service.recover(owner, { id: b.job.id });
});
test("Unknown trước Video ID đòi kiểm tra Post ID, confirmation + lý do và Page proof", async () => {
  const b = await batch("unknown-start"),
    p = new MockPublisher();
  p.begin = async () => {
    throw new AppError(504, "META_RESULT_UNKNOWN", "Start timeout");
  };
  const failing = new PublishEngine(db, storage, () => p);
  await failing.run(b.job.id, 0);
  await assert.rejects(
    service.recover(owner, { id: b.job.id }),
    code("RECOVERY_MANUAL"),
  );
  await assert.rejects(
    service.recover(owner, {
      id: b.job.id,
      externalId: "1_2",
      confirmed: true,
      reason: "Không đúng Page",
    }),
    code("PUBLISH_PAGE"),
  );
  const result = await service.recover(owner, {
    id: b.job.id,
    externalId: `${page.metaId}_12345`,
    confirmed: true,
    reason: "Xác nhận bài đúng video trong fixture",
  });
  assert.equal(result.state, "SUCCEEDED");
});
test("Known 429 retry có backoff, FAILED retry an toàn; worker không thực hiện sau thu hồi quyền", async () => {
  const b = await batch("rate"),
    p = new MockPublisher();
  p.begin = async () => {
    throw new AppError(429, "META_RATE_LIMIT", "Rate", 90);
  };
  const rate = new PublishEngine(db, storage, () => p);
  assert.equal((await rate.run(b.job.id, 0)).state, "QUEUED");
  const [j] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.id, b.job.id));
  assert(j.availableAt.getTime() > Date.now() + 80000);
  await service.action(owner, { id: j.id, action: "cancel" });
  const a = await asset("uploader");
  const input = { assetIds: [a.id] },
    preview = await service.preview(uploader, input),
    confirmed = await service.confirm(uploader, {
      ...input,
      fingerprint: preview.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    });
  await db.delete(resourceGrants).where(eq(resourceGrants.userId, uploader.id));
  assert.equal((await run(confirmed.jobs[0])).state, "FAILED");
  await db
    .insert(resourceGrants)
    .values({ userId: uploader.id, pageId: page.id });
  await service.action(uploader, { id: confirmed.jobs[0].id, action: "retry" });
  assert.equal((await run(confirmed.jobs[0])).state, "SUCCEEDED");
});
test("Lease expiry: trước mutation được requeue; sau marker mutation giữ UNKNOWN", async () => {
  for (const phase of ["CREATED", "FINISH"]) {
    const b = await batch("lease" + phase);
    await db
      .update(publishJobs)
      .set({
        state: "PROCESSING",
        phase,
        leaseToken: randomUUID(),
        leaseUntil: new Date(0),
      })
      .where(eq(publishJobs.id, b.job.id));
    await engine.recoverExpired();
    const [j] = await db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.id, b.job.id));
    assert.equal(j.state, phase === "CREATED" ? "QUEUED" : "UNKNOWN");
    if (phase === "CREATED")
      await service.action(owner, { id: j.id, action: "cancel" });
    else
      await service.recover(owner, {
        id: j.id,
        externalId: `${page.metaId}_12346`,
        confirmed: true,
        reason: "Lease recovery fixture",
      });
  }
});
test("Comment queued có thể cancel; comment UNKNOWN không tự gửi lại và recover cần ID", async () => {
  const a = await asset("comment-cancel"),
    [t] = await service.createTracking(owner, {
      assetId: a.id,
      affiliateAccount: "publisher_cancel",
    });
  await new TrackingService(db).links(owner, [
    {
      trackingId: t.id,
      subId: t.subId,
      url: "https://s.shopee.vn/cancel-comment",
      confirmed: true,
    },
  ]);
  await service.savePolicy(owner, policy({ autoComment: true }));
  const input = { assetIds: [a.id], trackingIds: { [a.id]: t.id } },
    p = await service.preview(owner, input),
    b = await service.confirm(owner, {
      ...input,
      fingerprint: p.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    });
  await run(b.jobs[0]);
  const [child] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.parentJobId, b.jobs[0].id));
  await service.action(owner, { id: child.id, action: "cancel" });
  assert.equal((await run(child)).state, "NOOP");
  const another = await asset("comment-unknown"),
    [t2] = await service.createTracking(owner, {
      assetId: another.id,
      affiliateAccount: "publisher_unknown_comment",
    });
  await new TrackingService(db).links(owner, [
    {
      trackingId: t2.id,
      subId: t2.subId,
      url: "https://s.shopee.vn/unknown-comment",
      confirmed: true,
    },
  ]);
  const i2 = { assetIds: [another.id], trackingIds: { [another.id]: t2.id } },
    p2 = await service.preview(owner, i2),
    b2 = await service.confirm(owner, {
      ...i2,
      fingerprint: p2.fingerprint,
      requestKey: randomUUID(),
      confirmed: true,
    });
  await run(b2.jobs[0]);
  const [j2] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.parentJobId, b2.jobs[0].id));
  const mp = new MockPublisher();
  let sends = 0;
  mp.comment = async () => {
    sends++;
    throw new AppError(504, "META_RESULT_UNKNOWN", "Unknown comment");
  };
  const unknown = new PublishEngine(db, storage, () => mp);
  assert.equal((await unknown.run(j2.id, 0)).state, "UNKNOWN");
  assert.equal((await unknown.run(j2.id, 0)).state, "NOOP");
  assert.equal(sends, 1);
  await assert.rejects(
    service.action(owner, { id: j2.id, action: "retry" }),
    code("PUBLISH_STATE"),
  );
  await service.recover(owner, {
    id: j2.id,
    externalId: `${page.metaId}_99999`,
    confirmed: true,
    reason: "Xác nhận đúng comment fixture",
  });
  await service.savePolicy(owner, policy());
});
test("Thiếu scope comment không cho preview; upload 429 giữa transfer giữ session khi retry", async () => {
  await service.savePolicy(owner, policy({ autoComment: true }));
  const [conn] = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.id, page.connectionId));
  await db
    .update(metaConnections)
    .set({ scopes: conn.scopes.filter((s) => s !== "pages_manage_engagement") })
    .where(eq(metaConnections.id, conn.id));
  const a = await asset("missing-scope");
  await assert.rejects(
    service.preview(owner, { assetIds: [a.id] }),
    code("COMMENT_PERMISSION"),
  );
  await db
    .update(metaConnections)
    .set({ scopes: conn.scopes })
    .where(eq(metaConnections.id, conn.id));
  await service.savePolicy(owner, policy());
  const b = await batch("transfer-retry"),
    mp = new MockPublisher(),
    original = mp.transfer.bind(mp);
  let first = true,
    starts = 0;
  const begin = mp.begin.bind(mp);
  mp.begin = async (...args) => {
    starts++;
    return begin(...args);
  };
  mp.transfer = async (...args) => {
    if (first) {
      first = false;
      throw new AppError(429, "META_RATE_LIMIT", "Chunk retry", 60);
    }
    return original(...args);
  };
  const retry = new PublishEngine(db, storage, () => mp);
  assert.equal((await retry.run(b.job.id, 0)).state, "QUEUED");
  const [j] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.id, b.job.id));
  assert(j.encryptedSession && j.metaVideoId);
  await db
    .update(publishJobs)
    .set({ availableAt: new Date(0) })
    .where(eq(publishJobs.id, j.id));
  assert.equal((await retry.run(j.id, j.generation)).state, "SUCCEEDED");
  assert.equal(
    starts,
    1,
    "Retry chunk lỗi chắc chắn không bắt đầu video khác.",
  );
});
test("BullMQ/Redis thật dispatch idempotent, worker restart đọc outbox và không có hai posts", async () => {
  const b = await batch("redis"),
    runtime = startPublishWorkers(db, true, storage, engine);
  try {
    await Promise.all([
      runtime.videoWorker.waitUntilReady(),
      runtime.commentWorker.waitUntilReady(),
    ]);
    await dispatchDue(db, runtime.queues);
    await dispatchDue(db, runtime.queues);
    let done = false;
    for (let i = 0; i < 80; i++) {
      const [job] = await db
        .select()
        .from(publishJobs)
        .where(eq(publishJobs.id, b.job.id));
      if (job.state === "SUCCEEDED") {
        assert.equal(job.attempts, 1);
        done = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(done, "Worker phải xử lý job thực trên Redis.");
  } finally {
    await runtime.close();
  }
  const second = await batch("redis-restart"),
    restarted = startPublishWorkers(db, true, storage, engine);
  try {
    await restarted.videoWorker.waitUntilReady();
    await restarted.tick();
    let done = false;
    for (let i = 0; i < 100; i++) {
      const [j] = await db
        .select()
        .from(publishJobs)
        .where(eq(publishJobs.id, second.job.id));
      if (j.state === "SUCCEEDED") {
        done = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(done);
  } finally {
    await restarted.close();
  }
});
