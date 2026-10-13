import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  lstat,
  rename,
  open,
  realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { VideoStorage } from "../publisher/storage";
export type MediaRecord = {
  id: string;
  storageKey: string;
  sha256: string;
  size: number;
};
async function hash(path: string) {
  const h = createHash("sha256"),
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    for await (const chunk of file.createReadStream()) h.update(chunk);
  } finally {
    await file.close().catch(() => {});
  }
  return h.digest("hex");
}
export async function backupMedia(
  storage: VideoStorage,
  records: MediaRecord[],
  root: string,
) {
  const snapshot = join(resolve(root), randomUUID());
  await mkdir(snapshot, { recursive: true, mode: 0o700 });
  for (const r of records) {
    const source = await storage.verify(r.storageKey, r.sha256, r.size),
      dest = join(snapshot, r.storageKey);
    await mkdir(resolve(dest, ".."), { recursive: true, mode: 0o700 });
    await copyFile(source, dest, constants.COPYFILE_EXCL);
    if ((await hash(dest)) !== r.sha256)
      throw new Error("Media backup checksum mismatch.");
  }
  const manifest = { version: 1, createdAt: new Date().toISOString(), records };
  await writeFile(join(snapshot, "manifest.json"), JSON.stringify(manifest), {
    mode: 0o600,
    flag: "wx",
  });
  return snapshot;
}
export async function restoreMedia(
  storage: VideoStorage,
  records: MediaRecord[],
  snapshot: string,
) {
  snapshot = resolve(snapshot);
  if ((await realpath(snapshot)) !== snapshot)
    throw new Error("Symlink backup root.");
  const manifest = JSON.parse(
    await readFile(join(snapshot, "manifest.json"), "utf8"),
  ) as { version: number; records: MediaRecord[] };
  if (manifest.version !== 1 || !Array.isArray(manifest.records))
    throw new Error("Invalid media manifest.");
  const wanted = new Map(records.map((r) => [r.id, r])),
    items: MediaRecord[] = [];
  const keys = new Set<string>();
  // Validate every matched source before writing, never overwrite existing content.
  for (const r of manifest.records) {
    storage.path(r.storageKey);
    if (keys.has(r.storageKey)) throw new Error("Duplicate media key.");
    keys.add(r.storageKey);
    const expected = wanted.get(r.id);
    if (!expected) continue;
    if (
      expected.sha256 !== r.sha256 ||
      expected.size !== r.size ||
      expected.storageKey !== r.storageKey
    )
      throw new Error("Media metadata mismatch.");
    const source = join(snapshot, r.storageKey);
    if ((await realpath(resolve(source, ".."))) !== resolve(source, ".."))
      throw new Error("Symlink backup namespace.");
    const info = await lstat(source);
    if (
      !info.isFile() ||
      info.size !== r.size ||
      (await hash(source)) !== r.sha256
    )
      throw new Error("Media backup integrity failed.");
    items.push(r);
  }
  if (items.length !== records.length)
    throw new Error("Missing media in backup.");
  for (const r of items) {
    const dest = await storage.securePath(r.storageKey),
      existing = await lstat(dest).catch(() => null);
    if (existing) {
      await storage.verify(r.storageKey, r.sha256, r.size);
      continue;
    }
    await copyFile(join(snapshot, r.storageKey), dest, constants.COPYFILE_EXCL);
    await storage.verify(r.storageKey, r.sha256, r.size);
  }
  return { verified: items.length };
}
export async function saveMediaPointer(root: string, snapshot: string) {
  await writeFile(
    join(root, "latest.json.tmp"),
    JSON.stringify({ version: 1, snapshot: snapshot.split("/").at(-1) }),
    { mode: 0o600 },
  );
  await rename(join(root, "latest.json.tmp"), join(root, "latest.json"));
}
