import { z } from "zod";
import { api } from "@/server/http/api";
import { analytics } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    analytics.accounts(
      actor,
      z
        .enum(["LIVE", "MOCK"])
        .parse(req.nextUrl.searchParams.get("source") ?? "LIVE"),
    ),
  { permission: "finance:read" },
);
