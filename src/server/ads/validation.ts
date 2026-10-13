import { z } from "zod";
export const adsInput = z
  .object({
    publishJobId: z.string().uuid(),
    donorVersionId: z.string().uuid(),
    name: z.string().trim().min(2).max(60),
    mode: z.enum(["EXISTING_POST", "NEW_CREATIVE"]),
    trackingId: z.string().uuid().optional(),
    budget: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .optional(),
    objective: z.enum(["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT"]).optional(),
    optimization: z.enum(["LINK_CLICKS", "POST_ENGAGEMENT"]).optional(),
    facebookOnly: z.boolean().default(false),
    acknowledgeDonorChanges: z.boolean().default(false),
    message: z.string().max(8000).optional(),
    cta: z.enum(["LEARN_MORE", "SHOP_NOW"]).optional(),
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export const confirmInput = z
  .object({
    ...adsInput.shape,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    requestKey: z.string().uuid(),
    confirmed: z.literal(true),
  })
  .strict();
export type AdsInput = z.infer<typeof adsInput>;
export type Finding = {
  state: "NEEDS_FIX" | "UNSUPPORTED" | "UNKNOWN";
  field: string;
  reason: string;
  fix: string;
};
export type Snapshot = {
  campaign: Record<string, unknown>;
  adSet: Record<string, unknown>;
  creative: Record<string, unknown>;
  ad: Record<string, unknown>;
  accountMetaId: string;
  pageMetaId: string;
  postId: string;
  videoId: string;
  currency: string;
  timezone: string;
  mode: AdsInput["mode"];
  affiliateUrl: string | null;
  subId: string | null;
  thumbnailUrl: string | null;
};
export type Kind = "campaign" | "adSet" | "creative" | "ad";
export const kinds: Kind[] = ["campaign", "adSet", "creative", "ad"];
export function compatible(
  input: AdsInput,
  template: {
    campaign: Record<string, unknown>;
    adSet: Record<string, unknown>;
    creative: Record<string, unknown>;
  },
) {
  const findings: Finding[] = [];
  const add = (
    field: string,
    reason: string,
    fix: string,
    state: Finding["state"] = "NEEDS_FIX",
  ) => findings.push({ state, field, reason, fix });
  const campaign: Record<string, unknown> = { status: "PAUSED" },
    adSet: Record<string, unknown> = { status: "PAUSED" };
  const objective = input.objective ?? template.campaign.objective;
  if (input.mode === "NEW_CREATIVE" && !input.cta && !template.creative.cta)
    add("creative.cta", "CTA của Donor unavailable.", "Chọn CTA override trước khi tạo.", "UNKNOWN");
  campaign.objective = objective;
  campaign.buying_type = template.campaign.buying_type;
  campaign.special_ad_categories = template.campaign.special_ad_categories;
  if (!["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT"].includes(String(objective)))
    add(
      "campaign.objective",
      "Objective chưa được hỗ trợ trong luồng này.",
      "Chọn Traffic hoặc Engagement phù hợp; objective khác cần flow riêng.",
      "UNSUPPORTED",
    );
  if (campaign.buying_type !== "AUCTION")
    add(
      "campaign.buying_type",
      "Chỉ hỗ trợ Auction đã đọc từ Donor.",
      "Chọn Donor Auction.",
      "UNSUPPORTED",
    );
  if (!Array.isArray(campaign.special_ad_categories))
    add(
      "campaign.special_ad_categories",
      "Meta không trả Special Ad Categories.",
      "Đọc Donor có trường này.",
      "UNKNOWN",
    );
  else if (campaign.special_ad_categories.length)
    add(
      "campaign.special_ad_categories",
      "Danh mục đặc biệt cần targeting/compliance riêng.",
      "Dùng quy trình Meta phù hợp.",
      "UNSUPPORTED",
    );
  const optimization = input.optimization ?? template.adSet.optimization_goal;
  adSet.optimization_goal = optimization;
  adSet.billing_event = template.adSet.billing_event;
  const expected =
    input.mode === "EXISTING_POST" ? "POST_ENGAGEMENT" : "LINK_CLICKS";
  if (
    optimization !== expected ||
    objective !==
      (input.mode === "EXISTING_POST"
        ? "OUTCOME_ENGAGEMENT"
        : "OUTCOME_TRAFFIC")
  )
    add(
      "adSet.optimization_goal",
      "Objective/optimization không tương thích chế độ video này.",
      "Existing Post: Engagement/Post Engagement; New Creative: Traffic/Link Clicks.",
      "UNSUPPORTED",
    );
  if (adSet.billing_event !== "IMPRESSIONS")
    add(
      "adSet.billing_event",
      "Billing event khác IMPRESSIONS chưa hỗ trợ.",
      "Chọn Donor billing IMPRESSIONS.",
      "UNSUPPORTED",
    );
  adSet.destination_type =
    input.mode === "EXISTING_POST" ? "ON_POST" : "WEBSITE";
  const c = template.campaign,
    s = template.adSet;
  const budgets = [
    c.daily_budget,
    c.lifetime_budget,
    s.daily_budget,
    s.lifetime_budget,
  ].filter((v) => v !== undefined);
  if (budgets.length !== 1)
    add(
      "budget",
      "Donor phải có đúng một ngân sách Campaign hoặc Ad Set.",
      "Chọn Donor có ngân sách không mơ hồ.",
    );
  const atCampaign =
    c.daily_budget !== undefined || c.lifetime_budget !== undefined;
  const lifetime =
    c.lifetime_budget !== undefined || s.lifetime_budget !== undefined;
  const budget =
    input.budget ??
    (atCampaign
      ? lifetime
        ? c.lifetime_budget
        : c.daily_budget
      : lifetime
        ? s.lifetime_budget
        : s.daily_budget);
  if (typeof budget !== "string" || !/^[1-9]\d{0,14}$/.test(budget))
    add(
      "budget",
      "Ngân sách cần chuỗi số nguyên dương, đơn vị nhỏ nhất theo currency TKQC.",
      "Sửa ngân sách; app không tự quy đổi tiền.",
    );
  else
    (atCampaign ? campaign : adSet)[
      lifetime ? "lifetime_budget" : "daily_budget"
    ] = budget;
  const bid = s.bid_strategy ?? c.bid_strategy;
  if (bid !== "LOWEST_COST_WITHOUT_CAP")
    add(
      "bid_strategy",
      "Chiến lược bid cần kiểm tra riêng.",
      "Chọn Donor LOWEST_COST_WITHOUT_CAP.",
      "UNSUPPORTED",
    );
  else (atCampaign ? campaign : adSet).bid_strategy = bid;
  if (!atCampaign) campaign.is_adset_budget_sharing_enabled = false;
  if (input.startTime) {
    if (new Date(input.startTime).getTime() < Date.now() + 60000)
      add(
        "schedule.start",
        "Start time phải cách hiện tại ít nhất 1 phút.",
        "Chọn thời điểm mới.",
      );
    else adSet.start_time = input.startTime;
  }
  if (input.endTime) {
    if (
      new Date(input.endTime).getTime() <=
      Math.max(
        Date.now() + 60000,
        input.startTime ? new Date(input.startTime).getTime() : 0,
      )
    )
      add(
        "schedule.end",
        "End time phải sau start/current time.",
        "Chọn lịch mới.",
      );
    else adSet.end_time = input.endTime;
  }
  if (lifetime && !input.endTime)
    add(
      "schedule.end",
      "Lifetime budget cần end time mới.",
      "Chọn end time; không dùng lịch cũ của Donor.",
    );
  const target = structuredClone(s.targeting) as
    | Record<string, unknown>
    | undefined;
  if (!target || typeof target !== "object" || Array.isArray(target))
    add(
      "targeting",
      "Targeting unavailable.",
      "Đọc Donor có quốc gia/placements.",
      "UNKNOWN",
    );
  else {
    if (input.facebookOnly) {
      target.publisher_platforms = ["facebook"];
      delete target.instagram_positions;
      target.facebook_positions = ["feed"];
    }
    if (
      !Array.isArray(target.publisher_platforms) ||
      target.publisher_platforms.length !== 1 ||
      target.publisher_platforms[0] !== "facebook"
    )
      add(
        "targeting.placements",
        "Chưa có kiểm chứng Instagram identity/placements khác Facebook.",
        "Chọn Facebook Feed override hoặc Donor Facebook.",
        "UNSUPPORTED",
      );
    if (
      !Array.isArray(target.facebook_positions) ||
      target.facebook_positions.length !== 1 ||
      target.facebook_positions[0] !== "feed"
    )
      add(
        "targeting.placements",
        "Luồng này hỗ trợ Facebook Feed.",
        "Chọn Facebook Feed override.",
        "UNSUPPORTED",
      );
    const geo = target.geo_locations as { countries?: unknown } | undefined;
    if (
      !Array.isArray(geo?.countries) ||
      !geo.countries.length ||
      geo.countries.some((v) => typeof v !== "string" || !/^[A-Z]{2}$/.test(v))
    )
      add(
        "targeting.location",
        "Không có quốc gia hợp lệ.",
        "Dùng Donor có quốc gia được đọc.",
      );
    if (
      (typeof target.age_min === "number" &&
        (target.age_min < 18 || target.age_min > 65)) ||
      (typeof target.age_max === "number" &&
        (target.age_max < 18 || target.age_max > 65)) ||
      (typeof target.age_min === "number" &&
        typeof target.age_max === "number" &&
        target.age_min > target.age_max)
    )
      add(
        "targeting.age",
        "Giới hạn tuổi chưa hợp lệ.",
        "Đọc Donor có tuổi 18–65.",
      );
    adSet.targeting = target;
  }
  return { campaign, adSet, findings };
}
export function subset(expected: unknown, actual: unknown): boolean {
  // Graph may return the same scheduled instant with +0700 rather than +07:00.
  if (typeof expected === "string" && typeof actual === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(expected)) {
    const time = Date.parse(expected), other = Date.parse(actual);
    if (Number.isFinite(time) && Number.isFinite(other)) return time === other;
  }
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((v) => actual.some((a) => subset(v, a)))
    );
  if (expected && typeof expected === "object")
    return (
      !!actual &&
      typeof actual === "object" &&
      Object.entries(expected).every(([k, v]) =>
        subset(v, (actual as Record<string, unknown>)[k]),
      )
    );
  if (typeof expected === "boolean")
    return actual === expected || actual === (expected ? 1 : 0);
  return expected === actual;
}
