import { z } from "zod";
import { api } from "@/server/http/api";
import { auditPage } from "@/server/database/read-models";

export const GET = api(
  async (request) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(request.nextUrl.searchParams.get("page") ?? 1);
    return auditPage(page);
  },
  { permission: "team:manage" },
);
