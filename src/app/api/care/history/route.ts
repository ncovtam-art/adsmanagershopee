import { api } from "@/server/http/api";
import { care } from "@/server/services";
import { z } from "zod";
export const GET = api(
  async (req, actor) =>
    care.history(
      actor,
      z.string().uuid().parse(req.nextUrl.searchParams.get("id")),
    ),
  { permission: "finance:read" },
);
