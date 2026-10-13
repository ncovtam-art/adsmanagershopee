"use client";
import { useEffect, useRef, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { Badge, Notice, EmptyState, Icon } from "../ui";
import { Modal } from "../modal";
import { SourceBadge } from "./source-badge";
import type { AccountRow, DonorRow, DonorPreview, DonorDetail } from "./types";
const initial = {
  name: "",
  accountId: "",
  campaignId: "",
  adSetId: "",
  adId: "",
  adsManagerUrl: "",
};
type Input = typeof initial & { donorId?: string };
export function DonorsManager({ write }: { write: boolean }) {
  const [rows, setRows] = useState<DonorRow[] | null>(null),
    [accounts, setAccounts] = useState<AccountRow[]>([]),
    [search, setSearch] = useState(""),
    [source, setSource] = useState("all");
  const [input, setInput] = useState<Input | null>(null),
    [preview, setPreview] = useState<DonorPreview | null>(null),
    [detail, setDetail] = useState<DonorDetail | null>(null),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [library, a] = await Promise.all([
      requestApi<DonorRow[]>("/api/donors"),
      requestApi<AccountRow[]>("/api/ad-accounts"),
    ]);
    setRows(library);
    setAccounts(a);
  }
  useEffect(() => {
    Promise.all([
      requestApi<DonorRow[]>("/api/donors"),
      requestApi<AccountRow[]>("/api/ad-accounts"),
    ])
      .then(([library, a]) => {
        setRows(library);
        setAccounts(a);
      })
      .catch((e) => setError(e.message));
  }, []);
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
    rows?.filter(
      (row) =>
        row.name.toLowerCase().includes(search.toLowerCase()) &&
        (source === "all" || source === row.source),
    ) ?? [];
  const account = accounts.find((a) => a.id === input?.accountId);
  return (
    <>
      <div className="tabs">
        <span className="selected">Ads Donor</span>
        <span>Tạo Ads · Giai đoạn 7</span>
        <span>Chăm sóc Ads · Giai đoạn 9</span>
      </div>
      {error && !input && !detail && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="toolbar page-toolbar">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            aria-label="Tìm Donor"
            placeholder="Tìm tên Donor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Nguồn Donor"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">Tất cả nguồn</option>
          <option value="LIVE">Meta API</option>
          <option value="MOCK">Dữ liệu thử nghiệm</option>
        </select>
        {write && (
          <button
            className="button primary"
            onClick={() => {
              setError("");
              setPreview(null);
              setInput({ ...initial });
            }}
          >
            <Icon name="plus" size={18} />
            Tạo Donor
          </button>
        )}
      </div>
      {rows === null && !error ? (
        <p role="status">Đang đọc thư viện…</p>
      ) : filtered.length === 0 ? (
        <section className="card">
          <EmptyState
            icon="ads"
            title="Chưa có Donor phù hợp"
            description="Kết nối TKQC rồi đọc mẫu quảng cáo của bạn bằng 3 ID hoặc chỉ Ad ID. Thao tác chỉ đọc cấu hình, chưa tạo quảng cáo."
          />
        </section>
      ) : (
        <div className="page-grid">
          {filtered.map((row) => (
            <article className="card donor-tile" key={row.id}>
              <SourceBadge source={row.source} />
              <h2>{row.name}</h2>
              <p>{row.accountName}</p>
              <Badge tone="purple">
                Version {row.versions[0]?.version ?? "—"}
              </Badge>
              <small>Ad ID {row.versions[0]?.adId}</small>
              <div className="toolbar">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const result = await requestApi<DonorDetail>(
                        `/api/donors/${row.id}`,
                      );
                      setDetail(result);
                      setVersion(result.versions[0]?.version ?? 0);
                    })
                  }
                >
                  Xem preview
                </button>
                {write && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setPreview(null);
                      setInput({
                        name: row.name,
                        accountId: row.accountId,
                        donorId: row.id,
                        campaignId: row.versions[0]?.campaignId ?? "",
                        adSetId: row.versions[0]?.adSetId ?? "",
                        adId: row.versions[0]?.adId ?? "",
                        adsManagerUrl: "",
                      });
                    }}
                  >
                    Tạo version mới
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {input && (
        <Modal
          labelledBy="donor-title"
          onClose={() => {
            setInput(null);
            setPreview(null);
          }}
          pending={busy}
        >
          <div className="modal-heading">
            <h2 id="donor-title">
              {input.donorId ? "Tạo version Donor mới" : "Tạo Donor"}
            </h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => {
                setInput(null);
                setPreview(null);
              }}
            >
              ×
            </button>
          </div>
          {error && <Notice error>{error}</Notice>}
          {!preview ? (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  setPreview(
                    await requestApi<DonorPreview>("/api/donors/preview", {
                      method: "POST",
                      body: JSON.stringify(input),
                    }),
                  );
                });
              }}
            >
              <label>
                Tên Donor
                <input
                  data-autofocus
                  required
                  value={input.name}
                  maxLength={100}
                  onChange={(e) => setInput({ ...input, name: e.target.value })}
                />
              </label>
              <label>
                TKQC nguồn
                <select
                  required
                  value={input.accountId}
                  disabled={!!input.donorId}
                  onChange={(e) =>
                    setInput({ ...input, accountId: e.target.value })
                  }
                >
                  <option value="">Chọn tài khoản đã kết nối</option>
                  {accounts
                    .filter((a) => a.status === "AUTHORIZED")
                    .map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name} ·{" "}
                        {a.source === "MOCK" ? "Thử nghiệm" : "Meta API"}
                      </option>
                    ))}
                </select>
              </label>
              {account?.source === "MOCK" && (
                <div className="notice warning">
                  <div>
                    <strong>
                      Dữ liệu thử nghiệm — không đọc quảng cáo thật
                    </strong>
                    <p>
                      Campaign: 90071992547409931
                      <br />
                      Ad Set: 90071992547409932
                      <br />
                      Ad: 90071992547409933
                    </p>
                    <button
                      className="button secondary small"
                      type="button"
                      onClick={() =>
                        setInput({
                          ...input,
                          campaignId: "90071992547409931",
                          adSetId: "90071992547409932",
                          adId: "90071992547409933",
                        })
                      }
                    >
                      Điền ID thử nghiệm
                    </button>
                  </div>
                </div>
              )}
              <label>
                Campaign ID
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={input.campaignId}
                  onChange={(e) =>
                    setInput({ ...input, campaignId: e.target.value })
                  }
                />
              </label>
              <label>
                Ad Set ID
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={input.adSetId}
                  onChange={(e) =>
                    setInput({ ...input, adSetId: e.target.value })
                  }
                />
              </label>
              <label>
                Ad ID
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]+"
                  value={input.adId}
                  onChange={(e) => setInput({ ...input, adId: e.target.value })}
                />
              </label>
              <p>
                Có thể để trống hai ID cha; API sẽ truy ngược và xác minh. Tất
                cả ID được giữ dạng chuỗi.
              </p>
              <label>
                URL Ads Manager (tùy chọn)
                <input
                  type="url"
                  value={input.adsManagerUrl}
                  onChange={(e) =>
                    setInput({ ...input, adsManagerUrl: e.target.value })
                  }
                />
              </label>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setInput(null)}
                >
                  Hủy
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Đang đọc cấu hình…" : "Đọc & kiểm tra preview"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <Preview value={preview} />
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  Sửa thông tin
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const result = await requestApi<{
                        id: string;
                        version: number;
                      }>("/api/donors", {
                        method: "POST",
                        body: JSON.stringify({
                          input,
                          fingerprint: preview.fingerprint,
                        }),
                      });
                      setInput(null);
                      setPreview(null);
                      await load();
                      setMessage(
                        `Đã lưu Donor version ${result.version}. Không có quảng cáo được tạo hoặc thay đổi.`,
                      );
                    })
                  }
                >
                  {busy ? "Đang xác minh & lưu…" : "Lưu Donor"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {detail && (
        <Modal labelledBy="donor-detail-title" onClose={() => setDetail(null)}>
          <div className="modal-heading">
            <h2 id="donor-detail-title">{detail.name}</h2>
            <button
              className="icon-button"
              aria-label="Đóng"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
          </div>
          <label>
            Phiên bản
            <select
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
            >
              {detail.versions.map((v) => (
                <option key={v.id} value={v.version}>
                  Version {v.version} ·{" "}
                  {new Date(v.createdAt).toLocaleString("vi-VN")}
                </option>
              ))}
            </select>
          </label>
          {detail.versions
            .filter((v) => v.version === version)
            .map((v) => (
              <Preview
                key={v.id}
                value={{
                  ...v,
                  source: detail.source,
                  accountName:
                    accounts.find((a) => a.id === detail.accountId)?.name ??
                    "TKQC nguồn",
                  currency:
                    accounts.find((a) => a.id === detail.accountId)?.currency ??
                    "unavailable",
                }}
              />
            ))}
        </Modal>
      )}
    </>
  );
}
function Preview({
  value,
}: {
  value: {
    source: "MOCK" | "LIVE";
    accountName: string;
    currency: string;
    campaignId: string;
    adSetId: string;
    adId: string;
    normalized: Record<string, unknown>;
    raw: Record<string, unknown>;
    warnings: string[];
  };
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const campaign = value.normalized.campaign as
      | Record<string, unknown>
      | undefined,
    adSet = value.normalized.adSet as Record<string, unknown> | undefined,
    creative = value.normalized.creative as Record<string, unknown> | undefined;
  return (
    <div className="donor-preview">
      <h3 tabIndex={-1} ref={heading}>
        Preview Donor
      </h3>
      <SourceBadge source={value.source} />
      <p>
        {value.accountName} · {value.currency}
      </p>
      <dl className="preview-facts">
        <dt>Campaign ID</dt>
        <dd>{value.campaignId}</dd>
        <dt>Ad Set ID</dt>
        <dd>{value.adSetId}</dd>
        <dt>Ad ID</dt>
        <dd>{value.adId}</dd>
        <dt>Objective</dt>
        <dd>{String(campaign?.objective ?? "unavailable")}</dd>
        <dt>Optimization Goal</dt>
        <dd>{String(adSet?.optimization_goal ?? "unavailable")}</dd>
        <dt>Ngân sách/ngày</dt>
        <dd>
          {String(
            adSet?.daily_budget ?? campaign?.daily_budget ?? "unavailable",
          )}{" "}
          · đơn vị nhỏ nhất {value.currency}
        </dd>
        <dt>Creative / CTA</dt>
        <dd>
          {String(creative?.type ?? "unavailable")} /{" "}
          {String(creative?.cta ?? "unavailable")}
        </dd>
      </dl>
      <div className="notice warning">
        Chưa sẵn sàng tạo Ads. Cần chọn identity, nội dung, đích và tracking
        mới, rồi kiểm tra compatibility ở Giai đoạn 7.
      </div>
      <details>
        <summary>
          Cảnh báo & trường unavailable ({value.warnings.length})
        </summary>
        <ul>
          {value.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Normalized Template</summary>
        <pre>{JSON.stringify(value.normalized, null, 2)}</pre>
      </details>
      <details>
        <summary>Raw Snapshot đã lọc dữ liệu nhạy cảm</summary>
        <pre>{JSON.stringify(value.raw, null, 2)}</pre>
      </details>
    </div>
  );
}
