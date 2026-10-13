import { api } from "@/server/http/api";
import { meta } from "@/server/services";
export const GET = api(async (_request, actor) => meta.listAccounts(actor), {
  permission: "workspace:read",
});
