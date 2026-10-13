import { api } from "@/server/http/api";
import { trackingService } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(
  async (_request, actor) => trackingService.products(actor),
  { permission: "workspace:read" },
);
export const POST = api(
  async (request, actor) =>
    trackingService.createProduct(actor, await readJson(request)),
  { permission: "products:write", mutation: true, status: 201 },
);
