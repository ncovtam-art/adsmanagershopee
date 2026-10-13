import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  symlink,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VideoStorage } from "../../src/server/publisher/storage";
import {
  backupMedia,
  restoreMedia,
} from "../../src/server/operations/media-backup";
import { videoFixture } from "../video-fixture";
test("Portable private media backup/restore real bytes, corrupt backup and existing file never overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "aacc-backup-")),
    source = new VideoStorage(join(root, "source")),
    target = new VideoStorage(join(root, "target")),
    buffer = videoFixture("backup");
  const key = `MOCK/${randomUUID()}.mp4`,
    record = {
      id: randomUUID(),
      storageKey: key,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      size: buffer.length,
    };
  try {
    await source.write(
      key,
      new ReadableStream({
        start(c) {
          c.enqueue(buffer);
          c.close();
        },
      }),
      buffer.length,
    );
    const snapshot = await backupMedia(source, [record], join(root, "backup"));
    assert.deepEqual(await restoreMedia(target, [record], snapshot), {
      verified: 1,
    });
    assert.deepEqual(await readFile(target.path(key)), buffer);
    await restoreMedia(target, [record], snapshot);
    await writeFile(target.path(key), Buffer.alloc(buffer.length));
    await assert.rejects(restoreMedia(target, [record], snapshot));
    assert.deepEqual(
      await readFile(target.path(key)),
      Buffer.alloc(buffer.length),
    );
    await writeFile(join(snapshot, key), Buffer.alloc(buffer.length));
    await assert.rejects(
      restoreMedia(new VideoStorage(join(root, "new")), [record], snapshot),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Private media storage rejects public roots, symlink namespaces and symlink files", async () => {
  const root = await mkdtemp(join(tmpdir(), "aacc-symlink-")),
    storage = new VideoStorage(join(root, "source")),
    key = `MOCK/${randomUUID()}.mp4`;
  try {
    assert.throws(() => new VideoStorage(join(root, "public")));
    await mkdir(storage.root, { recursive: true });
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(storage.root, "MOCK"));
    await assert.rejects(storage.securePath(key));
    await rm(join(storage.root, "MOCK"));
    await storage.securePath(key);
    const outside = join(root, "private.txt");
    await writeFile(outside, "private");
    await symlink(outside, storage.path(key));
    await assert.rejects(storage.verify(key, "0".repeat(64), 7));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
