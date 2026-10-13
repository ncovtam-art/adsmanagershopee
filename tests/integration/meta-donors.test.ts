import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connectTestDatabase, clearTestDatabase } from "../helpers";
import { AuthService } from "../../src/server/auth/service";
import { TeamService } from "../../src/server/team/service";
import { MetaService } from "../../src/server/meta/service";
import { DonorService } from "../../src/server/donors/service";
import { MetaImportService } from "../../src/server/meta/import";
import { MockMetaProvider, MOCK_IDS } from "../../src/server/meta/mock";
import {
  metaConnections,
  pages,
  adAccounts,
  pageMappings,
  donors,
  donorVersions,
  auditLogs,
  oauthStates,
} from "../../src/server/database/schema";
import { hashToken } from "../../src/server/auth/password";
import { unseal } from "../../src/server/meta/crypto";
import { AppError } from "../../src/server/http/errors";
import type { Actor } from "../../src/server/auth/policy";
import type { Connection } from "../../src/components/meta/types";
const connection = connectTestDatabase(),
  db = connection.db,
  meta = new MetaService(db),
  donor = new DonorService(db),
  imports = new MetaImportService(db),
  auth = new AuthService(db);
const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.code === expected;
let owner: Actor,
  buyer: Actor,
  viewer: Actor,
  inventory: Connection,
  firstPage: typeof pages.$inferSelect,
  account: typeof adAccounts.$inferSelect,
  secondAccount: typeof adAccounts.$inferSelect,
  donorId: string;
process.env.META_MOCK_ENABLED = "true";
const input = () => ({
  name: "Donor Integration",
  accountId: account.id,
  campaignId: MOCK_IDS.campaign,
  adSetId: MOCK_IDS.adSet,
  adId: MOCK_IDS.ad,
});
before(async () => {
  await clearTestDatabase(connection);
  const password = randomBytes(24).toString("hex");
  owner = await auth.createOwner({
    name: "Chủ sở hữu Meta Test",
    email: "owner@meta.test",
    password,
    workspaceName: "Meta Test",
  });
  const team = new TeamService(db);
  buyer = await team.create(owner, {
    name: "Media Buyer Test",
    email: "buyer@meta.test",
    password,
    role: "MEDIA_BUYER",
  });
  viewer = await team.create(owner, {
    name: "Viewer Test",
    email: "viewer@meta.test",
    password,
    role: "VIEWER",
  });
});
after(async () => {
  await connection.pool.end();
});
test("OAuth state chỉ dùng một lần, bind actor, từ chối state sai/hết hạn", async () => {
  const state = randomBytes(32).toString("hex");
  await db.insert(oauthStates).values({
    hash: hashToken(state),
    actorId: owner.id,
    expiresAt: new Date(Date.now() + 60000),
  });
  await assert.rejects(
    meta.consumeState({ ...owner, id: buyer.id }, state),
    code("OAUTH_STATE"),
  );
  await meta.consumeState(owner, state);
  await assert.rejects(meta.consumeState(owner, state), code("OAUTH_STATE"));
  const expired = randomBytes(32).toString("hex");
  await db.insert(oauthStates).values({
    hash: hashToken(expired),
    actorId: owner.id,
    expiresAt: new Date(0),
  });
  await assert.rejects(meta.consumeState(owner, expired), code("OAUTH_STATE"));
});
test("Mock cần bật rõ, thiếu quyền không thể kết nối; token/inventory mã hóa và response an toàn", async () => {
  process.env.META_MOCK_ENABLED = "false";
  await assert.rejects(meta.mock(owner), code("MOCK_DISABLED"));
  process.env.META_MOCK_ENABLED = "true";
  await assert.rejects(meta.mock(viewer), code("FORBIDDEN"));
  inventory = await meta.mock(owner);
  assert.equal(inventory.source, "MOCK");
  const [stored] = await db.select().from(metaConnections);
  assert(!stored.encryptedToken.includes("mock-user-token"));
  assert.equal(unseal(stored.encryptedToken), "mock-user-token");
  assert(
    !JSON.stringify(await meta.connections(owner)).includes("mock-page-token"),
  );
});
test("Wizard chặn ID ngoài inventory hoặc mapping TKQC chưa chọn, rollback", async () => {
  const before = (await db.select().from(pages)).length;
  await assert.rejects(
    meta.complete(owner, {
      connectionId: inventory.id,
      pageIds: ["1"],
      accountIds: [],
      mappings: {},
    }),
    code("UNAUTHORIZED_SELECTION"),
  );
  await assert.rejects(
    meta.complete(owner, {
      connectionId: inventory.id,
      pageIds: [inventory.pages[0].id],
      accountIds: [],
      mappings: { [inventory.pages[0].id]: MOCK_IDS.account },
    }),
    code("INVALID_MAPPING"),
  );
  assert.equal((await db.select().from(pages)).length, before);
});
test("Bulk Page/TKQC lưu ID string, chỉ mapping xác nhận và không sinh số tài chính", async () => {
  const result = await meta.complete(owner, {
    connectionId: inventory.id,
    pageIds: inventory.pages.map((p) => p.id),
    accountIds: inventory.accounts.map((a) => a.id),
    mappings: { [inventory.pages[0].id]: MOCK_IDS.account },
  });
  assert.equal(result.pageCount, 2);
  [firstPage] = await db
    .select()
    .from(pages)
    .where(eq(pages.metaId, inventory.pages[0].id));
  [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.metaId, MOCK_IDS.account));
  [secondAccount] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.metaId, inventory.accounts[1].id));
  assert.equal(firstPage.primaryAccountId, account.id);
  assert.equal(
    (
      await db
        .select()
        .from(pages)
        .where(eq(pages.metaId, inventory.pages[1].id))
    )[0].primaryAccountId,
    null,
  );
  assert.equal(account.metaId, MOCK_IDS.account);
  assert.equal(
    (await meta.page(owner, firstPage.id)).publishSettings.enabled,
    false,
  );
  assert.equal((await db.select().from(pageMappings)).length, 1);
});
test("Chạy lại wizard giữ Page Code, niche và mapping khi không yêu cầu đổi", async () => {
  await meta.updatePage(owner, firstPage.id, {
    code: "giadung",
    niche: "Gia dụng",
    primaryAccountId: account.id,
  });
  await meta.complete(owner, {
    connectionId: inventory.id,
    pageIds: [firstPage.metaId],
    accountIds: [MOCK_IDS.account],
    mappings: {},
  });
  const detail = await meta.page(owner, firstPage.id);
  assert.equal(detail.code, "giadung");
  assert.equal(detail.niche, "Gia dụng");
  assert.equal(detail.account?.id, account.id);
  assert.equal(detail.history.length, 1);
});
test("Đổi mapping lưu lịch sử trước/sau, không nhận TKQC không tồn tại", async () => {
  await meta.updatePage(owner, firstPage.id, {
    code: "giadung",
    niche: "Gia dụng",
    primaryAccountId: secondAccount.id,
  });
  let detail = await meta.page(owner, firstPage.id);
  assert.equal(detail.history.length, 2);
  assert.equal(detail.history[1].previousAccountId, account.id);
  assert.equal(detail.history[1].accountId, secondAccount.id);
  await assert.rejects(
    meta.updatePage(owner, firstPage.id, {
      code: "giadung",
      niche: "Gia dụng",
      primaryAccountId: randomBytes(16).toString("hex"),
    }),
    (error) => !(error instanceof AppError),
  );
  await meta.updatePage(owner, firstPage.id, {
    code: "giadung",
    niche: "Gia dụng",
    primaryAccountId: account.id,
  });
  detail = await meta.page(owner, firstPage.id);
  assert.equal(detail.history.length, 3);
});
test("RBAC tài nguyên: list rỗng, workspace/Donor đoán ID bị chặn, grant Page không lộ TKQC", async () => {
  assert.deepEqual(await meta.listPages(viewer), []);
  assert.deepEqual(await meta.listAccounts(buyer), []);
  await assert.rejects(
    meta.page(viewer, firstPage.id),
    code("RESOURCE_FORBIDDEN"),
  );
  await assert.rejects(
    donor.preview(buyer, input()),
    code("RESOURCE_FORBIDDEN"),
  );
  await meta.grant(owner, {
    userId: viewer.id,
    pageId: firstPage.id,
    accountId: null,
    enabled: true,
  });
  const rows = await meta.listPages(viewer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].primaryAccountId, null);
  assert.equal(rows[0].accountName, null);
  assert.equal((await meta.page(viewer, firstPage.id)).account, null);
  await meta.grant(owner, {
    userId: buyer.id,
    pageId: null,
    accountId: account.id,
    enabled: true,
  });
});
test("Donor xác minh 3 ID, source account, Ads Manager URL; lỗi không ghi dữ liệu", async () => {
  await assert.rejects(
    donor.preview(owner, { ...input(), campaignId: "123" }),
    code("DONOR_MISMATCH"),
  );
  await assert.rejects(
    donor.preview(owner, { ...input(), accountId: secondAccount.id }),
    code("DONOR_SOURCE_ACCOUNT"),
  );
  await assert.rejects(
    donor.preview(owner, {
      ...input(),
      adsManagerUrl: "https://adsmanager.facebook.com/?selected_ad_ids=123",
    }),
    code("ADS_URL_MISMATCH"),
  );
  assert.equal((await db.select().from(donors)).length, 0);
});
test("Chỉ Ad ID truy ngược cha, preview chưa lưu, normalized khác raw", async () => {
  const preview = await donor.preview(buyer, {
    ...input(),
    campaignId: "",
    adSetId: "",
  });
  assert.equal(preview.campaignId, MOCK_IDS.campaign);
  assert.equal(preview.adSetId, MOCK_IDS.adSet);
  assert.equal(preview.source, "MOCK");
  assert.equal((await db.select().from(donors)).length, 0);
  assert.notDeepEqual(preview.raw, preview.normalized);
  assert(!JSON.stringify(preview.normalized).includes("old-pixel"));
});
test("Lưu Donor: đọc lại nguồn, kiểm fingerprint, audit không chứa token", async () => {
  const preview = await donor.preview(buyer, input());
  await assert.rejects(
    donor.save(buyer, { input: input(), fingerprint: "0".repeat(64) }),
    code("DONOR_CHANGED"),
  );
  const saved = await donor.save(buyer, {
    input: input(),
    fingerprint: preview.fingerprint,
  });
  donorId = saved.id;
  assert.equal(saved.version, 1);
  const detail = await donor.detail(buyer, donorId);
  assert.equal(detail.versions[0].adId, MOCK_IDS.ad);
  const audits = await db.select().from(auditLogs);
  assert(!JSON.stringify(audits).includes("mock-user-token"));
  await assert.rejects(
    donor.detail(viewer, donorId),
    code("RESOURCE_FORBIDDEN"),
  );
});
test("Version mới không sửa bản cũ; Database chặn UPDATE/DELETE version", async () => {
  const before = await donor.detail(owner, donorId);
  const versionInput = { ...input(), donorId };
  const preview = await donor.preview(owner, versionInput);
  const result = await donor.save(owner, {
    input: versionInput,
    fingerprint: preview.fingerprint,
  });
  assert.equal(result.version, 2);
  const after = await donor.detail(owner, donorId);
  assert.deepEqual(after.versions[1], before.versions[0]);
  await assert.rejects(
    db
      .update(donorVersions)
      .set({ version: 9 })
      .where(eq(donorVersions.id, before.versions[0].id)),
  );
  await assert.rejects(
    db.delete(donorVersions).where(eq(donorVersions.id, before.versions[0].id)),
  );
});
test("Library chỉ có tài khoản được cấp; thu hồi grant chặn ngay", async () => {
  assert.equal((await donor.list(buyer)).length, 1);
  assert.deepEqual(await donor.list(viewer), []);
  await meta.grant(owner, {
    userId: buyer.id,
    pageId: null,
    accountId: account.id,
    enabled: false,
  });
  assert.deepEqual(await donor.list(buyer), []);
  await assert.rejects(
    donor.detail(buyer, donorId),
    code("RESOURCE_FORBIDDEN"),
  );
});
test("Quan hệ Ad Set cha sai và creative khác ID bị chặn dù ID nhập đúng", async () => {
  class BadProvider extends MockMetaProvider {
    async read(token: string, id: string, fields: string[]) {
      const result = await super.read(token, id, fields);
      if (id === MOCK_IDS.adSet) result.campaign_id = "123";
      return result;
    }
  }
  const service = new DonorService(db, () => new BadProvider());
  await assert.rejects(service.preview(owner, input()), code("DONOR_MISMATCH"));
  class BadCreative extends MockMetaProvider {
    async read(token: string, id: string, fields: string[]) {
      const data = await super.read(token, id, fields);
      if (id === MOCK_IDS.creative) data.id = "123";
      return data;
    }
  }
  await assert.rejects(
    new DonorService(db, () => new BadCreative()).preview(owner, input()),
    code("DONOR_MISMATCH"),
  );
});
test("Field tùy chọn unsupported có cảnh báo unavailable; permission không fallback", async () => {
  class OptionalProvider extends MockMetaProvider {
    async read(token: string, id: string, fields: string[]) {
      if (fields.includes("billing_event"))
        throw new AppError(422, "META_OBJECT", "unsupported field");
      const data = await super.read(token, id, fields);
      return Object.fromEntries(
        fields.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]),
      );
    }
  }
  const preview = await new DonorService(
    db,
    () => new OptionalProvider(),
  ).preview(owner, input());
  assert(
    preview.warnings.some((w) => w.includes("billing_event: unavailable")),
  );
  assert.equal(preview.normalized.adSet.optimization_goal, "LINK_CLICKS");
  class PermissionProvider extends MockMetaProvider {
    async read(): Promise<never> {
      throw new AppError(403, "META_PERMISSION", "Quyền bị từ chối.");
    }
  }
  await assert.rejects(
    new DonorService(db, () => new PermissionProvider()).preview(
      owner,
      input(),
    ),
    code("META_PERMISSION"),
  );
});
test("Source thay đổi sau preview bị từ chối, không lưu version ngoài ý muốn", async () => {
  let changed = false;
  class ChangingProvider extends MockMetaProvider {
    async read(token: string, id: string, fields: string[]) {
      const data = await super.read(token, id, fields);
      if (changed && id === MOCK_IDS.campaign) data.objective = "OUTCOME_SALES";
      return data;
    }
  }
  const service = new DonorService(db, () => new ChangingProvider()),
    preview = await service.preview(owner, input());
  const count = (await db.select().from(donorVersions)).length;
  changed = true;
  await assert.rejects(
    service.save(owner, { input: input(), fingerprint: preview.fingerprint }),
    code("DONOR_CHANGED"),
  );
  assert.equal((await db.select().from(donorVersions)).length, count);
});
test("Kết nối lại giữ mapping/code và đánh dấu Page mất quyền; inventory cũ bị chặn", async () => {
  class Limited extends MockMetaProvider {
    async inventory(token: string, expires: Date) {
      const data = await super.inventory(token, expires);
      data.pages = data.pages.slice(1);
      return data;
    }
  }
  const restricted = new MetaService(db, () => new Limited());
  await restricted.capture(
    owner,
    "MOCK",
    "mock-user-token",
    new Date(Date.now() + 60000),
  );
  const detail = await meta.page(owner, firstPage.id);
  assert.equal(detail.status, "REVOKED");
  assert.equal(detail.health.pageRead, false);
  assert.equal(detail.health.publishing, false);
  assert.equal(detail.code, "giadung");
  assert.equal(detail.account?.id, account.id);
  inventory = await meta.mock(owner);
  await db
    .update(metaConnections)
    .set({ checkedAt: new Date(0) })
    .where(eq(metaConnections.id, inventory.id));
  await assert.rejects(
    meta.complete(owner, {
      connectionId: inventory.id,
      pageIds: [firstPage.metaId],
      accountIds: [],
      mappings: {},
    }),
    code("INVENTORY_STALE"),
  );
  await meta.refresh(owner, inventory.id);
});
test("CSV import lưu tiền Decimal, nhập lại không trùng, Viewer không có quyền", async () => {
  const csv = Buffer.from(
    `account_id,date,currency,spend\n${MOCK_IDS.account},2026-01-01,VND,150000`,
  );
  const saved = await imports.upload(owner, csv, "report.csv");
  assert.equal(saved.duplicate, false);
  const repeated = await imports.upload(owner, csv, "renamed.csv");
  assert.equal(repeated.duplicate, true);
  assert.equal((await imports.list(owner)).length, 1);
  assert.equal((await imports.list(owner))[0].total, "150000.00");
  await assert.rejects(
    imports.upload(viewer, csv, "bad.csv"),
    code("FORBIDDEN"),
  );
});
test("Foreign keys và CHECK của grant chặn tài nguyên sai; token hết hạn chặn đọc Donor", async () => {
  await assert.rejects(
    db.execute(
      sql`INSERT INTO resource_grants(id,user_id) VALUES ('invalid',${viewer.id})`,
    ),
  );
  await db
    .update(metaConnections)
    .set({ expiresAt: new Date(0) })
    .where(eq(metaConnections.id, inventory.id));
  await assert.rejects(
    donor.preview(owner, input()),
    code("META_TOKEN_EXPIRED"),
  );
});
