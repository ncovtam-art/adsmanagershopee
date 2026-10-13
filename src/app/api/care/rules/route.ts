import { api } from "@/server/http/api";
import { care } from "@/server/services";
import { z } from "zod";
import { readJson } from "@/server/http/security";
export const GET = api(async (_req, actor) => care.list(actor), {
  permission: "finance:read",
});
export const POST = api(
  async (req, actor) => {
    const v = z
      .object({ id: z.string().uuid().optional(), rule: z.unknown() })
      .strict()
      .parse(await readJson(req));
    return care.save(actor, v.rule, v.id);
  },
  { permission: "ads:write", mutation: true },
);
