import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export function errorPayload(error: unknown) {
  if (error instanceof AppError)
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  if (error instanceof ZodError)
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
        },
      },
    };
  if (isUniqueViolation(error)) {
    return {
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "Email đã được sử dụng. Vui lòng chọn email khác.",
        },
      },
    };
  }
  // Không log nguyên exception: query hoặc thông tin kết nối có thể chứa dữ liệu nhạy cảm.
  console.error("Yêu cầu thất bại do lỗi máy chủ.");
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Không thể xử lý yêu cầu. Vui lòng thử lại hoặc liên hệ quản trị viên.",
      },
    },
  };
}
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && error.cause !== error
    ? isUniqueViolation(error.cause)
    : false;
}
