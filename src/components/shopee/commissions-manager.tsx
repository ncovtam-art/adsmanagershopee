"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { Notice, EmptyState, Badge } from "../ui";
import { Modal } from "../modal";
import { SourceBadge } from "../meta/source-badge";
import { CommissionImport } from "./commission-import";
import type {
  CommissionData,
  Commission,
  CommissionDetail,
  Tracking,
  Review,
  Batch,
} from "./types";
const statusLabels: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  PAID: "Đã thanh toán",
  REJECTED: "Hủy/từ chối",
};
const scopeLabels: Record<string, string> = {
  UNMATCHED: "Chưa khớp SubID",
  SUBID_ONLY: "Chỉ SubID · chưa tách nguồn",
  PAGE: "Page theo mapping",
  AD: "Ad theo mapping khai báo",
};
export function CommissionsManager({
  manage,
  pageId,
}: {
  manage: boolean;
  pageId?: string;
}) {
  const [loadedData, setData] = useState<CommissionData | null>(null),
    [source, setSource] = useState("LIVE"),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("rows"),
    [tracking, setTracking] = useState<Tracking[]>([]),
    [reviews, setReviews] = useState<Review[]>([]),
    [imports, setImports] = useState<Batch[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [mapping, setMapping] = useState<Commission | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [detail, setDetail] = useState<CommissionDetail | null>(null);
  const data =
    loadedData?.source === source &&
    loadedData.page === page &&
    loadedData.search === search &&
    loadedData.unmatched === (tab === "unmatched" ? "true" : "false")
      ? loadedData
      : null;
  const url = `/api/commissions?${new URLSearchParams({ source, page: String(page), search, unmatched: tab === "unmatched" ? "true" : "false", ...(pageId ? { pageId } : {}) })}`;
  async function load() {
    setData(await requestApi<CommissionData>(url));
    if (manage) {
      const [t, r, i] = await Promise.all([
        requestApi<Tracking[]>("/api/shopee/tracking"),
        requestApi<Review[]>("/api/commissions/reviews"),
        requestApi<Batch[]>("/api/commissions/imports"),
      ]);
      setTracking(t);
      setReviews(r);
      setImports(i);
    }
  }
  useEffect(() => {
    let current = true;
    requestApi<CommissionData>(url)
      .then((result) => {
        if (current) setData(result);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    if (manage)
      Promise.all([
        requestApi<Tracking[]>("/api/shopee/tracking"),
        requestApi<Review[]>("/api/commissions/reviews"),
        requestApi<Batch[]>("/api/commissions/imports"),
      ])
        .then(([t, r, i]) => {
          if (current) {
            setTracking(t);
            setReviews(r);
            setImports(i);
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [url, manage]);
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
  const modal = !!mapping || !!review || !!detail;
  return (
    <div className="shopee-stack">
      <div className="tabs">
        <button
          className={tab === "rows" ? "selected" : ""}
          onClick={() => {
            setTab("rows");
            setPage(1);
          }}
        >
          Hoa hồng Shopee
        </button>
        {manage && (
          <>
            <button
              className={tab === "unmatched" ? "selected" : ""}
              onClick={() => {
                setTab("unmatched");
                setPage(1);
              }}
            >
              Unmatched SubID
            </button>
            <button
              className={tab === "reviews" ? "selected" : ""}
              onClick={() => setTab("reviews")}
            >
              Cần xem xét ({reviews.length})
            </button>
            <button
              className={tab === "imports" ? "selected" : ""}
              onClick={() => setTab("imports")}
            >
              Lịch sử nhập
            </button>
          </>
        )}
        <Link href="/revenue">Ads Analytics & ROAS ở đầu trang</Link>
      </div>
      {error && !modal && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="toolbar">
        <label>
          Nguồn hoa hồng
          <select
            aria-label="Nguồn hoa hồng"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="LIVE">Báo cáo thật</option>
            <option value="MOCK">Dữ liệu thử nghiệm</option>
          </select>
        </label>
        <label>
          Tìm SubID/Order
          <input
            aria-label="Tìm SubID/Order"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="SubID hoặc Order ID"
          />
        </label>
      </div>
      {tab === "reviews" ? (
        <section className="card settings-card">
          <h2>Dòng cần xem xét</h2>
          <p>
            Các dòng này chưa được cộng vào hoa hồng. Xác định đúng từng dòng và
            trạng thái trước khi áp dụng.
          </p>
          {reviews.filter((r) => r.source === source).length === 0 ? (
            <p>Không có dòng cần xem xét trong nguồn đã chọn.</p>
          ) : (
            reviews
              .filter((r) => r.source === source)
              .map((r) => (
                <div className="connection-row" key={r.id}>
                  <div>
                    <strong>
                      Dòng {r.line} ·{" "}
                      {String(
                        r.candidate.orderId ??
                          r.candidate.externalRowId ??
                          "Thiếu định danh",
                      )}
                    </strong>
                    <p>
                      {String(r.candidate.amount)}{" "}
                      {String(r.candidate.currency)} · {r.reasons.join(" ")}
                    </p>
                    <SourceBadge source={r.source} />
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setError("");
                      setReview(r);
                    }}
                  >
                    Xem xét dòng
                  </button>
                </div>
              ))
          )}
        </section>
      ) : tab === "imports" ? (
        <section className="card settings-card">
          <h2>Lịch sử nhập báo cáo</h2>
          {imports
            .filter((i) => i.source === source)
            .map((i) => (
              <div className="connection-row" key={i.id}>
                <div>
                  <strong>{i.filename}</strong>
                  <small>
                    {i.affiliateAccount} ·{" "}
                    {i.state === "APPLIED" ? "Đã nhập" : "Đang preview"} ·{" "}
                    {new Date(i.createdAt).toLocaleString("vi-VN")}
                  </small>
                </div>
                <span>
                  {i.result
                    ? `${i.result.created} mới · ${i.result.updated} cập nhật · ${i.result.review} xem xét`
                    : "Chưa ghi nhận vào báo cáo"}
                </span>
              </div>
            ))}
        </section>
      ) : (
        <>
          <section className="card settings-card">
            <h2>Hoa hồng theo trạng thái</h2>
            <p>
              Tổng chỉ gồm dòng đã nhập trong phạm vi được cấp quyền; nguồn
              thật/thử nghiệm và currency tách riêng. Chờ duyệt/đã duyệt chưa
              phải tiền thực nhận. Xem chi phí và ROAS tại panel Ads Analytics; bảng này giữ các trạng thái hoa hồng để đối soát.
            </p>
            {data?.totals.length ? (
              <div className="commission-totals">
                {data.totals.map((total) => (
                  <div
                    className="card"
                    key={`${total.currency}:${total.status}`}
                  >
                    <small>{statusLabels[total.status]}</small>
                    <strong>{total.amount}</strong>
                    <span>{total.currency}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>— · Chưa có dữ liệu hoa hồng cho nguồn/phạm vi này.</p>
            )}
          </section>
          <section className="card table-scroll">
            {!data && !error ? (
              <p role="status">Đang đọc báo cáo…</p>
            ) : data?.rows.length ? (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Order / dòng</th>
                      <th>SubID / Page mapping</th>
                      <th>Hoa hồng</th>
                      <th>Trạng thái / mức đối soát</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.orderId ?? r.externalRowId ?? "Định danh thủ công"}
                          <small>{r.orderItemId ?? ""}</small>
                        </td>
                        <td>
                          {r.subId || "(trống)"}
                          <small>{r.pageName ?? "Unmatched"}</small>
                        </td>
                        <td>
                          {r.amount} {r.currency}
                          <small>{r.affiliateAccount}</small>
                        </td>
                        <td>
                          <Badge
                            tone={r.status === "PAID" ? "success" : "muted"}
                          >
                            {statusLabels[r.status]}
                          </Badge>
                          <small>{scopeLabels[r.attribution]}</small>
                          {r.matchMethod === "MANUAL" && (
                            <small>Mapping thủ công có audit</small>
                          )}
                        </td>
                        <td>
                          <div className="toolbar">
                            <button
                              className="button secondary small"
                              onClick={() =>
                                act(async () => {
                                  setDetail(
                                    await requestApi(
                                      `/api/commissions/${r.id}`,
                                    ),
                                  );
                                })
                              }
                            >
                              Lịch sử hoa hồng
                            </button>
                            {manage && (
                              <button
                                className="button secondary small"
                                onClick={() => {
                                  setError("");
                                  setMapping(r);
                                }}
                              >
                                Gán tracking
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="toolbar pagination">
                  <button
                    className="button secondary"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Trước
                  </button>
                  <span>
                    Trang {page} · {data.count} dòng
                  </span>
                  <button
                    className="button secondary"
                    disabled={page * 25 >= data.count}
                    onClick={() => setPage(page + 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            ) : (
              <EmptyState
                icon="revenue"
                title={
                  tab === "unmatched"
                    ? "Không có SubID chưa khớp"
                    : "Chưa có dữ liệu hoa hồng"
                }
                description={
                  manage
                    ? "Nhập báo cáo Shopee, kiểm tra preview và xác nhận để đối soát SubID."
                    : "Bạn chỉ thấy hoa hồng gắn với Page/TKQC được cấp quyền."
                }
              />
            )}
          </section>
        </>
      )}
      {manage && !pageId && <CommissionImport onSaved={load} />}
      {mapping && (
        <Modal
          labelledBy="mapping-title"
          pending={busy}
          onClose={() => setMapping(null)}
        >
          <div className="modal-heading">
            <h2 id="mapping-title">Gán hoa hồng vào tracking</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setMapping(null)}
            >
              ×
            </button>
          </div>
          {error && <Notice error>{error}</Notice>}
          <p>
            SubID báo cáo: {mapping.subId || "(trống)"}. Mapping thủ công giữ
            nguyên dữ liệu CSV và có lịch sử/audit.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void act(async () => {
                await requestApi("/api/commissions/match", {
                  method: "POST",
                  body: JSON.stringify({
                    id: mapping.id,
                    trackingId: form.get("trackingId"),
                    reason: form.get("reason"),
                  }),
                });
                setMapping(null);
                await load();
                setMessage("Đã lưu mapping thủ công và lịch sử hoa hồng.");
              });
            }}
          >
            <label>
              Tracking đích
              <select name="trackingId" required data-autofocus>
                <option value="">Chọn tracking cùng nguồn/tài khoản</option>
                {tracking
                  .filter(
                    (t) =>
                      t.source === mapping.source &&
                      t.affiliateAccount === mapping.affiliateAccount,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.subId} · {t.pageName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Lý do mapping
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <button className="button primary" disabled={busy}>
              Xác nhận mapping
            </button>
          </form>
        </Modal>
      )}
      {review && (
        <Modal
          labelledBy="review-title"
          pending={busy}
          onClose={() => setReview(null)}
        >
          <div className="modal-heading">
            <h2 id="review-title">Xem xét dòng hoa hồng</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              ×
            </button>
          </div>
          {error && <Notice error>{error}</Notice>}
          <p>{review.reasons.join(" ")}</p>
          <p>
            Order: {String(review.candidate.orderId ?? "—")} · SubID:{" "}
            {String(review.candidate.subId ?? "—")} ·{" "}
            {String(review.candidate.amount)}{" "}
            {String(review.candidate.currency)}
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void act(async () => {
                const input: Record<string, unknown> = {
                  id: review.id,
                  action: form.get("action"),
                  reason: form.get("reason"),
                };
                for (const key of ["status", "manualKey", "existingId"])
                  if (form.get(key)) input[key] = form.get(key);
                await requestApi("/api/commissions/reviews", {
                  method: "POST",
                  body: JSON.stringify(input),
                });
                setReview(null);
                await load();
                setMessage("Đã xử lý dòng cần xem xét với audit.");
              });
            }}
          >
            <label>
              Quyết định
              <select name="action" data-autofocus>
                <option value="APPLY">Áp dụng dữ liệu đã kiểm tra</option>
                <option value="IGNORE">Bỏ qua dòng này</option>
              </select>
            </label>
            <label>
              Trạng thái đã xác minh
              <select
                name="status"
                defaultValue={String(review.candidate.status ?? "")}
              >
                <option value="">Chọn trạng thái khi áp dụng</option>
                {Object.entries(statusLabels).map(([key, name]) => (
                  <option value={key} key={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {!review.candidate.externalKey && (
              <>
                <label>
                  Định danh dòng thủ công
                  <input
                    name="manualKey"
                    placeholder="Khóa ổn định cho đúng dòng sản phẩm"
                    maxLength={128}
                  />
                </label>
                <label>
                  Hoặc ghép vào dòng đã có
                  <select name="existingId">
                    <option value="">Không ghép dòng đã có</option>
                    {data?.rows
                      .filter(
                        (r) =>
                          r.source === review.source &&
                          r.affiliateAccount === review.affiliateAccount,
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.orderId ?? r.externalRowId ?? r.id} ·{" "}
                          {r.orderItemId ?? ""} · {r.amount}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  Không tạo khóa mới nếu đây là dòng đã có trong báo cáo trước.
                  Cần xem lại CSV nguồn để phân biệt từng sản phẩm.
                </p>
              </>
            )}
            <label>
              Lý do đối soát
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <button className="button primary" disabled={busy}>
              Xác nhận xử lý
            </button>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          labelledBy="commission-history-title"
          onClose={() => setDetail(null)}
        >
          <div className="modal-heading">
            <h2 id="commission-history-title">Lịch sử hoa hồng</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
          </div>
          <p>
            {detail.row.subId} · {detail.row.amount} {detail.row.currency}
          </p>
          {detail.history.map((h) => (
            <div className="connection-row" key={h.id}>
              <div>
                <strong>
                  {h.action === "CREATE"
                    ? "Nhập lần đầu"
                    : h.action === "UPDATE"
                      ? "Cập nhật báo cáo"
                      : h.action === "MANUAL_MAP"
                        ? "Gán tracking thủ công"
                        : "Đối soát thủ công"}
                </strong>
                <p>
                  {h.before
                    ? `${String(h.before.status)} / ${String(h.before.amount)} → `
                    : ""}
                  {String(h.after.status)} / {String(h.after.amount)}
                </p>
                <small>{new Date(h.createdAt).toLocaleString("vi-VN")}</small>
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
