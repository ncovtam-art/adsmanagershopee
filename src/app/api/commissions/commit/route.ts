import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (request, actor) => commissions.commit(actor, await readJson(request)),
  { permission: "commissions:manage", mutation: true },
);
