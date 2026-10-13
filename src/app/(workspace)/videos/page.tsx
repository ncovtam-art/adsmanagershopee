import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/policy";
import { PageHeader } from "@/components/ui";
import { VideoStudio } from "@/components/publisher/video-studio";
export default async function Videos() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="VIDEO STUDIO"
        title="Đăng video"
        description="Tổ chức video riêng theo Page, chuẩn bị link và lên lịch đăng sau khi xem preview."
      />
      <VideoStudio
        userId={user.id}
        adsWrite={can(user.role,"ads:write")}
        write={can(user.role, "publisher:write")}
        manage={can(user.role, "meta:manage")}
      />
    </>
  );
}
