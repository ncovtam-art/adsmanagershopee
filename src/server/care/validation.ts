import { z } from "zod";
import { createHash } from "node:crypto";
import { micros } from "../analytics/engine";
export const metrics = [
  "spend",
  "cpc",
  "ctr",
  "cpm",
  "linkClicks",
  "lpv",
  "costPerLpv",
  "estimatedCommission",
  "realizedCommission",
  "estimatedRoas",
  "realizedRoas",
  "estimatedProfit",
  "realizedProfit",
] as const;
export const conditionSchema = z
  .object({
    metric: z.enum(metrics),
    op: z.enum(["GTE", "GT", "LTE", "LT"]),
    value: z.string().regex(/^-?\d{1,24}(\.\d{1,6})?$/),
  })
  .strict();
export const ruleSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    accountId: z.string().uuid(),
    source: z.enum(["LIVE", "MOCK"]),
    level: z.enum(["campaign", "adset", "ad"]),
    windowDays: z.number().int().min(1).max(30),
    maxAgeMinutes: z.number().int().min(1).max(1440),
    cooldownMinutes: z.number().int().min(5).max(10080),
    conditions: z.array(conditionSchema).min(1).max(10),
    actions: z
      .array(z.enum(["ALERT", "TELEGRAM", "REVIEW", "WINNER", "AUTO_PAUSE"]))
      .min(1)
      .max(5)
      .refine((v) => new Set(v).size === v.length),
    commissionCompleteThrough: z.iso.date().nullable().default(null),
    financialAcknowledged: z.boolean().default(false),
  })
  .strict();
export type RuleInput = z.infer<typeof ruleSchema>;
export const financialMetric = (name: string) =>
  /Commission|Roas|Profit/.test(name);
export const financialRule = (r: RuleInput) =>
  r.conditions.some((c) => financialMetric(c.metric));
export function ruleHash(r: RuleInput) {
  return createHash("sha256")
    .update(JSON.stringify(ruleSchema.parse(r)))
    .digest("hex");
}
export function matches(
  conditions: RuleInput["conditions"],
  values: Record<string, string | null>,
) {
  return conditions.every((c) => {
    const v = values[c.metric];
    if (v === null || v === undefined) return false;
    const a = micros(v),
      b = micros(c.value);
    return c.op === "GTE"
      ? a >= b
      : c.op === "GT"
        ? a > b
        : c.op === "LTE"
          ? a <= b
          : a < b;
  });
}
export const eventTypes = [
  "CAMPAIGN_ISSUE",
  "SPEND_THRESHOLD",
  "LOW_ROAS",
  "ADS_FAILED",
  "PUBLISH_FAILED",
  "SHOPEE_IMPORTED",
  "UNMATCHED_SUBID",
  "PAGE_DISCONNECTED",
  "AUTO_PAUSE",
  "WINNER",
] as const;
export const telegramSchema = z
  .object({
    token: z
      .string()
      .regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/)
      .optional(),
    chatId: z.string().regex(/^-?\d{1,20}$/),
    enabled: z.boolean(),
    events: z.array(z.enum(eventTypes)).max(eventTypes.length),
    cooldownMinutes: z.number().int().min(5).max(10080),
  })
  .strict();
