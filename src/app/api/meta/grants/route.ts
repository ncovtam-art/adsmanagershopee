import { api } from "@/server/http/api";
import { meta } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(async (_request, actor) => meta.grants(actor), {
  permission: "meta:manage",
});
export const POST = api(
  async (request, actor) => meta.grant(actor, await readJson(request)),
  { permission: "meta:manage", mutation: true },
);
