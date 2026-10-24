import nextEnv from "@next/env";

// Preload before importing DB/services, using the same precedence as Next.js.
// Do not print parse errors: environment file contents can contain credentials.
nextEnv.loadEnvConfig(
  process.cwd(),
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test",
  {
    info() {},
    error() {
      console.error("Không đọc được cấu hình môi trường. Kiểm tra file .env* riêng; không gửi secrets vào log hoặc chat.");
    },
  },
);
