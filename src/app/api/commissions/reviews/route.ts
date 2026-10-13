import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(async (_request, actor) => commissions.reviews(actor), {
  permission: "commissions:manage",
});
export const POST = api(
  async (request, actor) => commissions.resolve(actor, await readJson(request)),
  { permission: "commissions:manage", mutation: true },
);
