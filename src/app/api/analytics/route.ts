import { api } from "@/server/http/api";
import { analytics } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    analytics.report(actor, Object.fromEntries(req.nextUrl.searchParams)),
  { permission: "finance:read" },
);
