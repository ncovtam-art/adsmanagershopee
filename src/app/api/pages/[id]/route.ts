import { api } from "@/server/http/api";
import { meta } from "@/server/services";
import { readJson } from "@/server/http/security";
import { z } from "zod";
import type { NextRequest } from "next/server";
const id = (request: NextRequest) =>
  z.string().uuid().parse(request.nextUrl.pathname.split("/").pop());
export const GET = api(
  async (request, actor) => meta.page(actor, id(request)),
  { permission: "workspace:read" },
);
export const PATCH = api(
  async (request, actor) =>
    meta.updatePage(actor, id(request), await readJson(request)),
  { permission: "meta:manage", mutation: true },
);
