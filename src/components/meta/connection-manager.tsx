"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { requestApi } from "@/lib/client-api";
import { Badge, Notice, Icon } from "../ui";
import { SourceBadge } from "./source-badge";
import type { MetaState, Connection, PageRow, AccountRow } from "./types";
const steps = ["Chọn Page", "Chọn TKQC", "Ghép tài khoản", "Kiểm tra quyền"];
export function ConnectionManager() {
  const [state, setState] = useState<MetaState | null>(null),
    [connection, setConnection] = useState<Connection | null>(null),
    [step, setStep] = useState(0);
  const [pageIds, setPageIds] = useState<string[]>([]),
    [accountIds, setAccountIds] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setState(await requestApi<MetaState>("/api/meta"));
  }
  useEffect(() => {
    requestApi<MetaState>("/api/meta")
      .then((data) => {
        setState(data);
        const result = new URLSearchParams(window.location.search).get(
          "metaResult",
        );
        if (result === "connected")
          setMessage(
            "Đã xác thực với Meta. Chọn kết nối bên dưới để hoàn tất thiết lập.",
          );
        else if (result)
          setError(
            result === "cancelled"
              ? "Bạn đã hủy cấp quyền Facebook."
              : "Kết nối Meta chưa hoàn tất. Kiểm tra cấu hình, quyền hoặc bắt đầu lại.",
          );
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
  async function choose(row: Connection) {
    const [existingPages, existingAccounts] = await Promise.all([
      requestApi<PageRow[]>("/api/pages"),
      requestApi<AccountRow[]>("/api/ad-accounts"),
    ]);
    const selected = existingPages.filter(
      (p) =>
        p.source === row.source && row.pages.some((r) => r.id === p.metaId),
    );
    setPageIds(selected.map((p) => p.metaId));
    setAccountIds(
      existingAccounts
        .filter(
          (a) =>
            a.source === row.source &&
            row.accounts.some((r) => r.id === a.metaId),
        )
        .map((a) => a.metaId),
    );
    setMapping(
      Object.fromEntries(
        selected.map((p) => [
          p.metaId,
          existingAccounts.find((a) => a.id === p.primaryAccountId)?.metaId ??
            null,
        ]),
      ),
    );
    setConnection(row);
    setStep(0);
    setSearch("");
    setFilter("all");
  }
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  const filtered =
    connection?.pages
      .filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.id.includes(search),
      )
      .filter(
        (p) =>
          filter === "all" ||
          (filter === "publish"
            ? p.tasks.includes("CREATE_CONTENT")
            : !p.tasks.includes("CREATE_CONTENT")),
      ) ?? [];
  return (
    <div className="meta-stack">
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <section className="card settings-card">
        <div className="section-heading">
          <div>
            <h2>Kết nối Facebook</h2>
            <p>Xác thực chính thức, chọn Page và TKQC, rồi xác nhận ánh xạ.</p>
          </div>
          <Icon name="link" />
        </div>
        {!state ? (
          <p role="status">Đang đọc cấu hình…</p>
        ) : (
          <>
            {!state.config.liveReady && (
              <div className="notice warning">
                Chưa đủ cấu hình Meta App ở máy chủ. Xem hướng dẫn
                META_CONNECTION.md; không nhập mật khẩu Facebook vào ứng dụng.
              </div>
            )}
            <div className="toolbar">
              <button
                className="button primary"
                disabled={busy || !state.config.liveReady}
                onClick={() =>
                  act(async () => {
                    const result = await requestApi<{ url: string }>(
                      "/api/meta/start",
                      { method: "POST" },
                    );
                    window.location.assign(result.url);
                  })
                }
              >
                Kết nối Facebook
              </button>
              {state.config.mockEnabled && (
                <button
                  className="button secondary"
                  disabled={busy || !state.config.encryptionReady}
                  onClick={() =>
                    act(async () => {
                      const row = await requestApi<Connection>(
                        "/api/meta/mock",
                        { method: "POST" },
                      );
                      await load();
                      await choose(row);
                    })
                  }
                >
                  Mở kết nối thử nghiệm
                </button>
              )}
              <Link className="button secondary" href="/pages">
                Xem Page đã lưu
              </Link>
            </div>
            {state.connections.length > 0 && (
              <div className="connection-list">
                {state.connections.map((row) => (
                  <div className="connection-row" key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <p>
                        {row.pages.length} Page · {row.accounts.length} TKQC ·
                        Kiểm tra{" "}
                        {new Date(row.checkedAt).toLocaleString("vi-VN")}
                      </p>
                      <SourceBadge source={row.source} />
                    </div>
                    <div className="toolbar">
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() => act(() => choose(row))}
                      >
                        Tiếp tục thiết lập
                      </button>
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            const refreshed = await requestApi<Connection>(
                              "/api/meta/refresh",
                              {
                                method: "POST",
                                body: JSON.stringify({ connectionId: row.id }),
                              },
                            );
                            await load();
                            await choose(refreshed);
                          })
                        }
                      >
                        Làm mới quyền
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {connection && (
        <section className="card settings-card">
          <div className="section-heading">
            <div>
              <h2>Thiết lập Page & TKQC</h2>
              <p>
                {connection.source === "MOCK"
                  ? "Bộ dữ liệu thử nghiệm riêng. Không có kết nối hay thao tác Facebook thật."
                  : "Danh sách do Meta trả về, chỉ lưu các mục bạn chọn."}
              </p>
            </div>
            <SourceBadge source={connection.source} />
          </div>
          <ol className="wizard-steps">
            {steps.map((name, index) => (
              <li key={name} className={index === step ? "current" : ""}>
                {index + 1}. {name}
              </li>
            ))}
          </ol>
          {step === 0 && (
            <>
              <div className="toolbar">
                <label className="search-field">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="Tìm Page được cấp quyền"
                    placeholder="Tìm tên hoặc ID Page"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Lọc quyền Page"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tất cả quyền</option>
                  <option value="publish">Có quyền tạo nội dung</option>
                  <option value="limited">Quyền hạn chế</option>
                </select>
                <button
                  className="button secondary"
                  onClick={() =>
                    setPageIds([
                      ...new Set([...pageIds, ...filtered.map((p) => p.id)]),
                    ])
                  }
                >
                  Chọn tất cả đang hiển thị
                </button>
                <button
                  className="button secondary"
                  onClick={() => setPageIds([])}
                >
                  Bỏ chọn
                </button>
              </div>
              <div className="selection-list">
                {filtered.map((p) => (
                  <label className="selection-item" key={p.id}>
                    <input
                      type="checkbox"
                      checked={pageIds.includes(p.id)}
                      onChange={() => setPageIds(toggle(pageIds, p.id))}
                    />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.id} ·{" "}
                        {p.tasks.join(", ") || "Quyền chưa được trả về"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <p>
                {pageIds.length} Page đã chọn.{" "}
                {filtered.length === 0 && "Không có Page phù hợp."}
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p>
                Chọn TKQC sẽ sử dụng. Có thể hoàn tất chỉ với Page khi chưa có
                quyền Ads.
              </p>
              <div className="selection-list">
                {connection.accounts.map((a) => (
                  <label className="selection-item" key={a.id}>
                    <input
                      type="checkbox"
                      checked={accountIds.includes(a.id)}
                      disabled={a.status !== 1}
                      onChange={() => {
                        setAccountIds(toggle(accountIds, a.id));
                        setMapping((old) =>
                          Object.fromEntries(
                            Object.entries(old).map(([p, v]) => [
                              p,
                              v === a.id ? null : v,
                            ]),
                          ),
                        );
                      }}
                    />
                    <span>
                      <strong>{a.name}</strong>
                      <small>
                        {a.id} · {a.currency} · {a.timezone}
                      </small>
                      <small>
                        {a.tasks.join(", ") || "Quyền tác vụ unavailable"} ·{" "}
                        {a.status === 1
                          ? "Đọc được, tài khoản hoạt động"
                          : "Tài khoản không hoạt động"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {connection.accounts.length === 0 && (
                <p>
                  Chưa được cấp TKQC. Bạn có thể nhập báo cáo CSV/XLSX bên dưới.
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <p>
                Mỗi Page có một TKQC chính. Bạn có thể để chưa ghép và bổ sung
                sau.
              </p>
              {connection.pages
                .filter((p) => pageIds.includes(p.id))
                .map((p) => (
                  <label className="mapping-row" key={p.id}>
                    <span>{p.name}</span>
                    <select
                      aria-label={`TKQC cho ${p.name}`}
                      value={mapping[p.id] ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          [p.id]: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Chưa ghép</option>
                      {connection.accounts
                        .filter((a) => accountIds.includes(a.id))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.currency}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
            </>
          )}
          {step === 3 && (
            <>
              <div className="health-list">
                {[
                  [
                    "Token",
                    new Date(connection.expiresAt) > new Date(),
                    "Thời hạn theo lần cấp token; API xác minh khi đọc lại quyền.",
                  ],
                  [
                    "Đọc Page",
                    connection.scopes.includes("pages_read_engagement"),
                    "Cần pages_read_engagement.",
                  ],
                  [
                    "Đăng bài",
                    connection.scopes.includes("pages_manage_posts") &&
                      connection.pages
                        .filter((p) => pageIds.includes(p.id))
                        .every((p) => p.tasks.includes("CREATE_CONTENT")),
                    "Cần pages_manage_posts và CREATE_CONTENT cho từng Page.",
                  ],
                  [
                    "Đọc Ads",
                    connection.scopes.includes("ads_read") ||
                      connection.scopes.includes("ads_management"),
                    "Cần ads_read hoặc ads_management.",
                  ],
                  [
                    "Quản lý Ads",
                    connection.scopes.includes("ads_management"),
                    "Cần ads_management và quyền phù hợp trên TKQC.",
                  ],
                ].map(([name, ok, help]) => (
                  <div className="health-row" key={String(name)}>
                    <div>
                      <strong>{name}</strong>
                      <small>{help}</small>
                    </div>
                    <Badge tone={ok ? "success" : "warning"}>
                      {ok ? "Quyền được cấp" : "Thiếu quyền"}
                    </Badge>
                  </div>
                ))}
              </div>
              <p>
                Chưa thử đăng bài hoặc tạo Ads. Nếu thiếu quyền, cấp quyền trong
                Meta App/App Review và kết nối lại. Lưu thiết lập không cấp thêm
                quyền.
              </p>
              <strong>
                {pageIds.length} Page · {accountIds.length} TKQC ·{" "}
                {
                  Object.values(mapping).filter(
                    (v) => v && accountIds.includes(v),
                  ).length
                }{" "}
                ánh xạ
              </strong>
            </>
          )}
          <div className="wizard-actions">
            <button
              className="button secondary"
              disabled={busy || step === 0}
              onClick={() => setStep(step - 1)}
            >
              Quay lại
            </button>
            {step < 3 ? (
              <button
                className="button primary"
                disabled={pageIds.length === 0 || busy}
                onClick={() => setStep(step + 1)}
              >
                Tiếp tục
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await requestApi("/api/meta/complete", {
                      method: "POST",
                      body: JSON.stringify({
                        connectionId: connection.id,
                        pageIds,
                        accountIds,
                        mappings: Object.fromEntries(
                          pageIds
                            .filter((id) => Object.hasOwn(mapping, id))
                            .map((id) => [
                              id,
                              mapping[id] && accountIds.includes(mapping[id]!)
                                ? mapping[id]
                                : null,
                            ]),
                        ),
                      }),
                    });
                    setConnection(null);
                    setMessage(
                      "Đã lưu Page, TKQC và ánh xạ. Mở Quản lý Page để kiểm tra.",
                    );
                    await load();
                  })
                }
              >
                {busy ? "Đang lưu…" : "Hoàn tất thiết lập"}
              </button>
            )}
          </div>
        </section>
      )}
      <ReportImport />
    </div>
  );
}
function ReportImport() {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [rows, setRows] = useState<
      Array<{
        id: string;
        filename: string;
        count: number;
        total: string;
        currency: string;
      }>
    >([]);
  async function load() {
    setRows(await requestApi("/api/meta/import"));
  }
  useEffect(() => {
    requestApi<
      Array<{
        id: string;
        filename: string;
        count: number;
        total: string;
        currency: string;
      }>
    >("/api/meta/import")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="card settings-card">
      <h2>Nhập báo cáo Meta CSV/XLSX</h2>
      <p>
        Dự phòng khi chưa có API. Một dòng tổng TKQC/ngày, một currency mỗi tệp,
        tối đa 2 MB/5.000 dòng. Dữ liệu lưu riêng, chưa được cộng vào Analytics.
      </p>
      <p>
        Cột bắt buộc: <code>account_id,date,currency,spend</code>. ID, ngày và
        tiền trong XLSX dùng dạng Text.
      </p>
      <a
        className="text-link"
        download="meta-report-template.csv"
        href="data:text/csv;charset=utf-8,account_id%2Cdate%2Ccurrency%2Cspend%0A123456789012345%2C2026-01-01%2CVND%2C150000"
      >
        Tải mẫu CSV
      </a>
      <p>
        Mẫu dùng ID minh họa; thay bằng báo cáo của bạn. Nhập tệp không tạo kết
        nối API hoặc khả năng tạo Ads.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="toolbar">
        <input
          aria-label="Tệp báo cáo Meta"
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="button secondary"
          disabled={!file || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const data = new FormData();
              data.set("file", file!);
              const response = await fetch("/api/meta/import", {
                method: "POST",
                body: data,
              });
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error.message);
              setMessage(
                payload.data.duplicate
                  ? "Báo cáo đã có, không nhập trùng."
                  : `Đã lưu ${payload.data.count} dòng báo cáo.`,
              );
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Đang nhập…" : "Nhập báo cáo"}
        </button>
      </div>
      {rows.map((row) => (
        <div className="connection-row" key={row.id}>
          <strong>{row.filename}</strong>
          <span>
            {row.count} dòng · {row.total} {row.currency}{" "}
            <Badge tone="muted">Nguồn nhập tệp</Badge>
          </span>
        </div>
      ))}
    </section>
  );
}
