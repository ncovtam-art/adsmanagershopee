import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { modules } from "@/lib/navigation";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const user = await requireUser();
  const { module } = await params;
  const data = Object.hasOwn(modules, module) ? modules[module] : null;
  if (!data) notFound();
  const forbidden = module === "revenue" && !can(user.role, "finance:read");
  return (
    <>
      <PageHeader
        eyebrow={data.eyebrow}
        title={data.title}
        description={data.description}
        action={
          <Badge tone="warning">
            {forbidden ? "Cần quyền truy cập" : "Chưa triển khai"}
          </Badge>
        }
      />
      <div className="tabs placeholder-tabs" aria-label="Các chức năng dự kiến">
        {data.tabs.map((tab) => (
          <span key={tab}>{tab}</span>
        ))}
      </div>
      <section className="card module-empty">
        <EmptyState
          icon={forbidden ? "shield" : data.icon}
          title={
            forbidden
              ? "Bạn chưa có quyền xem dữ liệu tài chính"
              : "Module này đang nằm trong lộ trình"
          }
          description={
            forbidden
              ? "Liên hệ chủ sở hữu để được cấp vai trò phù hợp. Không có dữ liệu tài chính được gửi đến trình duyệt của bạn."
              : `Chức năng sẽ được triển khai ở ${data.stage}. Hiện chưa có dữ liệu hoặc thao tác nghiệp vụ tại đây.`
          }
        >
          <Badge tone="purple">{data.stage}</Badge>
        </EmptyState>
      </section>
    </>
  );
}
