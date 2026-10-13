"use client";
import { useEffect, useMemo, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { qualityLabels, adsCsvHeaders, moneyText } from "@/lib/analytics";
import { Badge, EmptyState, Notice } from "../ui";
import { Modal } from "../modal";
import type { AnalyticsService } from "@/server/analytics/service";
type Report = Awaited<ReturnType<AnalyticsService["report"]>>;
type Account = Awaited<ReturnType<AnalyticsService["accounts"]>>[number];
type Policy = Awaited<ReturnType<AnalyticsService["policy"]>>;
type Preview = Awaited<ReturnType<AnalyticsService["previewCsv"]>>;
type History = Awaited<ReturnType<AnalyticsService["history"]>>;
type Row = Report["rows"][number];
function date(offset: number) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function SpendChart({
  values,
  currency,
}: {
  values: Array<{ day: string; spend: string | null }>;
  currency: string;
}) {
  const max = values.reduce(
    (m, d) => (d.spend !== null && Number(d.spend) > m ? Number(d.spend) : m),
    0,
  );
  return (
    <div
      className="spend-chart"
      role="img"
      aria-label="Biểu đồ chi phí quảng cáo theo ngày; hoa hồng được xét theo ngày đặt đơn"
    >
      <div className="chart-bars">
        {values.map((v) => (
          <div
            key={v.day}
            className="chart-column"
            title={`${v.day}: ${moneyText(v.spend, currency)}`}
          >
            <div
              className={`chart-bar ${v.spend === null ? "missing" : ""}`}
              style={{
                height:
                  v.spend === null
                    ? "8%"
                    : `${max ? Math.max(1, (Number(v.spend) / max) * 100) : 1}%`,
              }}
            />
            <span>{v.day.slice(5)}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        Chi phí theo ngày của TKQC. Cột thiếu snapshot hiển thị dấu — trong
        bảng; không gán hoa hồng theo ngày thanh toán.
      </p>
    </div>
  );
}
const advanced = ["clicks", "cpc", "ctr", "cpm", "lpv", "donor", "sync"];
export function AnalyticsManager({
  manage,
  userId,
  pageId,
}: {
  manage: boolean;
  userId: string;
  pageId?: string;
}) {
  const [source, setSource] = useState("LIVE"),
    [accounts, setAccounts] = useState<Account[]>([]),
    [accountId, setAccountId] = useState(""),
    [since, setSince] = useState(date(-7)),
    [until, setUntil] = useState(date(-1)),
    [level, setLevel] = useState("campaign"),
    [mode, setMode] = useState("cohort"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("spend"),
    [status, setStatus] = useState("all"),
    [columns, setColumns] = useState<string[]>(["sync"]),
    [reload, setReload] = useState(0);
  const [data, setData] = useState<{ key: string; report: Report } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [panel, setPanel] = useState<"policy" | "import" | null>(null),
    [policy, setPolicy] = useState<Policy | null>(null),
    [history, setHistory] = useState<History>([]),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [complete, setComplete] = useState(false),
    [replace, setReplace] = useState(false);
  const [views, setViews] = useState<
      Array<{
        name: string;
        source: string;
        accountId: string;
        since: string;
        until: string;
        level: string;
        mode: string;
        columns: string[];
        search?: string;
        sort?: string;
        status?: string;
      }>
    >([]),
    [viewName, setViewName] = useState("");
  const viewKey = `analytics-views:${userId}:${pageId ?? "all"}`;
  const query = new URLSearchParams({
    source,
    since,
    until,
    level,
    mode,
    search,
    status,
    ...(accountId ? { accountId } : {}),
    ...(pageId ? { pageId } : {}),
  }).toString();
  const key = query + ":" + reload;
  const report = data?.key === key ? data.report : null;
  const account = accounts.find((a) => a.id === accountId);
  const currency = report?.account?.currency ?? account?.currency ?? "";
  useEffect(() => {
    let live = true;
    requestApi<Account[]>(`/api/analytics/accounts?source=${source}`)
      .then((a) => {
        if (live) {
          setAccounts(a);
          setAccountId((old) =>
            a.some((x) => x.id === old) ? old : (a[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [source, reload]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setPending(true);
      setError("");
      requestApi<Report>(`/api/analytics?${query}`)
        .then((r) => {
          if (live) setData({ key, report: r });
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setPending(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, key]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(viewKey) ?? "[]");
        if (Array.isArray(saved)) setViews(saved.slice(0, 10));
      } catch {
        /* Không dùng view hỏng. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [viewKey]);
  const rows = useMemo(
    () =>
      [...(report?.rows ?? [])]
        .filter((r) => status === "all" || r.statuses.includes(status))
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "vi")
            : sort === "quality"
              ? b.quality.length - a.quality.length
              : BigInt(a.spend.replace(".", "")) >
                  BigInt(b.spend.replace(".", ""))
                ? -1
                : 1,
        ),
    [report, sort, status],
  );
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setReload((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openPolicy() {
    if (!accountId) return;
    await action(async () => {
      setPolicy(
        await requestApi<Policy>(
          `/api/analytics/policy?accountId=${accountId}`,
        ),
      );
      setPanel("policy");
    }, "");
  }
  async function sync() {
    await action(
      () =>
        requestApi("/api/analytics/sync", {
          method: "POST",
          body: JSON.stringify({ accountId, since, until, replace }),
        }),
      "Đã cập nhật snapshot Insights. Báo cáo đọc Database.",
    );
  }
  async function upload(commit = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("action", commit ? "commit" : "preview");
      form.set(
        "options",
        JSON.stringify({
          accountId,
          since,
          until,
          replace,
          ...(commit
            ? { complete, expectedFingerprint: preview?.fingerprint }
            : {}),
        }),
      );
      const response = await fetch("/api/analytics/import", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error.message);
      if (commit) {
        setPanel(null);
        setPreview(null);
        setReload((v) => v + 1);
        setMessage(
          "Đã lưu CSV theo snapshot Ad/ngày; không cộng thêm vào chi phí API.",
        );
      } else setPreview(payload.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveView() {
    if (!viewName.trim()) return;
    const next = [
      ...views.filter((v) => v.name !== viewName.trim()),
      {
        name: viewName.trim(),
        source,
        accountId,
        since,
        until,
        level,
        mode,
        columns,
        search,
        sort,
        status,
      },
    ].slice(-10);
    setViews(next);
    localStorage.setItem(viewKey, JSON.stringify(next));
    setViewName("");
    setMessage("Đã lưu bộ lọc trên trình duyệt này.");
  }
  return (
    <section className="analytics-stack" aria-label="Ads Analytics và ROAS">
      <section className="card analytics-top">
        <div className="section-heading">
          <div>
            <div className="eyebrow">ADS ANALYTICS</div>
            <h2>Chi phí, hoa hồng & lợi nhuận</h2>
          </div>
          <Badge tone={source === "MOCK" ? "warning" : "purple"}>
            {source === "MOCK" ? "MOCK · Dữ liệu thử nghiệm" : "LIVE"}
          </Badge>
        </div>
        <p className="muted">
          ROAS dựa trên SubID và mapping do người dùng khai báo. Đây chưa phải
          xác minh độc lập lượt chuyển đổi từ Meta/Shopee. Chỉ PAID được ghi
          nhận thực nhận; trạng thái hiện tại của đơn có thể đổi sau kỳ báo cáo.
        </p>
        <div className="analytics-filters">
          <label>
            Nguồn
            <select
              aria-label="Nguồn Analytics"
              disabled={busy}
              value={source}
              onChange={(e) => {
                setHistory([]);
                setSource(e.target.value);
                setAccountId("");
                setAccounts([]);
                setSelected(null);
                setPanel(null);
                setPreview(null);
              }}
            >
              <option value="LIVE">LIVE</option>
              <option value="MOCK">MOCK — thử nghiệm</option>
            </select>
          </label>
          <label>
            Tài khoản quảng cáo
            <select
              aria-label="TKQC Analytics"
              disabled={busy}
              value={accountId}
              onChange={(e) => {
                setHistory([]);
                setAccountId(e.target.value);
                setSelected(null);
                setPanel(null);
                setPreview(null);
              }}
            >
              <option value="">Chọn TKQC</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            Từ ngày
            <input
              aria-label="Từ ngày Analytics"
              disabled={busy}
              type="date"
              value={since}
              onChange={(e) => {
                setSince(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Đến ngày
            <input
              aria-label="Đến ngày Analytics"
              disabled={busy}
              type="date"
              value={until}
              onChange={(e) => {
                setUntil(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Thời gian
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cohort">Cohort ngày đặt đơn</option>
              <option value="daily">Theo ngày đặt đơn/chi phí</option>
              <option value="lifetime">Lifetime · cần đủ lịch sử</option>
            </select>
          </label>
          <label>
            Cấp báo cáo
            <select
              aria-label="Cấp báo cáo"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setSelected(null);
              }}
            >
              <option value="campaign">Campaign</option>
              <option value="adset">Ad Set</option>
              <option value="ad">Ad</option>
              <option value="subid">SubID</option>
              <option value="content">Nội dung / Video reference</option>
            </select>
          </label>
        </div>
        {account && (
          <p className="muted">
            Reporting timezone: <strong>{account.timezone}</strong> · Currency:{" "}
            {account.currency} · Khoảng chi phí và ngày đặt đơn: {since} →{" "}
            {until}. Ngày update, settlement và import không thay ngày đơn.
          </p>
        )}
        <div className="button-row">
          {manage && (
            <>
              <button
                className="button primary"
                disabled={!accountId || busy}
                onClick={sync}
              >
                Đồng bộ Insights
              </button>
              <button
                className="button secondary"
                disabled={!accountId || busy}
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setComplete(false);
                  setPanel("import");
                }}
              >
                Nhập Ads CSV
              </button>
              <button
                className="button secondary"
                disabled={!accountId || busy}
                onClick={openPolicy}
              >
                Quy tắc tài chính & lịch cập nhật
              </button>
            </>
          )}
          <button
            className="button secondary"
            disabled={!accountId || busy}
            onClick={() =>
              action(async () => {
                setHistory(
                  await requestApi<History>(
                    `/api/analytics/history?accountId=${accountId}`,
                  ),
                );
              }, "")
            }
          >
            Lịch sử đồng bộ
          </button>
          <button
            className="button secondary"
            disabled={!rows.length || busy}
            onClick={() =>
              action(async () => {
                const r = await requestApi<{ csv: string }>(
                  `/api/analytics/export?${query}`,
                );
                download(r.csv, "ads-analytics.csv");
              }, "Đã xuất báo cáo theo bộ lọc trên máy chủ.")
            }
          >
            Xuất CSV
          </button>
        </div>
        {manage && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Cho phép thay toàn bộ snapshot ngày đang có từ API/CSV khi đồng bộ
            hoặc nhập (không cộng hai nguồn).
          </label>
        )}
      </section>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!accountId && !pending && (
        <section className="card">
          <EmptyState
            icon="chart"
            title="Chưa có tài khoản quảng cáo để phân tích"
            description="Kết nối Facebook và lưu TKQC trong Cài đặt. Chỉ tài khoản được cấp quyền mới xuất hiện; CSV cũ cấp Account chỉ giữ lịch sử và không được cộng vào Analytics."
          />
        </section>
      )}
      {pending && <p role="status">Đang đọc báo cáo từ Database…</p>}
      {report?.account && (
        <>
          <div className="analytics-kpis">
            {[
              ["Ad Spend", report.totals?.spend],
              ["Hoa hồng dự kiến", report.totals?.estimatedCommission],
              ["Hoa hồng thực nhận · PAID", report.totals?.realizedCommission],
              ["Lợi nhuận thực nhận", report.totals?.realizedProfit],
            ].map(([label, value]) => (
              <div className="card kpi" key={label}>
                <span className="muted">{label}</span>
                <strong>{moneyText(value, currency)}</strong>
              </div>
            ))}
          </div>
          <section className="card">
            <div className="section-heading">
              <h3>Độ đầy đủ dữ liệu</h3>
              <Badge tone={report.quality.length ? "warning" : "success"}>
                {report.coverage.present}/{report.coverage.expected} ngày có
                snapshot
              </Badge>
            </div>
            <p>
              ROAS dự kiến:{" "}
              <strong>{report.totals?.estimatedRoas ?? "—"}</strong> · ROAS thực
              nhận: <strong>{report.totals?.realizedRoas ?? "—"}</strong> · Chi
              phí khác: {moneyText(report.totals?.otherCosts, currency)}
            </p>
            <p className="muted">
              Dự kiến gồm {report.policy?.estimatedStatuses.join(" + ")}; thực
              nhận chỉ PAID. REJECTED được tách riêng. Chi phí khác/ngày của
              TKQC được phân bổ theo tỷ trọng spend trong kỳ. Reach không cộng
              qua Ads/ngày.
            </p>
            {report.quality.length > 0 ? (
              <ul className="quality-list">
                {report.quality.map((code) => (
                  <li key={code}>{qualityLabels[code] ?? code}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Đủ điều kiện tính theo quy tắc khai báo đã xác nhận. Độ đầy đủ
                báo cáo Shopee phụ thuộc tệp bạn cung cấp.
              </p>
            )}
          </section>
          {(report.timeline?.length ?? 0) > 0 && (
            <section className="card">
              <h3>Xu hướng chi phí</h3>
              <SpendChart values={report.timeline!} currency={currency} />
            </section>
          )}
          <section className="card">
            <div className="section-heading">
              <h3>Campaign → Ad Set → Ad</h3>
              <Badge>{rows.length} nhóm</Badge>
            </div>
            <div className="analytics-filters">
              <label>
                Tìm kiếm
                <input
                  aria-label="Tìm kiếm Analytics"
                  placeholder="Tên, Page hoặc SubID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Sắp xếp
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="spend">Spend giảm dần</option>
                  <option value="name">Tên A–Z</option>
                  <option value="quality">Cần kiểm tra trước</option>
                </select>
              </label>
              <label>
                Trạng thái
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Tất cả</option>
                  <option>ACTIVE</option>
                  <option>PAUSED</option>
                  <option>UNKNOWN</option>
                </select>
              </label>
            </div>
            <details>
              <summary>Tùy chỉnh cột & bộ lọc đã lưu</summary>
              <div className="button-row">
                {advanced.map((c) => (
                  <label className="check-label" key={c}>
                    <input
                      type="checkbox"
                      checked={columns.includes(c)}
                      onChange={(e) =>
                        setColumns((old) =>
                          e.target.checked
                            ? [...old, c]
                            : old.filter((v) => v !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
              <div className="button-row">
                <input
                  aria-label="Tên bộ lọc Analytics"
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder="Tên bộ lọc"
                  maxLength={60}
                />
                <button className="button secondary" onClick={saveView}>
                  Lưu bộ lọc
                </button>
                <select
                  aria-label="Bộ lọc Analytics đã lưu"
                  value=""
                  onChange={(e) => {
                    const v = views[Number(e.target.value)];
                    if (v) {
                      setSource(v.source);
                      setAccountId(v.accountId);
                      setSince(v.since);
                      setUntil(v.until);
                      setLevel(v.level);
                      setMode(v.mode);
                      setColumns(v.columns);
                      setSearch(v.search ?? "");
                      setSort(v.sort ?? "spend");
                      setStatus(v.status ?? "all");
                    }
                  }}
                >
                  <option value="">Mở bộ lọc đã lưu</option>
                  {views.map((v, i) => (
                    <option key={v.name} value={i}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </details>
            {!rows.length ? (
              <EmptyState
                icon="chart"
                title="Chưa có dữ liệu Ads phù hợp"
                description="Chọn kỳ có dữ liệu rồi đồng bộ Insights hoặc nhập CSV đầy đủ. Không có số ROAS giả cho kỳ thiếu dữ liệu."
              />
            ) : (
              <div className="table-scroll">
                <table className="data-table analytics-table">
                  <thead>
                    <tr>
                      <th>Tên / Page</th>
                      <th>Spend</th>
                      <th>Pending</th>
                      <th>Approved</th>
                      <th>PAID</th>
                      <th>Rejected</th>
                      <th>ROAS dự kiến / thực nhận</th>
                      <th>Lãi dự kiến / thực nhận</th>
                      <th>Trạng thái / dữ liệu</th>
                      {columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setSelected(r)}
                          >
                            {r.name}
                          </button>
                          <div className="muted">
                            {r.pageNames.join(", ") || "Page chưa xác định"}
                          </div>
                        </td>
                        <td>{moneyText(r.spend, currency)}</td>
                        {["PENDING", "APPROVED", "PAID", "REJECTED"].map(
                          (s) => (
                            <td key={s}>{moneyText(r.commissions[s])}</td>
                          ),
                        )}
                        <td>
                          {r.estimatedRoas ?? "—"} / {r.realizedRoas ?? "—"}
                        </td>
                        <td>
                          {moneyText(r.estimatedProfit)} /{" "}
                          {moneyText(r.realizedProfit)}
                        </td>
                        <td>
                          {r.statuses.join(", ")}
                          <br />
                          {r.quality.length ? (
                            <Badge tone="warning">Kiểm tra dữ liệu</Badge>
                          ) : (
                            <Badge tone="success">Đủ theo khai báo</Badge>
                          )}
                        </td>
                        {columns.map((c) => (
                          <td key={c}>
                            {c === "sync"
                              ? r.lastSyncedAt
                                ? new Date(r.lastSyncedAt).toLocaleString(
                                    "vi-VN",
                                  )
                                : "—"
                              : c === "donor"
                                ? r.donorNames.join(", ") || "—"
                                : c === "clicks"
                                  ? r.clicks
                                  : c === "lpv"
                                    ? (r.lpv ?? "—")
                                    : c === "ctr"
                                      ? r.ctr !== null
                                        ? r.ctr + "%"
                                        : "—"
                                      : moneyText(r[c as "cpc" | "cpm"])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {history.length > 0 && (
        <section className="card">
          <h3>Lịch sử snapshot (30 lần gần nhất)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nguồn</th>
                  <th>Kỳ</th>
                  <th>Kết quả</th>
                  <th>Thời điểm</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.provider}</td>
                    <td>
                      {h.since} → {h.until}
                    </td>
                    <td>
                      {h.state} {h.errorCode}
                    </td>
                    <td>{new Date(h.createdAt).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {selected && (
        <Modal
          sidePanel
          labelledBy="analytics-detail"
          onClose={() => setSelected(null)}
        >
          <div className="modal-heading">
            <h2 id="analytics-detail">{selected.name}</h2>
            <button
              className="button secondary"
              data-autofocus
              onClick={() => setSelected(null)}
            >
              Đóng
            </button>
          </div>
          <p>
            Spend: {moneyText(selected.spend, currency)} · ROAS dự kiến / thực
            nhận: {selected.estimatedRoas ?? "—"} /{" "}
            {selected.realizedRoas ?? "—"}
          </p>
          <SpendChart values={selected.daily} currency={currency} />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Spend</th>
                  <th>Reach (chỉ Ad/ngày)</th>
                </tr>
              </thead>
              <tbody>
                {selected.daily.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{moneyText(d.spend, currency)}</td>
                    <td>{d.reach ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Ads: {selected.adNames.join(", ")}</p>
          <p>SubIDs: {selected.subIds.join(", ") || "—"}</p>
          <p>Donor: {selected.donorNames.join(", ") || "—"}</p>
          <p>Post IDs: {selected.postIds.join(", ") || "—"}</p>
          <p>Nội dung reference: {selected.contentRefs.join(", ") || "—"}</p>
          <ul>
            {selected.quality.map((c) => (
              <li key={c}>{qualityLabels[c] ?? c}</li>
            ))}
          </ul>
          <p className="muted">
            Xem lịch sử tracking/link và điều chỉnh mapping tại Cài đặt →
            Shopee; lịch sử đơn tại bảng đối soát. Video reference chưa phải
            Video ID của Publisher.
          </p>
        </Modal>
      )}
      {panel === "import" && (
        <Modal
          labelledBy="ads-csv-title"
          onClose={() => setPanel(null)}
          pending={busy}
        >
          <h2 id="ads-csv-title">Nhập chi phí Ads · {account?.name}</h2>
          <p>
            Kỳ {since} → {until}, timezone {account?.timezone}. Chỉ cấp Ad/ngày,
            không dùng breakdown hoặc báo cáo tổng cấp Campaign/TKQC.
          </p>
          <button
            className="button secondary"
            data-autofocus
            onClick={() =>
              download(
                adsCsvHeaders.join(",") + "\r\n",
                "ads-daily-template.csv",
              )
            }
          >
            Tải mẫu CSV Ad/ngày
          </button>
          <label>
            Tệp CSV UTF-8
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setComplete(false);
              }}
            />
          </label>
          <button
            className="button primary"
            disabled={!file || busy}
            onClick={() => upload()}
          >
            Xem preview Ads CSV
          </button>
          {preview && (
            <>
              <p>
                {preview.rows} dòng · {preview.days} ngày · Spend{" "}
                {moneyText(preview.spend, preview.currency)} · {preview.source}
              </p>
              <p>
                Ngày xung đột API:{" "}
                {preview.conflictingDays.join(", ") || "Không có"}
              </p>
              <p>
                Ngày không có dòng (sẽ ghi chi phí 0 khi xác nhận đầy đủ):{" "}
                {preview.emptyDays.join(", ") || "Không có"}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={complete}
                  onChange={(e) => setComplete(e.target.checked)}
                />
                Tôi xác nhận báo cáo gồm tất cả Ads cho toàn bộ kỳ đã chọn; ngày
                không có dòng thực sự không có chi phí.
              </label>
              {preview.conflictingDays.length > 0 && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Tôi xác nhận thay snapshot API theo ngày.
                </label>
              )}
              <button
                className="button primary"
                disabled={
                  !complete ||
                  busy ||
                  (preview.conflictingDays.length > 0 && !replace)
                }
                onClick={() => upload(true)}
              >
                Lưu snapshot Ads CSV
              </button>
            </>
          )}
          {error && <Notice error>{error}</Notice>}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setPanel(null)}
          >
            Đóng
          </button>
        </Modal>
      )}
      {panel === "policy" && policy && (
        <Modal
          labelledBy="analytics-policy"
          onClose={() => setPanel(null)}
          pending={busy}
        >
          <h2 id="analytics-policy">Quy tắc tài chính & lịch cập nhật</h2>
          <p>
            Thực nhận luôn chỉ PAID. Dự kiến chọn trạng thái được cộng; REJECTED
            bị loại.
          </p>
          <fieldset>
            <legend>Hoa hồng dự kiến</legend>
            {(["PENDING", "APPROVED", "PAID"] as const).map((s) => (
              <label className="check-label" key={s}>
                <input
                  type="checkbox"
                  checked={policy.estimatedStatuses.includes(s)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      estimatedStatuses: e.target.checked
                        ? [...policy.estimatedStatuses, s]
                        : policy.estimatedStatuses.filter((v) => v !== s),
                    })
                  }
                />
                {s}
              </label>
            ))}
          </fieldset>
          <label>
            Chi phí khác của TKQC mỗi ngày ({account?.currency})
            <input
              data-autofocus
              inputMode="decimal"
              value={policy.otherCostPerDay}
              onChange={(e) =>
                setPolicy({ ...policy, otherCostPerDay: e.target.value })
              }
            />
          </label>
          <p className="muted">
            Phân bổ theo tỷ trọng spend trong kỳ. Khi lọc một phần Page, lợi
            nhuận sẽ để — nếu chưa tách được chi phí khác.
          </p>
          <label>
            Ngày bắt đầu Ads thực sự (cho lifetime)
            <input
              type="date"
              value={policy.lifetimeStart ?? ""}
              onChange={(e) =>
                setPolicy({ ...policy, lifetimeStart: e.target.value || null })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={policy.mappingAcknowledged}
              onChange={(e) =>
                setPolicy({ ...policy, mappingAcknowledged: e.target.checked })
              }
            />
            Tôi xác nhận mapping SubID → Page/Ad và link dành riêng cho Ads là
            đúng, chấp nhận báo cáo theo khai báo; chưa có xác minh traffic độc
            lập.
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={policy.autoSync}
              onChange={(e) =>
                setPolicy({ ...policy, autoSync: e.target.checked })
              }
            />
            Cập nhật mỗi giờ, đối chiếu lại 3 ngày đã kết thúc; giữ ngày đã chọn
            CSV. Cần tiến trình worker đang chạy.
          </label>
          {error && <Notice error>{error}</Notice>}
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy || !policy.estimatedStatuses.length}
              onClick={() =>
                action(async () => {
                  await requestApi("/api/analytics/policy", {
                    method: "POST",
                    body: JSON.stringify({
                      accountId,
                      estimatedStatuses: policy.estimatedStatuses,
                      mappingAcknowledged: policy.mappingAcknowledged,
                      otherCostPerDay: policy.otherCostPerDay,
                      autoSync: policy.autoSync,
                      lifetimeStart: policy.lifetimeStart,
                    }),
                  });
                  setPanel(null);
                }, "Đã lưu quy tắc có audit.")
              }
            >
              Lưu quy tắc
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPanel(null)}
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
