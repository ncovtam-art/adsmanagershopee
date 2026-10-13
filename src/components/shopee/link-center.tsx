"use client";
import { useEffect, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { Notice, EmptyState, Badge, Icon } from "../ui";
import { Modal } from "../modal";
import { SourceBadge } from "../meta/source-badge";
import type { PageRow } from "../meta/types";
import type { Product, Tracking, TrackingDetail } from "./types";
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export async function uploadCsv<T>(
  url: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  form.set("file", file);
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  const response = await fetch(url, { method: "POST", body: form });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Không thể đọc tệp.");
  return payload.data as T;
}
export function LinkCenter({
  write,
  productsWrite,
  pageId,
}: {
  write: boolean;
  productsWrite: boolean;
  pageId?: string;
}) {
  const [products, setProducts] = useState<Product[]>([]),
    [records, setRecords] = useState<Tracking[] | null>(null),
    [pages, setPages] = useState<PageRow[]>([]),
    [tab, setTab] = useState("tracking"),
    [search, setSearch] = useState(""),
    [source, setSource] = useState("all"),
    [selected, setSelected] = useState<string[]>([]);
  const [createProduct, setCreateProduct] = useState(false),
    [createTracking, setCreateTracking] = useState(false),
    [link, setLink] = useState<Tracking | null>(null),
    [detail, setDetail] = useState<TrackingDetail | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [pageIds, setPageIds] = useState<string[]>(pageId ? [pageId] : []);
  async function load() {
    const [p, r, pg] = await Promise.all([
      requestApi<Product[]>("/api/products"),
      requestApi<Tracking[]>(
        `/api/shopee/tracking${pageId ? `?pageId=${pageId}` : ""}`,
      ),
      requestApi<PageRow[]>("/api/pages"),
    ]);
    setProducts(p);
    setRecords(r);
    setPages(pageId ? pg.filter((p) => p.id === pageId) : pg);
  }
  useEffect(() => {
    Promise.all([
      requestApi<Product[]>("/api/products"),
      requestApi<Tracking[]>(
        `/api/shopee/tracking${pageId ? `?pageId=${pageId}` : ""}`,
      ),
      requestApi<PageRow[]>("/api/pages"),
    ])
      .then(([p, r, pg]) => {
        setProducts(p);
        setRecords(r);
        setPages(pageId ? pg.filter((p) => p.id === pageId) : pg);
      })
      .catch((e) => setError(e.message));
  }, [pageId]);
  async function act(callback: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await callback();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered =
    records?.filter(
      (r) =>
        (source === "all" || r.source === source) &&
        [r.subId, r.productName, r.pageName, r.contentRef].some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        ),
    ) ?? [];
  const modalError =
    createProduct || createTracking || link || detail ? error : "";
  return (
    <div className="shopee-stack">
      <section className="card settings-card">
        <div className="section-heading">
          <div>
            <h2>Shopee Link Center</h2>
            <p>
              Chuẩn bị SubID, tạo Custom Link trong Shopee, rồi lưu kết quả vào
              đúng record.
            </p>
          </div>
          <Badge tone="purple">Manual / Assisted Bulk</Badge>
        </div>
        <p>
          Link được người dùng xác nhận, chưa được API Shopee xác minh. Tracking
          Organic và Ads riêng; dùng chung link sẽ có cảnh báo giới hạn phân bổ.
        </p>
        <div className="tabs">
          <button
            className={tab === "tracking" ? "selected" : ""}
            onClick={() => setTab("tracking")}
          >
            Tracking & Custom Link
          </button>
          <button
            className={tab === "products" ? "selected" : ""}
            onClick={() => setTab("products")}
          >
            Sản phẩm
          </button>
        </div>
        {error && !modalError && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        {tab === "products" ? (
          <>
            <div className="toolbar">
              {productsWrite && (
                <button
                  className="button primary"
                  onClick={() => {
                    setError("");
                    setCreateProduct(true);
                  }}
                >
                  Thêm sản phẩm
                </button>
              )}
            </div>
            {products.length === 0 ? (
              <EmptyState
                icon="link"
                title="Chưa có sản phẩm"
                description="Thêm tên và URL sản phẩm Shopee Việt Nam để chuẩn bị tracking."
              />
            ) : (
              <div className="page-grid">
                {products.map((p) => (
                  <article className="card donor-tile" key={p.id}>
                    <h3>{p.name}</h3>
                    <p>{p.niche || "Chưa đặt ngách"}</p>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link"
                    >
                      Mở sản phẩm trên Shopee
                    </a>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="toolbar page-toolbar">
              <label className="search-field">
                <Icon name="search" size={18} />
                <input
                  aria-label="Tìm tracking"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm SubID, Page, sản phẩm…"
                />
              </label>
              <select
                aria-label="Nguồn tracking"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="all">Tất cả nguồn</option>
                <option value="LIVE">Thật</option>
                <option value="MOCK">Thử nghiệm</option>
              </select>
              {write && (
                <button
                  className="button primary"
                  onClick={() => {
                    setError("");
                    setCreateTracking(true);
                  }}
                >
                  Tạo tracking
                </button>
              )}
            </div>
            {records === null && !error ? (
              <p role="status">Đang đọc tracking…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="link"
                title="Chưa có tracking phù hợp"
                description="Chọn Page và sản phẩm để tạo SubID duy nhất. Mỗi record giữ mapping riêng."
              />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Chọn</th>
                      <th>SubID / Page</th>
                      <th>Sản phẩm / nội dung</th>
                      <th>Nguồn / kênh</th>
                      <th>Link</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${r.subId}`}
                            checked={selected.includes(r.id)}
                            onChange={() =>
                              setSelected(
                                selected.includes(r.id)
                                  ? selected.filter((id) => id !== r.id)
                                  : [...selected, r.id],
                              )
                            }
                          />
                        </td>
                        <td>
                          <strong>{r.subId}</strong>
                          <small>{r.pageName}</small>
                          <small>{r.affiliateAccount}</small>
                        </td>
                        <td>
                          {r.productName}
                          <small>
                            {r.contentRef || "Chưa ghi tham chiếu nội dung"}
                          </small>
                        </td>
                        <td>
                          <SourceBadge source={r.source} />
                          <small>{r.channel}</small>
                        </td>
                        <td>
                          <Badge
                            tone={r.status === "READY" ? "success" : "warning"}
                          >
                            {r.status === "READY"
                              ? "Sẵn sàng · xác nhận thủ công"
                              : "Cần tạo Custom Link"}
                          </Badge>
                          {(r.sharedLink || r.channel === "SHARED") && (
                            <small className="tracking-warning">
                              Dùng chung nguồn/link — chỉ đối soát ở mức SubID
                            </small>
                          )}
                        </td>
                        <td>
                          <div className="toolbar">
                            {write && (
                              <button
                                className="button secondary small"
                                onClick={() => {
                                  setError("");
                                  setLink(r);
                                }}
                              >
                                Gắn Custom Link
                              </button>
                            )}
                            <button
                              className="button secondary small"
                              onClick={() =>
                                act(async () => {
                                  setDetail(
                                    await requestApi(
                                      `/api/shopee/tracking/${r.id}`,
                                    ),
                                  );
                                })
                              }
                            >
                              Lịch sử link
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="toolbar page-toolbar">
                <button
                  className="button secondary"
                  onClick={() =>
                    setSelected([
                      ...new Set([
                        ...selected,
                        ...filtered.slice(0, 100).map((r) => r.id),
                      ]),
                    ])
                  }
                >
                  Chọn tất cả đang hiển thị
                </button>
                <button
                  className="button secondary"
                  disabled={selected.length === 0 || busy}
                  onClick={() =>
                    act(async () => {
                      const data = await requestApi<{ csv: string }>(
                        "/api/shopee/export",
                        {
                          method: "POST",
                          body: JSON.stringify({ ids: selected }),
                        },
                      );
                      downloadCsv("shopee-link-preparation.csv", data.csv);
                    })
                  }
                >
                  Xuất danh sách chuẩn bị
                </button>
                <button
                  className="button secondary"
                  disabled={selected.length === 0}
                  onClick={() => {
                    const rows = selected.map(
                      (id) => records!.find((r) => r.id === id)!,
                    );
                    downloadCsv(
                      "shopee-link-results.csv",
                      "\uFEFFtracking_id,sub_id,affiliate_url\r\n" +
                        rows.map((r) => `${r.id},${r.subId},`).join("\r\n"),
                    );
                  }}
                >
                  Tải mẫu trả kết quả
                </button>
                <span>{selected.length} record đã chọn · tối đa 100/lần</span>
              </div>
            )}
            {write && (
              <div className="bulk-return">
                <h3>Nhập kết quả Custom Link hàng loạt</h3>
                <p>
                  Dùng mẫu trả kết quả: tracking_id,sub_id,affiliate_url. Có thể
                  đổi thứ tự dòng; app kiểm đúng ID + SubID trước lưu toàn bộ
                  batch.
                </p>
                <input
                  type="file"
                  accept=".csv"
                  aria-label="CSV kết quả Custom Link"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Tôi đã tạo các Custom Link trong Shopee với đúng SubID của
                  từng record.
                </label>
                <button
                  className="button secondary"
                  disabled={!file || !confirmed || busy}
                  onClick={() =>
                    act(async () => {
                      const result = await uploadCsv<{ changed: number }>(
                        "/api/shopee/links/import",
                        file!,
                        { confirmed: "true" },
                      );
                      await load();
                      setMessage(
                        `Đã lưu ${result.changed} phiên bản link; các dòng không đổi được giữ nguyên.`,
                      );
                    })
                  }
                >
                  Nhập kết quả link
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {createProduct && (
        <Modal
          labelledBy="product-title"
          onClose={() => setCreateProduct(false)}
          pending={busy}
        >
          <div className="modal-heading">
            <h2 id="product-title">Thêm sản phẩm</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setCreateProduct(false)}
            >
              ×
            </button>
          </div>
          {modalError && <Notice error>{modalError}</Notice>}
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void act(async () => {
                await requestApi("/api/products", {
                  method: "POST",
                  body: JSON.stringify({
                    name: form.get("name"),
                    url: form.get("url"),
                    niche: form.get("niche"),
                  }),
                });
                setCreateProduct(false);
                await load();
                setMessage("Đã lưu sản phẩm.");
              });
            }}
          >
            <label>
              Tên sản phẩm
              <input name="name" data-autofocus required maxLength={150} />
            </label>
            <label>
              URL sản phẩm
              <input
                name="url"
                type="url"
                required
                placeholder="https://shopee.vn/…"
              />
            </label>
            <label>
              Ngách sản phẩm
              <input name="niche" maxLength={100} />
            </label>
            <button className="button primary" disabled={busy}>
              Lưu sản phẩm
            </button>
          </form>
        </Modal>
      )}
      {createTracking && (
        <Modal
          labelledBy="tracking-title"
          onClose={() => setCreateTracking(false)}
          pending={busy}
        >
          <div className="modal-heading">
            <h2 id="tracking-title">Tạo tracking & SubID</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setCreateTracking(false)}
            >
              ×
            </button>
          </div>
          {modalError && <Notice error>{modalError}</Notice>}
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void act(async () => {
                const input: Record<string, unknown> = {
                  pageIds,
                  productId: form.get("productId"),
                  affiliateAccount: form.get("affiliateAccount"),
                  channel: form.get("channel"),
                  contentRef: form.get("contentRef"),
                };
                for (const key of ["campaignId", "adSetId", "adId"])
                  if (form.get(key)) input[key] = form.get(key);
                const result = await requestApi<Array<{ subId: string }>>(
                  "/api/shopee/tracking",
                  { method: "POST", body: JSON.stringify(input) },
                );
                setCreateTracking(false);
                await load();
                setMessage(
                  `Đã tạo ${result.length} SubID duy nhất. Tiếp theo tạo Custom Link trong Shopee.`,
                );
              });
            }}
          >
            <label>
              Sản phẩm tracking
              <select name="productId" required data-autofocus>
                <option value="">Chọn sản phẩm</option>
                {products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Mã tài khoản Shopee
              <input
                name="affiliateAccount"
                required
                defaultValue="shopee_vn"
                maxLength={64}
              />
            </label>
            <p>
              Dùng cùng mã này khi nhập báo cáo. Tách mã cho các tài khoản
              Affiliate khác nhau.
            </p>
            <label>
              Kênh tracking
              <select name="channel">
                <option value="ORGANIC">Organic</option>
                <option value="ADS">Ads</option>
                <option value="SHARED">Dùng chung Organic/Ads</option>
              </select>
            </label>
            <label>
              Tham chiếu nội dung
              <input
                name="contentRef"
                maxLength={200}
                placeholder="Tên/ID do bạn ghi; chưa liên kết Video Library"
              />
            </label>
            <fieldset>
              <legend>Chọn Page</legend>
              <button
                className="button secondary small"
                type="button"
                onClick={() => setPageIds(pages.slice(0, 100).map((p) => p.id))}
              >
                Chọn tất cả Page
              </button>
              <div className="selection-list">
                {pages.map((p) => (
                  <label className="selection-item" key={p.id}>
                    <input
                      type="checkbox"
                      checked={pageIds.includes(p.id)}
                      onChange={() =>
                        setPageIds(
                          pageIds.includes(p.id)
                            ? pageIds.filter((id) => id !== p.id)
                            : [...pageIds, p.id],
                        )
                      }
                    />
                    <span>
                      {p.name}
                      <SourceBadge source={p.source} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details>
              <summary>Mapping Ads đã có (tùy chọn)</summary>
              <p>
                Để trống khi chuẩn bị link trước khi tạo Ads. Nhập đủ 3 ID sẽ
                được xác minh qua kết nối Meta của TKQC chính; chỉ chọn một
                Page.
              </p>
              {["Campaign ID", "Ad Set ID", "Ad ID"].map((label, index) => (
                <label key={label}>
                  {label}
                  <input
                    name={["campaignId", "adSetId", "adId"][index]}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </label>
              ))}
            </details>
            <button
              className="button primary"
              disabled={busy || pageIds.length === 0}
            >
              Tạo SubID
            </button>
          </form>
        </Modal>
      )}
      {link && (
        <Modal
          labelledBy="link-title"
          onClose={() => setLink(null)}
          pending={busy}
        >
          <div className="modal-heading">
            <h2 id="link-title">Gắn Custom Link</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setLink(null)}
            >
              ×
            </button>
          </div>
          {modalError && <Notice error>{modalError}</Notice>}
          <SourceBadge source={link.source} />
          <p>
            SubID: <strong>{link.subId}</strong> · {link.pageName}
          </p>
          <p>
            Product URL:{" "}
            <a
              href={link.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              {link.productUrl}
            </a>
          </p>
          <p>
            Tạo link bằng Custom Link trong Shopee với SubID này, rồi dán kết
            quả. App không tự thêm SubID vào URL.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void act(async () => {
                await requestApi("/api/shopee/links", {
                  method: "POST",
                  body: JSON.stringify({
                    trackingId: link.id,
                    subId: link.subId,
                    url: form.get("url"),
                    confirmed: form.get("confirmed") === "on",
                  }),
                });
                setLink(null);
                await load();
                setMessage(
                  "Đã lưu phiên bản Custom Link do bạn xác nhận; chưa có xác minh API Shopee.",
                );
              });
            }}
          >
            <label>
              Affiliate URL
              <input
                type="url"
                name="url"
                required
                defaultValue={link.url ?? ""}
                data-autofocus
              />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="confirmed" required />
              Tôi đã tạo Custom Link trong Shopee với đúng SubID này.
            </label>
            <button className="button primary" disabled={busy}>
              Lưu Custom Link
            </button>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal labelledBy="link-history-title" onClose={() => setDetail(null)}>
          <div className="modal-heading">
            <h2 id="link-history-title">Lịch sử Custom Link</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
          </div>
          <p>
            {detail.subId} · {detail.channel}
          </p>
          {detail.versions.length === 0 ? (
            <p>Chưa gắn link.</p>
          ) : (
            detail.versions.map((v) => (
              <div className="connection-row" key={v.id}>
                <div>
                  <strong>Version {v.version}</strong>
                  <p>
                    <a
                      className="text-link"
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {v.url}
                    </a>
                  </p>
                  <small>
                    Xác nhận thủ công ·{" "}
                    {new Date(v.createdAt).toLocaleString("vi-VN")}
                  </small>
                </div>
              </div>
            ))
          )}
        </Modal>
      )}
    </div>
  );
}
