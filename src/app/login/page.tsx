import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/current";
import { LoginForm } from "@/components/login-form";
import { Icon, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main id="main-content" className="login-page">
      <div className="login-brand">
        <span className="brand-icon">
          <Icon name="zap" size={24} />
        </span>
        Affiliate<span className="login-brand-sub">COMMAND CENTER</span>
      </div>
      <section className="login-story">
        <Badge tone="purple">KHÔNG GIAN ĐIỀU HÀNH AFFILIATE</Badge>
        <h1>
          Mọi hoạt động.
          <br />
          Một <span>điểm điều hành.</span>
        </h1>
        <p>
          Từ nội dung đến quảng cáo, từ SubID đến lợi nhuận.
          <br />
          Tập trung công việc. Hiểu đúng dữ liệu.
        </p>
        <div className="orbit-visual" aria-hidden="true">
          <div className="orbit-ring ring-outer" />
          <div className="orbit-ring ring-inner" />
          <div className="orbit-core">
            <Icon name="zap" size={44} />
          </div>
          <span className="orbit-node node-1">
            <Icon name="pages" size={24} />
          </span>
          <span className="orbit-node node-2">
            <Icon name="videos" size={24} />
          </span>
          <span className="orbit-node node-3">
            <Icon name="ads" size={24} />
          </span>
          <span className="orbit-node node-4">
            <Icon name="revenue" size={24} />
          </span>
        </div>
        <div className="login-security">
          <Icon name="shield" size={17} />
          Truy cập theo vai trò · Phiên đăng nhập được bảo vệ
        </div>
      </section>
      <section className="login-card">
        <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
        <h2>
          Đăng nhập không gian
          <br />
          làm việc của bạn
        </h2>
        <p className="login-description">
          Tiếp tục công việc cùng nhóm của bạn.
        </p>
        <LoginForm />
        <div className="login-card-footer">
          <span className="status-dot" />
          Giai đoạn 1 · Nền tảng hệ thống
        </div>
      </section>
      <div className="login-footer">
        Affiliate Ads Command Center · Kết nối Meta và Shopee sẽ được bổ sung ở
        các giai đoạn tiếp theo.
      </div>
    </main>
  );
}
