import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { PageHeader } from "@/components/ui";
import { DonorsManager } from "@/components/meta/donors-manager";
import { AnalyticsManager } from "@/components/analytics/analytics-manager";
import { BulkAdsManager } from "@/components/ads/bulk-manager";
import { AdsManager } from "@/components/ads/ads-manager";
import { CareManager } from "@/components/care/care-manager";
export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ publishJobId?: string; cloneRequestId?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="THƯ VIỆN CẤU HÌNH QUẢNG CÁO"
        title="Quảng cáo"
        description="Theo dõi Campaign, Ad Set, Ad và giữ thư viện Donor theo phiên bản."
      />
      {can(user.role, "finance:read") && (
        <AnalyticsManager
          manage={can(user.role, "meta:manage")}
          userId={user.id}
        />
      )}
      {can(user.role, "ads:write") && (
        <AdsManager userId={user.id} initialJobId={params.publishJobId} />
      )}
      {can(user.role, "ads:write") && (
        <BulkAdsManager
          userId={user.id}
          initialCloneId={params.cloneRequestId}
        />
      )}
      {can(user.role, "finance:read") && (
        <CareManager
          write={can(user.role, "ads:write")}
          admin={can(user.role, "settings:write")}
        />
      )}
      <DonorsManager write={can(user.role, "donors:write")} />
    </>
  );
}
