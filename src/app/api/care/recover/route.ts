import { api } from "@/server/http/api";
import { care } from "@/server/services";
import { z } from "zod";
import { readJson } from "@/server/http/security";
export const POST = api(
  async (req, actor) =>
    care.recover(
      actor,
      z
        .object({ id: z.string().uuid() })
        .strict()
        .parse(await readJson(req)).id,
    ),
  { permission: "settings:write", mutation: true },
);
