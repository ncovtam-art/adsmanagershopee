"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigation, roleLabels } from "@/lib/navigation";
import { requestApi } from "@/lib/client-api";
import { Icon, Badge } from "./ui";
import type { Actor } from "@/server/auth/policy";

export function AppShell({
  user,
  workspaceName,
  children,
}: {
  user: Actor;
  workspaceName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const selected = navigation.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );
  const matches = navigation.filter((item) =>
    item.label.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );

  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      await requestApi("/api/auth/logout", { method: "POST", body: "{}" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <Link href="/" className="brand" onClick={() => setMobileOpen(false)}>
          <span className="brand-icon">
            <Icon name="zap" size={24} />
          </span>
          <span>
            Affiliate<span className="brand-subtitle">COMMAND CENTER</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {workspaceName.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{workspaceName}</strong>
            <small>Không gian làm việc</small>
          </div>
          <Icon name="shield" size={16} />
        </div>
        <div className="nav-caption">KHÔNG GIAN ĐIỀU HÀNH</div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={selected?.href === item.href ? "page" : undefined}
              className={`nav-link ${selected?.href === item.href ? "active" : ""}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {selected?.href === item.href && (
                <span className="nav-indicator" />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="foundation-note">
            <span className="status-dot" />
            <strong>Nền tảng đã thiết lập</strong>
            <p>Page · Donor · Shopee Tracking đã có</p>
            <Badge tone="purple">Module 1–10 · chờ nghiệm thu LIVE</Badge>
          </div>
          <div className="user-card">
            <span className="user-avatar">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{roleLabels[user.role]}</small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
            >
              <Icon name="pages" />
            </button>
            <span>Không gian làm việc</span>
            <Icon name="chevron" size={14} />
            <strong>{selected?.label ?? "Cài đặt"}</strong>
          </div>
          <div className="topbar-actions">
            <div className="search-container">
              <div className="search-box">
                <Icon name="search" size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder="Tìm mục điều hướng…"
                  aria-label="Tìm mục điều hướng"
                />
                {searchOpen && (
                  <button
                    className="search-close"
                    onClick={() => setSearchOpen(false)}
                    aria-label="Đóng tìm kiếm"
                  >
                    ×
                  </button>
                )}
              </div>
              {searchOpen && (
                <div className="search-results">
                  <div className="search-caption">ĐIỀU HƯỚNG</div>
                  {matches.length ? (
                    matches.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => {
                          setSearchOpen(false);
                          setSearch("");
                        }}
                      >
                        <Icon name={item.icon} size={16} />
                        {item.label}
                        <Icon name="arrow" size={14} />
                      </Link>
                    ))
                  ) : (
                    <p>Không tìm thấy mục phù hợp.</p>
                  )}
                </div>
              )}
            </div>
            <span className="topbar-avatar" title={user.name}>
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
        <main id="main-content" className="page-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>Affiliate Ads Command Center</span>
          <span>v1.0 · Dữ liệu tài chính chỉ hiển thị khi được xác minh</span>
        </footer>
      </div>
    </div>
  );
}
