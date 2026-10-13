import { AppError } from "./errors";
export async function readUpload(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new AppError(415, "UPLOAD_TYPE", "Chọn tệp bằng form tải lên.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "UPLOAD_FILE", "Chưa chọn tệp.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2 * 1024 * 1024 + 16384) {
      await reader.cancel();
      throw new AppError(413, "UPLOAD_SIZE", "Tệp tối đa 2 MB.");
    }
    chunks.push(value);
  }
  const form = await new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": request.headers.get("content-type")! },
  })
    .formData()
    .catch(() => {
      throw new AppError(400, "UPLOAD_FILE", "Nội dung tải lên không hợp lệ.");
    });
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > 2 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".csv")
  )
    throw new AppError(
      422,
      "UPLOAD_FILE",
      "Chỉ nhận CSV có nội dung, tối đa 2 MB.",
    );
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    form,
    buffer,
    filename: file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120),
  };
}
