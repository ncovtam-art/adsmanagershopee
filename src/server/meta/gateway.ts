import { createHmac, createHash } from "node:crypto";
import { AppError } from "../http/errors";
import { assertMetaWritesEnabled } from "./write-policy";
import { insightSchema, type Insight } from "../analytics/engine";
import type {
  MetaProvider,
  MetaInventory,
  MetaObject,
  MetaPage,
  MetaAccount,
} from "./types";
export const requiredScopes = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
  "ads_read",
  "ads_management",
];
export function metaConfig() {
  const appId = process.env.META_APP_ID,
    secret = process.env.META_APP_SECRET,
    version = process.env.META_GRAPH_VERSION,
    redirect = process.env.META_REDIRECT_URI;
  if (
    !appId ||
    !/^\d+$/.test(appId) ||
    !secret ||
    !version ||
    !/^v\d+\.\d+$/.test(version) ||
    !redirect
  )
    throw new AppError(
      503,
      "META_CONFIG",
      "Chưa đủ cấu hình Meta App. Bổ sung App ID, App Secret, Graph version và Redirect URI ở máy chủ.",
    );
  const url = new URL(redirect);
  const origin = process.env.APP_ORIGIN;
  if (
    url.origin !== origin ||
    url.pathname !== "/api/meta/callback" ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new AppError(
      503,
      "META_REDIRECT",
      "Redirect URI phải thuộc APP_ORIGIN và có đường dẫn /api/meta/callback; môi trường thật cần HTTPS.",
    );
  return { appId, secret, version, redirect };
}
export class MetaGateway implements MetaProvider {
  private blockedUntil = 0;
  private generation = 0;
  private cache = new Map<string, { expires: number; value: MetaObject }>();
  private pending = new Map<string, Promise<MetaObject>>();
  usage: Record<string, unknown> = {};
  constructor(
    private fetcher: typeof fetch = fetch,
    private sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  private async request(
    path: string,
    token?: string,
    params: Record<string, string> = {},
    mutation?: { body: FormData; video: boolean },
  ): Promise<MetaObject> {
    if (mutation) assertMetaWritesEnabled();
    const config = metaConfig();
    if (Date.now() < this.blockedUntil)
      throw new AppError(
        429,
        "META_RATE_LIMIT",
        "Meta đang giới hạn lưu lượng. Chờ trước khi thử lại; không chuyển tài khoản để né giới hạn.",
        Math.max(1, Math.ceil((this.blockedUntil - Date.now()) / 1000)),
      );
    const url = new URL(
      `https://${mutation?.video ? "graph-video.facebook.com" : "graph.facebook.com"}/${config.version}/${path}`,
    );
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    if (token && !mutation)
      url.searchParams.set(
        "appsecret_proof",
        createHmac("sha256", config.secret).update(token).digest("hex"),
      );
    if (token && mutation)
      mutation.body.set(
        "appsecret_proof",
        createHmac("sha256", config.secret).update(token).digest("hex"),
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
          signal: AbortSignal.timeout(mutation ? 60000 : 15000),
          redirect: "error",
          ...(mutation ? { method: "POST", body: mutation.body } : {}),
        });
      } catch {
        if (mutation)
          throw new AppError(
            504,
            "META_RESULT_UNKNOWN",
            "Meta timeout/mất kết nối. Chưa biết kết quả; không tự gửi lại thao tác đăng/comment.",
          );
        throw new AppError(
          502,
          "META_NETWORK",
          "Không thể kết nối Meta. Kiểm tra mạng và thử lại.",
        );
      }
      for (const header of [
        "x-app-usage",
        "x-ad-account-usage",
        "x-business-use-case-usage",
      ]) {
        const value = response.headers.get(header);
        if (value) {
          try {
            this.usage[header] = JSON.parse(value);
          } catch {
            /* Header không hợp lệ không làm hỏng yêu cầu. */
          }
        }
      }
      const body = await response.json().catch(() => null);
      if (response.ok && body && !body.error) return body;
      if (
        mutation &&
        (response.status >= 500 ||
          body?.error?.is_transient ||
          (response.ok && !body))
      )
        throw new AppError(
          504,
          "META_RESULT_UNKNOWN",
          "Kết quả Meta chưa xác định. Kiểm tra trạng thái trước khi gửi lại.",
        );
      const code = Number(body?.error?.code);
      if (response.status === 429 || [4, 17, 32, 613, 80004].includes(code)) {
        const seconds = Math.max(
          1,
          Number(response.headers.get("retry-after")) || 60,
        );
        this.blockedUntil = Date.now() + Math.min(seconds, 3600) * 1000;
        throw new AppError(
          429,
          "META_RATE_LIMIT",
          "Meta yêu cầu giảm lưu lượng. Chờ rồi thử lại; giới hạn được đọc từ phản hồi API.",
          Math.ceil(Math.min(seconds, 3600)),
        );
      }
      if (code === 190)
        throw new AppError(
          401,
          "META_TOKEN_EXPIRED",
          "Token Meta hết hạn hoặc bị thu hồi. Kết nối Facebook lại trong Cài đặt.",
        );
      if ([10, 200, 294].includes(code) || response.status === 403)
        throw new AppError(
          403,
          "META_PERMISSION",
          "Meta từ chối quyền. Kiểm tra quyền Page/TKQC và App Review rồi kết nối lại.",
        );
      if (
        (response.status >= 500 || body?.error?.is_transient) &&
        attempt < 2
      ) {
        await this.sleep(250 * 2 ** attempt + Math.floor(Math.random() * 150));
        continue;
      }
      throw new AppError(
        422,
        "META_OBJECT",
        "Meta không trả được đối tượng hoặc trường yêu cầu. Kiểm tra ID, quyền truy cập và Graph version.",
      );
    }
    throw new AppError(
      502,
      "META_UNAVAILABLE",
      "Meta chưa sẵn sàng. Thử lại sau.",
    );
  }
  async exchange(code: string) {
    const config = metaConfig();
    const token = await this.request("oauth/access_token", undefined, {
      client_id: config.appId,
      client_secret: config.secret,
      redirect_uri: config.redirect,
      code,
    });
    if (
      typeof token.access_token !== "string" ||
      typeof token.expires_in !== "number"
    )
      throw new AppError(
        502,
        "META_TOKEN",
        "Meta không trả token có thời hạn hợp lệ.",
      );
    return {
      token: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  }
  async list<T>(
    path: string,
    token: string,
    fields?: string,
    params: Record<string, string> = {},
  ): Promise<T[]> {
    const all: T[] = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const result = await this.request(path, token, {
        ...params,
        limit: "100",
        ...(fields ? { fields } : {}),
        ...(after ? { after } : {}),
      });
      if (!Array.isArray(result.data))
        throw new AppError(
          502,
          "META_RESPONSE",
          "Meta trả danh sách không hợp lệ.",
        );
      all.push(...(result.data as T[]));
      const paging = result.paging as
        | { next?: string; cursors?: { after?: string } }
        | undefined;
      if (!paging?.next) return all;
      // Không follow URL từ API: chỉ lấy cursor và giữ hostname/endpoint cố định.
      after = paging.cursors?.after;
      if (!after || cursors.has(after))
        throw new AppError(
          502,
          "META_PAGINATION",
          "Không thể đọc hết danh sách Meta. Chưa lưu danh sách thiếu.",
        );
      cursors.add(after);
    }
    throw new AppError(
      422,
      "META_TOO_MANY",
      "Danh sách quá lớn cho lần đồng bộ này. Chưa lưu danh sách thiếu.",
    );
  }
  async inventory(token: string, expiresAt: Date): Promise<MetaInventory> {
    const user = await this.request("me", token, { fields: "id,name" });
    if (typeof user.id !== "string" || typeof user.name !== "string")
      throw new AppError(
        502,
        "META_RESPONSE",
        "Meta không trả định danh người dùng hợp lệ.",
      );
    const permissions = await this.list<{ permission: string; status: string }>(
      "me/permissions",
      token,
    );
    const scopes = permissions
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);
    if (!scopes.includes("pages_show_list"))
      throw new AppError(
        403,
        "META_PERMISSION",
        "Thiếu pages_show_list. Cấp quyền xem Page rồi kết nối lại.",
      );
    const pages = await this.list<MetaPage>(
      "me/accounts",
      token,
      "id,name,access_token,tasks",
    );
    const accounts =
      scopes.includes("ads_read") || scopes.includes("ads_management")
        ? await this.list<MetaAccount>(
            "me/adaccounts",
            token,
            "id,account_id,name,currency,timezone_name,account_status,user_tasks",
          )
        : [];
    return {
      user: { id: user.id, name: user.name },
      scopes,
      pages,
      accounts,
      expiresAt,
    };
  }
  async read(token: string, id: string, fields: string[]) {
    if (!/^\d+$/.test(id))
      throw new AppError(422, "META_ID", "ID Meta phải là chuỗi chữ số.");
    const key = createHash("sha256")
      .update(
        `${metaConfig().version}:${token}:${id}:${[...fields].sort().join(",")}`,
      )
      .digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now())
      return structuredClone(cached.value);
    const waiting = this.pending.get(key);
    if (waiting) return structuredClone(await waiting);
    const generation = this.generation;
    const task = this.request(id, token, { fields: fields.join(",") });
    this.pending.set(key, task);
    try {
      const result = await task;
      if (this.cache.size >= 500)
        this.cache.delete(this.cache.keys().next().value!);
      if (generation === this.generation)
        this.cache.set(key, {
          expires: Date.now() + 30000,
          value: structuredClone(result),
        });
      return result;
    } finally {
      if (this.pending.get(key) === task) this.pending.delete(key);
    }
  }
  invalidateReads() {
    this.generation++;
    this.cache.clear();
    this.pending.clear();
  }
  async publisherWrite(
    token: string,
    path: string,
    params: Record<string, string>,
    chunk?: Uint8Array,
  ) {
    if (!/^\d{1,64}(?:_\d{1,64})?\/(videos|comments)$/.test(path))
      throw new AppError(
        422,
        "PUBLISH_PATH",
        "Endpoint publishing không hợp lệ.",
      );
    const body = new FormData();
    for (const [key, value] of Object.entries(params)) body.set(key, value);
    if (chunk)
      body.set(
        "video_file_chunk",
        new Blob([Buffer.from(chunk)], { type: "application/octet-stream" }),
        "chunk.mp4",
      );
    return this.request(
      path,
      token,
      {},
      { body, video: path.endsWith("/videos") },
    );
  }
  async publisherRead(token: string, id: string, fields: string[]) {
    if (!/^\d{1,64}(?:_\d{1,64})?$/.test(id))
      throw new AppError(
        422,
        "META_ID",
        "ID bài viết/video/comment không hợp lệ.",
      );
    return this.request(id, token, { fields: fields.join(",") });
  }
  async adsWrite(
    token: string,
    accountId: string,
    edge: "campaigns" | "adsets" | "adcreatives" | "ads",
    values: Record<string, unknown>,
  ) {
    if (!/^\d{1,64}$/.test(accountId))
      throw new AppError(422, "META_ID", "ID TKQC không hợp lệ.");
    const body = new FormData();
    for (const [key, value] of Object.entries(values))
      if (value !== undefined)
        body.set(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        );
    return this.request(
      `act_${accountId}/${edge}`,
      token,
      {},
      { body, video: false },
    );
  }
  async adsRead(token: string, id: string, fields: string[]) {
    if (!/^(?:act_)?\d{1,64}$/.test(id))
      throw new AppError(422, "META_ID", "ID Ads không hợp lệ.");
    return this.request(id, token, { fields: fields.join(",") });
  }
  async adsPause(token: string, id: string) {
    if (!/^\d{1,64}$/.test(id))
      throw new AppError(422, "META_ID", "ID Ads không hợp lệ.");
    const body = new FormData();
    body.set("status", "PAUSED");
    const r = await this.request(id, token, {}, { body, video: false });
    if (r.success !== true)
      throw new AppError(
        504,
        "META_RESULT_UNKNOWN",
        "Meta chưa xác nhận kết quả dừng; cần đọc lại trạng thái.",
      );
    this.invalidateReads();
  }
  async insights(
    token: string,
    account: { metaId: string; currency: string; timezone: string },
    since: string,
    until: string,
  ): Promise<Insight[]> {
    if (!/^\d+$/.test(account.metaId))
      throw new AppError(422, "META_ID", "ID TKQC không hợp lệ.");
    const records = await this.list<MetaObject>(
      `act_${account.metaId}/insights`,
      token,
      "account_id,account_currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,spend,impressions,clicks,reach,actions",
      {
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
      },
    );
    const ads = await this.list<MetaObject>(
      `act_${account.metaId}/ads`,
      token,
      "id,effective_status,campaign{id,effective_status},adset{id,effective_status},creative{object_story_spec,effective_object_story_id}",
    );
    const catalog = new Map(ads.map((a) => [a.id, a]));
    return records.map((r) => {
      if (
        r.date_start !== r.date_stop ||
        r.account_id !== account.metaId ||
        r.account_currency !== account.currency
      )
        throw new AppError(
          422,
          "INSIGHTS_DIMENSIONS",
          "Meta trả reporting period/account/currency không phù hợp; chưa lưu.",
        );
      const a = catalog.get(r.ad_id),
        creative = a?.creative as MetaObject | undefined,
        spec = creative?.object_story_spec as MetaObject | undefined;
      const post =
        typeof creative?.effective_object_story_id === "string"
          ? creative.effective_object_story_id
          : null;
      const page =
        typeof spec?.page_id === "string"
          ? spec.page_id
          : (post?.split("_")[0] ?? null);
      const actions = Array.isArray(r.actions)
        ? (r.actions as Array<{ action_type: string; value: string }>)
        : [];
      const action = (name: string) =>
        actions.find((x) => x.action_type === name)?.value ?? null;
      const result = insightSchema.safeParse({
        day: r.date_start,
        accountId: r.account_id,
        currency: r.account_currency,
        timezone: account.timezone,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        adSetId: r.adset_id,
        adSetName: r.adset_name,
        adId: r.ad_id,
        adName: r.ad_name,
        pageMetaId: page,
        postId: post,
        campaignStatus:
          (a?.campaign as MetaObject | undefined)?.effective_status ??
          "UNKNOWN",
        adSetStatus:
          (a?.adset as MetaObject | undefined)?.effective_status ?? "UNKNOWN",
        adStatus: a?.effective_status ?? "UNKNOWN",
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        reach: r.reach ?? null,
        linkClicks: action("link_click"),
        lpv: action("landing_page_view"),
      });
      if (!result.success)
        throw new AppError(
          422,
          "INSIGHTS_RESPONSE",
          "Meta trả metrics không hợp lệ; chưa lưu snapshot thiếu.",
        );
      return result.data;
    });
  }
}
