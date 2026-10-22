import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db";
import {
  metaConnections,
  oauthStates,
  pages,
  adAccounts,
  pageMappings,
  auditLogs,
  resourceGrants,
  users,
} from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { hashToken } from "../auth/password";
import { AppError } from "../http/errors";
import { seal, unseal, encryptionKey } from "./crypto";
import { metaConfigurationIssues } from "./config-status";
import { metaConfig, MetaGateway, requiredScopes } from "./gateway";
import { MockMetaProvider } from "./mock";
import { accessibleIds, requireResource } from "./access";
import type { Source, MetaInventory, MetaProvider } from "./types";
const stringId = z
  .string()
  .regex(/^\d+$/, "ID Meta phải là chuỗi chữ số.")
  .max(64);
export const selectionSchema = z
  .object({
    connectionId: z.string().uuid(),
    pageIds: z.array(stringId).min(1, "Chọn ít nhất một Page.").max(100),
    accountIds: z.array(stringId).max(100),
    mappings: z.record(z.string(), stringId.nullable()),
  })
  .strict();
const pageSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Page Code chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.",
      ),
    niche: z.string().trim().max(100),
    primaryAccountId: z.string().uuid().nullable(),
  })
  .strict();
export function mockEnabled() {
  return process.env.META_MOCK_ENABLED === "true";
}
export function providerFor(source: Source): MetaProvider {
  if (source === "MOCK") {
    if (!mockEnabled())
      throw new AppError(
        403,
        "MOCK_DISABLED",
        "Chế độ thử nghiệm chưa được bật ở máy chủ.",
      );
    return new MockMetaProvider();
  }
  return gateway;
}
export const gateway = new MetaGateway();
export function connectionConfig() {
  const issues = metaConfigurationIssues();
  let liveReady = false;
  try {
    metaConfig();
    encryptionKey();
    liveReady = true;
  } catch {
    /* Trả trạng thái cấu hình, không trả bí mật. */
  }
  return {
    liveReady: liveReady && issues.length === 0,
    issues,
    mockEnabled: mockEnabled(),
    encryptionReady: Boolean(
      process.env.TOKEN_ENCRYPTION_KEY?.match(/^[a-f0-9]{64}$/i),
    ),
  };
}
function publicInventory(
  row: typeof metaConnections.$inferSelect,
  inventory: MetaInventory,
) {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    expiresAt: row.expiresAt,
    checkedAt: row.checkedAt,
    scopes: row.scopes,
    pages: inventory.pages.map(({ id, name, tasks }) => ({ id, name, tasks })),
    accounts: inventory.accounts.map(
      ({
        account_id,
        name,
        currency,
        timezone_name,
        user_tasks,
        account_status,
      }) => ({
        id: account_id,
        name,
        currency,
        timezone: timezone_name,
        tasks: user_tasks ?? [],
        status: account_status,
      }),
    ),
  };
}
export class MetaService {
  constructor(
    private db: AppDatabase,
    private resolveProvider = providerFor,
  ) {}
  async begin(actor: Actor | null) {
    requirePermission(actor, "meta:manage");
    const config = metaConfig();
    encryptionKey();
    const state = randomBytes(32).toString("hex");
    await this.db.insert(oauthStates).values({
      hash: hashToken(state),
      actorId: actor.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const url = new URL(
      `https://www.facebook.com/${config.version}/dialog/oauth`,
    );
    Object.entries({
      client_id: config.appId,
      redirect_uri: config.redirect,
      state,
      scope: requiredScopes.join(","),
      response_type: "code",
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    return { url: url.toString() };
  }
  async consumeState(actor: Actor | null, state: string) {
    requirePermission(actor, "meta:manage");
    if (!/^[a-f0-9]{64}$/.test(state))
      throw new AppError(
        403,
        "OAUTH_STATE",
        "Phiên kết nối không hợp lệ. Bắt đầu kết nối lại.",
      );
    const [row] = await this.db
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.hash, hashToken(state)),
          eq(oauthStates.actorId, actor.id),
          gt(oauthStates.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row)
      throw new AppError(
        403,
        "OAUTH_STATE",
        "Phiên kết nối hết hạn, đã dùng hoặc không thuộc tài khoản này. Bắt đầu lại.",
      );
  }
  async callback(actor: Actor | null, state: string, code: string) {
    await this.consumeState(actor, state);
    if (!code || code.length > 4096)
      throw new AppError(
        422,
        "OAUTH_CODE",
        "Meta chưa trả mã xác thực hợp lệ.",
      );
    const result = await gateway.exchange(code);
    return this.capture(actor, "LIVE", result.token, result.expiresAt);
  }
  async mock(actor: Actor | null) {
    requirePermission(actor, "meta:manage");
    if (!mockEnabled())
      throw new AppError(
        403,
        "MOCK_DISABLED",
        "Chế độ thử nghiệm chưa được bật.",
      );
    return this.capture(
      actor,
      "MOCK",
      "mock-user-token",
      new Date(Date.now() + 86400000),
    );
  }
  async capture(
    actor: Actor | null,
    source: Source,
    token: string,
    expiresAt: Date,
  ) {
    requirePermission(actor, "meta:manage");
    encryptionKey();
    const inventory = await this.resolveProvider(source).inventory(
      token,
      expiresAt,
    );
    // Kiểm tra cấu trúc trước khi ghi; ID lớn luôn là string.
    z.object({
      user: z.object({ id: z.string(), name: z.string() }),
      pages: z.array(
        z.object({
          id: stringId,
          name: z.string(),
          access_token: z.string(),
          tasks: z.array(z.string()),
        }),
      ),
      accounts: z.array(
        z.object({
          account_id: stringId,
          name: z.string(),
          currency: z.string().regex(/^[A-Z]{3}$/),
          timezone_name: z.string(),
        }),
      ),
    }).parse(inventory);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847203)`);
      const [row] = await tx
        .insert(metaConnections)
        .values({
          actorId: actor.id,
          source,
          metaUserId: inventory.user.id,
          name: inventory.user.name,
          encryptedToken: seal(token),
          encryptedInventory: seal(JSON.stringify(inventory)),
          scopes: inventory.scopes,
          expiresAt,
          checkedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            metaConnections.actorId,
            metaConnections.source,
            metaConnections.metaUserId,
          ],
          set: {
            encryptedToken: seal(token),
            encryptedInventory: seal(JSON.stringify(inventory)),
            scopes: inventory.scopes,
            expiresAt,
            checkedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "META_CONNECTED",
        resourceId: row.id,
        metadata: {
          source,
          pageCount: inventory.pages.length,
          accountCount: inventory.accounts.length,
        },
      });
      // Kết nối lại không xóa mapping. Đánh dấu quyền cũ bị thu hồi.
      await tx
        .update(pages)
        .set({ status: "REVOKED", updatedAt: new Date() })
        .where(eq(pages.connectionId, row.id));
      await tx
        .update(adAccounts)
        .set({ status: "REVOKED", updatedAt: new Date() })
        .where(eq(adAccounts.connectionId, row.id));
      for (const page of inventory.pages)
        await tx
          .update(pages)
          .set({
            name: page.name,
            tasks: page.tasks,
            encryptedToken: seal(page.access_token),
            status: "AUTHORIZED",
            updatedAt: new Date(),
          })
          .where(
            and(eq(pages.connectionId, row.id), eq(pages.metaId, page.id)),
          );
      for (const account of inventory.accounts)
        await tx
          .update(adAccounts)
          .set({
            name: account.name,
            tasks: account.user_tasks ?? [],
            status: account.account_status === 1 ? "AUTHORIZED" : "INACTIVE",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(adAccounts.connectionId, row.id),
              eq(adAccounts.metaId, account.account_id),
            ),
          );
      return publicInventory(row, inventory);
    });
  }
  async connections(actor: Actor | null) {
    requirePermission(actor, "meta:manage");
    const rows = await this.db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.actorId, actor.id));
    return {
      config: connectionConfig(),
      connections: rows.map((row) =>
        publicInventory(row, JSON.parse(unseal(row.encryptedInventory))),
      ),
    };
  }
  async refresh(actor: Actor | null, id: string) {
    const row = await this.ownedConnection(actor, id);
    return this.capture(
      actor,
      row.source,
      unseal(row.encryptedToken),
      row.expiresAt,
    );
  }
  async ownedConnection(actor: Actor | null, id: string) {
    requirePermission(actor, "meta:manage");
    const [row] = await this.db
      .select()
      .from(metaConnections)
      .where(
        and(eq(metaConnections.id, id), eq(metaConnections.actorId, actor.id)),
      );
    if (!row)
      throw new AppError(
        404,
        "CONNECTION_NOT_FOUND",
        "Không tìm thấy kết nối của bạn.",
      );
    if (row.expiresAt <= new Date())
      throw new AppError(
        401,
        "META_TOKEN_EXPIRED",
        "Kết nối đã hết hạn. Kết nối lại trước khi tiếp tục.",
      );
    return row;
  }
  async complete(actor: Actor | null, input: unknown) {
    requirePermission(actor, "meta:manage");
    const value = selectionSchema.parse(input),
      connection = await this.ownedConnection(actor, value.connectionId);
    const inventory: MetaInventory = JSON.parse(
      unseal(connection.encryptedInventory),
    );
    if (Date.now() - connection.checkedAt.getTime() > 15 * 60 * 1000)
      throw new AppError(
        409,
        "INVENTORY_STALE",
        "Danh sách quyền đã cũ. Bấm làm mới quyền trước khi lưu.",
      );
    const pageIds = new Set(value.pageIds),
      accountIds = new Set(value.accountIds);
    if (
      [...pageIds].some((id) => !inventory.pages.some((p) => p.id === id)) ||
      [...accountIds].some(
        (id) => !inventory.accounts.some((a) => a.account_id === id),
      )
    )
      throw new AppError(
        422,
        "UNAUTHORIZED_SELECTION",
        "Có Page/TKQC không thuộc danh sách được Meta cấp quyền.",
      );
    if (
      Object.entries(value.mappings).some(
        ([pageId, accountId]) =>
          !pageIds.has(pageId) ||
          (accountId !== null && !accountIds.has(accountId)),
      )
    )
      throw new AppError(
        422,
        "INVALID_MAPPING",
        "Ánh xạ phải dùng Page và TKQC đã chọn. Không tự ghép tài khoản.",
      );
    if (
      Object.values(value.mappings).some(
        (id) =>
          id !== null &&
          inventory.accounts.find((a) => a.account_id === id)
            ?.account_status !== 1,
      )
    )
      throw new AppError(
        422,
        "INVALID_MAPPING",
        "Không ghép Page với TKQC không hoạt động.",
      );
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(847203)`);
      const [current] = await tx
        .select()
        .from(metaConnections)
        .where(eq(metaConnections.id, connection.id))
        .for("share");
      if (
        current.encryptedInventory !== connection.encryptedInventory ||
        current.expiresAt <= new Date()
      )
        throw new AppError(
          409,
          "INVENTORY_CHANGED",
          "Quyền kết nối đã thay đổi trong lúc thiết lập. Làm mới danh sách rồi chọn lại.",
        );
      const savedAccounts = new Map<string, string>();
      for (const account of inventory.accounts.filter((a) =>
        accountIds.has(a.account_id),
      )) {
        const [saved] = await tx
          .insert(adAccounts)
          .values({
            connectionId: connection.id,
            source: connection.source,
            metaId: account.account_id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezone_name,
            tasks: account.user_tasks ?? [],
            status: account.account_status === 1 ? "AUTHORIZED" : "INACTIVE",
          })
          .onConflictDoUpdate({
            target: [adAccounts.source, adAccounts.metaId],
            set: {
              connectionId: connection.id,
              name: account.name,
              currency: account.currency,
              timezone: account.timezone_name,
              tasks: account.user_tasks ?? [],
              status: account.account_status === 1 ? "AUTHORIZED" : "INACTIVE",
              updatedAt: new Date(),
            },
          })
          .returning();
        savedAccounts.set(account.account_id, saved.id);
      }
      for (const page of inventory.pages.filter((p) => pageIds.has(p.id))) {
        const [old] = await tx
          .select()
          .from(pages)
          .where(
            and(eq(pages.source, connection.source), eq(pages.metaId, page.id)),
          );
        const mappingSpecified = Object.hasOwn(value.mappings, page.id),
          mapped = value.mappings[page.id];
        const accountId = mappingSpecified
          ? mapped
            ? savedAccounts.get(mapped)!
            : null
          : (old?.primaryAccountId ?? null);
        const [saved] = await tx
          .insert(pages)
          .values({
            connectionId: connection.id,
            source: connection.source,
            metaId: page.id,
            name: page.name,
            code: `${connection.source.toLowerCase()}_${page.id}`,
            encryptedToken: seal(page.access_token),
            tasks: page.tasks,
            primaryAccountId: accountId,
            status: "AUTHORIZED",
          })
          .onConflictDoUpdate({
            target: [pages.source, pages.metaId],
            set: {
              connectionId: connection.id,
              name: page.name,
              encryptedToken: seal(page.access_token),
              tasks: page.tasks,
              primaryAccountId: accountId,
              status: "AUTHORIZED",
              updatedAt: new Date(),
            },
          })
          .returning();
        if (accountId !== (old?.primaryAccountId ?? null))
          await tx.insert(pageMappings).values({
            pageId: saved.id,
            previousAccountId: old?.primaryAccountId ?? null,
            accountId,
            actorId: actor.id,
          });
      }
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "META_SETUP_COMPLETED",
        resourceId: connection.id,
        metadata: {
          source: connection.source,
          pages: [...pageIds],
          accounts: [...accountIds],
          mappings: value.mappings,
        },
      });
      return { pageCount: pageIds.size, accountCount: accountIds.size };
    });
  }
  async listPages(actor: Actor | null) {
    const ids = await accessibleIds(this.db, actor, "page");
    if (ids?.length === 0) return [];
    const rows = await this.db
      .select({
        id: pages.id,
        metaId: pages.metaId,
        name: pages.name,
        code: pages.code,
        niche: pages.niche,
        source: pages.source,
        status: pages.status,
        primaryAccountId: pages.primaryAccountId,
        accountName: adAccounts.name,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .leftJoin(adAccounts, eq(pages.primaryAccountId, adAccounts.id))
      .where(ids ? inArray(pages.id, ids) : undefined)
      .orderBy(pages.name);
    const accountIds = await accessibleIds(this.db, actor, "account");
    return rows.map((row) =>
      accountIds !== null &&
      (!row.primaryAccountId || !accountIds.includes(row.primaryAccountId))
        ? { ...row, primaryAccountId: null, accountName: null }
        : row,
    );
  }
  async listAccounts(actor: Actor | null) {
    const ids = await accessibleIds(this.db, actor, "account");
    if (ids?.length === 0) return [];
    return this.db
      .select({
        id: adAccounts.id,
        metaId: adAccounts.metaId,
        name: adAccounts.name,
        currency: adAccounts.currency,
        timezone: adAccounts.timezone,
        source: adAccounts.source,
        status: adAccounts.status,
        tasks: adAccounts.tasks,
      })
      .from(adAccounts)
      .where(ids ? inArray(adAccounts.id, ids) : undefined)
      .orderBy(adAccounts.name);
  }
  async page(actor: Actor | null, id: string) {
    await requireResource(this.db, actor, "page", id);
    const [row] = await this.db.select().from(pages).where(eq(pages.id, id));
    if (!row) throw new AppError(404, "PAGE_NOT_FOUND", "Không tìm thấy Page.");
    const [connection] = await this.db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.id, row.connectionId));
    const accountVisible =
      row.primaryAccountId &&
      (await accessibleIds(this.db, actor, "account"))?.includes(
        row.primaryAccountId,
      );
    const admin = actor?.role === "OWNER" || actor?.role === "ADMIN";
    const account =
      row.primaryAccountId && (admin || accountVisible)
        ? (await this.listAccounts(actor)).find(
            (a) => a.id === row.primaryAccountId,
          )
        : null;
    const history = admin
      ? await this.db
          .select({
            id: pageMappings.id,
            previousAccountId: pageMappings.previousAccountId,
            accountId: pageMappings.accountId,
            createdAt: pageMappings.createdAt,
          })
          .from(pageMappings)
          .where(eq(pageMappings.pageId, id))
          .orderBy(pageMappings.createdAt)
      : [];
    return {
      id: row.id,
      metaId: row.metaId,
      name: row.name,
      code: row.code,
      niche: row.niche,
      source: row.source,
      status: row.status,
      publishSettings: row.publishSettings,
      account: account ?? null,
      history,
      health: {
        token:
          connection.expiresAt > new Date()
            ? "Còn hạn theo lần xác thực gần nhất"
            : "Hết hạn — cần kết nối lại",
        checkedAt: connection.checkedAt,
        api:
          row.status === "AUTHORIZED"
            ? "Đã đọc thành công ở lần kiểm tra gần nhất"
            : "Quyền chưa sẵn sàng",
        pageRead:
          row.status === "AUTHORIZED" &&
          connection.expiresAt > new Date() &&
          connection.scopes.includes("pages_read_engagement"),
        publishing:
          row.status === "AUTHORIZED" &&
          connection.expiresAt > new Date() &&
          connection.scopes.includes("pages_manage_posts") &&
          row.tasks.includes("CREATE_CONTENT"),
        adsRead:
          connection.scopes.includes("ads_read") ||
          connection.scopes.includes("ads_management"),
        adsManage: connection.scopes.includes("ads_management"),
        guidance:
          "Quyền được đọc từ API; chưa thử đăng bài hoặc tạo Ads. Nếu thiếu quyền: kiểm tra Page tasks, App Review và kết nối lại.",
      },
    };
  }
  async updatePage(actor: Actor | null, id: string, input: unknown) {
    requirePermission(actor, "meta:manage");
    const value = pageSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(pages)
        .where(eq(pages.id, id))
        .for("update");
      if (!row)
        throw new AppError(404, "PAGE_NOT_FOUND", "Không tìm thấy Page.");
      if (value.primaryAccountId) {
        const [account] = await tx
          .select()
          .from(adAccounts)
          .where(eq(adAccounts.id, value.primaryAccountId));
        if (
          !account ||
          account.source !== row.source ||
          account.status !== "AUTHORIZED"
        )
          throw new AppError(
            422,
            "INVALID_MAPPING",
            "TKQC phải cùng nguồn dữ liệu và có quyền truy cập.",
          );
      }
      const duplicate = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.code, value.code));
      if (duplicate.some((p) => p.id !== id))
        throw new AppError(
          409,
          "PAGE_CODE_CONFLICT",
          "Page Code đã được sử dụng.",
        );
      await tx
        .update(pages)
        .set({ ...value, updatedAt: new Date() })
        .where(eq(pages.id, id));
      if (value.primaryAccountId !== row.primaryAccountId)
        await tx.insert(pageMappings).values({
          pageId: id,
          previousAccountId: row.primaryAccountId,
          accountId: value.primaryAccountId,
          actorId: actor.id,
        });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "PAGE_UPDATED",
        resourceId: id,
        metadata: {
          before: {
            code: row.code,
            niche: row.niche,
            primaryAccountId: row.primaryAccountId,
          },
          after: value,
        },
      });
      return { id };
    });
  }
  async grants(actor: Actor | null) {
    requirePermission(actor, "meta:manage");
    return {
      grants: await this.db.select().from(resourceGrants),
      members: await this.db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.active, true)),
    };
  }
  async grant(actor: Actor | null, input: unknown) {
    requirePermission(actor, "meta:manage");
    const value = z
      .object({
        userId: z.string().uuid(),
        pageId: z.string().uuid().nullable(),
        accountId: z.string().uuid().nullable(),
        enabled: z.boolean(),
      })
      .strict()
      .refine(
        (v) => (v.pageId === null) !== (v.accountId === null),
        "Chọn đúng một Page hoặc TKQC.",
      )
      .parse(input);
    return this.db.transaction(async (tx) => {
      if (
        value.pageId &&
        !(await tx.select().from(pages).where(eq(pages.id, value.pageId)))[0]
      )
        throw new AppError(404, "PAGE_NOT_FOUND", "Không tìm thấy Page.");
      if (
        value.accountId &&
        !(
          await tx
            .select()
            .from(adAccounts)
            .where(eq(adAccounts.id, value.accountId))
        )[0]
      )
        throw new AppError(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy TKQC.");
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, value.userId))
        .for("update");
      if (!user || !user.active)
        throw new AppError(
          422,
          "USER_NOT_FOUND",
          "Nhân viên không tồn tại hoặc bị khóa.",
        );
      const where = and(
        eq(resourceGrants.userId, value.userId),
        value.pageId
          ? eq(resourceGrants.pageId, value.pageId)
          : eq(resourceGrants.accountId, value.accountId!),
      );
      await tx.delete(resourceGrants).where(where);
      if (value.enabled)
        await tx.insert(resourceGrants).values({
          userId: value.userId,
          pageId: value.pageId,
          accountId: value.accountId,
        });
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "RESOURCE_GRANT_CHANGED",
        resourceId: value.userId,
        metadata: value,
      });
      return { ok: true };
    });
  }
}
