import { api } from "@/server/http/api";
import { care } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (req, actor) => care.control(actor, await readJson(req)),
  { permission: "ads:write", mutation: true },
);
