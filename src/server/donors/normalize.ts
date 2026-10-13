import { createHash } from "node:crypto";
import type { MetaObject } from "../meta/types";
export type Snapshot = {
  campaign: MetaObject;
  adSet: MetaObject;
  ad: MetaObject;
  creative: MetaObject;
};
export function sanitizeSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 20) return "[giới hạn cấu trúc]";
  if (Array.isArray(value))
    return value.slice(0, 1000).map((v) => sanitizeSnapshot(v, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(access.?token|secret|password|authorization|cookie|email|phone)/i.test(
              key,
            ) && !["__proto__", "prototype", "constructor"].includes(key),
        )
        .map(([key, v]) => [key, sanitizeSnapshot(v, depth + 1)]),
    );
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()])
          if (/token|secret|password|auth|email|phone/i.test(key))
            url.searchParams.delete(key);
        return url.toString();
      } catch {
        return "[URL không hợp lệ]";
      }
    }
    return value.slice(0, 10000);
  }
  return value;
}
const campaignFields = [
  "objective",
  "buying_type",
  "daily_budget",
  "lifetime_budget",
  "bid_strategy",
  "special_ad_categories",
];
const adSetFields = [
  "optimization_goal",
  "billing_event",
  "destination_type",
  "daily_budget",
  "lifetime_budget",
  "bid_amount",
  "bid_strategy",
];
function pick(source: MetaObject, keys: string[]) {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(source, key))
      .map((key) => [key, source[key]]),
  );
}
export function normalize(snapshot: Snapshot) {
  const warnings: string[] = [];
  const campaign = pick(snapshot.campaign, campaignFields),
    adSet = pick(snapshot.adSet, adSetFields);
  for (const [group, fields] of [
    ["campaign", campaignFields],
    ["adSet", adSetFields],
  ] as const)
    for (const field of fields)
      if (snapshot[group][field] === undefined)
        warnings.push(
          `${group}.${field}: unavailable — Meta không trả trường này.`,
        );
  for (const data of [campaign, adSet])
    for (const field of ["daily_budget", "lifetime_budget", "bid_amount"])
      if (
        data[field] !== undefined &&
        (typeof data[field] !== "string" ||
          !/^\d+$/.test(data[field] as string))
      ) {
        delete data[field];
        warnings.push(
          `${field}: không tái sử dụng vì giá trị tiền không phải chuỗi số nguyên.`,
        );
      }
  const targeting = snapshot.adSet.targeting as MetaObject | undefined;
  if (targeting && typeof targeting === "object") {
    const reusable = pick(targeting, [
      "age_min",
      "age_max",
      "genders",
      "publisher_platforms",
      "facebook_positions",
      "instagram_positions",
      "device_platforms",
    ]);
    const geo = targeting.geo_locations as MetaObject | undefined;
    if (
      Array.isArray(geo?.countries) &&
      geo.countries.every((v) => typeof v === "string")
    )
      reusable.geo_locations = { countries: geo.countries };
    adSet.targeting = reusable;
    const removed = Object.keys(targeting).filter(
      (key) => ![...Object.keys(reusable)].includes(key),
    );
    if (removed.length)
      warnings.push(
        `Targeting cần kiểm tra lại: đã loại ${removed.join(", ")} và định danh phụ thuộc tài khoản.`,
      );
    if (geo && Object.keys(geo).some((k) => k !== "countries"))
      warnings.push(
        "Location chi tiết chưa được tái sử dụng; cần chọn lại trước khi tạo Ads.",
      );
  } else warnings.push("adSet.targeting: unavailable.");
  const story = snapshot.creative.object_story_spec as MetaObject | undefined;
  const link = story?.link_data as MetaObject | undefined,
    video = story?.video_data as MetaObject | undefined;
  const body = link ?? video;
  const cta = body?.call_to_action as MetaObject | undefined;
  const creative = {
    type: link ? "LINK" : video ? "VIDEO" : "UNAVAILABLE",
    ...(typeof body?.message === "string" ? { message: body.message } : {}),
    ...(typeof cta?.type === "string" ? { cta: cta.type } : {}),
    requiresNewIdentity: true,
    requiresNewContent: true,
    requiresVerifiedDestination: true,
  };
  if (!body)
    warnings.push(
      "Creative type/CTA: unavailable hoặc chưa hỗ trợ tái sử dụng.",
    );
  if (snapshot.adSet.promoted_object)
    warnings.push("Promoted object/pixel phải chọn lại cho tài khoản đích.");
  warnings.push(
    "Đã loại source IDs, lịch chạy cũ, trạng thái ACTIVE, metrics, tracking và identity. Ngân sách là đơn vị nhỏ nhất theo currency tài khoản nguồn.",
  );
  warnings.push(
    "Template là cấu hình tham khảo; cần kiểm tra compatibility, identity, creative và tracking ở Giai đoạn 7. Chưa thể tạo Ads.",
  );
  return {
    normalized: { schemaVersion: 1, campaign, adSet, creative },
    warnings,
  };
}
export function previewFingerprint(snapshot: unknown) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
