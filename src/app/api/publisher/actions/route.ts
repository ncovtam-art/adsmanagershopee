import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (req, actor) => publisher.action(actor, await readJson(req, 65536)),
  { permission: "publisher:write", mutation: true },
);
