import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../http/errors";
export function encryptionKey() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new AppError(
      503,
      "ENCRYPTION_CONFIG",
      "Cần TOKEN_ENCRYPTION_KEY gồm 64 ký tự hex trong cấu hình máy chủ.",
    );
  return Buffer.from(value, "hex");
}
export function seal(value: string, key = encryptionKey()) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(".");
}
export function unseal(value: string, key = encryptionKey()) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new AppError(
      503,
      "TOKEN_UNREADABLE",
      "Không thể đọc token. Kiểm tra khóa mã hóa hoặc kết nối lại Meta.",
    );
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      503,
      "TOKEN_UNREADABLE",
      "Không thể đọc token. Kiểm tra khóa mã hóa hoặc kết nối lại Meta.",
    );
  }
}
