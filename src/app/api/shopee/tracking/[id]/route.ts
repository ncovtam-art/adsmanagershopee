import { api } from "@/server/http/api";
import { trackingService } from "@/server/services";
import { z } from "zod";
export const GET = api(
  async (request, actor) =>
    trackingService.detail(
      actor,
      z.string().uuid().parse(request.nextUrl.pathname.split("/").pop()),
    ),
  { permission: "workspace:read" },
);
