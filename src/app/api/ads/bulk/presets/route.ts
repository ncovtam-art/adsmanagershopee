import { api } from "@/server/http/api";
import { bulkAds } from "@/server/services";
export const GET = api(async (_req, actor) => bulkAds.presets(actor), {
  permission: "ads:write",
});
import { readJson } from "@/server/http/security";
export const POST = api(
  async (req, actor) => bulkAds.savePreset(actor, await readJson(req, 65536)),
  { permission: "ads:write", mutation: true },
);
