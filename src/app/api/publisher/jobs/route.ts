import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    publisher.jobs(actor, Object.fromEntries(req.nextUrl.searchParams)),
  { permission: "workspace:read" },
);
