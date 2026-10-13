import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(async (_, actor) => publisher.templates(actor), {
  permission: "workspace:read",
});
export const POST = api(
  async (req, actor) =>
    publisher.saveTemplate(actor, await readJson(req, 65536)),
  { permission: "publisher:write", mutation: true },
);
