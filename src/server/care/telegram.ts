import { and, eq, gte, lte, sql, desc, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { AppDatabase } from "../db";
import { requirePermission, type Actor } from "../auth/policy";
import {
  telegramSettings,
  notificationJobs,
  users,
  auditLogs,
  adsRequests,
  publishJobs,
  commissionImports,
  commissionRows,
  pages,
} from "../database/schema";
import { seal, unseal } from "../meta/crypto";
import { AppError } from "../http/errors";
import { telegramSchema } from "./validation";
export interface TelegramProvider {
  test(token: string, chatId: string): Promise<void>;
  send(token: string, chatId: string, text: string): Promise<string>;
}
export class TelegramGateway implements TelegramProvider {
  constructor(private fetcher: typeof fetch = fetch) {}
  private async call(
    token: string,
    method: "getMe" | "sendMessage",
    body: Record<string, string>,
  ) {
    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch {
      throw new AppError(
        504,
        "TELEGRAM_UNKNOWN",
        "Kết quả Telegram chưa xác định; không tự gửi lại.",
      );
    }
    const data = await response.json().catch(() => null);
    if (response.status === 429)
      throw new AppError(
        429,
        "TELEGRAM_RATE",
        "Telegram yêu cầu chờ.",
        Math.min(
          3600,
          Math.max(1, Number(data?.parameters?.retry_after) || 60),
        ),
      );
    if (response.status >= 500 || (response.ok && !data))
      throw new AppError(
        504,
        "TELEGRAM_UNKNOWN",
        "Kết quả Telegram chưa xác định; kiểm tra chat.",
      );
    if (!response.ok || data?.ok !== true)
      throw new AppError(
        422,
        "TELEGRAM_REJECTED",
        "Telegram từ chối: kiểm tra Bot Token, Chat ID và quyền gửi.",
      );
    return data.result;
  }
  async test(token: string, chatId: string) {
    await this.call(token, "getMe", {});
    await this.send(
      token,
      chatId,
      "Kiểm tra kết nối Affiliate Ads Command Center.",
    );
  }
  async send(token: string, chatId: string, text: string) {
    const r = await this.call(token, "sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: "true",
    });
    if (!Number.isSafeInteger(r?.message_id))
      throw new AppError(504, "TELEGRAM_UNKNOWN", "Chưa có Message ID hợp lệ.");
    return String(r.message_id);
  }
}
export class TelegramService {
  constructor(
    private db: AppDatabase,
    private provider: TelegramProvider = new TelegramGateway(),
  ) {}
  private async config() {
    return (
      await this.db
        .select()
        .from(telegramSettings)
        .where(eq(telegramSettings.id, "global"))
    )[0];
  }
  async read(actor: Actor | null) {
    requirePermission(actor, "settings:write");
    const c = await this.config();
    return c
      ? {
          chatId: c.chatId,
          enabled: c.enabled,
          events: c.events,
          cooldownMinutes: c.cooldownMinutes,
          version: c.version,
          configured: true,
        }
      : {
          chatId: "",
          enabled: false,
          events: [],
          cooldownMinutes: 60,
          configured: false,
        };
  }
  async save(actor: Actor | null, input: unknown) {
    requirePermission(actor, "settings:write");
    const v = telegramSchema.parse(input);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(910019)`);
      const old = (
        await tx
          .select()
          .from(telegramSettings)
          .where(eq(telegramSettings.id, "global"))
      )[0];
      if (!v.token && !old)
        throw new AppError(
          422,
          "TELEGRAM_TOKEN",
          "Cần Bot Token để cấu hình lần đầu.",
        );
      const encryptedToken = v.token ? seal(v.token) : old!.encryptedToken;
      await tx
        .insert(telegramSettings)
        .values({
          id: "global",
          encryptedToken,
          chatId: v.chatId,
          enabled: v.enabled,
          events: v.events,
          cooldownMinutes: v.cooldownMinutes,
          updatedBy: actor.id,
        })
        .onConflictDoUpdate({
          target: telegramSettings.id,
          set: {
            encryptedToken,
            chatId: v.chatId,
            enabled: v.enabled,
            events: v.events,
            cooldownMinutes: v.cooldownMinutes,
            version: (old?.version ?? 0) + 1,
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
      await tx
        .insert(auditLogs)
        .values({
          actorId: actor.id,
          action: "TELEGRAM_CONFIGURED",
          resourceId: "global",
          metadata: { enabled: v.enabled, events: v.events },
        });
    });
    return this.read(actor);
  }
  async test(actor: Actor | null) {
    requirePermission(actor, "settings:write");
    const c = await this.config();
    if (!c)
      throw new AppError(422, "TELEGRAM_CONFIG", "Chưa cấu hình Telegram.");
    await this.provider.test(unseal(c.encryptedToken), c.chatId);
    await this.db
      .insert(auditLogs)
      .values({
        actorId: actor.id,
        action: "TELEGRAM_TESTED",
        resourceId: "global",
        metadata: {},
      });
    return { tested: true };
  }
  async jobs(actor: Actor | null) {
    requirePermission(actor, "settings:write");
    return this.db
      .select({
        id: notificationJobs.id,
        event: notificationJobs.event,
        state: notificationJobs.state,
        errorCode: notificationJobs.errorCode,
        messageId: notificationJobs.messageId,
        createdAt: notificationJobs.createdAt,
      })
      .from(notificationJobs)
      .orderBy(desc(notificationJobs.createdAt))
      .limit(100);
  }
  async retry(actor: Actor | null, id: string) {
    requirePermission(actor, "settings:write");
    const c = await this.config();
    if (!c?.enabled)
      throw new AppError(422, "TELEGRAM_CONFIG", "Telegram đang tắt.");
    const rows = await this.db
      .update(notificationJobs)
      .set({ state: "QUEUED", availableAt: new Date(), errorCode: null })
      .where(
        and(
          eq(notificationJobs.id, id),
          eq(notificationJobs.state, "FAILED"),
          eq(notificationJobs.configVersion, c.version),
        ),
      )
      .returning({ id: notificationJobs.id });
    if (!rows.length)
      throw new AppError(
        409,
        "NOTIFICATION_RETRY",
        "Chỉ retry lỗi chắc chắn FAILED với cấu hình hiện tại. UNKNOWN/SENDING cần kiểm tra chat.",
      );
    return rows[0];
  }
  async enqueue(
    event: string,
    resourceId: string,
    key: string,
    text: string,
    now = new Date(),
  ) {
    const c = await this.config();
    if (!c?.enabled || !c.events.includes(event)) return;
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram:${event}:${resourceId}`},0))`,
      );
      const recent = await tx
        .select({ id: notificationJobs.id })
        .from(notificationJobs)
        .where(
          and(
            eq(notificationJobs.event, event),
            eq(notificationJobs.resourceId, resourceId),
            gte(
              notificationJobs.createdAt,
              new Date(now.getTime() - c.cooldownMinutes * 60000),
            ),
          ),
        )
        .limit(1);
      if (recent.length) {
        await tx
          .insert(notificationJobs)
          .values({
            key,
            event,
            resourceId,
            text: text.slice(0, 3500),
            configVersion: c.version,
            state: "CANCELLED",
            errorCode: "COOLDOWN",
            createdAt: now,
            availableAt: now,
          })
          .onConflictDoNothing({ target: notificationJobs.key });
        return;
      }
      await tx
        .insert(notificationJobs)
        .values({
          key,
          event,
          resourceId,
          text: text.slice(0, 3500),
          configVersion: c.version,
          createdAt: now,
          availableAt: now,
        })
        .onConflictDoNothing({ target: notificationJobs.key });
    });
  }
  async scanEvents(now = new Date()) {
    const c = await this.config();
    if (!c?.enabled) return;
    const since = new Date(
      Math.max(c.createdAt.getTime(), now.getTime() - 86400000),
    );
    const unseen = (event: string, id: AnyPgColumn, time: AnyPgColumn) =>
      sql`NOT EXISTS (SELECT 1 FROM notification_jobs WHERE key=${event}||':'||${id}||':'||floor(extract(epoch FROM ${time})*1000)::bigint::text)`;
    const groups = [
      {
        event: "ADS_FAILED",
        rows: await this.db
          .select({ id: adsRequests.id, time: adsRequests.updatedAt })
          .from(adsRequests)
          .where(
            and(
              eq(adsRequests.state, "FAILED"),
              gte(adsRequests.updatedAt, since),
              unseen("ADS_FAILED", adsRequests.id, adsRequests.updatedAt),
            ),
          )
          .orderBy(adsRequests.updatedAt)
          .limit(100),
      },
      {
        event: "PUBLISH_FAILED",
        rows: await this.db
          .select({ id: publishJobs.id, time: publishJobs.updatedAt })
          .from(publishJobs)
          .where(
            and(
              eq(publishJobs.state, "FAILED"),
              gte(publishJobs.updatedAt, since),
              unseen("PUBLISH_FAILED", publishJobs.id, publishJobs.updatedAt),
            ),
          )
          .orderBy(publishJobs.updatedAt)
          .limit(100),
      },
      {
        event: "SHOPEE_IMPORTED",
        rows: await this.db
          .select({
            id: commissionImports.id,
            time: commissionImports.createdAt,
          })
          .from(commissionImports)
          .where(
            and(
              eq(commissionImports.state, "APPLIED"),
              gte(commissionImports.createdAt, since),
              unseen(
                "SHOPEE_IMPORTED",
                commissionImports.id,
                commissionImports.createdAt,
              ),
            ),
          )
          .orderBy(commissionImports.createdAt)
          .limit(100),
      },
      {
        event: "UNMATCHED_SUBID",
        rows: await this.db
          .select({ id: commissionRows.id, time: commissionRows.updatedAt })
          .from(commissionRows)
          .where(
            and(
              sql`${commissionRows.trackingId} IS NULL`,
              gte(commissionRows.updatedAt, since),
              unseen(
                "UNMATCHED_SUBID",
                commissionRows.id,
                commissionRows.updatedAt,
              ),
            ),
          )
          .orderBy(commissionRows.updatedAt)
          .limit(100),
      },
      {
        event: "PAGE_DISCONNECTED",
        rows: await this.db
          .select({ id: pages.id, time: pages.updatedAt })
          .from(pages)
          .where(
            and(
              inArray(pages.status, ["REVOKED", "DISCONNECTED", "EXPIRED"]),
              gte(pages.updatedAt, since),
              unseen("PAGE_DISCONNECTED", pages.id, pages.updatedAt),
            ),
          )
          .orderBy(pages.updatedAt)
          .limit(100),
      },
    ];
    for (const g of groups)
      for (const row of g.rows)
        await this.enqueue(
          g.event,
          row.id,
          `${g.event}:${row.id}:${row.time.getTime()}`,
          `AACC · ${g.event}\nBản ghi: ${row.id}\nMở ứng dụng để xem chi tiết và nguồn LIVE/MOCK.`,
          now,
        );
  }
  async tick(now = new Date()) {
    // Không gửi lại request có thể đã đến Telegram trước khi worker crash.
    await this.db
      .update(notificationJobs)
      .set({
        state: "UNKNOWN",
        errorCode: "WORKER_INTERRUPTED",
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationJobs.state, "SENDING"),
          lte(notificationJobs.updatedAt, new Date(now.getTime() - 60000)),
        ),
      );
    const c = await this.config();
    if (!c?.enabled) return;
    const actor = (
      await this.db.select().from(users).where(eq(users.id, c.updatedBy))
    )[0];
    if (!actor?.active || !["OWNER", "ADMIN"].includes(actor.role)) return;
    const due = await this.db
      .select()
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.state, "QUEUED"),
          lte(notificationJobs.availableAt, now),
        ),
      )
      .limit(10);
    for (const job of due) {
      const [claim] = await this.db
        .update(notificationJobs)
        .set({ state: "SENDING", updatedAt: now })
        .where(
          and(
            eq(notificationJobs.id, job.id),
            eq(notificationJobs.state, "QUEUED"),
          ),
        )
        .returning();
      if (!claim) continue;
      const current = await this.config();
      if (
        !current?.enabled ||
        current.version !== job.configVersion ||
        !current.events.includes(job.event)
      ) {
        await this.db
          .update(notificationJobs)
          .set({ state: "CANCELLED", updatedAt: new Date() })
          .where(eq(notificationJobs.id, job.id));
        continue;
      }
      try {
        const messageId = await this.provider.send(
          unseal(current.encryptedToken),
          current.chatId,
          job.text,
        );
        await this.db
          .update(notificationJobs)
          .set({ state: "SENT", messageId, updatedAt: new Date() })
          .where(eq(notificationJobs.id, job.id));
      } catch (e) {
        const error =
          e instanceof AppError
            ? e
            : new AppError(504, "TELEGRAM_UNKNOWN", "Kết quả chưa xác định.");
        const rate = error.status === 429;
        await this.db
          .update(notificationJobs)
          .set({
            state: rate
              ? "QUEUED"
              : error.code === "TELEGRAM_UNKNOWN"
                ? "UNKNOWN"
                : "FAILED",
            availableAt: new Date(Date.now() + (error.retryAfter ?? 60) * 1000),
            errorCode: error.code,
            updatedAt: new Date(),
          })
          .where(eq(notificationJobs.id, job.id));
      }
    }
  }
}
