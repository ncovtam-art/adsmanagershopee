import { z } from "zod";
import { createHash } from "node:crypto";
import { AppError } from "../http/errors";
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const uploadSchema = z
  .object({
    pageId: z.string().uuid(),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((v) => /\.mp4$/i.test(v), "Hiện nhận MP4/H.264."),
    size: z.number().int().min(1).max(MAX_VIDEO_BYTES),
    productId: z.string().uuid().nullable().default(null),
    niche: z.string().trim().max(100).default(""),
  })
  .strict();
export const templateSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100),
    kind: z.enum(["CAPTION", "COMMENT"]),
    pageId: z.string().uuid().nullable().default(null),
    niche: z.string().trim().min(1).max(100).nullable().default(null),
    body: z.string().trim().min(1).max(8000),
  })
  .strict()
  .refine(
    (v) => !(v.pageId && v.niche),
    "Template chọn Page hoặc niche, không cả hai.",
  );
export const pagePolicySchema = z
  .object({
    pageId: z.string().uuid(),
    enabled: z.boolean(),
    autoComment: z.boolean(),
    delaySeconds: z.number().int().min(0).max(86400),
    commentTemplateId: z.string().uuid().nullable(),
    removePreview: z.boolean(),
  })
  .strict();
export const prepareSchema = z
  .object({
    assetIds: z
      .array(z.string().uuid())
      .min(1)
      .max(100)
      .refine(
        (v) => new Set(v).size === v.length,
        "Không chọn Video ID trùng.",
      ),
    trackingIds: z.record(z.string().uuid(), z.string().uuid()).default({}),
    caption: z.string().max(8000).default(""),
    templateId: z.string().uuid().nullable().default(null),
    publishAt: z.iso.datetime({ offset: true }).nullable().default(null),
    allowRepost: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => !v.publishAt || new Date(v.publishAt).getTime() >= Date.now() + 5000,
    "Lịch phải còn ít nhất 5 giây trong tương lai.",
  )
  .refine(
    (v) =>
      !v.publishAt ||
      new Date(v.publishAt).getTime() <= Date.now() + 180 * 86400000,
    "Lịch tối đa 180 ngày.",
  );
export const confirmSchema = z
  .object({
    ...prepareSchema.shape,
    fingerprint: z.string().length(64),
    requestKey: z.string().uuid(),
    confirmed: z.literal(true),
  })
  .strict();
export const variables = [
  "affiliate_url",
  "product_name",
  "sub_id",
  "page_name",
  "video_name",
] as const;
export function validateTemplate(text: string) {
  for (const key of text.matchAll(/\{([\w]+)\}/g))
    if (!(variables as readonly string[]).includes(key[1]))
      throw new AppError(
        422,
        "TEMPLATE_VARIABLE",
        `Biến {${key[1]}} chưa được hỗ trợ.`,
      );
}
export function renderTemplate(text: string, values: Record<string, string>) {
  validateTemplate(text);
  const result = text.replace(/\{([\w]+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key) || !values[key])
      throw new AppError(
        422,
        "TEMPLATE_DATA",
        `Thiếu dữ liệu cho {${key}}. Chuẩn bị tracking/link trước khi đăng.`,
      );
    return values[key];
  });
  if (result.length > 8000)
    throw new AppError(422, "CAPTION_SIZE", "Nội dung sau ghép quá dài.");
  return result;
}
export function previewHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export const metaObjectId = z.string().regex(/^\d{1,64}(_\d{1,64})?$/);
export function safeFilename(name: string) {
  return name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180);
}
