import { api } from "@/server/http/api";
import { telegram } from "@/server/services";
export const GET = api(async (_req, actor) => telegram.jobs(actor), {
  permission: "settings:write",
});
