import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt);
  return `scrypt-v1$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  const hash = await derive(password, parts[1]);
  return timingSafeEqual(hash, Buffer.from(parts[2], "hex"));
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
// Cùng chi phí scrypt cho email không tồn tại; không chứa thông tin đăng nhập thật.
export const dummyHash = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
