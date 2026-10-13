import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { team } from "@/server/services";
import { PageHeader, EmptyState } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { TeamManager } from "@/components/team-manager";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.isInteger(Number(query.page)) ? Number(query.page) : 1),
  );
  const allowed = can(user.role, "team:manage");
  const data = allowed ? await team.list(user, page) : null;
  return (
    <>
      <PageHeader
        eyebrow="CẤU HÌNH KHÔNG GIAN LÀM VIỆC"
        title="Cài đặt"
        description="Quản lý kết nối, đội ngũ và trạng thái hệ thống."
      />
      <SettingsTabs active="team" />
      {data ? (
        <>
          <TeamManager
            members={data.items.map((item) => ({
              ...item,
              createdAt: item.createdAt.toISOString(),
            }))}
            actorId={user.id}
            actorRole={user.role}
          />
          <div className="pagination">
            <span>
              {data.total} tài khoản · Trang {page}
            </span>
            <div>
              {page > 1 && (
                <Link
                  className="button secondary small"
                  href={`/settings/team?page=${page - 1}`}
                >
                  Trước
                </Link>
              )}
              {page * data.pageSize < data.total && (
                <Link
                  className="button secondary small"
                  href={`/settings/team?page=${page + 1}`}
                >
                  Tiếp
                </Link>
              )}
            </div>
          </div>
        </>
      ) : (
        <section className="card">
          <EmptyState
            icon="shield"
            title="Bạn chưa có quyền quản lý nhân viên"
            description="Chỉ chủ sở hữu và quản trị viên được truy cập mục này. Liên hệ chủ sở hữu nếu cần thay đổi quyền."
          />
        </section>
      )}
    </>
  );
}
