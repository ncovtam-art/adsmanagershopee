import { api } from "@/server/http/api";
import { readJson } from "@/server/http/security";
import { analytics } from "@/server/services";
export const POST = api(
  async (req, actor) => analytics.sync(actor, await readJson(req)),
  { permission: "meta:manage", mutation: true },
);
