import { api } from "@/server/http/api";
import { ads } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (req, actor) => ads.preview(actor, await readJson(req, 65536)),
  { permission: "ads:write", mutation: true },
);
