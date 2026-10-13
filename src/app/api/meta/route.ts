import { api } from "@/server/http/api";
import { meta } from "@/server/services";
export const GET = api(async (_request, actor) => meta.connections(actor), {
  permission: "meta:manage",
});
