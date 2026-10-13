import { z } from "zod";
import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
import { readJson } from "@/server/http/security";
export const GET = api(async (_, actor) => publisher.control(actor), {
  permission: "workspace:read",
});
export const POST = api(
  async (req, actor) =>
    publisher.control(
      actor,
      z
        .object({ paused: z.boolean() })
        .strict()
        .parse(await readJson(req, 65536)).paused,
    ),
  { permission: "meta:manage", mutation: true },
);
