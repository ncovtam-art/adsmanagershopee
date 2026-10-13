import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
export const GET = api(async (_request, actor) => commissions.imports(actor), {
  permission: "commissions:manage",
});
