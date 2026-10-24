import { AppError } from "../http/errors";

export function assertMetaWritesEnabled() {
  if (process.env.DRY_RUN !== "false" || process.env.META_WRITES_ENABLED !== "true")
    throw new AppError(
      403,
      "META_WRITES_LOCKED",
      "Thao tác ghi Meta đang bị khóa. Chỉ đọc và kết nối OAuth được phép; không đăng bài hoặc thay đổi quảng cáo.",
    );
}
