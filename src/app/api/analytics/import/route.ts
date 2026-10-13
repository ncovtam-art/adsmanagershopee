import { api } from "@/server/http/api";
import { readUpload } from "@/server/http/upload";
import { analytics } from "@/server/services";
import { AppError } from "@/server/http/errors";
export const POST = api(
  async (req, actor) => {
    const { form, buffer } = await readUpload(req);
    let options: unknown;
    try {
      options = JSON.parse(String(form.get("options") ?? "{}"));
    } catch {
      throw new AppError(400, "CSV_OPTIONS", "Tùy chọn CSV không hợp lệ.");
    }
    return form.get("action") === "commit"
      ? analytics.importCsv(actor, buffer, options)
      : analytics.previewCsv(actor, buffer, options);
  },
  { permission: "meta:manage", mutation: true },
);
