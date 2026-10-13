import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { meta, commissions } from "@/server/services";
import { activeUserCount } from "@/server/database/read-models";
import { PageHeader, Icon, Badge } from "@/components/ui";

export default async function OverviewPage() {
  const user = await requireUser();
  const isAdmin = can(user.role, "team:manage");
  const count = isAdmin ? await activeUserCount() : null;
  const pageRows = await meta.listPages(user);
  const livePages = pageRows.filter(
    (p) => p.source === "LIVE" && p.status === "AUTHORIZED",
  ).length;
  const financial = can(user.role, "finance:read");
  const commissionData = financial
    ? await commissions.list(user, { source: "LIVE" })
    : null;
  const paidTotals =
    commissionData?.totals.filter((t) => t.status === "PAID") ?? [];
  const careData = financial
    ? await (await import("@/server/services")).care.list(user)
    : null;
  return (
    <>
      <PageHeader
        eyebrow="TỔNG QUAN KHÔNG GIAN LÀM VIỆC"
        title={`Chào ${user.name.split(" ").at(-1)}, bắt đầu thôi.`}
        description="Một góc nhìn tập trung cho hành trình Affiliate của bạn."
        action={
          <Badge tone="purple">
            <span className="status-dot purple-dot" /> Page · Donor · Shopee
            Tracking
          </Badge>
        }
      />
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="eyebrow">SẴN SÀNG CHO BƯỚC TIẾP THEO</span>
          <h2>
            Xây dựng không gian.
            <br />
            <span>Kết nối đội ngũ.</span>
          </h2>
          <p>
            Kết nối Page, xác nhận tài khoản quảng cáo và đọc mẫu Ads Donor từ
            các quảng cáo của bạn.
          </p>
          {isAdmin ? (
            <Link href="/settings?tab=meta" className="button primary">
              Kết nối Page
              <Icon name="arrow" size={17} />
            </Link>
          ) : (
            <Link href="/settings" className="button secondary">
              Xem cấu hình kết nối
              <Icon name="arrow" size={17} />
            </Link>
          )}
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-center">
            <Icon name="zap" size={44} />
          </div>
          <div className="art-chip chip-1">
            <Icon name="pages" size={20} />
            Page
          </div>
          <div className="art-chip chip-2">
            <Icon name="ads" size={20} />
            Campaign
          </div>
          <div className="art-chip chip-3">
            <Icon name="link" size={20} />
            SubID
          </div>
          <div className="art-chip chip-4">
            <Icon name="revenue" size={20} />
            ROAS
          </div>
        </div>
      </section>
      <div className="kpi-grid">
        <Kpi
          icon="pages"
          title="Page đã kết nối"
          value={String(livePages)}
          note={`${pageRows.filter((p) => p.source === "MOCK").length} Page thử nghiệm được lưu riêng`}
        />
        <Kpi
          icon="ads"
          title="Campaign đang chạy"
          value="—"
          note="Chưa đồng bộ quảng cáo"
        />
        {financial ? (
          <>
            <Kpi
              icon="revenue"
              title="Hoa hồng đã thanh toán"
              value={
                paidTotals.length === 1
                  ? `${paidTotals[0].amount} ${paidTotals[0].currency}`
                  : "—"
              }
              note={
                commissionData?.count
                  ? paidTotals.length > 1
                    ? "Nhiều currency; xem báo cáo chi tiết"
                    : "Đối soát chi tiết ở Doanh thu & ROAS"
                  : "Chưa có báo cáo Shopee"
              }
            />
            <Kpi
              icon="chart"
              title="Commission ROAS"
              value="—"
              note="Chưa đủ dữ liệu đối soát"
            />
          </>
        ) : (
          <>
            <Kpi
              icon="shield"
              title="Quyền truy cập"
              value="Giới hạn"
              note="Dữ liệu tài chính cần được cấp quyền"
            />
            <Kpi
              icon="clock"
              title="Đồng bộ gần nhất"
              value="—"
              note="Chưa có nguồn dữ liệu kết nối"
            />
          </>
        )}
      </div>
      <div className="dashboard-columns">
        <section className="card journey-card">
          <div className="section-heading">
            <div>
              <h2>Lộ trình khởi động</h2>
              <p>Thiết lập một lần, vận hành mỗi ngày.</p>
            </div>
            <Badge tone="purple">1 / 4</Badge>
          </div>
          <div className="journey-list">
            <Journey
              number="01"
              title="Thiết lập nền tảng"
              description="Đăng nhập, Database và phân quyền đã có."
              status="Đã thiết lập"
              done
            />
            <Journey
              number="02"
              title="Mời đội ngũ của bạn"
              description={
                count !== null
                  ? `${count} tài khoản đang hoạt động trong không gian.`
                  : "Chủ sở hữu quản lý quyền truy cập cho từng nhân viên."
              }
              href={isAdmin ? "/settings/team" : undefined}
            />
            <Journey
              number="03"
              title="Kết nối Page & Ad Account"
              description="Wizard chọn Page, TKQC và ánh xạ đã có."
              href={isAdmin ? "/settings?tab=meta" : "/pages"}
            />
            <Journey
              number="04"
              title="Chuẩn bị Ads Donor & tracking"
              description="Ads Donor, Shopee Tracking và Ads Analytics đã có. Mở Quảng cáo để đồng bộ chi phí và xem ROAS."
              href="/ads"
            />
          </div>
        </section>
        <section className="card quality-card">
          <span className="quality-icon">
            <Icon name="shield" size={26} />
          </span>
          <h2>
            Dữ liệu đáng tin cậy.
            <br />
            Quyết định chính xác.
          </h2>
          <p>
            Chi phí, hoa hồng và ROAS sẽ xuất hiện khi có dữ liệu được đối soát.
            Dấu “—” có nghĩa là chưa có dữ liệu.
          </p>
          <div className="quality-row">
            <Icon name="check" size={17} />
            Không dùng số liệu mẫu
          </div>
          <div className="quality-row">
            <Icon name="check" size={17} />
            Không tự bật quảng cáo
          </div>
          <div className="quality-row">
            <Icon name="check" size={17} />
            Phân quyền tại backend
          </div>
          <div className="quality-divider" />
          <span className="muted small-text">Đồng bộ gần nhất: chưa có</span>
          <Link href="/settings?tab=system" className="text-link">
            Kiểm tra trạng thái hệ thống
            <Icon name="arrow" size={15} />
          </Link>
        </section>
      </div>
      {careData && (
        <section className="card care-manager">
          <h2>Cảnh báo Ads Care</h2>
          <p>
            {careData.alerts.filter((a) => a.state === "OPEN").length} cảnh báo
            chưa kiểm tra trong phạm vi được cấp.
          </p>
          <Link href="/settings?tab=automation" className="button secondary">
            Xem Ads Care
          </Link>
        </section>
      )}
      <section className="readiness-strip">
        <Icon name="help" size={22} />
        <div>
          <strong>Các module Affiliate đã được triển khai</strong>
          <p>
            Page, Video, Ads, Shopee, ROAS và Ads Care đã có. Kết nối Meta LIVE
            cần cấu hình và nghiệm thu quyền API.
          </p>
        </div>
        <Link href="/pages" className="button secondary small">
          Xem bước tiếp theo
          <Icon name="chevron" size={15} />
        </Link>
      </section>
    </>
  );
}
function Kpi({
  icon,
  title,
  value,
  note,
}: {
  icon: string;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <section className="card kpi">
      <div className="kpi-top">
        <span>{title}</span>
        <Icon name={icon} size={18} />
      </div>
      <strong className={value.length > 4 ? "text-value" : ""}>{value}</strong>
      <small>
        <span className="tiny-dot" />
        {note}
      </small>
    </section>
  );
}
function Journey({
  number,
  title,
  description,
  status,
  done,
  href,
}: {
  number: string;
  title: string;
  description: string;
  status?: string;
  done?: boolean;
  href?: string;
}) {
  return (
    <div className="journey-item">
      <span className={`step-number ${done ? "done" : ""}`}>
        {done ? <Icon name="check" size={18} /> : number}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {href ? (
        <Link href={href} aria-label={title} className="icon-button">
          <Icon name="arrow" size={17} />
        </Link>
      ) : (
        status && <Badge tone={done ? "success" : "muted"}>{status}</Badge>
      )}
    </div>
  );
}
