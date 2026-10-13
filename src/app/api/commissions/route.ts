import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
export const GET = api(
  async (request, actor) =>
    commissions.list(actor, Object.fromEntries(request.nextUrl.searchParams)),
  { permission: "finance:read" },
);
