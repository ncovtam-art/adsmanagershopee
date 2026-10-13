import { z } from "zod";
import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
export const PUT = api(
  async (req, actor) =>
    publisher.upload(
      actor,
      z.string().uuid().parse(req.nextUrl.pathname.split("/").pop()),
      req.body,
    ),
  { permission: "publisher:write", mutation: true },
);
