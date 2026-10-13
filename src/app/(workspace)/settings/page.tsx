import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { connectionConfig } from "@/server/meta/service";
import { can } from "@/server/auth/policy";
import {
  databaseHealth,
  activeUserCount,
  auditCount,
} from "@/server/database/read-models";
import { settings } from "@/server/services";
import { PageHeader, EmptyState, Badge, Icon } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { LinkCenter } from "@/components/shopee/link-center";
import { ConnectionManager } from "@/components/meta/connection-manager";
import { WorkspaceForm } from "@/components/workspace-form";

import { CareManager } from "@/components/care/care-manager";
import { TelegramManager } from "@/components/care/telegram-manager";
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const tab = [
    "meta",
    "shopee",
    "telegram",
    "automation",
    "system",
    "advanced",
  ].includes(query.tab ?? "")
    ? query.tab!
    : "meta";
  const admin = can(user.role, "team:manage");
  return (
    <>
      <PageHeader
        eyebrow="CẤU HÌNH KHÔNG GIAN LÀM VIỆC"
        title="Cài đặt"
        description="Quản lý kết nối, đội ngũ và trạng thái hệ thống."
      />
      <SettingsTabs active={tab} />
      {(tab === "system" ||
        tab === "advanced" ||
        tab === "meta" ||
        tab === "telegram") &&
      !admin ? (
        <section className="card">
          <EmptyState
            icon="shield"
            title="Cần quyền quản trị"
            description="Chỉ chủ sở hữu và quản trị viên được xem thông tin hệ thống hoặc thay đổi cấu hình."
          />
        </section>
      ) : tab === "meta" ? (
        <ConnectionManager />
      ) : tab === "shopee" ? (
        <LinkCenter
          write={can(user.role, "tracking:write")}
          productsWrite={can(user.role, "products:write")}
        />
      ) : tab === "telegram" ? (
        <TelegramManager />
      ) : tab === "automation" && can(user.role, "finance:read") ? (
        <CareManager write={can(user.role, "ads:write")} admin={admin} />
      ) : tab === "advanced" ? (
        <section className="card settings-card">
          <div className="section-heading">
            <div>
              <h2>Không gian làm việc</h2>
              <p>Tên và múi giờ hiển thị của nhóm.</p>
            </div>
            <Icon name="settings" />
          </div>
          <WorkspaceForm {...await settings.read(user)} />
        </section>
      ) : tab === "system" ? (
        <SystemHealth />
      ) : (
        <section className="card module-empty">
          <EmptyState
            icon="link"
            title={
              tab === "shopee"
                ? "Shopee Link Center chưa được triển khai"
                : tab === "telegram"
                  ? "Telegram chưa được tích hợp"
                  : "Automation chưa được triển khai"
            }
            description={
              tab === "shopee"
                ? "Giai đoạn 4 sẽ hỗ trợ SubID, Custom Link thủ công và nhập báo cáo hoa hồng. Chưa có thao tác Shopee ở phiên bản này."
                : "Chức năng này sẽ được bổ sung theo lộ trình. Hiện chưa có Worker hoặc thông báo tự động."
            }
          >
            <Badge tone="warning">Chưa kết nối</Badge>
          </EmptyState>
        </section>
      )}
    </>
  );
}
async function SystemHealth() {
  let healthy = true;
  try {
    await databaseHealth();
  } catch {
    healthy = false;
  }
  const [users, audits] = healthy
    ? await Promise.all([activeUserCount(), auditCount()])
    : [null, null];
  const metaConfig = connectionConfig();
  return (
    <section className="card settings-card">
      <div className="section-heading">
        <div>
          <h2>Trạng thái hệ thống</h2>
          <p>Kiểm tra kết nối thực tế khi tải trang.</p>
        </div>
        <Badge tone={healthy ? "success" : "warning"}>
          {healthy ? "Database sẵn sàng" : "Database gián đoạn"}
        </Badge>
      </div>
      <div className="health-list">
        <HealthRow
          icon="database"
          title="PostgreSQL"
          description="Truy vấn SELECT 1 đến Database"
          status={healthy ? "Đã kết nối" : "Không thể kết nối"}
          ok={healthy}
        />
        <HealthRow
          icon="users"
          title="Tài khoản đang hoạt động"
          description="Dữ liệu từ Database"
          status={String(users ?? "—")}
          ok={healthy}
        />
        <HealthRow
          icon="shield"
          title="Nhật ký thao tác"
          description="Lưu các thay đổi nhân viên và cấu hình"
          status={`${audits ?? "—"} bản ghi`}
          ok={healthy}
        />
        <HealthRow
          icon="link"
          title="Meta OAuth"
          description="Xem kết nối và kiểm tra quyền ở tab Kết nối Meta"
          status={
            metaConfig.liveReady
              ? "Cấu hình sẵn sàng"
              : metaConfig.mockEnabled
                ? "Đã bật thử nghiệm"
                : "Chờ cấu hình Meta App"
          }
        />
        <HealthRow
          icon="link"
          title="Shopee Tracking"
          description="Custom Link thủ công và nhập báo cáo CSV"
          status="Manual / Import CSV"
        />
        {["Telegram"].map((name) => (
          <HealthRow
            key={name}
            icon="link"
            title={name}
            description="Cấu hình và lịch sử ở tab Telegram"
            status="Tắt mặc định / cấu hình riêng"
          />
        ))}
      </div>
      <Link href="/settings/audit" className="button secondary">
        Xem nhật ký thao tác
        <Icon name="arrow" size={16} />
      </Link>
    </section>
  );
}
function HealthRow({
  icon,
  title,
  description,
  status,
  ok,
}: {
  icon: string;
  title: string;
  description: string;
  status: string;
  ok?: boolean;
}) {
  return (
    <div className="health-row">
      <span className="health-icon">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <Badge tone={ok ? "success" : "muted"}>{status}</Badge>
    </div>
  );
}
