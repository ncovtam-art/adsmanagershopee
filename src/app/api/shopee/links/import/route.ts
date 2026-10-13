import { api } from "@/server/http/api";
import { trackingService } from "@/server/services";
import { readUpload } from "@/server/http/upload";
import { AppError } from "@/server/http/errors";
export const POST = api(
  async (request, actor) => {
    const upload = await readUpload(request);
    if (upload.form.get("confirmed") !== "true")
      throw new AppError(
        422,
        "LINK_CONFIRMATION",
        "Xác nhận các link được tạo với đúng SubID trong Shopee.",
      );
    return trackingService.importLinks(actor, upload.buffer);
  },
  { permission: "tracking:write", mutation: true },
);
