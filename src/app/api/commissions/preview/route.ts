import { api } from "@/server/http/api";
import { commissions } from "@/server/services";
import { readUpload } from "@/server/http/upload";
import { AppError } from "@/server/http/errors";
export const POST = api(
  async (request, actor) => {
    const upload = await readUpload(request);
    let options: unknown;
    try {
      options = JSON.parse(String(upload.form.get("options")));
    } catch {
      throw new AppError(
        422,
        "IMPORT_OPTIONS",
        "Cấu hình đọc CSV không hợp lệ.",
      );
    }
    return commissions.preview(actor, upload.buffer, upload.filename, options);
  },
  { permission: "commissions:manage", mutation: true },
);
