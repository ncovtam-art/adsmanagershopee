import { api } from "@/server/http/api";
import { bulkAds } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (req, actor) =>
    bulkAds.preview(actor, await readJson(req, 4 * 1024 * 1024)),
  { permission: "ads:write", mutation: true },
);
