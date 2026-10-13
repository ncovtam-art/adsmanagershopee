import { api } from "@/server/http/api";
import { meta } from "@/server/services";
import { readJson } from "@/server/http/security";
import { z } from "zod";
export const POST = api(
  async (request, actor) => {
    const value = z
      .object({ connectionId: z.string().uuid() })
      .strict()
      .parse(await readJson(request));
    return meta.refresh(actor, value.connectionId);
  },
  { permission: "meta:manage", mutation: true },
);
