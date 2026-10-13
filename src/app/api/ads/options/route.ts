import { api } from "@/server/http/api";
import { ads } from "@/server/services";
export const GET = api(async (_req, actor) => ads.options(actor), {
  permission: "ads:write",
});
