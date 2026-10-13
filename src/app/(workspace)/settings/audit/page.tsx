import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { auditPage } from "@/server/database/read-models";
import { settings } from "@/server/services";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

const labels: Record<string, string> = {
  OWNER_CREATED: "Khởi tạo chủ sở hữu",
  LOGIN: "Đăng nhập",
  MEMBER_CREATED: "Tạo nhân viên",
  MEMBER_DISABLED: "Khóa nhân viên",
  MEMBER_ENABLED: "Mở khóa nhân viên",
  WORKSPACE_UPDATED: "Thay đổi cấu hình",
};
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "team:manage"))
    return (
      <EmptyState
        icon="shield"
        title="Cần quyền quản trị"
        description="Bạn chưa có quyền xem nhật ký thao tác."
      />
    );
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.isInteger(Number(query.page)) ? Number(query.page) : 1),
  );
  const workspace = await settings.read(user);
  const { items, total } = await auditPage(page);
  return (
    <>
      <PageHeader
        eyebrow="BẢO MẬT & TRUY VẾT"
        title="Nhật ký thao tác"
        description={`Thời gian hiển thị theo ${workspace.timezone}. Nhật ký không chứa mật khẩu hay token.`}
        action={
          <Link className="button secondary" href="/settings?tab=system">
            Quay lại
          </Link>
        }
      />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Thao tác</th>
              <th>Đối tượng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {new Intl.DateTimeFormat("vi-VN", {
                    timeZone: workspace.timezone,
                    dateStyle: "short",
                    timeStyle: "medium",
                  }).format(item.createdAt)}
                </td>
                <td>{item.actor?.name ?? "Hệ thống"}</td>
                <td>
                  <Badge>{labels[item.action] ?? item.action}</Badge>
                </td>
                <td className="mono small-text">{item.resourceId}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <EmptyState
            icon="shield"
            title="Chưa có nhật ký tại trang này"
            description="Các thay đổi nhân viên và cấu hình sẽ được ghi lại ở đây."
          />
        )}
      </div>
      <div className="pagination">
        <span>
          {total} bản ghi · Trang {page}
        </span>
        <div>
          {page > 1 && (
            <Link
              href={`/settings/audit?page=${page - 1}`}
              className="button secondary small"
            >
              Trước
            </Link>
          )}
          {page * 20 < total && (
            <Link
              href={`/settings/audit?page=${page + 1}`}
              className="button secondary small"
            >
              Tiếp
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
