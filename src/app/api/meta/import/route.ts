import { api } from "@/server/http/api";
import { metaImport } from "@/server/services";
import { AppError } from "@/server/http/errors";
export const GET = api(async (_request, actor) => metaImport.list(actor), {
  permission: "meta:manage",
});
export const POST = api(
  async (request, actor) => {
    const reader = request.body?.getReader();
    if (!reader) throw new AppError(400, "IMPORT_FILE", "Chọn tệp báo cáo.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024 + 16384) {
        await reader.cancel();
        throw new AppError(413, "IMPORT_SIZE", "Tệp tối đa 2 MB.");
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    })
      .formData()
      .catch(() => {
        throw new AppError(400, "IMPORT_FILE", "Tệp tải lên không hợp lệ.");
      });
    const file = form.get("file");
    if (!(file instanceof File))
      throw new AppError(400, "IMPORT_FILE", "Chọn tệp báo cáo.");
    return metaImport.upload(
      actor,
      Buffer.from(await file.arrayBuffer()),
      file.name,
    );
  },
  { permission: "meta:manage", mutation: true, status: 201 },
);
