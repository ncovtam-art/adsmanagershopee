import { z } from "zod";
import { api } from "@/server/http/api";
import { analytics } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    analytics.history(
      actor,
      z.string().uuid().parse(req.nextUrl.searchParams.get("accountId")),
    ),
  { permission: "finance:read" },
);
