import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { PageHeader } from "@/components/ui";
import { LinkCenter } from "@/components/shopee/link-center";
import { CommissionsManager } from "@/components/shopee/commissions-manager";
import { PageWorkspace } from "@/components/meta/pages-manager";
import { AnalyticsManager } from "@/components/analytics/analytics-manager";
import { VideoStudio } from "@/components/publisher/video-studio";
export default async function Workspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  return (
    <>
      <PageHeader
        eyebrow="PAGE WORKSPACE"
        title="Workspace của Page"
        description="Cấu hình riêng và quyền được cấp cho Page này."
        action={
          <Link className="button secondary" href="/pages">
            Tất cả Page
          </Link>
        }
      />
      <PageWorkspace key={id} id={id} manage={can(user.role, "meta:manage")} />
      <VideoStudio adsWrite={can(user.role,"ads:write")} userId={user.id} pageId={id} write={can(user.role,"publisher:write")} manage={can(user.role,"meta:manage")}/>
      <LinkCenter
        key={`links-${id}`}
        pageId={id}
        write={can(user.role, "tracking:write")}
        productsWrite={can(user.role, "products:write")}
      />
      {can(user.role,"finance:read") && <AnalyticsManager userId={user.id} pageId={id} manage={false}/>}
      {can(user.role, "finance:read") && (
        <CommissionsManager
          key={`commissions-${id}`}
          pageId={id}
          manage={false}
        />
      )}
    </>
  );
}
