import { api } from "@/server/http/api";
import { trackingService } from "@/server/services";
import { readJson } from "@/server/http/security";
import { z } from "zod";
export const POST = api(
  async (request, actor) => {
    const input = z
      .object({ ids: z.array(z.string().uuid()).min(1).max(100) })
      .strict()
      .parse(await readJson(request));
    return { csv: await trackingService.export(actor, input.ids) };
  },
  { permission: "workspace:read", mutation: true },
);
