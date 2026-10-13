import { api } from "@/server/http/api";
import { trackingService } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(
  async (request, actor) =>
    trackingService.list(
      actor,
      request.nextUrl.searchParams.get("pageId") ?? undefined,
    ),
  { permission: "workspace:read" },
);
export const POST = api(
  async (request, actor) =>
    trackingService.create(actor, await readJson(request)),
  { permission: "tracking:write", mutation: true, status: 201 },
);
