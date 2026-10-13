import { z } from "zod";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { AppError } from "../http/errors";
export const rangeSchema = z
  .object({ since: z.iso.date(), until: z.iso.date() })
  .refine(
    (v) =>
      v.since <= v.until &&
      (Date.parse(v.until) - Date.parse(v.since)) / 86400000 < 366,
    "Kỳ báo cáo tối đa 366 ngày và ngày bắt đầu không sau ngày kết thúc.",
  );
export const querySchema = z
  .object({
    source: z.enum(["LIVE", "MOCK"]).default("LIVE"),
    accountId: z.string().uuid().optional(),
    pageId: z.string().uuid().optional(),
    since: z.iso.date(),
    until: z.iso.date(),
    mode: z.enum(["cohort", "daily", "lifetime"]).default("cohort"),
    level: z
      .enum(["campaign", "adset", "ad", "subid", "content"])
      .default("campaign"),
    search: z.string().max(200).default(""),
    status: z.enum(["all", "ACTIVE", "PAUSED", "UNKNOWN"]).default("all"),
  })
  .superRefine((v, c) => {
    if (!rangeSchema.safeParse(v).success)
      c.addIssue({
        code: "custom",
        message: "Kỳ báo cáo không hợp lệ (tối đa 366 ngày).",
      });
  });
const metaId = z.string().regex(/^\d{1,64}$/);
const count = z.string().regex(/^\d{1,30}$/);
export const money = z.string().regex(/^\d{1,24}(\.\d{1,6})?$/);
export const insightSchema = z.object({
  day: z.iso.date(),
  accountId: metaId,
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Reporting timezone không hợp lệ."),
  campaignId: metaId,
  campaignName: z.string().max(300),
  adSetId: metaId,
  adSetName: z.string().max(300),
  adId: metaId,
  adName: z.string().max(300),
  pageMetaId: metaId.nullable(),
  postId: z
    .string()
    .regex(/^\d+_\d+$/)
    .nullable(),
  campaignStatus: z.string().max(50),
  adSetStatus: z.string().max(50),
  adStatus: z.string().max(50),
  spend: money,
  impressions: count,
  clicks: count,
  linkClicks: count.nullable(),
  lpv: count.nullable(),
  reach: count.nullable(),
});
export type Insight = z.infer<typeof insightSchema>;
export function micros(v: string) {
  const [w, f = ""] = v.replace(/^[-+]/, "").split(".");
  return (
    (BigInt(w) * 1000000n + BigInt(f.padEnd(6, "0"))) *
    (v.startsWith("-") ? -1n : 1n)
  );
}
export function decimal(v: bigint) {
  const n = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${n / 1000000n}.${String(n % 1000000n).padStart(6, "0")}`;
}
export function ratio(a: bigint, b: bigint) {
  if (b <= 0n) return null;
  const neg = a < 0n;
  const x = ((neg ? -a : a) * 10000n + b / 2n) / b;
  return `${neg ? "-" : ""}${x / 10000n}.${String(x % 10000n).padStart(4, "0")}`;
}
export function days(since: string, until: string) {
  rangeSchema.parse({ since, until });
  const result: string[] = [];
  for (let t = Date.parse(since); t <= Date.parse(until); t += 86400000)
    result.push(new Date(t).toISOString().slice(0, 10));
  return result;
}
export function localDay(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function fingerprint(
  rows: Insight[],
  range: { since: string; until: string },
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        range: { since: range.since, until: range.until },
        rows: [...rows].sort((a, b) =>
          `${a.day}:${a.adId}`.localeCompare(`${b.day}:${b.adId}`),
        ),
      }),
    )
    .digest("hex");
}
export const csvHeaders = [
  "date",
  "account_id",
  "currency",
  "timezone",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "page_id",
  "post_id",
  "campaign_status",
  "adset_status",
  "ad_status",
  "spend",
  "impressions",
  "clicks",
  "link_clicks",
  "landing_page_views",
  "reach",
];
export function parseAdsCsv(buffer: Buffer) {
  if (!buffer.length || buffer.length > 2 * 1024 * 1024)
    throw new AppError(413, "CSV_SIZE", "CSV tối đa 2 MB.");
  let records: string[][];
  try {
    records = parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer), {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 20000,
    });
  } catch {
    throw new AppError(
      422,
      "CSV_PARSE",
      "Cần CSV UTF-8, dấu phẩy và tiêu đề theo mẫu Ads/ngày.",
    );
  }
  const header = records.shift();
  if (
    !header ||
    header.length !== csvHeaders.length ||
    new Set(header).size !== header.length ||
    header.some((x) => !csvHeaders.includes(x))
  )
    throw new AppError(
      422,
      "CSV_HEADERS",
      "Cần đúng các cột mẫu Ads/ngày. Báo cáo cấp Account/Campaign/Ad Set phải xuất lại cấp Ad; không cộng các reporting level.",
    );
  if (!records.length || records.length > 5000)
    throw new AppError(422, "CSV_ROWS", "Cần 1–5.000 dòng Ad/ngày.");
  const rows = records.map((r, i) => {
    const v = (k: string) => r[header.indexOf(k)];
    const parsed = insightSchema.safeParse({
      day: v("date"),
      accountId: v("account_id"),
      currency: v("currency"),
      timezone: v("timezone"),
      campaignId: v("campaign_id"),
      campaignName: v("campaign_name"),
      adSetId: v("adset_id"),
      adSetName: v("adset_name"),
      adId: v("ad_id"),
      adName: v("ad_name"),
      pageMetaId: v("page_id") || null,
      postId: v("post_id") || null,
      campaignStatus: v("campaign_status") || "UNKNOWN",
      adSetStatus: v("adset_status") || "UNKNOWN",
      adStatus: v("ad_status") || "UNKNOWN",
      spend: v("spend"),
      impressions: v("impressions"),
      clicks: v("clicks"),
      linkClicks: v("link_clicks") || null,
      lpv: v("landing_page_views") || null,
      reach: v("reach") || null,
    });
    if (!parsed.success)
      throw new AppError(
        422,
        "CSV_ROW",
        `Dòng ${i + 2}: ${parsed.error.issues[0].message}.`,
      );
    return { ...parsed.data, spend: decimal(micros(parsed.data.spend)) };
  });
  if (
    new Set(rows.map((r) => r.accountId)).size !== 1 ||
    new Set(rows.map((r) => r.currency)).size !== 1 ||
    new Set(rows.map((r) => r.timezone)).size !== 1
  )
    throw new AppError(
      422,
      "CSV_ACCOUNT",
      "Mỗi tệp chỉ một TKQC/currency/reporting timezone.",
    );
  if (new Set(rows.map((r) => `${r.day}:${r.adId}`)).size !== rows.length)
    throw new AppError(
      422,
      "CSV_DUPLICATE",
      "Một Ad/ngày chỉ xuất hiện một lần, không dùng breakdown trùng.",
    );
  return rows;
}
