import { api } from "@/server/http/api";
import { trackingService } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (request, actor) =>
    trackingService.links(actor, [await readJson(request)]),
  { permission: "tracking:write", mutation: true },
);
