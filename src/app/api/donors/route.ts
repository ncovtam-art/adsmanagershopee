import { api } from "@/server/http/api";
import { donorService } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(async (_request, actor) => donorService.list(actor), {
  permission: "workspace:read",
});
export const POST = api(
  async (request, actor) => donorService.save(actor, await readJson(request)),
  { permission: "donors:write", mutation: true, status: 201 },
);
