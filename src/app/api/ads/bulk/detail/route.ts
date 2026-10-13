import { api } from "@/server/http/api";
import { bulkAds } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    bulkAds.detail(actor, req.nextUrl.searchParams.get("id") ?? ""),
  { permission: "ads:write" },
);
