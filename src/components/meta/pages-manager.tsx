"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { requestApi } from "@/lib/client-api";
import { Badge, Notice, EmptyState, Icon } from "../ui";
import { SourceBadge } from "./source-badge";
import type { PageRow, AccountRow, PageDetail } from "./types";
export function PagesManager({ manage }: { manage: boolean }) {
  const [rows, setRows] = useState<PageRow[] | null>(null),
    [accounts, setAccounts] = useState<AccountRow[]>([]),
    [tab, setTab] = useState("pages"),
    [view, setView] = useState("grid"),
    [search, setSearch] = useState(""),
    [source, setSource] = useState("all"),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      requestApi<PageRow[]>("/api/pages"),
      requestApi<AccountRow[]>("/api/ad-accounts"),
    ])
      .then(([p, a]) => {
        setRows(p);
        setAccounts(a);
      })
      .catch((e) => setError(e.message));
  }, []);
  const filtered =
    rows?.filter(
      (p) =>
        (p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.metaId.includes(search) ||
          p.code.toLowerCase().includes(search.toLowerCase())) &&
        (source === "all" || p.source === source),
    ) ?? [];
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      <div className="tabs">
        <button
          className={tab === "pages" ? "selected" : ""}
          onClick={() => setTab("pages")}
        >
          Tất cả Page
        </button>
        <button
          className={tab === "workspace" ? "selected" : ""}
          onClick={() => setTab("workspace")}
        >
          Workspace
        </button>
        <button
          className={tab === "accounts" ? "selected" : ""}
          onClick={() => setTab("accounts")}
        >
          Tài khoản quảng cáo
        </button>
        <button
          className={tab === "content" ? "selected" : ""}
          onClick={() => setTab("content")}
        >
          Nội dung
        </button>
      </div>
      {tab === "content" ? (
        <section className="card">
          <EmptyState
            icon="videos"
            title="Nội dung sẽ có ở Giai đoạn 6"
            description="Hiện chưa có video hoặc bài đăng được đồng bộ. Mở từng Page để xem cấu hình và quyền."
          />
        </section>
      ) : tab === "accounts" ? (
        <AccountTable rows={accounts} />
      ) : (
        <>
          <div className="toolbar page-toolbar">
            <label className="search-field">
              <Icon name="search" size={18} />
              <input
                aria-label="Tìm Page"
                placeholder="Tìm tên, mã hoặc ID Page"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Nguồn Page"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="all">Tất cả nguồn</option>
              <option value="LIVE">Meta API</option>
              <option value="MOCK">Dữ liệu thử nghiệm</option>
            </select>
            <div className="view-toggle">
              <button
                className="button secondary"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                Lưới
              </button>
              <button
                className="button secondary"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                Bảng
              </button>
            </div>
          </div>
          {rows === null && !error ? (
            <p role="status">Đang đọc Page…</p>
          ) : filtered.length === 0 ? (
            <section className="card">
              <EmptyState
                icon="pages"
                title="Chưa có Page phù hợp"
                description={
                  manage
                    ? "Kết nối Facebook, chọn Page và hoàn tất thiết lập trong Cài đặt."
                    : "Bạn chỉ thấy Page được quản trị viên cấp quyền. Liên hệ quản trị viên nếu chưa có Page."
                }
              >
                {manage && (
                  <Link className="button primary" href="/settings?tab=meta">
                    Thiết lập kết nối Meta
                  </Link>
                )}
              </EmptyState>
            </section>
          ) : view === "grid" ? (
            <div className="page-grid">
              {filtered.map((p) => (
                <Link
                  className="card page-tile"
                  href={`/pages/${p.id}`}
                  key={p.id}
                >
                  <div className="page-avatar">
                    <Icon name="pages" size={28} />
                  </div>
                  <SourceBadge source={p.source} />
                  <h2>{p.name}</h2>
                  <p>{p.code}</p>
                  <small>ID {p.metaId}</small>
                  <div className="tile-info">
                    <span>Ngách</span>
                    <strong>{p.niche || "Chưa đặt"}</strong>
                    <span>TKQC chính</span>
                    <strong>
                      {p.accountName || "Chưa ghép hoặc chưa có quyền"}
                    </strong>
                  </div>
                  <Badge
                    tone={p.status === "AUTHORIZED" ? "success" : "warning"}
                  >
                    {p.status === "AUTHORIZED"
                      ? "Đã cấp quyền"
                      : "Cần kiểm tra quyền"}
                  </Badge>
                  <span className="text-link">Mở Workspace →</span>
                </Link>
              ))}
            </div>
          ) : (
            <section className="card table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Mã / ngách</th>
                    <th>TKQC chính</th>
                    <th>Nguồn / quyền</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link className="text-link" href={`/pages/${p.id}`}>
                          {p.name}
                        </Link>
                        <small>{p.metaId}</small>
                      </td>
                      <td>
                        {p.code}
                        <small>{p.niche || "Chưa đặt"}</small>
                      </td>
                      <td>{p.accountName || "Chưa ghép hoặc chưa có quyền"}</td>
                      <td>
                        <SourceBadge source={p.source} />
                        <small>
                          {p.status === "AUTHORIZED"
                            ? "Đã cấp quyền"
                            : "Cần kiểm tra quyền"}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      {manage && tab === "accounts" && (
        <ResourceAccess pages={rows ?? []} accounts={accounts} />
      )}
    </>
  );
}
function AccountTable({ rows }: { rows: AccountRow[] }) {
  return (
    <section className="card table-scroll">
      {rows.length === 0 ? (
        <EmptyState
          icon="ads"
          title="Chưa có TKQC được cấp quyền"
          description="Chọn TKQC trong wizard hoặc nhờ quản trị viên cấp quyền tài nguyên."
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tài khoản / ID</th>
              <th>Đơn vị / múi giờ</th>
              <th>Quyền tác vụ</th>
              <th>Nguồn / trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.name}
                  <small>{a.metaId}</small>
                </td>
                <td>
                  {a.currency}
                  <small>{a.timezone}</small>
                </td>
                <td>{a.tasks.join(", ") || "unavailable"}</td>
                <td>
                  <SourceBadge source={a.source} />
                  <small>
                    {a.status === "AUTHORIZED"
                      ? "Đã đọc thành công"
                      : "Cần kiểm tra quyền"}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
function ResourceAccess({
  pages,
  accounts,
}: {
  pages: PageRow[];
  accounts: AccountRow[];
}) {
  type Grants = {
    members: Array<{ id: string; name: string; role: string }>;
    grants: Array<{
      id: string;
      userId: string;
      pageId: string | null;
      accountId: string | null;
    }>;
  };
  const [data, setData] = useState<Grants | null>(null),
    [userId, setUser] = useState(""),
    [resource, setResource] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await requestApi<Grants>("/api/meta/grants"));
  }
  useEffect(() => {
    requestApi<Grants>("/api/meta/grants")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function update(
    enabled: boolean,
    user: string,
    kind: string,
    id: string,
  ) {
    setBusy(true);
    setError("");
    try {
      await requestApi("/api/meta/grants", {
        method: "POST",
        body: JSON.stringify({
          userId: user,
          pageId: kind === "page" ? id : null,
          accountId: kind === "account" ? id : null,
          enabled,
        }),
      });
      await load();
      setMessage(
        enabled ? "Đã cấp quyền tài nguyên." : "Đã thu hồi quyền tài nguyên.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card">
      <h2>Phân quyền Page / TKQC</h2>
      <p>
        Vai trò giới hạn thao tác; danh sách này giới hạn tài nguyên. Cấp Page
        và TKQC riêng. OWNER/ADMIN xem toàn bộ.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="toolbar">
        <select
          aria-label="Nhân viên nhận quyền"
          value={userId}
          onChange={(e) => setUser(e.target.value)}
        >
          <option value="">Chọn nhân viên</option>
          {data?.members
            .filter((u) => !["OWNER", "ADMIN"].includes(u.role))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
        </select>
        <select
          aria-label="Tài nguyên được cấp"
          value={resource}
          onChange={(e) => setResource(e.target.value)}
        >
          <option value="">Chọn Page hoặc TKQC</option>
          {pages.map((p) => (
            <option key={p.id} value={`page:${p.id}`}>
              Page: {p.name}
            </option>
          ))}
          {accounts.map((a) => (
            <option key={a.id} value={`account:${a.id}`}>
              TKQC: {a.name}
            </option>
          ))}
        </select>
        <button
          className="button primary"
          disabled={busy || !userId || !resource}
          onClick={() => {
            const [kind, id] = resource.split(":");
            void update(true, userId, kind, id);
          }}
        >
          Cấp quyền
        </button>
      </div>
      {data?.grants.map((g) => (
        <div className="connection-row" key={g.id}>
          <span>
            {data.members.find((u) => u.id === g.userId)?.name ??
              "Nhân viên đã khóa"}{" "}
            →{" "}
            {g.pageId
              ? pages.find((p) => p.id === g.pageId)?.name
              : accounts.find((a) => a.id === g.accountId)?.name}
          </span>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              update(
                false,
                g.userId,
                g.pageId ? "page" : "account",
                g.pageId ?? g.accountId!,
              )
            }
          >
            Thu hồi
          </button>
        </div>
      ))}
    </section>
  );
}
export function PageWorkspace({ id, manage }: { id: string; manage: boolean }) {
  const [data, setData] = useState<PageDetail | null>(null),
    [accounts, setAccounts] = useState<AccountRow[]>([]),
    [code, setCode] = useState(""),
    [niche, setNiche] = useState(""),
    [primary, setPrimary] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const row = await requestApi<PageDetail>(`/api/pages/${id}`);
    setData(row);
    setCode(row.code);
    setNiche(row.niche);
    setPrimary(row.account?.id ?? "");
  }
  useEffect(() => {
    let current = true;
    Promise.all([
      requestApi<PageDetail>(`/api/pages/${id}`),
      manage
        ? requestApi<AccountRow[]>("/api/ad-accounts")
        : Promise.resolve([] as AccountRow[]),
    ])
      .then(([row, list]) => {
        if (!current) return;
        setAccounts(list);
        setData(row);
        setCode(row.code);
        setNiche(row.niche);
        setPrimary(row.account?.id ?? "");
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [id, manage]);
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {data ? (
        <>
          <section className="card settings-card">
            <div className="section-heading">
              <div>
                <h2>{data.name}</h2>
                <p>Facebook Page ID: {data.metaId}</p>
              </div>
              <SourceBadge source={data.source} />
            </div>
            <div className="workspace-metrics">
              {["Video", "Campaign", "Chi tiêu", "Hoa hồng", "ROAS"].map(
                (name) => (
                  <div key={name}>
                    <small>{name}</small>
                    <strong>—</strong>
                    <small>Chưa có dữ liệu</small>
                  </div>
                ),
              )}
            </div>
            <p>
              Publish Settings: chưa bật đăng bài. Đăng video được triển khai ở
              Giai đoạn 6.
            </p>
            {manage ? (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await requestApi(`/api/pages/${id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        code,
                        niche,
                        primaryAccountId: primary || null,
                      }),
                    });
                    await load();
                    setMessage("Đã lưu Page và lịch sử ánh xạ.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Page Code
                  <input
                    required
                    value={code}
                    maxLength={40}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <label>
                  Ngách
                  <input
                    value={niche}
                    maxLength={100}
                    onChange={(e) => setNiche(e.target.value)}
                  />
                </label>
                <label>
                  TKQC chính
                  <select
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                  >
                    <option value="">Chưa ghép</option>
                    {accounts
                      .filter(
                        (a) =>
                          a.source === data.source && a.status === "AUTHORIZED",
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.currency}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  {busy ? "Đang lưu…" : "Lưu cấu hình Page"}
                </button>
              </form>
            ) : (
              <p>
                Mã {data.code} · Ngách {data.niche || "Chưa đặt"} · TKQC{" "}
                {data.account?.name ?? "Chưa ghép hoặc chưa có quyền"}
              </p>
            )}
          </section>
          <section className="card settings-card">
            <h2>Quyền & trạng thái kết nối</h2>
            <p>
              {data.health.token} · {data.health.api}
            </p>
            <p>
              Kiểm tra gần nhất:{" "}
              {new Date(data.health.checkedAt).toLocaleString("vi-VN")}
            </p>
            <div className="health-list">
              {[
                ["Đọc Page", data.health.pageRead],
                ["Đăng bài", data.health.publishing],
                ["Đọc Ads", data.health.adsRead],
                ["Quản lý Ads", data.health.adsManage],
              ].map(([name, ok]) => (
                <div className="health-row" key={String(name)}>
                  <strong>{name}</strong>
                  <Badge tone={ok ? "success" : "warning"}>
                    {ok ? "Quyền được cấp" : "Thiếu quyền"}
                  </Badge>
                </div>
              ))}
            </div>
            <p>{data.health.guidance}</p>
            {manage && (
              <Link href="/settings?tab=meta" className="button secondary">
                Làm mới hoặc kết nối lại
              </Link>
            )}
          </section>
          {manage && (
            <section className="card settings-card">
              <h2>Lịch sử ánh xạ</h2>
              {data.history.length === 0 ? (
                <p>Chưa có thay đổi ánh xạ.</p>
              ) : (
                data.history.map((h) => (
                  <div className="connection-row" key={h.id}>
                    <span>
                      {accounts.find((a) => a.id === h.previousAccountId)
                        ?.name ?? "Chưa ghép"}{" "}
                      →{" "}
                      {accounts.find((a) => a.id === h.accountId)?.name ??
                        "Chưa ghép"}
                    </span>
                    <small>
                      {new Date(h.createdAt).toLocaleString("vi-VN")}
                    </small>
                  </div>
                ))
              )}
            </section>
          )}
        </>
      ) : (
        !error && <p role="status">Đang đọc Workspace…</p>
      )}
    </>
  );
}
