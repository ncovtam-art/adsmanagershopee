import { api } from "@/server/http/api";
import { telegram } from "@/server/services";
export const POST = api(async (_req, actor) => telegram.test(actor), {
  permission: "settings:write",
  mutation: true,
});
