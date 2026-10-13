import { api } from "@/server/http/api";
import { settings } from "@/server/services";
import { readJson } from "@/server/http/security";

export const GET = api(async (_request, actor) => settings.read(actor), {
  permission: "workspace:read",
});
export const PATCH = api(
  async (request, actor) => settings.update(actor, await readJson(request)),
  { permission: "settings:write", mutation: true },
);
