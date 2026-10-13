import { api } from "@/server/http/api";
export const GET = api(async (_request, actor) => actor, {
  permission: "workspace:read",
});
