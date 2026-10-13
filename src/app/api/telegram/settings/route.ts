import { api } from "@/server/http/api";
import { telegram } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(async (_req, actor) => telegram.read(actor), {
  permission: "settings:write",
});
export const POST = api(
  async (req, actor) => telegram.save(actor, await readJson(req)),
  { permission: "settings:write", mutation: true },
);
