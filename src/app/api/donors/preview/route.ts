import { api } from "@/server/http/api";
import { donorService } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (request, actor) =>
    donorService.preview(actor, await readJson(request)),
  { permission: "donors:write", mutation: true },
);
