import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db";
import {
  commissionImports,
  commissionRows,
  commissionReviews,
  commissionHistory,
  trackingRecords,
  trackingLinkVersions,
  pages,
  auditLogs,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { accessibleIds, isAdmin } from "../meta/access";
import { mockEnabled } from "../meta/service";
import { seal } from "../meta/crypto";
import { ambiguousTrackingIds } from "./link-ambiguity";
import { AppError } from "../http/errors";
import {
  parseCommission,
  inspectCsv,
  moneyUnits,
  unitsMoney,
  type Candidate,
} from "./csv";
import { sha } from "./validation";
import { TrackingService } from "./tracking";
type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
const status = z.enum(["PENDING", "APPROVED", "PAID", "REJECTED"]);
const publicFields = {
  id: commissionRows.id,
  externalRowId: commissionRows.externalRowId,
  orderId: commissionRows.orderId,
  orderItemId: commissionRows.orderItemId,
  subId: commissionRows.subId,
  trackingId: commissionRows.trackingId,
  amount: commissionRows.amount,
  currency: commissionRows.currency,
  status: commissionRows.status,
  orderedAt: commissionRows.orderedAt,
  reportedAt: commissionRows.reportedAt,
  settledAt: commissionRows.settledAt,
  matchMethod: commissionRows.matchMethod,
  source: commissionRows.source,
  affiliateAccount: commissionRows.affiliateAccount,
  updatedAt: commissionRows.updatedAt,
};
function comparable(row: Candidate | typeof commissionRows.$inferSelect) {
  return JSON.stringify({
    subId: row.subId,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    orderedAt: row.orderedAt ? new Date(row.orderedAt).toISOString() : null,
    reportedAt: row.reportedAt ? new Date(row.reportedAt).toISOString() : null,
    settledAt: row.settledAt ? new Date(row.settledAt).toISOString() : null,
  });
}
export class CommissionService {
  constructor(private db: AppDatabase) {}
  async inspect(
    actor: Actor | null,
    buffer: Buffer,
    encoding: string,
    delimiter: string,
  ) {
    requirePermission(actor, "commissions:manage");
    const value = inspectCsv(buffer, encoding, delimiter);
    return {
      headers: value.headers,
      columns: value.columns,
      statuses: value.statuses,
      encoding: value.encoding,
      delimiter: value.delimiter,
      count: value.rows.length,
    };
  }
  async preview(
    actor: Actor | null,
    buffer: Buffer,
    filename: string,
    input: unknown,
  ) {
    requirePermission(actor, "commissions:manage");
    const parsed = parseCommission(buffer, input);
    if (parsed.options.source === "MOCK" && !mockEnabled())
      throw new AppError(
        403,
        "MOCK_DISABLED",
        "Bật chế độ thử nghiệm trước khi nhập báo cáo MOCK.",
      );
    const fingerprint = sha(buffer),
      previewFingerprint = sha(
        JSON.stringify({
          fingerprint,
          options: parsed.options,
          candidates: parsed.candidates,
        }),
      );
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847301)`);
      const [old] = await tx
        .select()
        .from(commissionImports)
        .where(
          and(
            eq(commissionImports.source, parsed.options.source),
            eq(
              commissionImports.affiliateAccount,
              parsed.options.affiliateAccount,
            ),
            eq(commissionImports.fingerprint, fingerprint),
          ),
        );
      if (old?.state === "APPLIED")
        return {
          id: old.id,
          applied: true,
          fingerprint: old.previewFingerprint,
          count: old.candidates.length,
          reviewCount: 0,
          samples: [],
          result: old.result,
        };
      const values = {
        source: parsed.options.source,
        affiliateAccount: parsed.options.affiliateAccount,
        fingerprint,
        previewFingerprint,
        filename,
        encoding: parsed.encoding,
        encryptedRaw: seal(buffer.toString("base64")),
        options: parsed.options as unknown as Record<string, unknown>,
        candidates: parsed.candidates as unknown as Record<string, unknown>[],
        createdBy: actor.id,
      };
      const [batch] = old
        ? await tx
            .update(commissionImports)
            .set(values)
            .where(eq(commissionImports.id, old.id))
            .returning()
        : await tx.insert(commissionImports).values(values).returning();
      return {
        id: batch.id,
        applied: false,
        fingerprint: previewFingerprint,
        count: parsed.candidates.length,
        reviewCount: parsed.candidates.filter((c) => c.reasons.length > 0)
          .length,
        samples: parsed.candidates.slice(0, 25),
        result: null,
      };
    });
  }
  private async apply(
    tx: Tx,
    actor: Actor,
    candidate: Candidate,
    batch: typeof commissionImports.$inferSelect,
    force = false,
    existingId?: string,
  ) {
    let [old] = existingId
      ? await tx
          .select()
          .from(commissionRows)
          .where(eq(commissionRows.id, existingId))
          .for("update")
      : await tx
          .select()
          .from(commissionRows)
          .where(
            and(
              eq(commissionRows.source, batch.source),
              eq(commissionRows.affiliateAccount, batch.affiliateAccount),
              eq(commissionRows.externalKey, candidate.externalKey!),
            ),
          )
          .for("update");
    if (!old && !existingId) {
      const base = and(
        eq(commissionRows.source, batch.source),
        eq(commissionRows.affiliateAccount, batch.affiliateAccount),
      );
      let related: (typeof commissionRows.$inferSelect)[] = [];
      if (candidate.externalRowId)
        related = await tx
          .select()
          .from(commissionRows)
          .where(
            and(
              base,
              eq(commissionRows.externalRowId, candidate.externalRowId),
            ),
          )
          .limit(3)
          .for("update");
      if (!related.length && candidate.orderId && candidate.orderItemId) {
        const rows = await tx
          .select()
          .from(commissionRows)
          .where(
            and(
              base,
              eq(commissionRows.orderId, candidate.orderId),
              eq(commissionRows.orderItemId, candidate.orderItemId),
            ),
          )
          .limit(3)
          .for("update");
        related = rows.filter(
          (row) =>
            !candidate.externalRowId ||
            !row.externalRowId ||
            row.externalRowId === candidate.externalRowId,
        );
      }
      if (related.length > 1) {
        if (force)
          throw new AppError(
            422,
            "REVIEW_IDENTITY",
            "Có nhiều dòng phù hợp. Chọn chính xác dòng đã có trước khi áp dụng.",
          );
        return "review";
      }
      if (related.length === 1) old = related[0];
    }
    const enriched =
      !!old &&
      ((!old.externalRowId && !!candidate.externalRowId) ||
        (!old.orderId && !!candidate.orderId) ||
        (!old.orderItemId && !!candidate.orderItemId));
    if (old) {
      if (
        !force &&
        [
          [old.orderId, candidate.orderId],
          [old.orderItemId, candidate.orderItemId],
          [old.externalRowId, candidate.externalRowId],
        ].some(([a, b]) => a && b && a !== b)
      )
        return "review";
      candidate = {
        ...candidate,
        externalRowId: candidate.externalRowId ?? old.externalRowId,
        orderId: candidate.orderId ?? old.orderId,
        orderItemId: candidate.orderItemId ?? old.orderItemId,
        orderedAt: candidate.orderedAt ?? old.orderedAt?.toISOString() ?? null,
        settledAt: candidate.settledAt ?? old.settledAt?.toISOString() ?? null,
      };
    }
    if (
      old &&
      (old.source !== batch.source ||
        old.affiliateAccount !== batch.affiliateAccount)
    )
      throw new AppError(
        422,
        "COMMISSION_NAMESPACE",
        "Không gộp dòng khác nguồn hoặc tài khoản Shopee.",
      );
    if (existingId && !old)
      throw new AppError(
        404,
        "COMMISSION_NOT_FOUND",
        "Không tìm thấy dòng đã chọn để đối soát.",
      );
    if (
      existingId &&
      candidate.externalKey &&
      old?.externalKey !== candidate.externalKey
    )
      throw new AppError(
        422,
        "COMMISSION_IDENTITY",
        "Không đổi định danh đáng tin cậy để gộp vào dòng khác.",
      );
    if (old && !force) {
      const same = comparable(old) === comparable(candidate);
      if (same && !enriched) return "duplicate";
      if (
        old.reportedAt &&
        candidate.reportedAt &&
        new Date(candidate.reportedAt) < old.reportedAt
      )
        return "stale";
      if (
        !same &&
        (!old.reportedAt ||
          !candidate.reportedAt ||
          new Date(candidate.reportedAt).getTime() === old.reportedAt.getTime())
      )
        return "review";
      if (old.subId !== candidate.subId || old.currency !== candidate.currency)
        return "review";
    }
    const [tracking] = await tx
      .select()
      .from(trackingRecords)
      .where(
        and(
          eq(trackingRecords.source, batch.source),
          eq(trackingRecords.affiliateAccount, batch.affiliateAccount),
          eq(trackingRecords.subId, candidate.subId),
        ),
      );
    const retainManual =
      old?.matchMethod === "MANUAL" && old.subId === candidate.subId;
    const values = {
      source: batch.source,
      affiliateAccount: batch.affiliateAccount,
      externalKey: old?.externalKey ?? candidate.externalKey!,
      externalRowId: candidate.externalRowId,
      orderId: candidate.orderId,
      orderItemId: candidate.orderItemId,
      subId: candidate.subId,
      trackingId: retainManual ? old!.trackingId : (tracking?.id ?? null),
      matchMethod: retainManual ? "MANUAL" : tracking ? "SUBID" : "UNMATCHED",
      amount: candidate.amount,
      currency: candidate.currency,
      status: candidate.status!,
      orderedAt: candidate.orderedAt ? new Date(candidate.orderedAt) : null,
      reportedAt: candidate.reportedAt ? new Date(candidate.reportedAt) : null,
      settledAt: candidate.settledAt ? new Date(candidate.settledAt) : null,
      importId: batch.id,
      updatedAt: new Date(),
    };
    const [saved] = old
      ? await tx
          .update(commissionRows)
          .set(values)
          .where(eq(commissionRows.id, old.id))
          .returning()
      : await tx.insert(commissionRows).values(values).returning();
    await tx.insert(commissionHistory).values({
      rowId: saved.id,
      importId: batch.id,
      action: force ? "MANUAL_REVIEW" : old ? "UPDATE" : "CREATE",
      before: (old as unknown as Record<string, unknown>) ?? null,
      after: saved as unknown as Record<string, unknown>,
      actorId: actor.id,
    });
    return old ? "updated" : "created";
  }
  async commit(actor: Actor | null, input: unknown) {
    requirePermission(actor, "commissions:manage");
    const value = z
      .object({
        id: z.string().uuid(),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(input);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847301)`);
      const [batch] = await tx
        .select()
        .from(commissionImports)
        .where(eq(commissionImports.id, value.id))
        .for("update");
      if (!batch)
        throw new AppError(404, "IMPORT_NOT_FOUND", "Không tìm thấy preview.");
      if (batch.state === "APPLIED")
        return {
          created: batch.result?.created ?? 0,
          updated: batch.result?.updated ?? 0,
          duplicate: batch.result?.duplicate ?? 0,
          stale: batch.result?.stale ?? 0,
          review: batch.result?.review ?? 0,
          duplicateFile: true,
        };
      if (batch.previewFingerprint !== value.fingerprint)
        throw new AppError(
          409,
          "PREVIEW_CHANGED",
          "Preview đã đổi. Đọc preview mới trước khi nhập.",
        );
      const result = {
        created: 0,
        updated: 0,
        duplicate: 0,
        stale: 0,
        review: 0,
      };
      for (const raw of batch.candidates) {
        const candidate = raw as unknown as Candidate;
        const outcome: keyof typeof result = candidate.reasons.length
          ? "review"
          : await this.apply(tx, actor, candidate, batch);
        if (outcome === "review")
          await tx.insert(commissionReviews).values({
            importId: batch.id,
            line: candidate.line,
            candidate: raw,
            reasons: candidate.reasons.length
              ? candidate.reasons
              : [
                  "Nội dung khác nhưng thiếu mốc cập nhật đáng tin cậy, đổi SubID/currency hoặc trùng revision. Cần đối chiếu thủ công.",
                ],
          });
        result[outcome]++;
      }
      await tx
        .update(commissionImports)
        .set({ state: "APPLIED", result })
        .where(eq(commissionImports.id, batch.id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "COMMISSION_IMPORTED",
        resourceId: batch.id,
        metadata: {
          ...result,
          source: batch.source,
          affiliateAccount: batch.affiliateAccount,
        },
      });
      return { ...result, duplicateFile: false };
    });
  }
  async imports(actor: Actor | null) {
    requirePermission(actor, "commissions:manage");
    return this.db
      .select({
        id: commissionImports.id,
        filename: commissionImports.filename,
        source: commissionImports.source,
        affiliateAccount: commissionImports.affiliateAccount,
        state: commissionImports.state,
        result: commissionImports.result,
        createdAt: commissionImports.createdAt,
      })
      .from(commissionImports)
      .orderBy(desc(commissionImports.createdAt))
      .limit(30);
  }
  async reviews(actor: Actor | null) {
    requirePermission(actor, "commissions:manage");
    return this.db
      .select({
        id: commissionReviews.id,
        importId: commissionReviews.importId,
        line: commissionReviews.line,
        candidate: commissionReviews.candidate,
        reasons: commissionReviews.reasons,
        source: commissionImports.source,
        affiliateAccount: commissionImports.affiliateAccount,
      })
      .from(commissionReviews)
      .innerJoin(
        commissionImports,
        eq(commissionImports.id, commissionReviews.importId),
      )
      .where(eq(commissionReviews.state, "OPEN"))
      .orderBy(commissionReviews.createdAt)
      .limit(100);
  }
  async resolve(actor: Actor | null, input: unknown) {
    requirePermission(actor, "commissions:manage");
    const value = z
      .object({
        id: z.string().uuid(),
        action: z.enum(["APPLY", "IGNORE"]),
        status: status.optional(),
        manualKey: z.string().trim().min(2).max(128).optional(),
        existingId: z.string().uuid().optional(),
        reason: z
          .string()
          .trim()
          .min(5, "Ghi lý do đối soát ít nhất 5 ký tự.")
          .max(500),
      })
      .strict()
      .refine(
        (v) => !v.manualKey || !v.existingId,
        "Chỉ chọn một định danh thủ công hoặc dòng đã có.",
      )
      .parse(input);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847301)`);
      const [review] = await tx
        .select()
        .from(commissionReviews)
        .where(eq(commissionReviews.id, value.id))
        .for("update");
      if (!review || review.state !== "OPEN")
        throw new AppError(
          409,
          "REVIEW_CLOSED",
          "Dòng đã được xử lý hoặc không tồn tại.",
        );
      const [batch] = await tx
        .select()
        .from(commissionImports)
        .where(eq(commissionImports.id, review.importId));
      if (value.action === "APPLY") {
        const candidate = review.candidate as unknown as Candidate;
        if (!value.status)
          throw new AppError(
            422,
            "REVIEW_STATUS",
            "Chọn trạng thái hoa hồng đã xác minh.",
          );
        candidate.status = value.status;
        if (!candidate.externalKey && !value.manualKey && !value.existingId)
          throw new AppError(
            422,
            "REVIEW_IDENTITY",
            "Nhập định danh dòng ổn định hoặc chọn dòng đã có; không dùng Order ID làm khóa nếu nhiều sản phẩm.",
          );
        candidate.externalKey =
          candidate.externalKey ??
          (value.manualKey
            ? sha(JSON.stringify(["manual", value.manualKey]))
            : null);
        await this.apply(tx, actor, candidate, batch, true, value.existingId);
      }
      await tx
        .update(commissionReviews)
        .set({
          state: value.action === "APPLY" ? "APPLIED" : "IGNORED",
          resolvedBy: actor.id,
          reason: value.reason,
        })
        .where(eq(commissionReviews.id, value.id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "COMMISSION_REVIEW_RESOLVED",
        resourceId: review.id,
        metadata: value,
      });
      return { ok: true };
    });
  }
  async list(actor: Actor | null, query: unknown) {
    requirePermission(actor, "finance:read");
    const value = z
      .object({
        source: z.enum(["LIVE", "MOCK"]).default("LIVE"),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        pageId: z.string().uuid().optional(),
        unmatched: z.enum(["true", "false"]).default("false"),
        search: z.string().max(128).default(""),
      })
      .parse(query);
    const ids = await accessibleIds(this.db, actor, "page"),
      accounts = await accessibleIds(this.db, actor, "account");
    if (value.unmatched === "true" && !isAdmin(actor))
      throw new AppError(
        403,
        "UNMATCHED_FORBIDDEN",
        "Chỉ quản trị viên xử lý dữ liệu chưa xác định Page.",
      );
    const all = await this.db
      .select({
        ...publicFields,
        pageId: trackingRecords.pageId,
        pageName: pages.name,
        channel: trackingRecords.channel,
        accountId: trackingRecords.accountId,
        adId: trackingRecords.adId,
        linkVersion: trackingRecords.linkVersion,
        urlHash: trackingLinkVersions.urlHash,
      })
      .from(commissionRows)
      .leftJoin(
        trackingRecords,
        eq(trackingRecords.id, commissionRows.trackingId),
      )
      .leftJoin(pages, eq(pages.id, trackingRecords.pageId))
      .leftJoin(
        trackingLinkVersions,
        and(
          eq(trackingLinkVersions.trackingId, trackingRecords.id),
          eq(trackingLinkVersions.version, trackingRecords.linkVersion),
        ),
      )
      .where(eq(commissionRows.source, value.source));
    const ambiguous = await ambiguousTrackingIds(this.db);
    const filtered = all
      .filter(
        (row) =>
          (ids === null || (!!row.pageId && ids.includes(row.pageId))) &&
          (row.channel !== "ADS" ||
            accounts === null ||
            (!!row.accountId && accounts.includes(row.accountId))) &&
          (!value.pageId || row.pageId === value.pageId) &&
          (value.unmatched !== "true" || !row.trackingId) &&
          (!value.search ||
            [row.subId, row.orderId, row.externalRowId].some((v) =>
              v?.toLowerCase().includes(value.search.toLowerCase()),
            )),
      )
      .map((row) => ({
        ...row,
        attribution: !row.trackingId
          ? "UNMATCHED"
          : row.channel === "SHARED" ||
              row.linkVersion === 0 ||
              (!!row.trackingId && ambiguous.has(row.trackingId))
            ? "SUBID_ONLY"
            : row.adId
              ? "AD"
              : "PAGE",
      }));
    const totals = new Map<string, bigint>();
    for (const row of filtered) {
      const key = `${row.currency}:${row.status}`;
      totals.set(key, (totals.get(key) ?? 0n) + moneyUnits(row.amount));
    }
    filtered.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
        a.id.localeCompare(b.id),
    );
    return {
      source: value.source,
      search: value.search,
      unmatched: value.unmatched,
      rows: filtered.slice((value.page - 1) * 25, value.page * 25),
      count: filtered.length,
      page: value.page,
      totals: [...totals].map(([key, units]) => {
        const [currency, status] = key.split(":");
        return { currency, status, amount: unitsMoney(units) };
      }),
    };
  }
  async detail(actor: Actor | null, id: string) {
    requirePermission(actor, "finance:read");
    const [row] = await this.db
      .select()
      .from(commissionRows)
      .where(eq(commissionRows.id, id));
    if (!row)
      throw new AppError(
        404,
        "COMMISSION_NOT_FOUND",
        "Không tìm thấy dòng hoa hồng.",
      );
    if (!isAdmin(actor)) {
      if (!row.trackingId)
        throw new AppError(
          403,
          "UNMATCHED_FORBIDDEN",
          "Dòng chưa có Page được cấp quyền.",
        );
      await new TrackingService(this.db).requireTracking(actor, row.trackingId);
    }
    const history = await this.db
      .select()
      .from(commissionHistory)
      .where(eq(commissionHistory.rowId, id))
      .orderBy(commissionHistory.createdAt);
    return { row, history };
  }
  async match(actor: Actor | null, input: unknown) {
    requirePermission(actor, "commissions:manage");
    const value = z
      .object({
        id: z.string().uuid(),
        trackingId: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(input);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847301)`);
      const [row] = await tx
        .select()
        .from(commissionRows)
        .where(eq(commissionRows.id, value.id))
        .for("update");
      const [tracking] = await tx
        .select()
        .from(trackingRecords)
        .where(eq(trackingRecords.id, value.trackingId));
      if (
        !row ||
        !tracking ||
        row.source !== tracking.source ||
        row.affiliateAccount !== tracking.affiliateAccount
      )
        throw new AppError(
          422,
          "MATCH_SOURCE",
          "Dòng và tracking phải cùng nguồn/tài khoản Shopee.",
        );
      const [saved] = await tx
        .update(commissionRows)
        .set({
          trackingId: tracking.id,
          matchMethod: "MANUAL",
          updatedAt: new Date(),
        })
        .where(eq(commissionRows.id, row.id))
        .returning();
      await tx.insert(commissionHistory).values({
        rowId: row.id,
        importId: row.importId,
        action: "MANUAL_MAP",
        before: row as unknown as Record<string, unknown>,
        after: saved as unknown as Record<string, unknown>,
        actorId: actor.id,
      });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "COMMISSION_MANUAL_MAPPED",
        resourceId: row.id,
        metadata: value,
      });
      return { ok: true };
    });
  }
}
