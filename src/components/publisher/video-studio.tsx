"use client";
import { useEffect, useRef, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { EmptyState, Notice, Badge } from "../ui";
import { Modal } from "../modal";
import type { PublisherService } from "@/server/publisher/service";
type Asset = Awaited<ReturnType<PublisherService["library"]>>["rows"][number];
type Job = Awaited<ReturnType<PublisherService["jobs"]>>[number];
type Template = Awaited<ReturnType<PublisherService["templates"]>>[number];
type Policy = Awaited<ReturnType<PublisherService["policy"]>>;
type Preview = Awaited<ReturnType<PublisherService["preview"]>>;
type History = Awaited<ReturnType<PublisherService["history"]>>;
type PageOption = {
  id: string;
  name: string;
  source: "LIVE" | "MOCK";
  status: string;
};
type Product = { id: string; name: string };
const stateLabels: Record<string, string> = {
  NEW: "Chờ tải file",
  UPLOADING: "Đang tải",
  READY: "Sẵn sàng",
  QUEUED: "Chờ worker",
  SCHEDULED: "Đã lên lịch",
  PROCESSING: "Đang xử lý",
  PROCESSING_META: "Meta đang xử lý",
  SUCCEEDED: "Thành công",
  FAILED: "Lỗi chắc chắn",
  UNKNOWN: "Chưa rõ kết quả · không gửi lại",
  PAUSED: "Tạm dừng",
  CANCELLED: "Đã hủy",
  DEAD_LETTER: "Cần xử lý thủ công",
  UNSUPPORTED: "Không được API hỗ trợ",
};
const warningLabels: Record<string, string> = {
  VIDEO_DUPLICATE_HASH:
    "File trùng hash: giữ file và cần xác nhận đăng lại nếu đã đăng",
  SHARED_LINK: "Link dùng chung: không chứng minh attribution Ads",
  USER_DECLARED_LINK:
    "Custom Link/SubID do người dùng khai báo, chưa được Shopee API xác minh",
  PREVIEW_UNSUPPORTED:
    "Gỡ preview link chưa được API hỗ trợ: comment sẽ không tự gửi",
};
function time(value: string | Date) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
function uploadFile(
  id: string,
  file: File,
  onProgress: (n: number) => void,
  ref: { current: XMLHttpRequest | null },
) {
  return new Promise<Asset>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    ref.current = xhr;
    xhr.open("PUT", `/api/videos/${id}`);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.floor((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json.data);
        else reject(new Error(json.error?.message ?? "Tải video thất bại."));
      } catch {
        reject(new Error("Không đọc được phản hồi upload."));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error("Mất kết nối khi upload. Tệp chưa READY sẽ không được đăng."),
      );
    xhr.onabort = () =>
      reject(new Error("Đã hủy upload. Ticket cũ không dùng lại."));
    xhr.send(file);
  });
}
export function VideoStudio({
  write,
  manage,
  userId,
  adsWrite = false,
  pageId: fixedPage,
}: {
  write: boolean;
  manage: boolean;
  userId: string;
  adsWrite?: boolean;
  pageId?: string;
}) {
  const [source, setSource] = useState("LIVE"),
    [pageId, setPageId] = useState(fixedPage ?? ""),
    [pages, setPages] = useState<PageOption[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [tab, setTab] = useState("library"),
    [search, setSearch] = useState(""),
    [number, setNumber] = useState(1),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [library, setLibrary] = useState<{
      key: string;
      rows: Asset[];
      count: number;
    } | null>(null),
    [queue, setQueue] = useState<{ key: string; rows: Job[] } | null>(null),
    [paused, setPaused] = useState(false),
    [files, setFiles] = useState<
      Array<{ file: File; productId: string; niche: string }>
    >([]),
    [uploadProgress, setUploadProgress] = useState<{
      name: string;
      percent: number;
    } | null>(null);
  const [caption, setCaption] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [schedule, setSchedule] = useState(""),
    [timezone, setTimezone] = useState("+07:00"),
    [allowRepost, setAllowRepost] = useState(false),
    [trackings, setTrackings] = useState<
      Array<{
        id: string;
        contentId: string | null;
        subId: string;
        channel: string;
        status: string;
      }>
    >([]),
    [trackingIds, setTrackingIds] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
      data: Preview;
      input: Record<string, unknown>;
      requestKey: string;
    } | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [policy, setPolicy] = useState<Policy | null>(null),
    [template, setTemplate] = useState<{
      name: string;
      kind: "CAPTION" | "COMMENT";
      body: string;
      scope: string;
      niche: string;
      pageId?: string;
      id?: string;
    } | null>(null),
    [player, setPlayer] = useState<Asset | null>(null),
    [history, setHistory] = useState<{ job: Job; rows: History } | null>(null),
    [recover, setRecover] = useState<Job | null>(null),
    [externalId, setExternalId] = useState(""),
    [reason, setReason] = useState(""),
    [recoveryConfirmed, setRecoveryConfirmed] = useState(false),
    [affiliateAccount, setAffiliateAccount] = useState("shopee_vn");
  const xhr = useRef<XMLHttpRequest | null>(null),
    cancelUpload = useRef(false);
  const scopeKey = `${userId}:${source}:${pageId}`,
    libKey = `${scopeKey}:${number}:${search}`,
    rows = library?.key === libKey ? library.rows : [],
    jobs = queue?.key === scopeKey ? queue.rows : [],
    pageOptions = pages.filter(
      (p) => p.source === source && (!fixedPage || p.id === fixedPage),
    ),
    picked = rows.filter((a) => selected.includes(a.id));
  useEffect(() => {
    let live = true;
    Promise.all([
      requestApi<PageOption[]>("/api/pages"),
      requestApi<Product[]>("/api/products"),
      requestApi<Template[]>("/api/publisher/templates"),
    ])
      .then(([p, prod, t]) => {
        if (live) {
          setPages(p);
          setProducts(prod);
          setTemplates(t);
          if (fixedPage) {
            const page = p.find((x) => x.id === fixedPage);
            if (page) setSource(page.source);
          }
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [fixedPage]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({
        source,
        page: String(number),
        search,
        ...(pageId ? { pageId } : {}),
      });
      Promise.all([
        requestApi<{ rows: Asset[]; count: number }>(`/api/videos?${query}`),
        requestApi<Job[]>(
          `/api/publisher/jobs?${new URLSearchParams({ source, ...(pageId ? { pageId } : {}) })}`,
        ),
        requestApi<{ paused: boolean }>("/api/publisher/control"),
        requestApi<typeof trackings>(
          `/api/shopee/tracking${pageId ? `?pageId=${pageId}` : ""}`,
        ),
      ])
        .then(([a, j, c, t]) => {
          if (live) {
            setLibrary({ key: libKey, ...a });
            setQueue({ key: scopeKey, rows: j });
            setPaused(c.paused);
            setTrackings(t);
          }
        })
        .catch((e) => {
          if (live) {
            setError(e.message);
            setLibrary(null);
            setQueue(null);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source, pageId, number, search, reload, libKey, scopeKey]);
  useEffect(() => {
    const timer = setInterval(() => setReload((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      if (success) setMessage(success);
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function chooseFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = Array.from(list);
    if (next.length > 100) {
      setError("Mỗi lượt tối đa 100 video.");
      return;
    }
    if (
      next.some(
        (f) =>
          !f.name.toLowerCase().endsWith(".mp4") ||
          f.size > 300 * 1024 * 1024 ||
          !f.size,
      )
    ) {
      setError("Chỉ nhận MP4/H.264 có nội dung, ≤300 MB mỗi file.");
      return;
    }
    setFiles(next.map((file) => ({ file, productId: "", niche: "" })));
    setError("");
  }
  async function upload() {
    if (!pageId || !files.length) return;
    cancelUpload.current = false;
    await act(async () => {
      let duplicates = 0;
      for (const item of files) {
        if (cancelUpload.current) break;
        const ticket = await requestApi<Asset>("/api/videos", {
          method: "POST",
          body: JSON.stringify({
            pageId,
            filename: item.file.name,
            size: item.file.size,
            productId: item.productId || null,
            niche: item.niche,
          }),
        });
        const ready = await uploadFile(
          ticket.id,
          item.file,
          (n) => setUploadProgress({ name: item.file.name, percent: n }),
          xhr,
        );
        if (ready.duplicateOf) duplicates++;
      }
      setFiles([]);
      setUploadProgress(null);
      xhr.current = null;
      setMessage(
        `Upload hoàn tất; ${duplicates} file trùng hash được giữ và cảnh báo.`,
      );
    }, "");
  }
  async function makePreview() {
    await act(async () => {
      const publishAt = schedule
        ? new Date(schedule + timezone).toISOString()
        : null;
      const input = {
        assetIds: picked.map((a) => a.id),
        trackingIds: Object.fromEntries(
          picked
            .filter((a) => trackingIds[a.id])
            .map((a) => [a.id, trackingIds[a.id]]),
        ),
        caption,
        templateId: templateId || null,
        publishAt,
        allowRepost,
      };
      const data = await requestApi<Preview>("/api/publisher/preview", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setPreview({ data, input, requestKey: crypto.randomUUID() });
      setConfirmed(false);
    }, "");
  }
  function switchSource(value: string) {
    setSource(value);
    if (!fixedPage) setPageId("");
    setSelected([]);
    setTrackingIds({});
    setNumber(1);
    setPreview(null);
    setPlayer(null);
    setHistory(null);
    setRecover(null);
  }
  const tabs = [
    ["library", "Video Library"],
    ["bulk", "Đăng hàng loạt"],
    ["schedule", "Lịch đăng"],
    ["posted", "Bài viết đã đăng"],
    ["queue", "Publish Queue"],
    ["templates", "Caption Templates"],
  ];
  const shownJobs = jobs.filter((j) =>
    tab === "posted"
      ? j.kind === "VIDEO" && j.state === "SUCCEEDED"
      : tab === "schedule"
        ? j.state === "SCHEDULED"
        : true,
  );
  return (
    <section className="video-studio" aria-label="Video Publisher">
      <section className="card">
        <div className="section-heading">
          <div>
            <div className="eyebrow">VIDEO STUDIO</div>
            <h2>Kho video & lịch đăng</h2>
          </div>
          <Badge tone={source === "MOCK" ? "warning" : "purple"}>
            {source === "MOCK" ? "MOCK · Không đăng Facebook thật" : "LIVE"}
          </Badge>
        </div>
        <p className="muted">
          Upload → gắn sản phẩm/SubID/Custom Link → preview → xác nhận → worker.
          File riêng trong storage có quyền; lịch hiển thị UTC+7. UNKNOWN cần
          kiểm tra ID trước khi retry.
        </p>
        <div className="studio-toolbar">
          <label>
            Nguồn video
            <select
              aria-label="Nguồn video"
              disabled={busy || !!fixedPage}
              value={source}
              onChange={(e) => switchSource(e.target.value)}
            >
              <option>LIVE</option>
              <option>MOCK</option>
            </select>
          </label>
          <label>
            Page video
            <select
              aria-label="Page video"
              value={pageId}
              disabled={busy || !!fixedPage}
              onChange={(e) => {
                setPageId(e.target.value);
                setSelected([]);
                setNumber(1);
                setTrackingIds({});
              }}
            >
              <option value="">Tất cả Page · chọn một Page để upload</option>
              {pageOptions.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {manage && (
            <button
              className="button secondary"
              disabled={!pageId || busy}
              onClick={() =>
                act(
                  async () =>
                    setPolicy(
                      await requestApi<Policy>(
                        `/api/publisher/policy?pageId=${pageId}`,
                      ),
                    ),
                  "",
                )
              }
            >
              Cấu hình đăng & comment
            </button>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setReload((n) => n + 1)}
          >
            Làm mới
          </button>
        </div>
        <div
          className="tabs publisher-tabs"
          role="tablist"
          aria-label="Chức năng Publisher"
        >
          {tabs.map(([key, name]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!pageOptions.length && (
        <section className="card">
          <EmptyState
            icon="pages"
            title="Chưa có Page cho nguồn này"
            description="Lưu Page trong Cài đặt → Facebook hoặc nhờ quản trị viên cấp quyền Page trước khi chuẩn bị video."
          />
        </section>
      )}
      {(tab === "library" || tab === "bulk") && (
        <>
          {write && (
            <section className="card">
              <h3>Upload video theo Page</h3>
              <div
                className="video-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) chooseFiles(e.dataTransfer.files);
                }}
              >
                <label>
                  Kéo thả hoặc chọn nhiều video MP4
                  <input
                    aria-label="Tệp video MP4"
                    disabled={busy}
                    type="file"
                    accept="video/mp4,.mp4"
                    multiple
                    onChange={(e) => chooseFiles(e.target.files)}
                  />
                </label>
                <p className="muted">
                  Tối đa 100 video/lượt, 300 MB/file. Mỗi file đi qua stream
                  upload riêng; không tự xóa file trùng.
                </p>
              </div>
              {files.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Sản phẩm</th>
                        <th>Ngách</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((item, i) => (
                        <tr key={i}>
                          <td>
                            {item.file.name} ·{" "}
                            {(item.file.size / 1048576).toFixed(1)} MB
                          </td>
                          <td>
                            <select
                              aria-label={`Sản phẩm file ${i + 1}`}
                              disabled={busy}
                              value={item.productId}
                              onChange={(e) =>
                                setFiles((old) =>
                                  old.map((f, n) =>
                                    n === i
                                      ? { ...f, productId: e.target.value }
                                      : f,
                                  ),
                                )
                              }
                            >
                              <option value="">Chưa gắn sản phẩm</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`Ngách file ${i + 1}`}
                              disabled={busy}
                              value={item.niche}
                              maxLength={100}
                              onChange={(e) =>
                                setFiles((old) =>
                                  old.map((f, n) =>
                                    n === i
                                      ? { ...f, niche: e.target.value }
                                      : f,
                                  ),
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={!pageId || !files.length || busy}
                  onClick={upload}
                >
                  Upload video đã chọn
                </button>
                {uploadProgress && (
                  <>
                    <span role="status">
                      {uploadProgress.name}: {uploadProgress.percent}%
                    </span>
                    <button
                      className="button secondary"
                      onClick={() => {
                        cancelUpload.current = true;
                        xhr.current?.abort();
                      }}
                    >
                      Hủy upload
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
          <section className="card">
            <div className="section-heading">
              <h3>Video Library</h3>
              <Badge>{library?.key === libKey ? library.count : 0} video</Badge>
            </div>
            <label>
              Tìm video
              <input
                aria-label="Tìm video"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setNumber(1);
                  setSelected([]);
                }}
                placeholder="Tên file"
              />
            </label>
            {loading && !rows.length ? (
              <p role="status">Đang đọc thư viện…</p>
            ) : !rows.length ? (
              <EmptyState
                icon="videos"
                title="Chưa có video phù hợp"
                description="Upload video vào Page; file phải được kiểm tra metadata trước khi vào Publish Queue."
              />
            ) : (
              <div className="table-scroll">
                <table className="data-table video-library">
                  <thead>
                    <tr>
                      {write && <th>Chọn</th>}
                      <th>Video / Page</th>
                      <th>Metadata</th>
                      <th>Sản phẩm / SubID</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        {write && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Chọn video ${a.filename}`}
                              disabled={a.state !== "READY" || busy}
                              checked={selected.includes(a.id)}
                              onChange={(e) =>
                                setSelected((old) =>
                                  e.target.checked
                                    ? [...old, a.id]
                                    : old.filter((id) => id !== a.id),
                                )
                              }
                            />
                          </td>
                        )}
                        <td>
                          <button
                            className="text-button"
                            disabled={a.state !== "READY"}
                            onClick={() => setPlayer(a)}
                          >
                            {a.filename}
                          </button>
                          <small>
                            {a.pageName} · {a.source}
                          </small>
                          <small>{a.niche || "Chưa gắn ngách"}</small>
                        </td>
                        <td>
                          {a.width && a.height
                            ? `${a.width}×${a.height} · ${a.aspectRatio}`
                            : "—"}
                          <small>
                            {a.durationMs
                              ? `${(a.durationMs / 1000).toFixed(1)} giây`
                              : "—"}{" "}
                            · {(a.size / 1048576).toFixed(1)} MB
                          </small>
                          <small title={a.sha256 ?? ""}>
                            Hash: {a.sha256?.slice(0, 12) ?? "—"}
                          </small>
                        </td>
                        <td>
                          {a.productName ?? "Chưa gắn sản phẩm"}
                          {trackings
                            .filter((t) => t.contentId === a.id)
                            .map((t) => (
                              <small key={t.id}>
                                {t.subId} · {t.channel} · {t.status}
                              </small>
                            ))}
                          {write && a.productId && a.state === "READY" && (
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  () =>
                                    requestApi("/api/publisher/tracking", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        assetId: a.id,
                                        affiliateAccount,
                                      }),
                                    }),
                                  "Đã tạo SubID Organic cho video. Gắn Custom Link ở Cài đặt → Shopee.",
                                )
                              }
                            >
                              Tạo SubID Organic
                            </button>
                          )}
                        </td>
                        <td>
                          <Badge
                            tone={a.state === "READY" ? "success" : "warning"}
                          >
                            {stateLabels[a.state] ?? a.state}
                          </Badge>
                          {a.duplicateOf && (
                            <small className="quality-warning">
                              Trùng hash · giữ file
                            </small>
                          )}
                          {a.errorCode && <small>{a.errorCode}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="button-row">
              <button
                className="button secondary"
                disabled={number <= 1}
                onClick={() => {
                  setNumber((n) => n - 1);
                  setSelected([]);
                }}
              >
                Trang trước
              </button>
              <span>Trang {number}</span>
              <button
                className="button secondary"
                disabled={!library || number * 50 >= library.count}
                onClick={() => {
                  setNumber((n) => n + 1);
                  setSelected([]);
                }}
              >
                Trang sau
              </button>
              {write && (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      setSelected(
                        rows
                          .filter((a) => a.state === "READY")
                          .map((a) => a.id),
                      )
                    }
                  >
                    Chọn video sẵn sàng
                  </button>
                  <label>
                    Mã tài khoản Shopee
                    <input
                      aria-label="Mã tài khoản Shopee video"
                      value={affiliateAccount}
                      onChange={(e) => setAffiliateAccount(e.target.value)}
                      maxLength={64}
                    />
                  </label>
                </>
              )}
            </div>
          </section>
          {write && (
            <section className="card">
              <h3>Chuẩn bị {picked.length} video để đăng</h3>
              <div className="studio-toolbar">
                <label>
                  Caption Template
                  <select
                    aria-label="Caption Template Publisher"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="">
                      Tự chọn template Page/ngách/chung; dùng caption nhập nếu
                      không có
                    </option>
                    {templates
                      .filter((t) => t.kind === "CAPTION")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Lịch đăng video
                  <input
                    aria-label="Lịch đăng video"
                    type="datetime-local"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                </label>
                <label>
                  Múi giờ nhập lịch
                  <select
                    aria-label="Múi giờ lịch video"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    <option value="+07:00">UTC+7 · Việt Nam</option>
                    <option value="+00:00">UTC</option>
                  </select>
                </label>
              </div>
              <label>
                Caption nhập tay
                <textarea
                  aria-label="Caption nhập tay"
                  value={caption}
                  maxLength={8000}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Nội dung hoặc {video_name}, {product_name}, {affiliate_url}, {sub_id}, {page_name}"
                />
              </label>
              <p className="muted">
                Không nhập lịch = đăng khi worker nhận job sau xác nhận.
                Template ưu tiên Page → ngách → chung. Custom Link được chốt
                theo phiên bản tại lúc xác nhận.
              </p>
              {picked.map((a) => (
                <label key={a.id}>
                  Tracking cho {a.filename}
                  <select
                    aria-label={`Tracking cho ${a.filename}`}
                    value={trackingIds[a.id] ?? ""}
                    onChange={(e) =>
                      setTrackingIds((old) => ({
                        ...old,
                        [a.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Không dùng link / tracking</option>
                    {trackings
                      .filter(
                        (t) => t.contentId === a.id && t.channel !== "ADS",
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.subId} · {t.status}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={allowRepost}
                  onChange={(e) => setAllowRepost(e.target.checked)}
                />
                Cho phép đăng lại video đã đăng (không cho phép nếu job cũ
                UNKNOWN/đang xử lý).
              </label>
              <button
                className="button primary"
                disabled={!picked.length || busy}
                onClick={makePreview}
              >
                Xem preview đăng video
              </button>
            </section>
          )}
        </>
      )}
      {["queue", "schedule", "posted"].includes(tab) && (
        <section className="card">
          <div className="section-heading">
            <h3>
              {tab === "posted"
                ? "Bài viết đã đăng"
                : tab === "schedule"
                  ? "Lịch đăng · UTC+7"
                  : "Publish Queue & Comment"}
            </h3>
            <Badge tone={paused ? "warning" : "success"}>
              {paused ? "Queue tạm dừng" : "Queue được phép chạy"}
            </Badge>
          </div>
          {manage && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    requestApi("/api/publisher/control", {
                      method: "POST",
                      body: JSON.stringify({ paused: !paused }),
                    }),
                  paused
                    ? "Đã tiếp tục nhận jobs mới."
                    : "Đã tạm dừng jobs mới; job đang gửi cần chờ kết quả.",
                )
              }
            >
              {paused ? "Tiếp tục queue" : "Tạm dừng queue"}
            </button>
          )}
          <p className="muted">
            Tối đa 500 jobs gần nhất trong phạm vi Page. Worker chạy riêng;
            Redis có thể được khôi phục từ jobs trong Database. Tạm dừng không
            thu hồi thao tác đang gửi Meta.
          </p>
          {!shownJobs.length ? (
            <EmptyState
              icon="clock"
              title="Chưa có job phù hợp"
              description="Chuẩn bị video, xem preview rồi xác nhận. App không tự đăng khi mới upload."
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Video / Page</th>
                    <th>Loại / lịch</th>
                    <th>Kết quả</th>
                    <th>IDs</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {shownJobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        {j.filename}
                        <small>
                          {j.pageName} · {j.source}
                        </small>
                      </td>
                      <td>
                        {j.kind === "VIDEO" ? "Video" : "Comment"}
                        <small>{time(j.availableAt)} UTC+7</small>
                      </td>
                      <td>
                        <Badge
                          tone={j.state === "SUCCEEDED" ? "success" : "warning"}
                        >
                          {stateLabels[j.state] ?? j.state}
                        </Badge>
                        <small>
                          {j.progress}% · attempt {j.attempts} · {j.phase}
                        </small>
                        {j.errorCode && <small>{j.errorCode}</small>}
                      </td>
                      <td>
                        <small>Video: {j.metaVideoId ?? "—"}</small>
                        <small>Post: {j.postId ?? "—"}</small>
                        <small>Comment: {j.commentId ?? "—"}</small>
                        <small>{j.provenance ?? "Chưa xác minh"}</small>
                      </td>
                      <td>
                        <div className="job-actions">
                          {adsWrite && j.kind === "VIDEO" && j.state === "SUCCEEDED" && <a className="button primary small" href={`/ads?publishJobId=${j.id}`}>Chạy quảng cáo</a>}
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                async () =>
                                  setHistory({
                                    job: j,
                                    rows: await requestApi<History>(
                                      `/api/publisher/jobs/${j.id}`,
                                    ),
                                  }),
                                "",
                              )
                            }
                          >
                            Lịch sử job
                          </button>
                          {write && (
                            <>
                              {["QUEUED", "SCHEDULED"].includes(j.state) && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      () =>
                                        requestApi("/api/publisher/actions", {
                                          method: "POST",
                                          body: JSON.stringify({
                                            id: j.id,
                                            action: "pause",
                                          }),
                                        }),
                                      "Đã tạm dừng job.",
                                    )
                                  }
                                >
                                  Tạm dừng job
                                </button>
                              )}
                              {j.state === "PAUSED" && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      () =>
                                        requestApi("/api/publisher/actions", {
                                          method: "POST",
                                          body: JSON.stringify({
                                            id: j.id,
                                            action: "resume",
                                          }),
                                        }),
                                      "Đã tiếp tục job.",
                                    )
                                  }
                                >
                                  Tiếp tục job
                                </button>
                              )}
                              {[
                                "QUEUED",
                                "SCHEDULED",
                                "PAUSED",
                                "FAILED",
                                "DEAD_LETTER",
                              ].includes(j.state) &&
                                ((j.kind === "VIDEO" && !j.postId) ||
                                  (j.kind === "COMMENT" && !j.commentId)) && (
                                  <button
                                    className="button secondary small"
                                    disabled={busy}
                                    onClick={() =>
                                      act(
                                        () =>
                                          requestApi("/api/publisher/actions", {
                                            method: "POST",
                                            body: JSON.stringify({
                                              id: j.id,
                                              action: "cancel",
                                            }),
                                          }),
                                        "Đã hủy job chưa đăng.",
                                      )
                                    }
                                  >
                                    Hủy job
                                  </button>
                                )}
                              {["FAILED", "DEAD_LETTER"].includes(j.state) && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      () =>
                                        requestApi("/api/publisher/actions", {
                                          method: "POST",
                                          body: JSON.stringify({
                                            id: j.id,
                                            action: "retry",
                                          }),
                                        }),
                                      "Đã chuẩn bị retry lỗi chắc chắn; không gửi lại UNKNOWN.",
                                    )
                                  }
                                >
                                  Retry lỗi chắc chắn
                                </button>
                              )}
                              {["UNKNOWN", "PROCESSING_META"].includes(
                                j.state,
                              ) && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() => {
                                    setRecover(j);
                                    setExternalId("");
                                    setReason("");
                                    setRecoveryConfirmed(false);
                                  }}
                                >
                                  Kiểm tra / nối ID
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "templates" && (
        <section className="card">
          <div className="section-heading">
            <h3>Caption & Comment Templates</h3>
            {write && (
              <button
                className="button primary"
                onClick={() =>
                  setTemplate({
                    name: "",
                    kind: "CAPTION",
                    body: "",
                    scope: pageId ? "page" : "global",
                    pageId: pageId || undefined,
                    niche: "",
                  })
                }
              >
                Thêm template
              </button>
            )}
          </div>
          <p className="muted">
            Biến hỗ trợ:{" "}
            {
              "{video_name}, {page_name}, {product_name}, {affiliate_url}, {sub_id}"
            }
            . Page/ngách/chung được ghép an toàn, không chạy code.
          </p>
          {!templates.length ? (
            <EmptyState
              icon="videos"
              title="Chưa có template"
              description="Tạo Caption hoặc Comment template. Uploader chỉ tạo theo Page đã cấp quyền."
            />
          ) : (
            <div className="template-list">
              {templates.map((t) => (
                <article key={t.id}>
                  <h4>
                    {t.name} <Badge>{t.kind}</Badge>
                  </h4>
                  <small>
                    {t.pageId
                      ? (pages.find((p) => p.id === t.pageId)?.name ??
                        "Theo Page")
                      : t.niche
                        ? `Ngách ${t.niche}`
                        : "Chung"}
                  </small>
                  <p>{t.body}</p>
                  {write && (manage || t.pageId) && (
                    <button
                      className="button secondary small"
                      onClick={() =>
                        setTemplate({
                          id: t.id,
                          name: t.name,
                          kind: t.kind as "CAPTION" | "COMMENT",
                          body: t.body,
                          scope: t.pageId
                            ? "page"
                            : t.niche
                              ? "niche"
                              : "global",
                          niche: t.niche ?? "",
                          pageId: t.pageId ?? undefined,
                        })
                      }
                    >
                      Sửa template
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {player && (
        <Modal labelledBy="video-player" onClose={() => setPlayer(null)}>
          <div className="modal-heading">
            <h2 id="video-player">{player.filename}</h2>
            <button
              className="button secondary"
              data-autofocus
              onClick={() => setPlayer(null)}
            >
              Đóng
            </button>
          </div>
          <video
            controls
            preload="metadata"
            src={`/api/videos/${player.id}/media`}
            className="video-player"
          />
          <p>
            {player.pageName} · {player.source} · {player.width}×{player.height}{" "}
            · {player.aspectRatio}
          </p>
          <p className="muted">File hash: {player.sha256}</p>
        </Modal>
      )}
      {preview && (
        <Modal
          labelledBy="publish-preview"
          onClose={() => setPreview(null)}
          pending={busy}
        >
          <h2 id="publish-preview">
            Preview trước khi đăng · {preview.data.source}
          </h2>
          <p>
            {preview.data.rows.length} video ·{" "}
            {preview.data.publishAt
              ? time(preview.data.publishAt) + " UTC+7"
              : "Nhận job ngay sau xác nhận"}
          </p>
          {preview.data.rows.map((r) => (
            <article className="publish-preview-row" key={r.assetId}>
              <h3>
                {r.filename} → {r.pageName}
              </h3>
              <p>{r.caption || "Không có caption"}</p>
              <p>SubID: {r.subId ?? "—"}</p>
              <p>Comment: {r.commentBody ?? "Không tự comment"}</p>
              <p>Delay: {r.commentPolicy.delaySeconds}s</p>
              <ul>
                {r.warnings.map((w) => (
                  <li key={w}>{warningLabels[w] ?? w}</li>
                ))}
              </ul>
            </article>
          ))}
          <label className="check-label">
            <input
              data-autofocus
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {preview.data.source === "LIVE"
              ? "Tôi xác nhận đăng Facebook LIVE cho các video/Page, caption và lịch ở preview này."
              : "Tôi xác nhận chạy Publisher MOCK; không đăng lên Facebook thật."}
          </label>
          {error && <Notice error>{error}</Notice>}
          <div className="button-row">
            <button
              className="button primary"
              disabled={!confirmed || busy}
              onClick={() =>
                act(async () => {
                  await requestApi("/api/publisher/confirm", {
                    method: "POST",
                    body: JSON.stringify({
                      ...preview.input,
                      fingerprint: preview.data.fingerprint,
                      requestKey: preview.requestKey,
                      confirmed: true,
                    }),
                  });
                  setPreview(null);
                  setSelected([]);
                  setSchedule("");
                  setAllowRepost(false);
                  setTab("queue");
                }, "Đã xác nhận batch vào Publish Queue. Worker xử lý riêng.")
              }
            >
              Xác nhận thêm vào hàng đợi
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
      {policy && (
        <Modal
          labelledBy="publish-policy"
          onClose={() => setPolicy(null)}
          pending={busy}
        >
          <h2 id="publish-policy">Cấu hình đăng & comment của Page</h2>
          <p>
            Chỉ OWNER/ADMIN bật tính năng. Quyền/token thực vẫn được kiểm tra
            trước mỗi thao tác.
          </p>
          <label className="check-label">
            <input
              data-autofocus
              type="checkbox"
              checked={policy.enabled}
              onChange={(e) =>
                setPolicy({ ...policy, enabled: e.target.checked })
              }
            />
            Cho phép đăng video trên Page này
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={policy.autoComment}
              onChange={(e) =>
                setPolicy({ ...policy, autoComment: e.target.checked })
              }
            />
            Auto-comment Custom Link sau khi có Post ID
          </label>
          <label>
            Comment delay (giây)
            <input
              type="number"
              min={0}
              max={86400}
              value={policy.delaySeconds}
              onChange={(e) =>
                setPolicy({ ...policy, delaySeconds: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Comment template
            <select
              aria-label="Comment template Publisher"
              value={policy.commentTemplateId ?? ""}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  commentTemplateId: e.target.value || null,
                })
              }
            >
              <option value="">
                Tự chọn Page/ngách/chung hoặc mẫu mặc định
              </option>
              {templates
                .filter(
                  (t) =>
                    t.kind === "COMMENT" &&
                    (!t.pageId || t.pageId === policy.pageId),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={policy.removePreview}
              onChange={(e) =>
                setPolicy({ ...policy, removePreview: e.target.checked })
              }
            />
            Yêu cầu gỡ preview link trong comment
          </label>
          <p className="quality-warning">
            UNSUPPORTED: chưa có tham số Meta API được xác minh để gỡ preview.
            Nếu chọn, comment job sẽ không tự gửi; cần xử lý thủ công.
          </p>
          {error && <Notice error>{error}</Notice>}
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const { previewCapability, ...input } = policy;
                  void previewCapability;
                  await requestApi("/api/publisher/policy", {
                    method: "POST",
                    body: JSON.stringify(input),
                  });
                  setPolicy(null);
                }, "Đã lưu cấu hình Page có audit.")
              }
            >
              Lưu cấu hình Publisher
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPolicy(null)}
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
      {template && (
        <Modal
          labelledBy="publish-template"
          onClose={() => setTemplate(null)}
          pending={busy}
        >
          <h2 id="publish-template">Template nội dung</h2>
          <label>
            Tên template
            <input
              aria-label="Tên template Publisher"
              data-autofocus
              value={template.name}
              maxLength={100}
              onChange={(e) =>
                setTemplate({ ...template, name: e.target.value })
              }
            />
          </label>
          <label>
            Loại template
            <select
              aria-label="Loại template Publisher"
              value={template.kind}
              onChange={(e) =>
                setTemplate({
                  ...template,
                  kind: e.target.value as "CAPTION" | "COMMENT",
                })
              }
            >
              <option value="CAPTION">Caption</option>
              <option value="COMMENT">Comment</option>
            </select>
          </label>
          <label>
            Phạm vi template
            <select
              aria-label="Phạm vi template Publisher"
              value={template.scope}
              onChange={(e) =>
                setTemplate({ ...template, scope: e.target.value })
              }
            >
              {template.pageId && <option value="page">Theo Page</option>}
              {manage && (
                <>
                  <option value="global">Chung</option>
                  <option value="niche">Theo ngách</option>
                </>
              )}
            </select>
          </label>
          {template.scope === "niche" && (
            <label>
              Ngách template
              <input
                value={template.niche}
                onChange={(e) =>
                  setTemplate({ ...template, niche: e.target.value })
                }
              />
            </label>
          )}
          <label>
            Nội dung template
            <textarea
              aria-label="Nội dung template Publisher"
              value={template.body}
              maxLength={8000}
              onChange={(e) =>
                setTemplate({ ...template, body: e.target.value })
              }
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <div className="button-row">
            <button
              className="button primary"
              disabled={
                busy ||
                !template.name.trim() ||
                !template.body.trim() ||
                (!manage && !template.pageId)
              }
              onClick={() =>
                act(async () => {
                  await requestApi("/api/publisher/templates", {
                    method: "POST",
                    body: JSON.stringify({
                      id: template.id,
                      name: template.name,
                      kind: template.kind,
                      body: template.body,
                      pageId: template.scope === "page" ? template.pageId : null,
                      niche: template.scope === "niche" ? template.niche : null,
                    }),
                  });
                  setTemplates(
                    await requestApi<Template[]>("/api/publisher/templates"),
                  );
                  setTemplate(null);
                }, "Đã lưu template.")
              }
            >
              Lưu template Publisher
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setTemplate(null)}
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal
          sidePanel
          labelledBy="publish-history"
          onClose={() => setHistory(null)}
        >
          <div className="modal-heading">
            <h2 id="publish-history">Lịch sử {history.job.kind}</h2>
            <button
              className="button secondary"
              data-autofocus
              onClick={() => setHistory(null)}
            >
              Đóng
            </button>
          </div>
          <p>
            {history.job.filename} · {history.job.pageName} ·{" "}
            {history.job.source}
          </p>
          <p>
            Post: {history.job.postId ?? "—"} · Comment:{" "}
            {history.job.commentId ?? "—"}
          </p>
          <p>Caption: {history.job.caption}</p>
          <p>Comment: {history.job.commentBody ?? "—"}</p>
          <ol className="publish-timeline">
            {history.rows.map((h) => (
              <li key={h.id}>
                <strong>{h.action}</strong>
                <small>{time(h.createdAt)} UTC+7</small>
                <pre>{JSON.stringify(h.details, null, 2)}</pre>
              </li>
            ))}
          </ol>
        </Modal>
      )}
      {recover && (
        <Modal
          labelledBy="publish-recover"
          onClose={() => setRecover(null)}
          pending={busy}
        >
          <h2 id="publish-recover">Kiểm tra kết quả · {recover.kind}</h2>
          <p>
            UNKNOWN không được gửi lại. Kiểm tra Page và chọn đúng ID; nhập ID
            là xác nhận thủ công, không chứng minh file hash độc lập trên Meta.
          </p>
          {recover.kind === "VIDEO" && recover.metaVideoId && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    requestApi("/api/publisher/recover", {
                      method: "POST",
                      body: JSON.stringify({ id: recover.id }),
                    }),
                  "Đã kiểm tra Meta. Xem trạng thái job; nếu chưa có Post ID thì tiếp tục chờ, không đăng lại.",
                )
              }
            >
              Đọc trạng thái Video ID
            </button>
          )}
          <label>
            {recover.kind === "VIDEO"
              ? "Post ID đã kiểm tra"
              : "Comment ID đã kiểm tra"}
            <input
              aria-label="ID kết quả Publisher"
              data-autofocus
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
            />
          </label>
          <label>
            Lý do xác nhận
            <textarea
              aria-label="Lý do recovery Publisher"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={recoveryConfirmed}
              onChange={(e) => setRecoveryConfirmed(e.target.checked)}
            />
            Tôi đã kiểm tra ID đúng Page, video/bài viết/nội dung của job này.
          </label>
          {error && <Notice error>{error}</Notice>}
          <div className="button-row">
            <button
              className="button primary"
              disabled={
                !externalId ||
                reason.trim().length < 5 ||
                !recoveryConfirmed ||
                busy
              }
              onClick={() =>
                act(async () => {
                  await requestApi("/api/publisher/recover", {
                    method: "POST",
                    body: JSON.stringify({
                      id: recover.id,
                      externalId,
                      confirmed: true,
                      reason,
                    }),
                  });
                  setRecover(null);
                }, "Đã nối ID thực sau kiểm tra và lưu audit; không gửi lại nội dung.")
              }
            >
              Nối kết quả đã kiểm tra
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setRecover(null)}
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
