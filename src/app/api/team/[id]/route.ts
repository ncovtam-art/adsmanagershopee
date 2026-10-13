import type { NextRequest } from "next/server";
import { api } from "@/server/http/api";
import { team } from "@/server/services";
import { readJson } from "@/server/http/security";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return api(
    async (req, actor) => team.update(actor, id, await readJson(req)),
    { permission: "team:manage", mutation: true },
  )(request);
}
