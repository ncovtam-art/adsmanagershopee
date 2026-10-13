import { z } from "zod";
import { api } from "@/server/http/api";
import { team } from "@/server/services";
import { readJson } from "@/server/http/security";

const pageSchema = z.coerce
  .number()
  .int("Trang không hợp lệ.")
  .min(1, "Trang phải lớn hơn 0.")
  .max(10000, "Trang quá lớn.");
export const GET = api(
  async (request, actor) =>
    team.list(
      actor,
      pageSchema.parse(request.nextUrl.searchParams.get("page") ?? "1"),
    ),
  { permission: "team:manage" },
);
export const POST = api(
  async (request, actor) => team.create(actor, await readJson(request)),
  { permission: "team:manage", mutation: true, status: 201 },
);
