import { api } from "@/server/http/api";
import { telegram } from "@/server/services";
import { readJson } from "@/server/http/security";
import { z } from "zod";
export const POST = api(
  async (req, actor) =>
    telegram.retry(
      actor,
      z
        .object({ id: z.string().uuid() })
        .strict()
        .parse(await readJson(req)).id,
    ),
  { permission: "settings:write", mutation: true },
);
