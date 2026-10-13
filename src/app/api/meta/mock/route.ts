import { api } from "@/server/http/api";
import { meta } from "@/server/services";
export const POST = api(async (_request, actor) => meta.mock(actor), {
  permission: "meta:manage",
  mutation: true,
});
