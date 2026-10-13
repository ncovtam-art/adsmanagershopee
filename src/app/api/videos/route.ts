import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(
  async (req, actor) =>
    publisher.library(actor, Object.fromEntries(req.nextUrl.searchParams)),
  { permission: "workspace:read" },
);
export const POST = api(
  async (req, actor) => publisher.beginUpload(actor, await readJson(req)),
  { permission: "publisher:write", mutation: true },
);
