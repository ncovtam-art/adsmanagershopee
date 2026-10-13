import { AppError } from "./errors";

export const SESSION_COOKIE = "aacc_session";
export function assertOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (!configured)
    throw new AppError(
      503,
      "CONFIGURATION_REQUIRED",
      "Địa chỉ ứng dụng chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    );
  if (request.headers.get("origin") !== new URL(configured).origin) {
    throw new AppError(
      403,
      "INVALID_ORIGIN",
      "Yêu cầu không hợp lệ. Vui lòng mở lại ứng dụng tại địa chỉ đã cấu hình.",
    );
  }
}
export function sessionCookieOptions() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.COOKIE_SECURE !== "false" &&
    !process.env.APP_ORIGIN?.startsWith("https://")
  ) {
    throw new AppError(
      503,
      "HTTPS_REQUIRED",
      "Ứng dụng production cần địa chỉ HTTPS.",
    );
  }
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure:
      process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" &&
        process.env.COOKIE_SECURE !== "false"),
  };
}

export async function readJson(request: Request, maximumBytes=16384) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(
      415,
      "INVALID_CONTENT_TYPE",
      "Yêu cầu phải sử dụng định dạng JSON.",
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(400, "INVALID_JSON", "Nội dung yêu cầu bị thiếu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "Nội dung yêu cầu quá lớn.");
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ.");
  }
}
