import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
import { z } from "zod";
export const GET = api(
  async (request, actor) =>
    commissions.detail(
      actor,
      z.string().uuid().parse(request.nextUrl.pathname.split("/").pop()),
    ),
  { permission: "finance:read" },
);
