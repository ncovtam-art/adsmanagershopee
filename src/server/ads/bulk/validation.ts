import { z } from "zod";
import { adsInput, type Snapshot, type Finding } from "../validation";
import { previewFingerprint } from "../../donors/normalize";
export const overridesSchema = adsInput
  .omit({
    publishJobId: true,
    donorVersionId: true,
    name: true,
    trackingId: true,
  })
  .partial()
  .strict();
export const cloneSchema = z
  .object({
    sourceRequestId: z.string().uuid(),
    level: z.enum(["CAMPAIGN", "ADSET", "AD"]),
    copies: z.number().int().min(1).max(10),
    newParents: z.boolean().default(false),
  })
  .strict();
export const bulkItemSchema = z
  .object({
    key: z.string().uuid(),
    publishJobId: z.string().uuid(),
    trackingId: z.string().uuid().optional(),
    donorVersionId: z.string().uuid().optional(),
    overrides: overridesSchema.optional(),
    cloneSourceId: z.string().uuid().optional(),
    copyIndex: z.number().int().min(0).max(9).optional(),
  })
  .strict();
export const bulkInput = z
  .object({
    name: z.string().trim().min(2).max(60),
    donorVersionId: z.string().uuid().optional(),
    presetId: z.string().uuid().optional(),
    structure: z
      .enum([
        "PER_VIDEO",
        "CAMPAIGN_PER_PAGE",
        "ADSET_PER_PAGE",
        "APPEND_ADSETS",
        "APPEND_ADS",
      ])
      .default("PER_VIDEO"),
    parentRequestId: z.string().uuid().optional(),
    overrides: overridesSchema.default({}),
    items: z.array(bulkItemSchema).min(1).max(100),
    clone: cloneSchema.optional(),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.key)).size === v.items.length,
    "Mỗi row key phải riêng.",
  );
export type BulkInput = z.infer<typeof bulkInput>;
export const bulkConfirm = z
  .object({
    input: bulkInput,
    requestKey: z.string().uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    budgetAcknowledged: z.literal(true),
  })
  .strict();
export const presetSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100),
    donorVersionId: z.string().uuid(),
    structure: z.enum(["PER_VIDEO", "CAMPAIGN_PER_PAGE", "ADSET_PER_PAGE"]),
    overrides: overridesSchema,
  })
  .strict();
export type PlanRow = {
  key: string;
  pageId: string;
  accountId: string;
  source: "LIVE" | "MOCK";
  snapshot: Snapshot;
  campaignGroup: string;
  adSetGroup: string;
  campaignOwnerKey: string | null;
  adSetOwnerKey: string | null;
  campaignRefId: string | null;
  adSetRefId: string | null;
  findings: Finding[];
};
export function sameConfig(a: unknown, b: unknown) {
  return previewFingerprint(canonical(a)) === previewFingerprint(canonical(b));
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  return v;
}
export function plan(rows: PlanRow[]) {
  const campaigns = new Map<string, PlanRow>(),
    sets = new Map<string, PlanRow>();
  for (const row of rows) {
    const c = campaigns.get(row.campaignGroup),
      s = sets.get(row.adSetGroup);
    if (c && !sameConfig(c.snapshot.campaign, row.snapshot.campaign))
      row.findings.push({
        state: "NEEDS_FIX",
        field: "structure.campaign",
        reason: "Campaign dùng chung có ngân sách/objective khác nhau.",
        fix: "Đồng nhất cấu hình hoặc chọn một Campaign/video.",
      });
    if (s && !sameConfig(s.snapshot.adSet, row.snapshot.adSet))
      row.findings.push({
        state: "NEEDS_FIX",
        field: "structure.adSet",
        reason: "Ad Set dùng chung có target/ngân sách/lịch khác nhau.",
        fix: "Đồng nhất cấu hình hoặc chọn nhiều Ad Sets.",
      });
    row.campaignOwnerKey = row.campaignRefId ? null : (c?.key ?? null);
    row.adSetOwnerKey = row.adSetRefId ? null : (s?.key ?? null);
    if (!c) campaigns.set(row.campaignGroup, row);
    if (!s) sets.set(row.adSetGroup, row);
  }
  const budgets = new Map<
    string,
    {
      source: string;
      currency: string;
      kind: string;
      newBudget: bigint;
      existingBudget: bigint;
    }
  >();
  for (const [kind, groups] of [
    ["campaign", campaigns],
    ["adSet", sets],
  ] as const)
    for (const row of groups.values()) {
      const value =
        kind === "campaign" ? row.snapshot.campaign : row.snapshot.adSet;
      for (const field of ["daily_budget", "lifetime_budget"])
        if (
          typeof value[field] === "string" &&
          /^\d+$/.test(value[field] as string)
        ) {
          const key = `${row.source}:${row.snapshot.currency}:${field}`,
            sum = budgets.get(key) ?? {
              source: row.source,
              currency: row.snapshot.currency,
              kind: field,
              newBudget: 0n,
              existingBudget: 0n,
            };
          if (kind === "campaign" ? row.campaignRefId : row.adSetRefId)
            sum.existingBudget += BigInt(value[field] as string);
          else sum.newBudget += BigInt(value[field] as string);
          budgets.set(key, sum);
        }
    }
  return {
    counts: {
      campaigns: [...campaigns.values()].filter((r) => !r.campaignRefId).length,
      adSets: [...sets.values()].filter((r) => !r.adSetRefId).length,
      creatives: rows.length,
      ads: rows.length,
    },
    budgets: [...budgets.values()].map((b) => ({
      ...b,
      newBudget: b.newBudget.toString(),
      existingBudget: b.existingBudget.toString(),
    })),
  };
}
