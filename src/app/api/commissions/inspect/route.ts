import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
import { readUpload } from "@/server/http/upload";
export const POST = api(
  async (request, actor) => {
    const upload = await readUpload(request);
    return commissions.inspect(
      actor,
      upload.buffer,
      String(upload.form.get("encoding") ?? "auto"),
      String(upload.form.get("delimiter") ?? "auto"),
    );
  },
  { permission: "commissions:manage", mutation: true },
);
