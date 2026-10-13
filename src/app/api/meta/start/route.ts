import { api } from "@/server/http/api";
import { meta } from "@/server/services";
export const POST = api(async (_request, actor) => meta.begin(actor), {
  permission: "meta:manage",
  mutation: true,
});
