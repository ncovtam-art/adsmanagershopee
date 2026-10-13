import { api } from "@/server/http/api";
import { meta } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (request, actor) => meta.complete(actor, await readJson(request)),
  { permission: "meta:manage", mutation: true },
);
