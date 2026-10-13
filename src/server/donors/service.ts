import { eq, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db";
import {
  adAccounts,
  metaConnections,
  donors,
  donorVersions,
  auditLogs,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { AppError } from "../http/errors";
import { unseal } from "../meta/crypto";
import { accessibleIds, requireResource } from "../meta/access";
import { gateway, providerFor } from "../meta/service";
import type { MetaObject, MetaProvider, Source } from "../meta/types";
import {
  normalize,
  sanitizeSnapshot,
  previewFingerprint,
  type Snapshot,
} from "./normalize";
const metaId = z
  .string()
  .trim()
  .regex(/^\d+$/, "ID Meta phải là chuỗi chữ số.")
  .max(64);
export const donorInput = z
  .object({
    name: z.string().trim().min(2, "Tên Donor cần ít nhất 2 ký tự.").max(100),
    accountId: z.string().uuid(),
    campaignId: z.union([metaId, z.literal("")]),
    adSetId: z.union([metaId, z.literal("")]),
    adId: metaId,
    adsManagerUrl: z.string().trim().max(2000).optional(),
    donorId: z.string().uuid().optional(),
  })
  .strict();
const campaignOptional = [
  "objective",
  "buying_type",
  "daily_budget",
  "lifetime_budget",
  "bid_strategy",
  "special_ad_categories",
];
const setOptional = [
  "optimization_goal",
  "billing_event",
  "destination_type",
  "targeting",
  "daily_budget",
  "lifetime_budget",
  "bid_amount",
  "bid_strategy",
  "start_time",
  "end_time",
  "promoted_object",
];
const creativeOptional = [
  "object_story_spec",
  "effective_object_story_id",
  "object_story_id",
  "instagram_actor_id",
  "call_to_action_type",
];
async function readConfig(
  provider: MetaProvider,
  token: string,
  id: string,
  core: string[],
  optional: string[],
) {
  const result = await provider.read(token, id, core);
  if (optional.length) {
    try {
      Object.assign(
        result,
        await provider.read(token, id, ["id", ...optional]),
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "META_OBJECT")
        throw error;
      // Một field không được hỗ trợ không làm mất các field khác. Không fallback khi thiếu quyền/token/rate limit.
      for (const field of optional) {
        try {
          Object.assign(result, await provider.read(token, id, ["id", field]));
        } catch (inner) {
          if (!(inner instanceof AppError) || inner.code !== "META_OBJECT")
            throw inner;
        }
      }
    }
  }
  return result;
}
function stringField(object: MetaObject, key: string) {
  const value = object[key];
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new AppError(
      422,
      "DONOR_RELATION_UNAVAILABLE",
      `Meta không trả ${key} hợp lệ để xác minh quan hệ. Chưa lưu Donor.`,
    );
  return value;
}
function objectId(object: MetaObject, id: string) {
  if (stringField(object, "id") !== id)
    throw new AppError(
      422,
      "DONOR_MISMATCH",
      "Meta trả đối tượng khác ID yêu cầu. Chưa lưu Donor.",
    );
}
export function parseAdsManagerUrl(value: string) {
  if (!value) return {};
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(422, "ADS_URL", "URL Ads Manager không hợp lệ.");
  }
  if (
    url.protocol !== "https:" ||
    ![
      "adsmanager.facebook.com",
      "www.facebook.com",
      "business.facebook.com",
    ].includes(url.hostname)
  )
    throw new AppError(
      422,
      "ADS_URL",
      "Chỉ nhận URL HTTPS chính thức của Ads Manager. Không truy cập URL này ở máy chủ.",
    );
  const result: Record<string, string> = {};
  for (const [key, field] of [
    ["selected_campaign_ids", "campaignId"],
    ["selected_adset_ids", "adSetId"],
    ["selected_ad_ids", "adId"],
  ]) {
    const id = url.searchParams.get(key);
    if (id) {
      if (!/^\d+$/.test(id))
        throw new AppError(422, "ADS_URL", "URL phải chọn một ID cho mỗi cấp.");
      result[field] = id;
    }
  }
  return result;
}
export class DonorService {
  constructor(
    private db: AppDatabase,
    private resolveProvider: (source: Source) => MetaProvider = providerFor,
  ) {}
  async preview(actor: Actor | null, input: unknown) {
    requirePermission(actor, "donors:write");
    const value = donorInput.parse(input);
    await requireResource(this.db, actor, "account", value.accountId);
    if (value.adsManagerUrl) {
      const parsed = parseAdsManagerUrl(value.adsManagerUrl);
      for (const key of ["campaignId", "adSetId", "adId"] as const) {
        if (parsed[key] && value[key] && parsed[key] !== value[key])
          throw new AppError(
            422,
            "ADS_URL_MISMATCH",
            "ID trong URL khác ID đã nhập.",
          );
      }
    }
    const [account] = await this.db
      .select()
      .from(adAccounts)
      .where(eq(adAccounts.id, value.accountId));
    if (!account || account.status !== "AUTHORIZED")
      throw new AppError(
        403,
        "ACCOUNT_PERMISSION",
        "TKQC chưa có kết nối đọc hợp lệ. Kiểm tra quyền và kết nối Meta.",
      );
    const [connection] = await this.db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.id, account.connectionId));
    if (connection.expiresAt <= new Date())
      throw new AppError(
        401,
        "META_TOKEN_EXPIRED",
        "Token hết hạn. Kết nối lại Meta.",
      );
    if (
      !connection.scopes.some((s) => ["ads_read", "ads_management"].includes(s))
    )
      throw new AppError(
        403,
        "META_PERMISSION",
        "Thiếu ads_read hoặc ads_management. Cấp quyền và kết nối lại.",
      );
    if (value.donorId) {
      const [existing] = await this.db
        .select()
        .from(donors)
        .where(eq(donors.id, value.donorId));
      if (!existing || existing.accountId !== account.id)
        throw new AppError(
          422,
          "DONOR_ACCOUNT",
          "Version mới phải thuộc cùng Donor và tài khoản nguồn.",
        );
    }
    const provider = this.resolveProvider(account.source),
      token = unseal(connection.encryptedToken);
    const ad = await readConfig(
      provider,
      token,
      value.adId,
      ["id", "account_id", "adset_id", "campaign_id", "creative"],
      ["name", "tracking_specs"],
    );
    objectId(ad, value.adId);
    const adSetId = stringField(ad, "adset_id"),
      campaignId = stringField(ad, "campaign_id");
    if (
      (value.adSetId && value.adSetId !== adSetId) ||
      (value.campaignId && value.campaignId !== campaignId)
    )
      throw new AppError(
        422,
        "DONOR_MISMATCH",
        "Campaign, Ad Set và Ad không cùng cấu trúc. Kiểm tra lại 3 ID.",
      );
    if (stringField(ad, "account_id") !== account.metaId)
      throw new AppError(
        403,
        "DONOR_SOURCE_ACCOUNT",
        "Ad không thuộc TKQC nguồn đã chọn.",
      );
    const adSet = await readConfig(
      provider,
      token,
      adSetId,
      ["id", "account_id", "campaign_id"],
      setOptional,
    );
    objectId(adSet, adSetId);
    const campaign = await readConfig(
      provider,
      token,
      campaignId,
      ["id", "account_id"],
      campaignOptional,
    );
    objectId(campaign, campaignId);
    if (
      stringField(adSet, "campaign_id") !== campaignId ||
      stringField(adSet, "account_id") !== account.metaId ||
      stringField(campaign, "account_id") !== account.metaId
    )
      throw new AppError(
        422,
        "DONOR_MISMATCH",
        "Quan hệ cha hoặc tài khoản của Campaign/Ad Set/Ad không khớp. Chưa lưu Donor.",
      );
    const creativeRef = ad.creative as MetaObject | undefined;
    if (!creativeRef || typeof creativeRef !== "object")
      throw new AppError(
        422,
        "DONOR_CREATIVE",
        "Meta chưa trả creative để đọc mẫu.",
      );
    const creativeId = stringField(creativeRef, "id"),
      creative = await readConfig(
        provider,
        token,
        creativeId,
        ["id"],
        creativeOptional,
      );
    objectId(creative, creativeId);
    const raw = sanitizeSnapshot({ campaign, adSet, ad, creative }) as Snapshot;
    const result = normalize(raw);
    return {
      name: value.name,
      donorId: value.donorId,
      accountId: account.id,
      accountName: account.name,
      currency: account.currency,
      source: account.source,
      campaignId,
      adSetId,
      adId: value.adId,
      raw,
      ...result,
      fingerprint: previewFingerprint({
        raw,
        normalized: result.normalized,
        accountId: account.id,
      }),
    };
  }
  async save(actor: Actor | null, input: unknown) {
    requirePermission(actor, "donors:write");
    const parsed = z
      .object({
        input: donorInput,
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(input);
    gateway.invalidateReads();
    const preview = await this.preview(actor, parsed.input);
    if (preview.fingerprint !== parsed.fingerprint)
      throw new AppError(
        409,
        "DONOR_CHANGED",
        "Cấu hình nguồn đã thay đổi sau preview. Đọc lại preview trước khi lưu.",
      );
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847204)`);
      let donorId = preview.donorId;
      if (!donorId) {
        const [donor] = await tx
          .insert(donors)
          .values({
            name: preview.name,
            accountId: preview.accountId,
            source: preview.source,
            createdBy: actor.id,
          })
          .returning();
        donorId = donor.id;
      }
      const [last] = await tx
        .select({ version: donorVersions.version })
        .from(donorVersions)
        .where(eq(donorVersions.donorId, donorId))
        .orderBy(desc(donorVersions.version))
        .limit(1);
      const [version] = await tx
        .insert(donorVersions)
        .values({
          donorId,
          version: (last?.version ?? 0) + 1,
          campaignId: preview.campaignId,
          adSetId: preview.adSetId,
          adId: preview.adId,
          raw: preview.raw,
          normalized: preview.normalized,
          warnings: preview.warnings,
          createdBy: actor.id,
        })
        .returning({ id: donorVersions.id, version: donorVersions.version });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "DONOR_VERSION_CREATED",
        resourceId: donorId,
        metadata: {
          version: version.version,
          source: preview.source,
          accountId: preview.accountId,
        },
      });
      return { id: donorId, version: version.version };
    });
  }
  async list(actor: Actor | null) {
    requirePermission(actor, "workspace:read");
    const ids = await accessibleIds(this.db, actor, "account");
    if (ids?.length === 0) return [];
    const rows = await this.db
      .select({
        id: donors.id,
        name: donors.name,
        accountId: donors.accountId,
        accountName: adAccounts.name,
        source: donors.source,
        createdAt: donors.createdAt,
      })
      .from(donors)
      .innerJoin(adAccounts, eq(donors.accountId, adAccounts.id))
      .where(ids ? inArray(donors.accountId, ids) : undefined)
      .orderBy(desc(donors.createdAt));
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        versions: await this.db
          .select({
            id: donorVersions.id,
            version: donorVersions.version,
            campaignId: donorVersions.campaignId,
            adSetId: donorVersions.adSetId,
            adId: donorVersions.adId,
            createdAt: donorVersions.createdAt,
          })
          .from(donorVersions)
          .where(eq(donorVersions.donorId, row.id))
          .orderBy(desc(donorVersions.version)),
      })),
    );
  }
  async detail(actor: Actor | null, id: string) {
    requirePermission(actor, "workspace:read");
    const [row] = await this.db.select().from(donors).where(eq(donors.id, id));
    if (!row)
      throw new AppError(404, "DONOR_NOT_FOUND", "Không tìm thấy Donor.");
    await requireResource(this.db, actor, "account", row.accountId);
    return {
      ...row,
      versions: await this.db
        .select()
        .from(donorVersions)
        .where(eq(donorVersions.donorId, id))
        .orderBy(desc(donorVersions.version)),
    };
  }
}
