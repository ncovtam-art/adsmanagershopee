import { createHash } from "node:crypto";
import { gateway, mockEnabled } from "../meta/service";
import { MetaGateway } from "../meta/gateway";
import { AppError } from "../http/errors";
import { metaObjectId } from "./validation";
import type { MetaObject, Source } from "../meta/types";
export type PublishState = {
  videoId: string;
  postId: string | null;
  status: "READY" | "PROCESSING" | "ERROR";
  published: boolean;
};
export interface PublisherProvider {
  begin(
    token: string,
    pageId: string,
    size: number,
    key: string,
  ): Promise<{
    videoId: string;
    sessionId: string;
    start: number;
    end: number;
  }>;
  transfer(
    token: string,
    pageId: string,
    sessionId: string,
    start: number,
    chunk: Uint8Array,
  ): Promise<{ start: number; end: number }>;
  finish(
    token: string,
    pageId: string,
    sessionId: string,
    caption: string,
    title: string,
  ): Promise<void>;
  inspect(
    token: string,
    pageId: string,
    videoId: string,
  ): Promise<PublishState>;
  comment(
    token: string,
    postId: string,
    message: string,
    key: string,
  ): Promise<string>;
  inspectPost(
    token: string,
    pageId: string,
    postId: string,
  ): Promise<{ postId: string; videoId: string }>;
  inspectComment(
    token: string,
    pageId: string,
    postId: string,
    commentId: string,
    message: string,
  ): Promise<string>;
}
function numericOffset(v: unknown) {
  if (typeof v !== "string" || !/^\d+$/.test(v) || Number(v) > 314572800)
    throw new AppError(
      504,
      "META_RESULT_UNKNOWN",
      "Meta trả upload offset không hợp lệ; cần kiểm tra trạng thái.",
    );
  return Number(v);
}
function id(v: unknown) {
  const p = metaObjectId.safeParse(v);
  if (!p.success)
    throw new AppError(
      504,
      "META_RESULT_UNKNOWN",
      "Meta không trả ID hợp lệ. Không tự gửi lại thao tác.",
    );
  return p.data;
}
export class LivePublisher implements PublisherProvider {
  constructor(private client: MetaGateway = gateway) {}
  async begin(token: string, pageId: string, size: number, _key: string) {
    void _key;
    const r = await this.client.publisherWrite(token, `${pageId}/videos`, {
      upload_phase: "start",
      file_size: String(size),
    });
    return {
      videoId: id(r.video_id),
      sessionId: id(r.upload_session_id),
      start: numericOffset(r.start_offset),
      end: numericOffset(r.end_offset),
    };
  }
  async transfer(
    token: string,
    pageId: string,
    sessionId: string,
    start: number,
    chunk: Uint8Array,
  ) {
    const r = await this.client.publisherWrite(
      token,
      `${pageId}/videos`,
      {
        upload_phase: "transfer",
        upload_session_id: sessionId,
        start_offset: String(start),
      },
      chunk,
    );
    return {
      start: numericOffset(r.start_offset),
      end: numericOffset(r.end_offset),
    };
  }
  async finish(
    token: string,
    pageId: string,
    sessionId: string,
    caption: string,
    title: string,
  ) {
    const r = await this.client.publisherWrite(token, `${pageId}/videos`, {
      upload_phase: "finish",
      upload_session_id: sessionId,
      description: caption,
      title,
      published: "true",
    });
    if (r.success !== true)
      throw new AppError(
        504,
        "META_RESULT_UNKNOWN",
        "Meta chưa xác nhận hoàn tất upload. Không gửi finish lần nữa.",
      );
  }
  async inspect(
    token: string,
    pageId: string,
    videoId: string,
  ): Promise<PublishState> {
    const r = await this.client.publisherRead(token, videoId, [
      "id",
      "status",
      "published",
    ]);
    if (id(r.id) !== videoId)
      throw new AppError(422, "PUBLISH_ID", "Video ID trả về không khớp.");
    const status = r.status as MetaObject | undefined;
    const s = String(status?.video_status ?? "unknown").toLowerCase();
    const posts = await this.client.list<MetaObject>(
      `${pageId}/published_posts`,
      token,
      "id,object_id",
      { limit: "100" },
    );
    const matches = posts.filter((p) => p.object_id === videoId);
    if (matches.length > 1)
      throw new AppError(
        409,
        "PUBLISH_AMBIGUOUS",
        "Nhiều bài viết cho Video ID; chọn Post ID sau kiểm tra thủ công.",
      );
    const postId = matches[0] ? id(matches[0].id) : null;
    if (postId && !postId.startsWith(`${pageId}_`))
      throw new AppError(422, "PUBLISH_PAGE", "Post ID không thuộc Page.");
    return {
      videoId,
      postId,
      status: postId ? "READY" : s === "error" ? "ERROR" : "PROCESSING",
      published: r.published === true || postId !== null,
    };
  }
  async comment(token: string, postId: string, message: string, _key: string) {
    void _key;
    return id(
      (
        await this.client.publisherWrite(token, `${postId}/comments`, {
          message,
        })
      ).id,
    );
  }
  async inspectPost(token: string, pageId: string, postId: string) {
    const r = await this.client.publisherRead(token, postId, [
      "id",
      "object_id",
      "from",
    ]);
    if (
      id(r.id) !== postId ||
      (r.from as MetaObject | undefined)?.id !== pageId
    )
      throw new AppError(
        422,
        "PUBLISH_PAGE",
        "Bài viết không thuộc Page đã chọn.",
      );
    return { postId, videoId: id(r.object_id) };
  }
  async inspectComment(
    token: string,
    pageId: string,
    postId: string,
    commentId: string,
    message: string,
  ) {
    const r = await this.client.publisherRead(token, commentId, [
      "id",
      "from",
      "object",
      "message",
    ]);
    if (
      id(r.id) !== commentId ||
      (r.from as MetaObject | undefined)?.id !== pageId ||
      (r.object as MetaObject | undefined)?.id !== postId ||
      r.message !== message
    )
      throw new AppError(
        422,
        "COMMENT_IDENTITY",
        "Comment không khớp Page/bài viết/nội dung đã xác nhận.",
      );
    return commentId;
  }
}
export class MockPublisher implements PublisherProvider {
  private positions = new Map<string, number>();
  private sizes = new Map<string, number>();
  private number(value: string) {
    return (
      "98" +
      BigInt(
        "0x" + createHash("sha256").update(value).digest("hex").slice(0, 14),
      ).toString()
    );
  }
  async begin(_token: string, _pageId: string, size: number, key: string) {
    const videoId = this.number(key),
      sessionId = videoId;
    this.sizes.set(sessionId, size);
    this.positions.set(sessionId, 0);
    return { videoId, sessionId, start: 0, end: Math.min(size, 1048576) };
  }
  async transfer(
    _token: string,
    _pageId: string,
    sessionId: string,
    start: number,
    chunk: Uint8Array,
  ) {
    const next = start + chunk.length;
    this.positions.set(sessionId, next);
    return {
      start: next,
      end: Math.min(this.sizes.get(sessionId) ?? next, next + 1048576),
    };
  }
  async finish(
    _token: string,
    _pageId: string,
    _sessionId: string,
    _caption: string,
    _title: string,
  ) {
    void [_token, _pageId, _sessionId, _caption, _title];
  }
  async inspect(
    _token: string,
    pageId: string,
    videoId: string,
  ): Promise<PublishState> {
    return {
      videoId,
      postId: `${pageId}_${videoId}`,
      status: "READY",
      published: true,
    };
  }
  async comment(_token: string, postId: string, _message: string, key: string) {
    return `${postId.split("_")[0]}_${this.number(key)}`;
  }
  async inspectPost(_token: string, pageId: string, postId: string) {
    metaObjectId.parse(postId);
    if (!postId.startsWith(`${pageId}_`))
      throw new AppError(
        422,
        "PUBLISH_PAGE",
        "Post không thuộc Page thử nghiệm.",
      );
    return { postId, videoId: postId.split("_")[1] };
  }
  async inspectComment(
    _token: string,
    pageId: string,
    _postId: string,
    commentId: string,
    _message: string,
  ) {
    void _message;
    if (!commentId.startsWith(`${pageId}_`))
      throw new AppError(
        422,
        "COMMENT_IDENTITY",
        "Comment không thuộc Page thử nghiệm.",
      );
    return commentId;
  }
}
const mock = new MockPublisher();
export function publisherFor(source: Source): PublisherProvider {
  if (source === "MOCK") {
    if (!mockEnabled())
      throw new AppError(
        403,
        "MOCK_DISABLED",
        "Chưa bật thử nghiệm Publisher.",
      );
    return mock;
  }
  return new LivePublisher();
}
