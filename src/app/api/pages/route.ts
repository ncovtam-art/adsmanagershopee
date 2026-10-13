import { api } from "@/server/http/api";
import { meta } from "@/server/services";
export const GET = api(async (_request, actor) => meta.listPages(actor), {
  permission: "workspace:read",
});
