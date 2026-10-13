import { z } from "zod";
import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(
  async (req, actor) =>
    publisher.policy(
      actor,
      z.string().uuid().parse(req.nextUrl.searchParams.get("pageId")),
    ),
  { permission: "workspace:read" },
);
export const POST = api(
  async (req, actor) => publisher.savePolicy(actor, await readJson(req, 65536)),
  { permission: "meta:manage", mutation: true },
);
