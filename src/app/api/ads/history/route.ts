import { api } from "@/server/http/api";
import { ads } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    ads.history(actor, req.nextUrl.searchParams.get("id") ?? ""),
  { permission: "ads:write" },
);
