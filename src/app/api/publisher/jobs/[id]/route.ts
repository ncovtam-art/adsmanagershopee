import { z } from "zod";
import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
export const GET = api(
  async (req, actor) =>
    publisher.history(
      actor,
      z.string().uuid().parse(req.nextUrl.pathname.split("/").pop()),
    ),
  { permission: "workspace:read" },
);
