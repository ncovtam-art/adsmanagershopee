"use client";
import { useEffect, useState, useRef } from "react";
import { requestApi } from "@/lib/client-api";
import { Modal } from "../modal";
import { Notice, Badge, EmptyState } from "../ui";
import type { AdsService } from "@/server/ads/service";
import type { AdsInput } from "@/server/ads/validation";
type Option = Awaited<ReturnType<AdsService["options"]>>[number];
type Preview = Awaited<ReturnType<AdsService["preview"]>>;
type Job = Awaited<ReturnType<AdsService["list"]>>[number];
type Donor = {
  id: string;
  name: string;
  accountId: string;
  source: "LIVE" | "MOCK";
  versions: { id: string; version: number }[];
};
type Tracking = {
  id: string;
  contentId: string | null;
  channel: string;
  subId: string;
  status: string;
  adId: string | null;
  url: string | null;
};
const labels: Record<string, string> = {
  QUEUED: "Chờ worker",
  WAITING: "Chờ parent batch",
  PROCESSING: "Đang tạo/xác minh",
  SUCCEEDED: "Đã xác minh PAUSED",
  FAILED: "Lỗi chắc chắn",
  UNKNOWN: "Chưa rõ kết quả · không gửi lại",
  CANCELLED: "Đã hủy",
};
export function AdsManager({
  initialJobId,
  userId,
}: {
  initialJobId?: string;
  userId: string;
}) {
  const [options, setOptions] = useState<Option[]>([]),
    [donors, setDonors] = useState<Donor[]>([]),
    [tracking, setTracking] = useState<Tracking[]>([]),
    [jobs, setJobs] = useState<Job[]>([]);
  const [source, setSource] = useState<"LIVE" | "MOCK">("LIVE"),
    [open, setOpen] = useState(false),
    [input, setInput] = useState<AdsInput>({
      publishJobId: "",
      donorVersionId: "",
      name: "Video Ads",
      mode: "NEW_CREATIVE",
      facebookOnly: false,
      acknowledgeDonorChanges: false,
    });
  const [preview, setPreview] = useState<Preview | null>(null),
    [requestKey, setRequestKey] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [affiliateAccount, setAffiliateAccount] = useState("shopee_vn");
  const [history, setHistory] = useState<Awaited<
      ReturnType<AdsService["history"]>
    > | null>(null),
    [recover, setRecover] = useState<Job | null>(null),
    [externalId, setExternalId] = useState(""),
    [reason, setReason] = useState(""),
    [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const context = useRef(userId);
  useEffect(() => {
    context.current = userId;
  }, [userId]);
  async function refresh() {
    const identity = userId;
    const [o, d, t, j] = await Promise.all([
      requestApi<Option[]>("/api/ads/options"),
      requestApi<Donor[]>("/api/donors"),
      requestApi<Tracking[]>("/api/shopee/tracking"),
      requestApi<Job[]>("/api/ads/requests"),
    ]);
    if (context.current !== identity) return;
    setOptions(o);
    setDonors(d);
    setTracking(t);
    setJobs(j);
    if (initialJobId && !initial.current) {
      const selected = o.find((o) => o.id === initialJobId);
      if (selected) {
        initial.current = true;
        setSource(selected.source);
        setInput((v) => ({ ...v, publishJobId: selected.id }));
        setOpen(true);
      }
    }
    return o;
  }
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useRef(false);
  const chosen = options.find((o) => o.id === input.publishJobId);
  function edit(values: Partial<AdsInput>) {
    setInput((v) => ({ ...v, ...values }));
    setPreview(null);
    setConfirmed(false);
  }
  async function act(fn: () => Promise<unknown>, success = "") {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (success) setMessage(success);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedTracks = tracking.filter(
    (t) => t.contentId === chosen?.assetId && t.channel === "ADS" && !t.adId,
  );
  return (
    <section className="card ads-manager" id="ads-from-donor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CREATE ADS FROM DONOR</span>
          <h2>Tạo Ads từ Donor</h2>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setPreview(null);
            setOpen(true);
            setError("");
          }}
        >
          Tạo Ads PAUSED
        </button>
      </div>
      <p className="muted">
        Một video/bài đã đăng → Donor version → compatibility → preview/xác nhận
        → worker. Campaign, Ad Set và Ad mới luôn PAUSED; không tự bật quảng
        cáo.
      </p>
      <label>
        Nguồn Ads
        <select
          aria-label="Nguồn Ads từ Donor"
          value={source}
          onChange={(e) => setSource(e.target.value as "LIVE" | "MOCK")}
        >
          <option>LIVE</option>
          <option>MOCK</option>
        </select>
      </label>
      {source === "MOCK" && (
        <Notice>MOCK · không tạo quảng cáo Facebook thật</Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {!jobs.filter((j) => j.source === source).length ? (
        <EmptyState
          icon="ads"
          title="Chưa có Ads request"
          description="Chọn video đã đăng, kiểm tra Donor và tạo PAUSED sau preview."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nguồn / chế độ</th>
                <th>Trạng thái</th>
                <th>IDs mới</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {jobs
                .filter((j) => j.source === source)
                .map((j) => (
                  <tr key={j.id}>
                    <td>
                      {j.source} · {j.mode}
                      <small>{j.id}</small>
                    </td>
                    <td>
                      <Badge
                        tone={j.state === "SUCCEEDED" ? "success" : "warning"}
                      >
                        {labels[j.state]}
                      </Badge>
                      <small>
                        {j.phase} · {j.attempts} lần · {j.errorCode}
                      </small>
                    </td>
                    <td>
                      <small>Campaign: {j.campaignId ?? "—"}</small>
                      <small>Ad Set: {j.adSetId ?? "—"}</small>
                      <small>Creative: {j.creativeId ?? "—"}</small>
                      <small>Ad: {j.adId ?? "—"}</small>
                    </td>
                    <td>
                      <div className="job-actions">
                      {j.state === "SUCCEEDED" && <a className="button secondary small" href={`/ads?cloneRequestId=${j.id}`}>Nhân bản Ads</a>}
                        <button
                          className="button secondary small"
                          onClick={() =>
                            act(async () =>
                              setHistory(
                                await requestApi(`/api/ads/history?id=${j.id}`),
                              ),
                            )
                          }
                        >
                          Lịch sử Ads
                        </button>
                        {j.state === "QUEUED" && j.phase === "NONE" && !j.bulkBatchId && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  requestApi("/api/ads/actions", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      id: j.id,
                                      action: "cancel",
                                    }),
                                  }),
                                "Đã hủy request chưa tạo.",
                              )
                            }
                          >
                            Hủy Ads request
                          </button>
                        )}
                        {j.state === "FAILED" && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  requestApi("/api/ads/actions", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      id: j.id,
                                      action: "retry",
                                    }),
                                  }),
                                "Đã xếp lại lỗi chắc chắn; giữ IDs đã tạo.",
                              )
                            }
                          >
                            Retry Ads
                          </button>
                        )}
                        {j.state === "UNKNOWN" && (
                          <button
                            className="button secondary small"
                            onClick={() => {
                              setRecover(j);
                              setExternalId("");
                              setReason("");
                              setRecoveryConfirmed(false);
                            }}
                          >
                            Kiểm tra / nối Ads ID
                          </button>
                        )}
                        {j.source === "LIVE" && j.adId && (
                          <a
                            className="button secondary small"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${j.adId}`}
                          >
                            Mở Ads Manager
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Modal
          labelledBy="ads-wizard"
          onClose={() => setOpen(false)}
          pending={busy}
        >
          <div className="ads-wizard">
            <h2 id="ads-wizard">Ads Wizard · mặc định PAUSED</h2>
            <label>
              Video đã đăng
              <select
                aria-label="Video đã đăng cho Ads"
                data-autofocus
                value={input.publishJobId}
                onChange={(e) =>
                  edit({ publishJobId: e.target.value, trackingId: undefined })
                }
              >
                <option value="">Chọn bài video đúng Page/TKQC</option>
                {options
                  .filter((o) => o.source === source)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.filename} · {o.pageName} · {o.accountName}
                    </option>
                  ))}
              </select>
            </label>
            {chosen && (
              <Notice>
                {chosen.source} · {chosen.pageName} → {chosen.accountName} ·{" "}
                {chosen.currency} · {chosen.timezone}
                <br />
                Post: {chosen.postId} · Video: {chosen.videoId}
              </Notice>
            )}
            <label>
              Donor version
              <select
                aria-label="Donor version cho Ads"
                value={input.donorVersionId}
                onChange={(e) => edit({ donorVersionId: e.target.value })}
              >
                <option value="">Chọn version bất biến</option>
                {donors
                  .filter((d) => d.source === source)
                  .flatMap((d) =>
                    d.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {d.name} · v{v.version}
                      </option>
                    )),
                  )}
              </select>
            </label>
            <label>
              Tên quảng cáo
              <input
                aria-label="Tên quảng cáo mới"
                value={input.name}
                maxLength={60}
                onChange={(e) => edit({ name: e.target.value })}
              />
            </label>
            <label>
              Chế độ Creative
              <select
                aria-label="Chế độ Ads Creative"
                value={input.mode}
                onChange={(e) =>
                  edit({
                    mode: e.target.value as AdsInput["mode"],
                    objective: undefined,
                    optimization: undefined,
                    trackingId: undefined,
                    message: undefined,
                    cta: undefined,
                  })
                }
              >
                <option value="NEW_CREATIVE">
                  New Creative · video + Custom Link riêng
                </option>
                <option value="EXISTING_POST">
                  Existing Post · giữ bài/link gốc
                </option>
              </select>
            </label>
            {input.mode === "EXISTING_POST" ? (
              <Notice>
                Không gắn CTA/link/SubID mới độc lập vào Existing Post.
                Attribution giữ mức SubID/SHARED; chọn Engagement/Post
                Engagement hoặc dùng New Creative.
              </Notice>
            ) : (
              <>
                <label>
                  Mã tài khoản Affiliate
                  <input
                    aria-label="Mã Affiliate Ads"
                    value={affiliateAccount}
                    onChange={(e) => setAffiliateAccount(e.target.value)}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !chosen}
                  onClick={() =>
                    act(async () => {
                      const rows = await requestApi<Tracking[]>(
                        "/api/ads/tracking",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            publishJobId: input.publishJobId,
                            affiliateAccount,
                          }),
                        },
                      );
                      edit({ trackingId: rows[0].id });
                    }, "Đã tạo ADS SubID riêng. Tạo Custom Link bên Shopee rồi nhập tại Link Center.")
                  }
                >
                  Tạo ADS SubID riêng
                </button>
                <a href="/settings?tab=shopee" target="_blank" rel="noreferrer">
                  Mở Shopee Link Center
                </a>
                <label>
                  Tracking ADS đúng video
                  <select
                    aria-label="Tracking ADS cho Creative"
                    value={input.trackingId ?? ""}
                    onChange={(e) =>
                      edit({ trackingId: e.target.value || undefined })
                    }
                  >
                    <option value="">
                      Chọn tracking đã có Custom Link riêng
                    </option>
                    {selectedTracks.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.subId} · {t.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Message override
                  <textarea
                    aria-label="Message Ads override"
                    value={input.message ?? ""}
                    onChange={(e) =>
                      edit({ message: e.target.value || undefined })
                    }
                    maxLength={8000}
                  />
                </label>
                <label>
                  CTA override
                  <select
                    aria-label="CTA Ads override"
                    value={input.cta ?? ""}
                    onChange={(e) =>
                      edit({
                        cta: e.target.value
                          ? (e.target.value as AdsInput["cta"])
                          : undefined,
                      })
                    }
                  >
                    <option value="">Theo Donor</option>
                    <option>LEARN_MORE</option>
                    <option>SHOP_NOW</option>
                  </select>
                </label>
              </>
            )}
            <label>
              Objective override
              <select
                aria-label="Objective Ads override"
                value={input.objective ?? ""}
                onChange={(e) =>
                  edit({
                    objective: e.target.value
                      ? (e.target.value as AdsInput["objective"])
                      : undefined,
                  })
                }
              >
                <option value="">Theo Donor</option>
                <option>OUTCOME_TRAFFIC</option>
                <option>OUTCOME_ENGAGEMENT</option>
              </select>
            </label>
            <label>
              Optimization override
              <select
                aria-label="Optimization Ads override"
                value={input.optimization ?? ""}
                onChange={(e) =>
                  edit({
                    optimization: e.target.value
                      ? (e.target.value as AdsInput["optimization"])
                      : undefined,
                  })
                }
              >
                <option value="">Theo Donor</option>
                <option>LINK_CLICKS</option>
                <option>POST_ENGAGEMENT</option>
              </select>
            </label>
            <label>
              Ngân sách override · đơn vị nhỏ nhất theo{" "}
              {chosen?.currency ?? "TKQC"}
              <input
                aria-label="Ngân sách Ads override"
                value={input.budget ?? ""}
                inputMode="numeric"
                onChange={(e) => edit({ budget: e.target.value || undefined })}
              />
            </label>
            <label>
              Start time mới (ISO có UTC offset)
              <input
                aria-label="Start Ads ISO"
                placeholder="2026-10-20T09:00:00+07:00"
                value={input.startTime ?? ""}
                onChange={(e) =>
                  edit({ startTime: e.target.value || undefined })
                }
              />
            </label>
            <label>
              End time mới · bắt buộc lifetime
              <input
                aria-label="End Ads ISO"
                value={input.endTime ?? ""}
                onChange={(e) => edit({ endTime: e.target.value || undefined })}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={input.facebookOnly}
                onChange={(e) => edit({ facebookOnly: e.target.checked })}
              />
              Override placements sang Facebook Feed
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={input.acknowledgeDonorChanges}
                onChange={(e) =>
                  edit({ acknowledgeDonorChanges: e.target.checked })
                }
              />
              Tôi đã kiểm tra targeting chuẩn hóa, audience/pixel và lịch cũ bị
              loại
            </label>
            <button
              className="button secondary"
              disabled={busy || !input.publishJobId || !input.donorVersionId}
              onClick={() =>
                act(async () => {
                  const p = await requestApi<Preview>("/api/ads/preview", {
                    method: "POST",
                    body: JSON.stringify(input),
                  });
                  setPreview(p);
                  setRequestKey(crypto.randomUUID());
                  setConfirmed(false);
                })
              }
            >
              Kiểm tra compatibility / Preview Ads
            </button>
            {preview && (
              <section className="card">
                <h3>Compatibility: {preview.state}</h3>
                <p>
                  {preview.pageName} → {preview.accountName} ·{" "}
                  {preview.donorName} v{preview.donorVersion}
                </p>
                {preview.findings.map((f, i) => (
                  <Notice key={i} error>
                    {f.state} · {f.field}: {f.reason}
                    <br />
                    Cách sửa: {f.fix}
                  </Notice>
                ))}
                {preview.warnings.map((w, i) => (
                  <p className="muted" key={i}>
                    {w}
                  </p>
                ))}
                <p>
                  SubID: {preview.snapshot.subId ?? "—"} · Link:{" "}
                  {preview.snapshot.affiliateUrl ?? "—"}
                </p>
                <pre className="json-preview">
                  {JSON.stringify(preview.snapshot, null, 2)}
                </pre>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Tôi xác nhận tạo {preview.source} Campaign, Ad Set, Creative
                  và Ad mới PAUSED
                </label>
                <button
                  className="button primary"
                  disabled={busy || preview.state !== "READY" || !confirmed}
                  onClick={() =>
                    act(async () => {
                      await requestApi("/api/ads/confirm", {
                        method: "POST",
                        body: JSON.stringify({
                          ...input,
                          requestKey,
                          fingerprint: preview.fingerprint,
                          confirmed: true,
                        }),
                      });
                      setOpen(false);
                      setPreview(null);
                    }, "Đã xác nhận Ads request. Worker tạo và xác minh từng ID; không bật Ads.")
                  }
                >
                  Xác nhận tạo Ads PAUSED
                </button>
              </section>
            )}
            {error && <Notice error>{error}</Notice>}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Đóng wizard Ads
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal labelledBy="ads-history" onClose={() => setHistory(null)}>
          <h2 id="ads-history">Lịch sử tạo Ads</h2>
          <pre className="json-preview">{JSON.stringify(history, null, 2)}</pre>
          <button className="button secondary" onClick={() => setHistory(null)}>
            Đóng lịch sử Ads
          </button>
        </Modal>
      )}
      {recover && (
        <Modal
          labelledBy="ads-recover"
          onClose={() => setRecover(null)}
          pending={busy}
        >
          <h2 id="ads-recover">Kiểm tra UNKNOWN · {recover.phase}</h2>
          <p>
            Chỉ đọc/xác minh ID, không gửi lại create. ID phải đúng TKQC, tên
            marker request, cấu hình và quan hệ cha.
          </p>
          <label>
            ID đối tượng đúng bước
            <input
              aria-label="Ads ID recovery"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
            />
          </label>
          <label>
            Lý do nối ID
            <input
              aria-label="Lý do Ads recovery"
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
            Tôi đã đối chiếu đối tượng thực trong Ads Manager
          </label>
          {error && <Notice error>{error}</Notice>}
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await requestApi("/api/ads/recover", {
                  method: "POST",
                  body: JSON.stringify({
                    id: recover.id,
                    ...(externalId
                      ? { externalId, reason, confirmed: recoveryConfirmed }
                      : {}),
                  }),
                });
                setRecover(null);
              }, "Đã xác minh ID, tiếp tục từ bước còn thiếu; không tạo lại ID cũ.")
            }
          >
            Đọc / xác minh Ads ID
          </button>
        </Modal>
      )}
    </section>
  );
}
