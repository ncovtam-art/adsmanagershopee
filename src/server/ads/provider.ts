import { createHash } from "node:crypto";
import { MetaGateway } from "../meta/gateway";
import { gateway, mockEnabled } from "../meta/service";
import { LivePublisher } from "../publisher/provider";
import { AppError } from "../http/errors";
import { subset, type Kind } from "./validation";
export type Context = {
  accountMetaId: string;
  pageMetaId: string;
  postId: string;
  videoId: string;
  currency: string;
  timezone: string;
  token: string;
  pageToken: string;
};
export interface AdsProvider {
  preflight(ctx: Context): Promise<{ thumbnailUrl: string | null }>;
  create(
    ctx: Context,
    kind: Kind,
    payload: Record<string, unknown>,
    key: string,
  ): Promise<string>;
  verify(
    ctx: Context,
    kind: Kind,
    id: string,
    payload: Record<string, unknown>,
    key: string,
  ): Promise<void>;
}
const edges = {
  campaign: "campaigns",
  adSet: "adsets",
  creative: "adcreatives",
  ad: "ads",
} as const;
export function verificationShape(
  kind: Kind,
  payload: Record<string, unknown>,
) {
  const expected = structuredClone(payload);
  if (kind === "creative") {
    const spec = expected.object_story_spec as
      | { video_data?: Record<string, unknown> }
      | undefined;
    if (spec?.video_data) delete spec.video_data.image_url;
  }
  if (kind === "ad")
    expected.creative = {
      id: (expected.creative as { creative_id: string }).creative_id,
    };
  return expected;
}
export class LiveAdsProvider implements AdsProvider {
  constructor(private client: MetaGateway = gateway) {}
  async preflight(ctx: Context) {
    const a = await this.client.adsRead(ctx.token, `act_${ctx.accountMetaId}`, [
      "id",
      "account_id",
      "account_status",
      "currency",
      "timezone_name",
      "user_tasks",
    ]);
    if (
      a.account_id !== ctx.accountMetaId ||
      a.account_status !== 1 ||
      a.currency !== ctx.currency ||
      a.timezone_name !== ctx.timezone ||
      !Array.isArray(a.user_tasks) ||
      !a.user_tasks.some((t) => ["ADVERTISE", "MANAGE"].includes(String(t)))
    )
      throw new AppError(
        403,
        "ADS_ACCOUNT_CHANGED",
        "TKQC/quyền/currency/timezone hiện tại không khớp. Làm mới kết nối.",
      );
    const proof = await new LivePublisher(this.client).inspectPost(
      ctx.pageToken,
      ctx.pageMetaId,
      ctx.postId,
    );
    if (proof.videoId !== ctx.videoId)
      throw new AppError(
        422,
        "ADS_POST_VIDEO",
        "Post ID không chứa video đã chọn trên Page.",
      );
    const v = await this.client.publisherRead(ctx.pageToken, ctx.videoId, [
      "id",
      "picture",
    ]);
    let thumbnailUrl: string | null = null;
    if (v.id !== ctx.videoId)
      throw new AppError(422, "ADS_VIDEO", "Meta trả video khác.");
    if (typeof v.picture === "string") {
      const u = new URL(v.picture);
      if (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        (/(^|\.)fbcdn\.net$/.test(u.hostname) ||
          /(^|\.)fbsbx\.com$/.test(u.hostname))
      )
        thumbnailUrl = u.toString();
    }
    return { thumbnailUrl };
  }
  async create(
    ctx: Context,
    kind: Kind,
    payload: Record<string, unknown>,
    _key: string,
  ) {
    void _key;
    const r = await this.client.adsWrite(
      ctx.token,
      ctx.accountMetaId,
      edges[kind],
      payload,
    );
    if (typeof r.id !== "string" || !/^\d{1,64}$/.test(r.id))
      throw new AppError(
        504,
        "META_RESULT_UNKNOWN",
        "Meta không trả ID mới hợp lệ; cần kiểm tra trước khi gửi lại.",
      );
    return r.id;
  }
  async verify(
    ctx: Context,
    kind: Kind,
    id: string,
    payload: Record<string, unknown>,
    _key: string,
  ) {
    void _key;
    const expected = verificationShape(kind, payload);
    const fields = [
      ...new Set([
        "id",
        "account_id",
        ...Object.keys(expected),
        ...(kind === "creative" ? ["effective_object_story_id"] : []),
      ]),
    ];
    const r = await this.client.adsRead(ctx.token, id, fields);
    if (kind === "creative" && expected.object_story_id && !r.object_story_id)
      r.object_story_id = r.effective_object_story_id;
    if (
      r.id !== id ||
      r.account_id !== ctx.accountMetaId ||
      !subset(expected, r)
    )
      throw new AppError(
        422,
        "ADS_VERIFY",
        "Meta chưa xác minh cấu hình/quan hệ/PAUSED đúng preview. Không coi đã tạo thành công.",
      );
  }
}
export function mockAdsId(key: string, kind: Kind) {
  return (
    9800000000000000000n +
    BigInt(
      "0x" +
        createHash("sha256")
          .update(key + kind)
          .digest("hex")
          .slice(0, 12),
    )
  ).toString();
}
export class MockAdsProvider implements AdsProvider {
  async preflight(_ctx: Context) {
    void _ctx;
    return { thumbnailUrl: "https://mock.invalid/video-thumbnail.jpg" };
  }
  async create(
    _ctx: Context,
    kind: Kind,
    _payload: Record<string, unknown>,
    key: string,
  ) {
    void _ctx;
    void _payload;
    return mockAdsId(key, kind);
  }
  async verify(
    _ctx: Context,
    kind: Kind,
    id: string,
    _payload: Record<string, unknown>,
    key: string,
  ) {
    void _ctx;
    void _payload;
    if (id !== mockAdsId(key, kind))
      throw new AppError(
        422,
        "ADS_VERIFY",
        "MOCK ID không khớp request, không phải ID Facebook thật.",
      );
  }
}
export function adsProvider(source: "LIVE" | "MOCK"): AdsProvider {
  if (source === "MOCK") {
    if (!mockEnabled())
      throw new AppError(403, "MOCK_DISABLED", "Bật rõ MOCK trước khi thử.");
    return new MockAdsProvider();
  }
  return new LiveAdsProvider();
}
