import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { AppError } from "../http/errors";
export const accountKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_-]{2,64}$/,
    "Mã tài khoản Shopee cần 2–64 chữ thường, số, gạch ngang/gạch dưới.",
  );
export const metaId = z
  .string()
  .regex(/^\d{1,64}$/, "ID Meta phải là chuỗi chữ số.");
export const productInput = z
  .object({
    name: z.string().trim().min(2).max(150),
    url: z.string().trim().max(2000),
    niche: z.string().trim().max(100),
  })
  .strict();
export function shopeeUrl(value: string, affiliate = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(422, "SHOPEE_URL", "URL Shopee không hợp lệ.");
  }
  const hosts = affiliate
    ? ["shopee.vn", "www.shopee.vn", "shope.ee", "s.shopee.vn", "vn.shp.ee"]
    : ["shopee.vn", "www.shopee.vn"];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.includes(url.hostname) ||
    url.pathname === "/"
  )
    throw new AppError(
      422,
      "SHOPEE_URL",
      "Dùng URL HTTPS sản phẩm Shopee Việt Nam hoặc Custom Link Shopee được hỗ trợ.",
    );
  url.hash = "";
  return url.toString();
}
export function newSubId(code: string) {
  return `${
    code
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "P"
  }-${randomBytes(6).toString("hex").toUpperCase()}`;
}
export function normalizeSubId(value: string) {
  return value.normalize("NFC").trim().toUpperCase();
}
export const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const trackingInput = z
  .object({
    pageIds: z
      .array(z.string().uuid())
      .min(1)
      .max(100)
      .refine(
        (v) => new Set(v).size === v.length,
        "Page không được chọn trùng.",
      ),
    productId: z.string().uuid(),
    affiliateAccount: accountKey,
    channel: z.enum(["ORGANIC", "ADS", "SHARED"]),
    contentRef: z.string().trim().max(200),
    contentId: z.string().uuid().optional(),
    campaignId: metaId.optional(),
    adSetId: metaId.optional(),
    adId: metaId.optional(),
  })
  .strict()
  .refine(
    (v) =>
      [v.campaignId, v.adSetId, v.adId].filter(Boolean).length === 0 ||
      [v.campaignId, v.adSetId, v.adId].filter(Boolean).length === 3,
    "Nhập đủ ba ID hoặc để trống cả ba.",
  )
  .refine(
    (v) => v.channel === "ADS" || !v.adId,
    "Chỉ tracking Ads có ID quảng cáo.",
  )
  .refine(
    (v) => !v.adId || v.pageIds.length === 1,
    "Tracking Ads có ID chỉ gắn một Page.",
  );
export const linkInput = z
  .object({
    trackingId: z.string().uuid(),
    subId: z.string().trim().min(1).max(64),
    url: z.string().trim().max(2000),
    confirmed: z.literal(true, {
      error: "Xác nhận bạn đã tạo Custom Link với đúng SubID trong Shopee.",
    }),
  })
  .strict();
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
