import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import type { AppDatabase } from "../db";
import {
  products,
  pages,
  trackingRecords,
  videoAssets,
  trackingLinkVersions,
  adsRequests,
  auditLogs,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { requireResource, accessibleIds } from "../meta/access";
import { mockEnabled } from "../meta/service";
import { DonorService } from "../donors/service";
import { ambiguousTrackingIds } from "./link-ambiguity";
import { AppError } from "../http/errors";
import {
  productInput,
  trackingInput,
  linkInput,
  shopeeUrl,
  newSubId,
  normalizeSubId,
  sha,
  csvCell,
} from "./validation";
export class TrackingService {
  constructor(private db: AppDatabase) {}
  async products(actor: Actor | null) {
    requirePermission(actor, "workspace:read");
    return this.db
      .select({
        id: products.id,
        name: products.name,
        url: products.url,
        niche: products.niche,
        active: products.active,
      })
      .from(products)
      .orderBy(products.name);
  }
  async createProduct(actor: Actor | null, input: unknown) {
    requirePermission(actor, "products:write");
    const value = productInput.parse(input),
      url = shopeeUrl(value.url);
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(products)
        .where(eq(products.url, url));
      if (existing)
        throw new AppError(
          409,
          "PRODUCT_EXISTS",
          "Sản phẩm URL này đã có trong danh mục.",
        );
      const [saved] = await tx
        .insert(products)
        .values({ ...value, url, createdBy: actor.id })
        .returning({ id: products.id });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "PRODUCT_CREATED",
        resourceId: saved.id,
        metadata: { name: value.name },
      });
      return saved;
    });
  }
  async create(actor: Actor | null, input: unknown) {
    requirePermission(actor, "tracking:write");
    const value = trackingInput.parse(input);
    if (value.channel !== "ORGANIC" && actor.role === "UPLOADER")
      throw new AppError(
        403,
        "ADS_TRACKING_FORBIDDEN",
        "Uploader chỉ tạo tracking Organic.",
      );
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, value.productId));
    if (!product || !product.active)
      throw new AppError(
        422,
        "PRODUCT_NOT_FOUND",
        "Chọn sản phẩm đang hoạt động.",
      );
    if(value.contentId){
      const [asset]=await this.db.select().from(videoAssets).where(eq(videoAssets.id,value.contentId));
      if(!asset||asset.state!=="READY"||value.pageIds.length!==1||asset.pageId!==value.pageIds[0]||(asset.productId&&asset.productId!==value.productId))throw new AppError(422,"TRACKING_CONTENT","Video/Product/Page không khớp tracking hoặc video chưa sẵn sàng.");
    }
    const pageList: (typeof pages.$inferSelect)[] = [];
    for (const id of value.pageIds) {
      await requireResource(this.db, actor, "page", id);
      const [page] = await this.db.select().from(pages).where(eq(pages.id, id));
      if (!page)
        throw new AppError(404, "PAGE_NOT_FOUND", "Không tìm thấy Page.");
      if (page.source === "MOCK" && !mockEnabled())
        throw new AppError(
          403,
          "MOCK_DISABLED",
          "Bật chế độ thử nghiệm ở máy chủ trước khi tạo tracking cho Page MOCK.",
        );
      if (value.channel === "ADS") {
        if (!page.primaryAccountId)
          throw new AppError(
            422,
            "TRACKING_ACCOUNT",
            "Page cần có TKQC chính trước khi chuẩn bị tracking Ads.",
          );
        await requireResource(this.db, actor, "account", page.primaryAccountId);
        if (value.adId)
          await new DonorService(this.db).preview(actor, {
            name: "Kiểm tra tracking",
            accountId: page.primaryAccountId,
            campaignId: value.campaignId,
            adSetId: value.adSetId,
            adId: value.adId,
          });
      }
      pageList.push(page);
    }
    return this.db.transaction(async (tx) => {
      const saved: (typeof trackingRecords.$inferSelect)[] = [];
      for (const page of pageList) {
        let row: typeof trackingRecords.$inferSelect | undefined;
        for (let retry = 0; retry < 5 && !row; retry++) {
          [row] = await tx
            .insert(trackingRecords)
            .values({
              pageId: page.id,
              accountId: value.channel === "ADS" ? page.primaryAccountId : null,
              productId: product.id,
              productUrl: product.url,
              source: page.source,
              affiliateAccount: value.affiliateAccount,
              subId: newSubId(page.code),
              channel: value.channel,
              contentRef: value.contentRef,
              contentId: value.contentId??null,
              campaignId: value.campaignId ?? null,
              adSetId: value.adSetId ?? null,
              adId: value.adId ?? null,
              createdBy: actor.id,
            })
            .onConflictDoNothing({ target: trackingRecords.subId })
            .returning();
        }
        if (!row)
          throw new AppError(
            503,
            "SUBID_COLLISION",
            "Chưa sinh được SubID duy nhất. Thử lại.",
          );
        saved.push(row);
      }
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "TRACKING_CREATED",
        resourceId: saved[0].id,
        metadata: { ids: saved.map((r) => r.id), channel: value.channel },
      });
      return saved.map((r) => ({
        id: r.id,
        subId: r.subId,
        pageId: r.pageId,
        source: r.source,
      }));
    });
  }
  async requireTracking(actor: Actor | null, id: string) {
    requirePermission(actor, "workspace:read");
    const [row] = await this.db
      .select()
      .from(trackingRecords)
      .where(eq(trackingRecords.id, id));
    if (!row)
      throw new AppError(
        404,
        "TRACKING_NOT_FOUND",
        "Không tìm thấy tracking record.",
      );
    await requireResource(this.db, actor, "page", row.pageId);
    if (row.channel === "ADS")
      await requireResource(this.db, actor, "account", row.accountId!);
    return row;
  }
  async list(actor: Actor | null, pageId?: string) {
    const ids = await accessibleIds(this.db, actor, "page"),
      accountIds = await accessibleIds(this.db, actor, "account");
    if (pageId) await requireResource(this.db, actor, "page", pageId);
    if (ids?.length === 0) return [];
    const rows = await this.db
      .select({
        id: trackingRecords.id,
        pageId: trackingRecords.pageId,
        pageName: pages.name,
        productName: products.name,
        productUrl: trackingRecords.productUrl,
        subId: trackingRecords.subId,
        channel: trackingRecords.channel,
        source: trackingRecords.source,
        affiliateAccount: trackingRecords.affiliateAccount,
        contentRef: trackingRecords.contentRef,
        contentId: trackingRecords.contentId,
        accountId: trackingRecords.accountId,
        campaignId: trackingRecords.campaignId,
        adSetId: trackingRecords.adSetId,
        adId: trackingRecords.adId,
        status: trackingRecords.status,
        linkVersion: trackingRecords.linkVersion,
        url: trackingLinkVersions.url,
        urlHash: trackingLinkVersions.urlHash,
        createdAt: trackingRecords.createdAt,
      })
      .from(trackingRecords)
      .innerJoin(pages, eq(pages.id, trackingRecords.pageId))
      .innerJoin(products, eq(products.id, trackingRecords.productId))
      .leftJoin(
        trackingLinkVersions,
        and(
          eq(trackingLinkVersions.trackingId, trackingRecords.id),
          eq(trackingLinkVersions.version, trackingRecords.linkVersion),
        ),
      )
      .where(
        and(
          ids ? inArray(trackingRecords.pageId, ids) : undefined,
          pageId ? eq(trackingRecords.pageId, pageId) : undefined,
        ),
      )
      .orderBy(desc(trackingRecords.createdAt))
      .limit(1000);
    const visible = rows.filter(
      (r) =>
        r.channel !== "ADS" ||
        accountIds === null ||
        accountIds.includes(r.accountId!),
    );
    const ambiguous = await ambiguousTrackingIds(this.db);
    return visible.map((r) => ({
      ...r,
      sharedLink: ambiguous.has(r.id),
      verification: r.url ? "USER_DECLARED" : "NOT_SUPPLIED",
    }));
  }
  async detail(actor: Actor | null, id: string) {
    const row = await this.requireTracking(actor, id);
    const versions = await this.db
      .select({
        id: trackingLinkVersions.id,
        version: trackingLinkVersions.version,
        url: trackingLinkVersions.url,
        confirmation: trackingLinkVersions.confirmation,
        createdAt: trackingLinkVersions.createdAt,
      })
      .from(trackingLinkVersions)
      .where(eq(trackingLinkVersions.trackingId, id))
      .orderBy(desc(trackingLinkVersions.version));
    return { ...row, versions };
  }
  async links(actor: Actor | null, input: unknown) {
    requirePermission(actor, "tracking:write");
    const values = z
      .array(linkInput)
      .min(1)
      .max(100)
      .refine(
        (v) => new Set(v.map((r) => r.trackingId)).size === v.length,
        "Một record chỉ xuất hiện một lần trong batch.",
      )
      .parse(input);
    for (const value of values) {
      const record = await this.requireTracking(actor, value.trackingId);
      if (actor.role === "UPLOADER" && record.channel !== "ORGANIC")
        throw new AppError(
          403,
          "ADS_TRACKING_FORBIDDEN",
          "Uploader không thay đổi tracking Ads/Shared.",
        );
      if (record.subId !== normalizeSubId(value.subId))
        throw new AppError(
          422,
          "LINK_SUBID",
          "SubID không khớp tracking record. Chưa lưu batch.",
        );
      shopeeUrl(value.url, true);
    }
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847300)`);
      let changed = 0;
      for (const value of values) {
        const [record] = await tx
          .select()
          .from(trackingRecords)
          .where(eq(trackingRecords.id, value.trackingId))
          .for("update");
        const url = shopeeUrl(value.url, true),
          hash = sha(url);
        const [previous] = await tx
          .select()
          .from(trackingLinkVersions)
          .where(
            and(
              eq(trackingLinkVersions.trackingId, record.id),
              eq(trackingLinkVersions.version, record.linkVersion),
            ),
          );
        if (previous?.url === url) continue;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(847307)`);
        const frozen=await tx.select({id:adsRequests.id}).from(adsRequests).where(and(eq(adsRequests.trackingId,record.id),eq(adsRequests.mode,'NEW_CREATIVE'),sql`${adsRequests.state}<>'CANCELLED'`)).limit(1);
        if(frozen.length)throw new AppError(409,'ADS_LINK_FROZEN','Link đã đóng băng trong Ads request. Dùng tracking mới cho link mới; chỉ hủy request chưa tạo đối tượng.');
        const version = record.linkVersion + 1;
        await tx.insert(trackingLinkVersions).values({
          trackingId: record.id,
          version,
          url,
          urlHash: hash,
          createdBy: actor.id,
        });
        await tx
          .update(trackingRecords)
          .set({ status: "READY", linkVersion: version })
          .where(eq(trackingRecords.id, record.id));
        await tx.insert(auditLogs).values({
          actorId: actor.id,
          action: "TRACKING_LINK_SAVED",
          resourceId: record.id,
          metadata: { version, confirmation: "USER_DECLARED" },
        });
        changed++;
      }
      return { changed };
    });
  }
  async importLinks(actor: Actor | null, buffer: Buffer) {
    requirePermission(actor, "tracking:write");
    let rows: Record<string, string>[];
    try {
      const raw: string[][] = parse(
        new TextDecoder("utf-8", { fatal: true }).decode(buffer),
        { bom: true, skip_empty_lines: true, max_record_size: 10000 },
      );
      const header = raw.shift();
      if (!header || header.join(",") !== "tracking_id,sub_id,affiliate_url")
        throw new Error("header");
      rows = raw.map((row) => {
        if (row.length !== 3) throw new Error("columns");
        return {
          trackingId: row[0].replace(/^'/, ""),
          subId: row[1].replace(/^'/, ""),
          url: row[2],
        };
      });
    } catch {
      throw new AppError(
        422,
        "LINK_CSV",
        "CSV UTF-8 cần cột tracking_id,sub_id,affiliate_url theo mẫu; ghép bằng ID, không theo thứ tự dòng.",
      );
    }
    return this.links(
      actor,
      rows.map((row) => ({ ...row, confirmed: true })),
    );
  }
  async export(actor: Actor | null, ids: string[]) {
    requirePermission(actor, "workspace:read");
    const records = await this.list(actor);
    if (
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => !records.some((r) => r.id === id))
    )
      throw new AppError(
        403,
        "EXPORT_SCOPE",
        "Chỉ xuất tối đa 100 tracking records bạn được cấp quyền.",
      );
    const header =
      "tracking_id,sub_id,product_url,content_ref,page_name,affiliate_account,source,channel,affiliate_url";
    return (
      "\uFEFF" +
      header +
      "\r\n" +
      ids
        .map((id) => {
          const r = records.find((r) => r.id === id)!;
          return [
            r.id,
            r.subId,
            r.productUrl,
            r.contentRef,
            r.pageName,
            r.affiliateAccount,
            r.source,
            r.channel,
            r.url ?? "",
          ]
            .map(csvCell)
            .join(",");
        })
        .join("\r\n")
    );
  }
}
