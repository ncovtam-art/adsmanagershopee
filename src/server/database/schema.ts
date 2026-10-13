import {
  pgTable,
  pgEnum,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  numeric,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";

export const roleNames = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "MEDIA_BUYER",
  "UPLOADER",
  "VIEWER",
] as const;
export type Role = (typeof roleNames)[number];
export const roleEnum = pgEnum("role", roleNames);
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
const date = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date", precision: 3 });

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("VIEWER"),
    active: boolean("active").notNull().default(true),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_role_active_idx").on(table.role, table.active),
  ],
);
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: date("expires_at").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);
export const loginGuards = pgTable("login_guards", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStart: date("window_start").notNull(),
  blockedUntil: date("blocked_until"),
});
export const workspaces = pgTable("settings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  updatedAt: date("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_date_idx").on(table.actorId, table.createdAt),
    index("audit_logs_resource_id_idx").on(table.resourceId),
  ],
);
export const publicUserFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
};

// Nguồn thử nghiệm có namespace riêng; không được trộn với dữ liệu Meta thật.
export const sourceEnum = pgEnum("meta_source", ["LIVE", "MOCK"]);
export const metaConnections = pgTable(
  "meta_connections",
  {
    id: id(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    source: sourceEnum("source").notNull(),
    metaUserId: text("meta_user_id").notNull(),
    name: text("name").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    encryptedInventory: text("encrypted_inventory").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: date("expires_at").notNull(),
    checkedAt: date("checked_at").notNull().defaultNow(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_connection_identity").on(
      t.actorId,
      t.source,
      t.metaUserId,
    ),
  ],
);
export const oauthStates = pgTable(
  "oauth_states",
  {
    hash: text("hash").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: date("expires_at").notNull(),
  },
  (t) => [index("oauth_states_expiry").on(t.expiresAt)],
);
export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: id(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => metaConnections.id),
    source: sourceEnum("source").notNull(),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    tasks: jsonb("tasks").$type<string[]>().notNull(),
    status: text("status").notNull(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ad_account_source_id").on(t.source, t.metaId),
    index("accounts_connection").on(t.connectionId),
  ],
);
export const pages = pgTable(
  "pages",
  {
    id: id(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => metaConnections.id),
    source: sourceEnum("source").notNull(),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    niche: text("niche").notNull().default(""),
    primaryAccountId: text("primary_account_id").references(
      () => adAccounts.id,
    ),
    encryptedToken: text("encrypted_token").notNull(),
    tasks: jsonb("tasks").$type<string[]>().notNull(),
    publishSettings: jsonb("publish_settings")
      .$type<{ enabled: boolean }>()
      .notNull()
      .default({ enabled: false }),
    status: text("status").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("page_source_id").on(t.source, t.metaId),
    uniqueIndex("page_code_unique").on(t.code),
    index("page_account").on(t.primaryAccountId),
  ],
);
export const pageMappings = pgTable(
  "page_mappings",
  {
    id: id(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    previousAccountId: text("previous_account_id").references(
      () => adAccounts.id,
    ),
    accountId: text("account_id").references(() => adAccounts.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("mapping_page_date").on(t.pageId, t.createdAt)],
);
export const resourceGrants = pgTable(
  "resource_grants",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => adAccounts.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    uniqueIndex("grant_user_page").on(t.userId, t.pageId),
    uniqueIndex("grant_user_account").on(t.userId, t.accountId),
  ],
);
export const donors = pgTable(
  "donors",
  {
    id: id(),
    name: text("name").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    source: sourceEnum("source").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("donor_account").on(t.accountId)],
);
export const donorVersions = pgTable(
  "donor_versions",
  {
    id: id(),
    donorId: text("donor_id")
      .notNull()
      .references(() => donors.id),
    version: integer("version").notNull(),
    campaignId: text("campaign_id").notNull(),
    adSetId: text("ad_set_id").notNull(),
    adId: text("ad_id").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    normalized: jsonb("normalized").$type<Record<string, unknown>>().notNull(),
    warnings: jsonb("warnings").$type<string[]>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("donor_version_unique").on(t.donorId, t.version)],
);

export const metaImports = pgTable(
  "meta_imports",
  {
    id: id(),
    fingerprint: text("fingerprint").notNull(),
    filename: text("filename").notNull(),
    rows: jsonb("rows")
      .$type<
        Array<{
          accountId: string;
          date: string;
          currency: string;
          spend: string;
        }>
      >()
      .notNull(),
    count: integer("count").notNull(),
    total: numeric("total", { precision: 30, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("import_fingerprint").on(t.fingerprint)],
);

export const trackingChannel = pgEnum("tracking_channel", [
  "ORGANIC",
  "ADS",
  "SHARED",
]);
export const linkStatus = pgEnum("link_status", [
  "WAITING",
  "PROCESSING",
  "READY",
  "FAILED",
  "MANUAL_ACTION_REQUIRED",
  "UNKNOWN",
]);
export const commissionStatus = pgEnum("commission_status", [
  "PENDING",
  "APPROVED",
  "PAID",
  "REJECTED",
]);
export const products = pgTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    niche: text("niche").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_url_unique").on(t.url)],
);
export const trackingRecords = pgTable(
  "tracking_records",
  {
    id: id(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    accountId: text("account_id").references(() => adAccounts.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    productUrl: text("product_url").notNull(),
    source: sourceEnum("source").notNull(),
    affiliateAccount: text("affiliate_account").notNull(),
    subId: text("sub_id").notNull(),
    channel: trackingChannel("channel").notNull(),
    contentRef: text("content_ref").notNull().default(""),
    contentId: text("content_id").references(() => videoAssets.id),
    campaignId: text("campaign_id"),
    adSetId: text("ad_set_id"),
    adId: text("ad_id"),
    status: linkStatus("status").notNull().default("MANUAL_ACTION_REQUIRED"),
    linkVersion: integer("link_version").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tracking_subid_unique").on(t.subId),
    index("tracking_page_created").on(t.pageId, t.createdAt),
    index("tracking_ad_idx").on(t.adId),
    index("tracking_account_idx").on(t.accountId),
  ],
);
export const trackingLinkVersions = pgTable(
  "tracking_link_versions",
  {
    id: id(),
    trackingId: text("tracking_id")
      .notNull()
      .references(() => trackingRecords.id),
    version: integer("version").notNull(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    confirmation: text("confirmation").notNull().default("USER_DECLARED"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tracking_link_version_unique").on(t.trackingId, t.version),
    index("tracking_link_hash").on(t.urlHash),
  ],
);
export const commissionImports = pgTable(
  "commission_imports",
  {
    id: id(),
    source: sourceEnum("source").notNull(),
    affiliateAccount: text("affiliate_account").notNull(),
    fingerprint: text("fingerprint").notNull(),
    previewFingerprint: text("preview_fingerprint").notNull(),
    filename: text("filename").notNull(),
    encoding: text("encoding").notNull(),
    encryptedRaw: text("encrypted_raw").notNull(),
    options: jsonb("options").$type<Record<string, unknown>>().notNull(),
    candidates: jsonb("candidates")
      .$type<Record<string, unknown>[]>()
      .notNull(),
    state: text("state").notNull().default("PREVIEW"),
    result: jsonb("result").$type<Record<string, number>>(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_import_file_unique").on(
      t.source,
      t.affiliateAccount,
      t.fingerprint,
    ),
    index("commission_import_recent").on(
      t.source,
      t.affiliateAccount,
      t.createdAt,
    ),
  ],
);
export const commissionRows = pgTable(
  "commission_rows",
  {
    id: id(),
    source: sourceEnum("source").notNull(),
    affiliateAccount: text("affiliate_account").notNull(),
    externalKey: text("external_key").notNull(),
    externalRowId: text("external_row_id"),
    orderId: text("order_id"),
    orderItemId: text("order_item_id"),
    subId: text("sub_id").notNull(),
    trackingId: text("tracking_id").references(() => trackingRecords.id),
    matchMethod: text("match_method").notNull(),
    amount: numeric("amount", { precision: 30, scale: 6 }).notNull(),
    currency: text("currency").notNull(),
    status: commissionStatus("status").notNull(),
    orderedAt: date("ordered_at"),
    reportedAt: date("reported_at"),
    settledAt: date("settled_at"),
    importId: text("import_id")
      .notNull()
      .references(() => commissionImports.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_row_identity").on(
      t.source,
      t.affiliateAccount,
      t.externalKey,
    ),
    index("commission_tracking_idx").on(t.trackingId),
    index("commission_tracking_order").on(t.trackingId, t.orderedAt),
    index("commission_namespace_order").on(
      t.source,
      t.affiliateAccount,
      t.orderedAt,
    ),
    index("commission_subid_idx").on(t.subId),
    index("commission_order_idx").on(t.orderId, t.orderItemId),
    index("commission_order_date").on(t.orderedAt),
  ],
);
export const commissionReviews = pgTable(
  "commission_reviews",
  {
    id: id(),
    importId: text("import_id")
      .notNull()
      .references(() => commissionImports.id),
    line: integer("line").notNull(),
    candidate: jsonb("candidate").$type<Record<string, unknown>>().notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull(),
    state: text("state").notNull().default("OPEN"),
    resolvedBy: text("resolved_by").references(() => users.id),
    reason: text("reason"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_review_import_line").on(t.importId, t.line),
    index("commission_review_state").on(t.state),
  ],
);
export const commissionHistory = pgTable(
  "commission_history",
  {
    id: id(),
    rowId: text("row_id")
      .notNull()
      .references(() => commissionRows.id),
    importId: text("import_id").references(() => commissionImports.id),
    action: text("action").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>().notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("commission_history_row_date").on(t.rowId, t.createdAt)],
);

// Chỉ một snapshot Ad/ngày được chọn cho mỗi tài khoản/ngày; không cộng API + CSV.
export const insightDays = pgTable(
  "insight_days",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    day: text("day").notNull(),
    provider: text("provider").notNull(),
    fingerprint: text("fingerprint").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    syncedAt: date("synced_at").notNull().defaultNow(),
    runId: text("run_id")
      .notNull()
      .references(() => insightRuns.id),
  },
  (t) => [uniqueIndex("insight_day_account_unique").on(t.accountId, t.day)],
);
export const insightAds = pgTable(
  "insight_ads",
  {
    id: id(),
    dayId: text("day_id")
      .notNull()
      .references(() => insightDays.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    adId: text("ad_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name").notNull(),
    adSetId: text("ad_set_id").notNull(),
    adSetName: text("ad_set_name").notNull(),
    adName: text("ad_name").notNull(),
    pageMetaId: text("page_meta_id"),
    postId: text("post_id"),
    campaignStatus: text("campaign_status").notNull(),
    adSetStatus: text("ad_set_status").notNull(),
    adStatus: text("ad_status").notNull(),
    spend: numeric("spend", { precision: 30, scale: 6 }).notNull(),
    impressions: numeric("impressions", { precision: 30, scale: 0 }).notNull(),
    clicks: numeric("clicks", { precision: 30, scale: 0 }).notNull(),
    linkClicks: numeric("link_clicks", { precision: 30, scale: 0 }),
    lpv: numeric("lpv", { precision: 30, scale: 0 }),
    reach: numeric("reach", { precision: 30, scale: 0 }),
  },
  (t) => [
    uniqueIndex("insight_ad_day_unique").on(t.dayId, t.adId),
    index("insight_ad_account").on(t.accountId, t.adId),
    index("insight_day_campaign_page").on(t.dayId, t.campaignId, t.pageMetaId),
  ],
);
export const insightRuns = pgTable(
  "insight_runs",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    provider: text("provider").notNull(),
    since: text("since").notNull(),
    until: text("until").notNull(),
    state: text("state").notNull(),
    errorCode: text("error_code"),
    fingerprint: text("fingerprint"),
    encryptedRaw: text("encrypted_raw"),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("insight_run_account_date").on(t.accountId, t.createdAt)],
);
export const analyticsPolicies = pgTable("analytics_policies", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => adAccounts.id),
  estimatedStatuses: jsonb("estimated_statuses")
    .$type<Array<"PENDING" | "APPROVED" | "PAID">>()
    .notNull()
    .default(["PENDING", "APPROVED", "PAID"]),
  mappingAcknowledged: boolean("mapping_acknowledged").notNull().default(false),
  otherCostPerDay: numeric("other_cost_per_day", { precision: 30, scale: 6 })
    .notNull()
    .default("0"),
  autoSync: boolean("auto_sync").notNull().default(false),
  nextSyncAt: date("next_sync_at"),
  lifetimeStart: text("lifetime_start"),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id),
  updatedAt: date("updated_at").notNull().defaultNow(),
});

export const videoAssets = pgTable(
  "video_assets",
  {
    id: id(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    source: sourceEnum("source").notNull(),
    filename: text("filename").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256"),
    storageKey: text("storage_key").notNull(),
    state: text("state").notNull().default("NEW"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    aspectRatio: text("aspect_ratio"),
    niche: text("niche").notNull().default(""),
    productId: text("product_id").references(() => products.id),
    duplicateOf: text("duplicate_of").references(
      (): AnyPgColumn => videoAssets.id,
    ),
    errorCode: text("error_code"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("videos_page_created").on(t.pageId, t.createdAt),
    index("videos_page_hash").on(t.pageId, t.sha256),
  ],
);
export const captionTemplates = pgTable("caption_templates", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  pageId: text("page_id").references(() => pages.id),
  niche: text("niche"),
  body: text("body").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const publisherPageSettings = pgTable("publisher_page_settings", {
  pageId: text("page_id")
    .primaryKey()
    .references(() => pages.id),
  autoComment: boolean("auto_comment").notNull().default(false),
  delaySeconds: integer("delay_seconds").notNull().default(60),
  commentTemplateId: text("comment_template_id").references(
    () => captionTemplates.id,
  ),
  removePreview: boolean("remove_preview").notNull().default(false),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const publishBatches = pgTable(
  "publish_batches",
  {
    id: id(),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publish_batch_actor_request").on(t.actorId, t.requestKey),
  ],
);
export const publisherStates = [
  "QUEUED",
  "SCHEDULED",
  "PROCESSING",
  "PROCESSING_META",
  "SUCCEEDED",
  "FAILED",
  "UNKNOWN",
  "PAUSED",
  "CANCELLED",
  "DEAD_LETTER",
  "UNSUPPORTED",
] as const;
export const publisherStateEnum = pgEnum(
  "publisher_job_state",
  publisherStates,
);
export const publishJobs = pgTable(
  "publish_jobs",
  {
    id: id(),
    batchId: text("batch_id")
      .notNull()
      .references(() => publishBatches.id),
    kind: text("kind").notNull(),
    parentJobId: text("parent_job_id").references(
      (): AnyPgColumn => publishJobs.id,
    ),
    assetId: text("asset_id")
      .notNull()
      .references(() => videoAssets.id),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    source: sourceEnum("source").notNull(),
    trackingId: text("tracking_id").references(() => trackingRecords.id),
    linkVersionId: text("link_version_id").references(
      () => trackingLinkVersions.id,
    ),
    caption: text("caption").notNull(),
    commentBody: text("comment_body"),
    commentPolicy: jsonb("comment_policy")
      .$type<{
        enabled: boolean;
        delaySeconds: number;
        removePreview: boolean;
      }>()
      .notNull(),
    state: publisherStateEnum("state").notNull(),
    phase: text("phase").notNull().default("CREATED"),
    availableAt: date("available_at").notNull(),
    generation: integer("generation").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    progress: integer("progress").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseUntil: date("lease_until"),
    enqueuedAt: date("enqueued_at"),
    metaVideoId: text("meta_video_id"),
    encryptedSession: text("encrypted_session"),
    offset: integer("offset").notNull().default(0),
    endOffset: integer("end_offset").notNull().default(0),
    postId: text("post_id"),
    commentId: text("comment_id"),
    provenance: text("provenance"),
    errorCode: text("error_code"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publish_batch_asset_kind").on(t.batchId, t.assetId, t.kind),
    uniqueIndex("publish_comment_parent").on(t.parentJobId),
    index("publish_due").on(t.state, t.availableAt),
    index("publish_page_created").on(t.pageId, t.createdAt),
    index("publish_post_idx").on(t.postId),
  ],
);
export const publishHistory = pgTable(
  "publish_history",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => publishJobs.id),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("publish_history_job_date").on(t.jobId, t.createdAt)],
);
export const publisherControls = pgTable("publisher_controls", {
  id: text("id").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id),
  updatedAt: date("updated_at").notNull().defaultNow(),
});

// Giai đoạn 7: workflow một Ads PAUSED, không tái sử dụng source IDs.
export const adsRequests = pgTable(
  "ads_requests",
  {
    id: id(),
    bulkBatchId: text("bulk_batch_id").references(
      (): AnyPgColumn => adsBatches.id,
    ),
    bulkIndex: integer("bulk_index"),
    campaignRefId: text("campaign_ref_id").references(
      (): AnyPgColumn => adsRequests.id,
    ),
    adSetRefId: text("ad_set_ref_id").references(
      (): AnyPgColumn => adsRequests.id,
    ),
    cloneSourceId: text("clone_source_id").references(
      (): AnyPgColumn => adsRequests.id,
    ),
    cloneLevel: text("clone_level"),
    generation: integer("generation").notNull().default(0),
    enqueuedAt: date("enqueued_at"),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    publishJobId: text("publish_job_id")
      .notNull()
      .references(() => publishJobs.id),
    donorVersionId: text("donor_version_id")
      .notNull()
      .references(() => donorVersions.id),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    source: sourceEnum("source").notNull(),
    mode: text("mode").notNull(),
    trackingId: text("tracking_id").references(() => trackingRecords.id),
    linkVersionId: text("link_version_id").references(
      () => trackingLinkVersions.id,
    ),
    snapshot: jsonb("snapshot")
      .$type<import("../ads/validation").Snapshot>()
      .notNull(),
    state: text("state").notNull().default("QUEUED"),
    phase: text("phase").notNull().default("NONE"),
    campaignId: text("campaign_id"),
    adSetId: text("ad_set_id"),
    creativeId: text("creative_id"),
    adId: text("ad_id"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: date("available_at").notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseUntil: date("lease_until"),
    errorCode: text("error_code"),
    verifiedAt: date("verified_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ads_actor_request_key").on(t.createdBy, t.requestKey),
    index("ads_request_due").on(t.state, t.availableAt),
    index("ads_request_page_account").on(t.pageId, t.accountId),
  ],
);
export const adsHistory = pgTable(
  "ads_history",
  {
    id: id(),
    requestId: text("request_id")
      .notNull()
      .references(() => adsRequests.id),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("ads_history_request_date").on(t.requestId, t.createdAt)],
);

export const adsBatches = pgTable(
  "ads_batches",
  {
    id: id(),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull().default("RUNNING"),
    source: sourceEnum("source").notNull(),
    structure: text("structure").notNull(),
    counts: jsonb("counts")
      .$type<{
        campaigns: number;
        adSets: number;
        creatives: number;
        ads: number;
      }>()
      .notNull(),
    budgets: jsonb("budgets")
      .$type<
        Array<{
          source: string;
          currency: string;
          kind: string;
          newBudget: string;
          existingBudget: string;
        }>
      >()
      .notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ads_batch_actor_key").on(t.createdBy, t.requestKey),
    index("ads_batches_state").on(t.state),
  ],
);
export const adsBatchHistory = pgTable(
  "ads_batch_history",
  {
    id: id(),
    batchId: text("batch_id")
      .notNull()
      .references(() => adsBatches.id),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("ads_batch_history_date").on(t.batchId, t.createdAt)],
);
export const adsPreparations = pgTable(
  "ads_preparations",
  {
    id: id(),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    rows: jsonb("rows")
      .$type<
        Array<{
          key: string;
          publishJobId: string;
          trackingId: string;
          subId: string;
        }>
      >()
      .notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ads_prepare_actor_key").on(t.createdBy, t.requestKey)],
);
export const adsPresets = pgTable("ads_presets", {
  id: id(),
  name: text("name").notNull(),
  donorVersionId: text("donor_version_id")
    .notNull()
    .references(() => donorVersions.id),
  structure: text("structure").notNull(),
  overrides: jsonb("overrides")
    .$type<import("../ads/bulk/validation").BulkInput["overrides"]>()
    .notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});

// Giai đoạn 9: cấu hình tắt mặc định; lịch sử và outbox bền trong PostgreSQL.
export const careRules = pgTable(
  "care_rules",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    source: sourceEnum("source").notNull(),
    name: text("name").notNull(),
    config: jsonb("config")
      .$type<import("../care/validation").RuleInput>()
      .notNull(),
    configHash: text("config_hash").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    autoEnabled: boolean("auto_enabled").notNull().default(false),
    dryRunId: text("dry_run_id").references((): AnyPgColumn => careRuns.id),
    nextRunAt: date("next_run_at").notNull().defaultNow(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("care_rule_due").on(t.enabled, t.nextRunAt),
    index("care_rule_account").on(t.accountId),
    index("care_rule_creator").on(t.createdBy),
  ],
);
export const careRuns = pgTable(
  "care_runs",
  {
    id: id(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => careRules.id),
    configHash: text("config_hash").notNull(),
    dryRun: boolean("dry_run").notNull(),
    state: text("state").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [index("care_run_rule_date").on(t.ruleId, t.createdAt)],
);
export const careAlerts = pgTable(
  "care_alerts",
  {
    id: id(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => careRules.id),
    runId: text("run_id")
      .notNull()
      .references(() => careRuns.id),
    objectId: text("object_id").notNull(),
    type: text("type").notNull(),
    state: text("state").notNull().default("OPEN"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: date("reviewed_at"),
  },
  (t) => [
    index("care_alert_rule_object_date").on(t.ruleId, t.objectId, t.createdAt),
  ],
);
export const carePauses = pgTable(
  "care_pauses",
  {
    id: id(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => careRules.id),
    alertId: text("alert_id")
      .notNull()
      .references(() => careAlerts.id),
    accountId: text("account_id")
      .notNull()
      .references(() => adAccounts.id),
    source: sourceEnum("source").notNull(),
    level: text("level").notNull(),
    objectId: text("object_id").notNull(),
    state: text("state").notNull(),
    errorCode: text("error_code"),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("care_pause_object_once").on(
      t.accountId,
      t.source,
      t.level,
      t.objectId,
    ),
    index("care_pause_state_time").on(t.state, t.updatedAt),
  ],
);
export const telegramSettings = pgTable("telegram_settings", {
  id: text("id").primaryKey(),
  encryptedToken: text("encrypted_token").notNull(),
  chatId: text("chat_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  events: jsonb("events").$type<string[]>().notNull(),
  cooldownMinutes: integer("cooldown_minutes").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: id(),
    key: text("key").notNull(),
    event: text("event").notNull(),
    resourceId: text("resource_id").notNull(),
    text: text("text").notNull(),
    configVersion: integer("config_version").notNull(),
    state: text("state").notNull().default("QUEUED"),
    availableAt: date("available_at").notNull().defaultNow(),
    errorCode: text("error_code"),
    messageId: text("message_id"),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_key_unique").on(t.key),
    index("notification_due").on(t.state, t.availableAt),
    index("notification_event_resource_date").on(
      t.event,
      t.resourceId,
      t.createdAt,
    ),
  ],
);

export const apiRateBuckets = pgTable(
  "api_rate_buckets",
  {
    key: text("key").primaryKey(),
    hits: integer("hits").notNull(),
    expiresAt: date("expires_at").notNull(),
  },
  (t) => [index("api_rate_expiry").on(t.expiresAt)],
);
