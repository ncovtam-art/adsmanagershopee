import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { PageHeader, EmptyState } from "@/components/ui";
import { CommissionsManager } from "@/components/shopee/commissions-manager";
import { AnalyticsManager } from "@/components/analytics/analytics-manager";
export default async function Revenue() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="SHOPEE TRACKING & ĐỐI SOÁT"
        title="Doanh thu & ROAS"
        description="Chi phí Meta, hoa hồng Shopee và lợi nhuận theo quy tắc đối soát rõ ràng."
      />
      {can(user.role, "finance:read") ? (
        <>
        <AnalyticsManager manage={can(user.role,"meta:manage")} userId={user.id}/>
        <CommissionsManager manage={can(user.role, "commissions:manage")} />
        </>
      ) : (
        <section className="card">
          <EmptyState
            icon="shield"
            title="Bạn chưa có quyền xem dữ liệu tài chính"
            description="Liên hệ chủ sở hữu để được cấp vai trò phù hợp. Không có dữ liệu tài chính được gửi đến trình duyệt của bạn."
          />
        </section>
      )}
    </>
  );
}
