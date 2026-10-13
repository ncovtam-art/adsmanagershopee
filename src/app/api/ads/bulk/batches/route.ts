import { api } from "@/server/http/api";
import { bulkAds } from "@/server/services";
export const GET = api(async (_req, actor) => bulkAds.list(actor), {
  permission: "ads:write",
});
