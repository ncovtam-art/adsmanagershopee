import { and, eq, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { AppDatabase } from "../db";
import { requirePermission, type Actor } from "../auth/policy";
import { accessibleIds, requireResource, isAdmin } from "../meta/access";
import {
  careRules,
  careRuns,
  careAlerts,
  carePauses,
  adAccounts,
  metaConnections,
  users,
  auditLogs,
  trackingRecords,
  commissionImports,
} from "../database/schema";
import { AnalyticsService } from "../analytics/service";
import { localDay, micros, ratio } from "../analytics/engine";
import { AppError } from "../http/errors";
import { unseal } from "../meta/crypto";
import { ruleSchema, ruleHash, financialRule, matches } from "./validation";
import { pauseProvider, type PauseContext } from "./provider";
import { TelegramService } from "./telegram";
type Rule = typeof careRules.$inferSelect;
const allowedWarnings = new Set([
  "CSV_DECLARED",
  "MANUAL_MAPPING",
  "PARTIAL_PAGE_SCOPE",
  "REACH_NON_ADDITIVE",
]);
export class CareService {
  constructor(
    private db: AppDatabase,
    private analytics = new AnalyticsService(db),
    private providers = pauseProvider,
    private telegram = new TelegramService(db),
  ) {}
  private async account(actor: Actor | null, id: string) {
    requirePermission(actor, "finance:read");
    await requireResource(this.db, actor, "account", id);
    const a = (
      await this.db.select().from(adAccounts).where(eq(adAccounts.id, id))
    )[0];
    if (!a)
      throw new AppError(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy TKQC.");
    return a;
  }
  private async rule(actor: Actor | null, id: string, write = false) {
    z.string().uuid().parse(id);
    requirePermission(actor, write ? "ads:write" : "finance:read");
    const r = (
      await this.db.select().from(careRules).where(eq(careRules.id, id))
    )[0];
    if (!r) throw new AppError(404, "CARE_NOT_FOUND", "Không tìm thấy rule.");
    await this.account(actor, r.accountId);
    if (write && r.createdBy !== actor.id && !isAdmin(actor))
      throw new AppError(
        403,
        "CARE_OWNER",
        "Chỉ tác giả hoặc quản trị viên được sửa rule.",
      );
    return r;
  }
  async list(actor: Actor | null) {
    requirePermission(actor, "finance:read");
    const ids = await accessibleIds(this.db, actor, "account");
    if (ids?.length === 0) return { rules: [], alerts: [], pauses: [] };
    const rules = await this.db
      .select()
      .from(careRules)
      .where(ids ? inArray(careRules.accountId, ids) : undefined)
      .orderBy(desc(careRules.createdAt))
      .limit(100);
    const ruleIds = rules.map((r) => r.id);
    const allowedPages = await accessibleIds(this.db, actor, "page");
    const alerts = ruleIds.length
      ? await this.db
          .select()
          .from(careAlerts)
          .where(inArray(careAlerts.ruleId, ruleIds))
          .orderBy(desc(careAlerts.createdAt))
          .limit(100)
      : [];
    const visible = alerts.filter((a) =>
      this.evidenceAllowed(a.payload, allowedPages),
    );
    const visibleIds = new Set(visible.map((a) => a.id));
    const pauses = ruleIds.length
      ? await this.db
          .select()
          .from(carePauses)
          .where(inArray(carePauses.ruleId, ruleIds))
          .orderBy(desc(carePauses.createdAt))
          .limit(100)
      : [];
    return {
      rules,
      alerts: visible,
      pauses:
        allowedPages === null
          ? pauses
          : pauses.filter((p) => visibleIds.has(p.alertId)),
    };
  }
  private evidenceAllowed(
    item: Record<string, unknown>,
    allowed: string[] | null,
  ) {
    const ids = item.pageIds as string[] | undefined;
    return (
      allowed === null ||
      (!!ids?.length && ids.every((id) => allowed.includes(id)))
    );
  }
  async save(actor: Actor | null, input: unknown, id?: string) {
    requirePermission(actor, "ads:write");
    const v = ruleSchema.parse(input),
      a = await this.account(actor, v.accountId);
    if (a.source !== v.source)
      throw new AppError(422, "SOURCE_MISMATCH", "Rule và TKQC khác nguồn.");
    if (v.actions.includes("AUTO_PAUSE") && !isAdmin(actor))
      throw new AppError(
        403,
        "CARE_AUTO_ADMIN",
        "Auto Pause cần OWNER/ADMIN có phạm vi toàn TKQC.",
      );
    if (id) {
      const old = await this.rule(actor, id, true);
      if (old.accountId !== v.accountId || old.source !== v.source)
        throw new AppError(
          422,
          "CARE_IDENTITY",
          "Tạo rule mới để đổi TKQC/nguồn.",
        );
    }
    return this.db.transaction(async (tx) => {
      const values = {
        name: v.name,
        config: v,
        configHash: ruleHash(v),
        enabled: false,
        autoEnabled: false,
        dryRunId: null,
        updatedAt: new Date(),
      };
      const [r] = id
        ? await tx
            .update(careRules)
            .set(values)
            .where(eq(careRules.id, id))
            .returning()
        : await tx
            .insert(careRules)
            .values({
              ...values,
              accountId: v.accountId,
              source: v.source,
              createdBy: actor.id,
            })
            .returning();
      await tx
        .insert(auditLogs)
        .values({
          actorId: actor.id,
          action: id ? "CARE_RULE_UPDATED" : "CARE_RULE_CREATED",
          resourceId: r.id,
          metadata: { configHash: r.configHash, autoEnabled: false },
        });
      return r;
    });
  }
  async evaluate(actor: Actor, r: Rule, now = new Date()) {
    const account = await this.account(actor, r.accountId),
      v = r.config;
    const today = localDay(now, account.timezone);
    const until = new Date(Date.parse(today) - 86400000)
        .toISOString()
        .slice(0, 10),
      since = new Date(Date.parse(today) - v.windowDays * 86400000)
        .toISOString()
        .slice(0, 10);
    const report = await this.analytics.report(actor, {
      source: r.source,
      accountId: r.accountId,
      since,
      until,
      mode: "cohort",
      level: v.level,
    });
    let financeFresh = true;
    if (financialRule(v)) {
      const records = await this.db
        .select({ account: trackingRecords.affiliateAccount })
        .from(trackingRecords)
        .where(
          and(
            eq(trackingRecords.accountId, r.accountId),
            eq(trackingRecords.source, r.source),
          ),
        );
      const namespaces = [...new Set(records.map((t) => t.account))];
      for (const namespace of namespaces) {
        const [recent] = await this.db
          .select()
          .from(commissionImports)
          .where(
            and(
              eq(commissionImports.source, r.source),
              eq(commissionImports.affiliateAccount, namespace),
              eq(commissionImports.state, "APPLIED"),
            ),
          )
          .orderBy(desc(commissionImports.createdAt))
          .limit(1);
        if (
          !recent ||
          now.getTime() - recent.createdAt.getTime() > v.maxAgeMinutes * 60000
        )
          financeFresh = false;
      }
      if (!namespaces.length) financeFresh = false;
    }
    const items = report.rows.map((row) => {
      const values: Record<string, string | null> = {
        spend: row.spend,
        cpc: row.cpc,
        ctr: row.ctr,
        cpm: row.cpm,
        linkClicks: row.linkClicks,
        lpv: row.lpv,
        costPerLpv:
          row.lpv === null
            ? null
            : ratio(micros(row.spend), BigInt(row.lpv) * 1000000n),
        estimatedCommission: row.estimatedCommission,
        realizedCommission: row.realizedCommission,
        estimatedRoas: row.estimatedRoas,
        realizedRoas: row.realizedRoas,
        estimatedProfit: row.estimatedProfit,
        realizedProfit: row.realizedProfit,
      };
      const blockers: string[] = [];
      if (
        report.coverage.present !== report.coverage.expected ||
        report.coverage.expected === 0
      )
        blockers.push("MISSING_SPEND");
      if (
        !row.lastSyncedAt ||
        now.getTime() - Date.parse(row.lastSyncedAt) > v.maxAgeMinutes * 60000
      )
        blockers.push("STALE_DATA");
      if (
        row.quality.some((f) =>
          ["MISSING_SPEND", "PARTIAL_DAY", "STALE_DATA"].includes(f),
        )
      )
        blockers.push("INCOMPLETE_INSIGHTS");
      for (const condition of v.conditions)
        if (values[condition.metric] === null)
          blockers.push(`MISSING_${condition.metric}`);
      if (financialRule(v)) {
        blockers.push(...row.quality.filter((f) => !allowedWarnings.has(f)));
        if (
          !v.financialAcknowledged ||
          !v.commissionCompleteThrough ||
          v.commissionCompleteThrough < until
        )
          blockers.push("COMMISSION_COVERAGE_NOT_ACKNOWLEDGED");
        if (!financeFresh) blockers.push("STALE_COMMISSION");
      }
      const autoBlockers = [...blockers];
      if (v.maxAgeMinutes > 60) autoBlockers.push("AUTO_MAX_AGE_60_MIN");
      if (row.providers.some((p) => p !== "API"))
        autoBlockers.push("AUTO_API_REQUIRED");
      if (!isAdmin(actor))
        autoBlockers.push("AUTO_FULL_ACCOUNT_SCOPE_REQUIRED");
      if (
        !row.statuses.every((s) => s === "ACTIVE") ||
        row.statuses.length === 0
      )
        autoBlockers.push("AUTO_ACTIVE_REQUIRED");
      const matched = matches(v.conditions, values);
      return {
        objectId: row.key,
        name: row.name,
        pageIds: row.pageIds,
        campaignId: row.campaignId,
        adSetId: row.adSetId,
        values,
        quality: row.quality,
        blockers: [...new Set(blockers)],
        autoBlockers: [...new Set(autoBlockers)],
        conditionMatched: matched,
        matched: matched && blockers.length === 0,
      };
    });
    const policyHash = createHash("sha256")
      .update(
        JSON.stringify({
          estimatedStatuses: report.policy?.estimatedStatuses,
          mappingAcknowledged: report.policy?.mappingAcknowledged,
          otherCostPerDay: report.policy?.otherCostPerDay,
        }),
      )
      .digest("hex");
    return {
      since,
      until,
      currency: account.currency,
      source: r.source,
      coverage: report.coverage,
      policyHash,
      items,
    };
  }
  async dryRun(actor: Actor | null, id: string) {
    const r = await this.rule(actor, id, true);
    requirePermission(actor, "ads:write");
    const result = await this.evaluate(actor, r);
    const [run] = await this.db
      .insert(careRuns)
      .values({
        ruleId: r.id,
        configHash: r.configHash,
        dryRun: true,
        state: "DRY_RUN",
        result,
        actorId: actor.id,
      })
      .returning();
    await this.db
      .insert(auditLogs)
      .values({
        actorId: actor.id,
        action: "CARE_DRY_RUN",
        resourceId: r.id,
        metadata: {
          runId: run.id,
          matched: result.items.filter((i) => i.matched).length,
        },
      });
    return run;
  }
  async control(actor: Actor | null, input: unknown) {
    const v = z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean(),
        autoEnabled: z.boolean().default(false),
        confirmAutoPause: z.boolean().default(false),
      })
      .strict()
      .parse(input);
    const r = await this.rule(actor, v.id, true);
    requirePermission(actor, "ads:write");
    if (v.autoEnabled) {
      if (
        !v.enabled ||
        !v.confirmAutoPause ||
        !isAdmin(actor) ||
        !r.config.actions.includes("AUTO_PAUSE")
      )
        throw new AppError(
          422,
          "CARE_AUTO_CONFIRM",
          "Auto Pause cần rule bật, OWNER/ADMIN và xác nhận rõ.",
        );
      const [dry] = await this.db
        .select()
        .from(careRuns)
        .where(
          and(
            eq(careRuns.ruleId, r.id),
            eq(careRuns.dryRun, true),
            eq(careRuns.actorId, actor.id),
            eq(careRuns.configHash, r.configHash),
          ),
        )
        .orderBy(desc(careRuns.createdAt))
        .limit(1);
      if (!dry || Date.now() - dry.createdAt.getTime() > 86400000)
        throw new AppError(
          409,
          "CARE_DRY_RUN_REQUIRED",
          "Chạy Dry Run mới với cấu hình hiện tại trước khi bật Auto Pause.",
        );
      const evidence = await this.evaluate(actor, r);
      const oldItems = dry.result.items as
        | Array<{ autoBlockers: string[] }>
        | undefined;
      if (
        dry.result.policyHash !== evidence.policyHash ||
        !oldItems?.length ||
        oldItems.some((i) => i.autoBlockers.length) ||
        !evidence.items.length ||
        evidence.items.some((i) => i.autoBlockers.length)
      )
        throw new AppError(
          409,
          "CARE_DATA_GUARD",
          "Dry Run hoặc dữ liệu hiện tại chưa đủ điều kiện Auto Pause.",
        );
      return this.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(careRules)
          .set({
            enabled: true,
            autoEnabled: true,
            dryRunId: dry.id,
            nextRunAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(eq(careRules.id, r.id), eq(careRules.configHash, r.configHash)),
          )
          .returning();
        if (!updated)
          throw new AppError(
            409,
            "CARE_CHANGED",
            "Rule đã thay đổi, chạy Dry Run lại.",
          );
        await tx
          .insert(auditLogs)
          .values({
            actorId: actor.id,
            action: "CARE_AUTO_ARMED",
            resourceId: r.id,
            metadata: { dryRunId: dry.id },
          });
        return updated;
      });
    }
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(careRules)
        .set({
          enabled: v.enabled,
          autoEnabled: false,
          dryRunId: null,
          nextRunAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(careRules.id, r.id))
        .returning();
      await tx
        .insert(auditLogs)
        .values({
          actorId: actor.id,
          action: "CARE_RULE_CONTROLLED",
          resourceId: r.id,
          metadata: { enabled: v.enabled, autoEnabled: false },
        });
      return updated;
    });
  }
  async history(actor: Actor | null, id: string) {
    await this.rule(actor, id);
    const allowed = await accessibleIds(this.db, actor, "page");
    const runs = await this.db
      .select()
      .from(careRuns)
      .where(eq(careRuns.ruleId, id))
      .orderBy(desc(careRuns.createdAt))
      .limit(50);
    return runs.map((run) => ({
      ...run,
      result: {
        ...run.result,
        items: ((run.result.items ?? []) as Record<string, unknown>[]).filter(
          (i) => this.evidenceAllowed(i, allowed),
        ),
      },
    }));
  }
  async review(actor: Actor | null, id: string) {
    z.string().uuid().parse(id);
    requirePermission(actor, "ads:write");
    const alert = (
      await this.db.select().from(careAlerts).where(eq(careAlerts.id, id))
    )[0];
    if (!alert)
      throw new AppError(404, "CARE_ALERT", "Không tìm thấy cảnh báo.");
    await this.rule(actor, alert.ruleId, true);
    if (
      !this.evidenceAllowed(
        alert.payload,
        await accessibleIds(this.db, actor, "page"),
      )
    )
      throw new AppError(
        403,
        "RESOURCE_FORBIDDEN",
        "Quyền Page của cảnh báo đã bị thu hồi.",
      );
    return this.db.transaction(async (tx) => {
      const [r] = await tx
        .update(careAlerts)
        .set({
          state: "REVIEWED",
          reviewedBy: actor.id,
          reviewedAt: new Date(),
        })
        .where(eq(careAlerts.id, id))
        .returning();
      await tx
        .insert(auditLogs)
        .values({
          actorId: actor.id,
          action: "CARE_ALERT_REVIEWED",
          resourceId: id,
          metadata: {},
        });
      return r;
    });
  }
  private async context(
    actor: Actor,
    r: Rule,
    object: { objectId: string; campaignId: string; adSetId: string | null },
  ): Promise<PauseContext> {
    if (!isAdmin(actor))
      throw new AppError(403, "CARE_AUTO_ADMIN", "Auto Pause cần OWNER/ADMIN.");
    const a = await this.account(actor, r.accountId);
    const c = (
      await this.db
        .select()
        .from(metaConnections)
        .where(eq(metaConnections.id, a.connectionId))
    )[0];
    if (
      a.source !== r.source ||
      a.status !== "AUTHORIZED" ||
      !a.tasks.some((t) => ["MANAGE", "ADVERTISE"].includes(t)) ||
      !c ||
      c.source !== r.source ||
      c.expiresAt.getTime() <= Date.now() ||
      !c.scopes.includes("ads_management")
    )
      throw new AppError(
        403,
        "CARE_API_PERMISSION",
        "Kết nối/quyền ads_management/TKQC chưa hợp lệ.",
      );
    return {
      token: unseal(c.encryptedToken),
      accountMetaId: a.metaId,
      id: object.objectId,
      level: r.config.level,
      campaignId: object.campaignId,
      adSetId: object.adSetId,
    };
  }
  private async pause(
    actor: Actor,
    r: Rule,
    alert: typeof careAlerts.$inferSelect,
    item: { objectId: string; campaignId: string; adSetId: string | null },
  ) {
    const [op] = await this.db
      .insert(carePauses)
      .values({
        ruleId: r.id,
        alertId: alert.id,
        accountId: r.accountId,
        source: r.source,
        level: r.config.level,
        objectId: item.objectId,
        state: "CHECKING",
        actorId: actor.id,
      })
      .onConflictDoNothing()
      .returning();
    if (!op) return;
    const finish = async (state: string, errorCode: string | null = null) =>
      this.db.transaction(async (tx) => {
        await tx
          .update(carePauses)
          .set({ state, errorCode, updatedAt: new Date() })
          .where(eq(carePauses.id, op.id));
        await tx
          .insert(auditLogs)
          .values({
            actorId: actor.id,
            action: "CARE_PAUSE_" + state,
            resourceId: op.id,
            metadata: { objectId: item.objectId, source: r.source, errorCode },
          });
      });
    let sent = false;
    try {
      const current = await this.rule(actor, r.id, true),
        freshActor = (
          await this.db.select().from(users).where(eq(users.id, actor.id))
        )[0];
      if (
        !freshActor?.active ||
        !isAdmin(freshActor) ||
        !current.enabled ||
        !current.autoEnabled ||
        current.configHash !== r.configHash ||
        !current.dryRunId
      )
        throw new AppError(
          409,
          "CARE_DISABLED",
          "Rule/quyền đã đổi trước khi dừng.",
        );
      const dry = (
        await this.db
          .select()
          .from(careRuns)
          .where(eq(careRuns.id, current.dryRunId))
      )[0];
      if (!dry?.dryRun || dry.configHash !== r.configHash)
        throw new AppError(
          409,
          "CARE_DRY_RUN_REQUIRED",
          "Dry Run không còn hợp lệ.",
        );
      const fresh = await this.evaluate(freshActor, current);
      const candidate = fresh.items.find((i) => i.objectId === item.objectId);
      if (
        (financialRule(current.config) &&
          dry.result.policyHash !== fresh.policyHash) ||
        !candidate?.matched ||
        candidate.autoBlockers.length
      )
        throw new AppError(
          409,
          "CARE_DATA_GUARD",
          "Dữ liệu/quy tắc không còn đủ điều kiện.",
        );
      const ctx = await this.context(freshActor, current, candidate),
        provider = this.providers(r.source);
      const status = await provider.inspect(ctx);
      if (status === "PAUSED") {
        await finish("VERIFIED");
        return;
      }
      const [sendClaim] = await this.db
        .update(carePauses)
        .set({ state: "SENDING", updatedAt: new Date() })
        .where(
          and(
            eq(carePauses.id, op.id),
            eq(carePauses.state, "CHECKING"),
            sql`EXISTS (SELECT 1 FROM care_rules WHERE id=${r.id} AND enabled=true AND auto_enabled=true AND config_hash=${r.configHash})`,
            sql`EXISTS (SELECT 1 FROM users WHERE id=${actor.id} AND active=true AND role IN ('OWNER','ADMIN'))`,
          ),
        )
        .returning({ id: carePauses.id });
      if (!sendClaim)
        throw new AppError(
          409,
          "CARE_DISABLED",
          "Rule hoặc quyền đã thay đổi trước mutation.",
        );
      sent = true;
      await provider.pause(ctx);
      if ((await provider.inspect(ctx)) !== "PAUSED")
        throw new AppError(
          504,
          "CARE_UNKNOWN",
          "Chưa xác minh trạng thái PAUSED.",
        );
      await finish("VERIFIED");
      await this.telegram.enqueue(
        "AUTO_PAUSE",
        item.objectId,
        `pause:${op.id}`,
        `AACC · ${r.source} · Auto Pause ${r.config.level}\nID: ${item.objectId}\nĐã xác minh PAUSED.`,
      );
    } catch (e) {
      const code = e instanceof AppError ? e.code : "CARE_UNKNOWN";
      await finish(sent ? "UNKNOWN" : "BLOCKED", code);
    }
  }
  async recover(actor: Actor | null, id: string) {
    z.string().uuid().parse(id);
    requirePermission(actor, "settings:write");
    const op = (
      await this.db.select().from(carePauses).where(eq(carePauses.id, id))
    )[0];
    if (!op) throw new AppError(404, "CARE_PAUSE", "Không tìm thấy thao tác.");
    const r = await this.rule(actor, op.ruleId, true);
    if (op.state !== "UNKNOWN")
      throw new AppError(
        409,
        "CARE_RECOVERY",
        "Chỉ đọc xác minh thao tác UNKNOWN; không gửi lại.",
      );
    const alert = (
      await this.db
        .select()
        .from(careAlerts)
        .where(eq(careAlerts.id, op.alertId))
    )[0];
    const item = alert.payload as unknown as {
      objectId: string;
      campaignId: string;
      adSetId: string | null;
    };
    const ctx = await this.context(actor, r, item);
    if ((await this.providers(op.source).inspect(ctx)) !== "PAUSED")
      throw new AppError(
        409,
        "CARE_RECOVERY_ACTIVE",
        "Đối tượng chưa PAUSED; kiểm tra Ads Manager, không tự gửi lại.",
      );
    await this.db.transaction(async (tx) => {
      await tx
        .update(carePauses)
        .set({ state: "VERIFIED", errorCode: null, updatedAt: new Date() })
        .where(eq(carePauses.id, id));
      await tx
        .insert(auditLogs)
        .values({
          actorId: actor.id,
          action: "CARE_PAUSE_RECOVERED",
          resourceId: id,
          metadata: { source: op.source, objectId: op.objectId },
        });
    });
    return { verified: true };
  }
  async execute(actor: Actor, r: Rule, now = new Date()) {
    const result = await this.evaluate(actor, r);
    const inserted = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care:${r.id}`},0))`,
      );
      const [freshActor] = await tx
        .select()
        .from(users)
        .where(eq(users.id, actor.id));
      requirePermission(freshActor ?? null, "ads:write");
      const [current] = await tx
        .select()
        .from(careRules)
        .where(eq(careRules.id, r.id));
      if (!current?.enabled || current.configHash !== r.configHash) return [];
      const [run] = await tx
        .insert(careRuns)
        .values({
          ruleId: r.id,
          configHash: r.configHash,
          dryRun: false,
          state: "EVALUATED",
          result,
          actorId: actor.id,
          createdAt: now,
        })
        .returning();
      const alerts = [];
      for (const item of result.items.filter((i) => i.matched)) {
        const recent = await tx
          .select({ id: careAlerts.id })
          .from(careAlerts)
          .where(
            and(
              eq(careAlerts.ruleId, r.id),
              eq(careAlerts.objectId, item.objectId),
              gte(
                careAlerts.createdAt,
                new Date(now.getTime() - r.config.cooldownMinutes * 60000),
              ),
            ),
          )
          .limit(1);
        if (recent.length) continue;
        const [alert] = await tx
          .insert(careAlerts)
          .values({
            ruleId: r.id,
            runId: run.id,
            objectId: item.objectId,
            type: r.config.actions.includes("WINNER")
              ? "WINNER"
              : r.config.actions.includes("REVIEW")
                ? "REVIEW"
                : "ALERT",
            payload: item,
            createdAt: now,
          })
          .returning();
        alerts.push({ alert, item });
        await tx
          .insert(auditLogs)
          .values({
            actorId: actor.id,
            action: "CARE_ALERT_CREATED",
            resourceId: alert.id,
            metadata: { ruleId: r.id, type: alert.type, source: r.source },
          });
      }
      return alerts;
    });
    for (const { alert, item } of inserted) {
      if (r.config.actions.includes("TELEGRAM")) {
        const event =
          alert.type === "WINNER"
            ? "WINNER"
            : r.config.conditions.some(
                  (c) => /Roas/.test(c.metric) && ["LT", "LTE"].includes(c.op),
                )
              ? "LOW_ROAS"
              : r.config.conditions.some(
                    (c) => c.metric === "spend" && ["GT", "GTE"].includes(c.op),
                  )
                ? "SPEND_THRESHOLD"
                : "CAMPAIGN_ISSUE";
        await this.telegram.enqueue(
          event,
          item.objectId,
          `alert:${alert.id}`,
          `AACC · ${r.source} · ${alert.type}\nRule: ${r.name}\n${item.name} (${item.objectId})\nMở ứng dụng để xem dữ liệu/ngưỡng.`,
          now,
        );
      }
      if (
        r.autoEnabled &&
        r.config.actions.includes("AUTO_PAUSE") &&
        item.autoBlockers.length === 0
      )
        await this.pause(actor, r, alert, item);
    }
    return result;
  }
  async tick(now = new Date()) {
    await this.db
      .update(carePauses)
      .set({
        state: "UNKNOWN",
        errorCode: "WORKER_INTERRUPTED",
        updatedAt: now,
      })
      .where(
        and(
          inArray(carePauses.state, ["CHECKING", "SENDING"]),
          lte(carePauses.updatedAt, new Date(now.getTime() - 120000)),
        ),
      );
    const due = await this.db
      .select()
      .from(careRules)
      .where(and(eq(careRules.enabled, true), lte(careRules.nextRunAt, now)))
      .orderBy(careRules.nextRunAt)
      .limit(100);
    for (const r of due) {
      const [claim] = await this.db
        .update(careRules)
        .set({ nextRunAt: new Date(now.getTime() + 60000) })
        .where(
          and(
            eq(careRules.id, r.id),
            eq(careRules.enabled, true),
            lte(careRules.nextRunAt, now),
          ),
        )
        .returning();
      if (!claim) continue;
      const actor = (
        await this.db.select().from(users).where(eq(users.id, r.createdBy))
      )[0];
      try {
        requirePermission(actor ?? null, "ads:write");
        await this.execute(actor, r, now);
      } catch (e) {
        await this.db
          .insert(careRuns)
          .values({
            ruleId: r.id,
            configHash: r.configHash,
            dryRun: false,
            state: "BLOCKED",
            result: { code: e instanceof AppError ? e.code : "CARE_ERROR" },
            actorId: r.createdBy,
            createdAt: now,
          });
      }
    }
  }
}
