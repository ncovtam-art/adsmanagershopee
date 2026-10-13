import { z } from "zod";
import { api } from "@/server/http/api";
import { readJson } from "@/server/http/security";
import { analytics } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    analytics.policy(
      actor,
      z.string().uuid().parse(req.nextUrl.searchParams.get("accountId")),
    ),
  { permission: "finance:read" },
);
export const POST = api(
  async (req, actor) => analytics.savePolicy(actor, await readJson(req)),
  { permission: "settings:write", mutation: true },
);
