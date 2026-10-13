import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { PageHeader } from "@/components/ui";
import { PagesManager } from "@/components/meta/pages-manager";
export default async function PagesPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="PAGE & META CONNECTION"
        title="Quản lý Page"
        description="Page Workspace, tài khoản quảng cáo và quyền tài nguyên."
      />
      <PagesManager manage={can(user.role, "meta:manage")} />
    </>
  );
}
