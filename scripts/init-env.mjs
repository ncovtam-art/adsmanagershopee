import { randomBytes } from "node:crypto";
import {
  writeFileSync,
  existsSync,
  readFileSync,
  appendFileSync,
} from "node:fs";

if (existsSync(".env")) {
  console.log("Đã có .env; giữ nguyên cấu hình hiện tại.");
} else {
  const password = randomBytes(32).toString("hex");
  writeFileSync(
    ".env",
    [
      "POSTGRES_USER=command_center",
      `POSTGRES_PASSWORD=${password}`,
      "POSTGRES_DB=command_center",
      `DATABASE_URL=postgresql://command_center:${password}@127.0.0.1:5432/command_center?schema=public`,
      `TEST_DATABASE_URL=postgresql://command_center:${password}@127.0.0.1:5433/command_center_test?schema=public`,
      "APP_ORIGIN=http://localhost:3000",
      "COOKIE_SECURE=false",
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Đã tạo .env development với mật khẩu Database ngẫu nhiên; không ghi đè tệp có sẵn.",
  );
}

for (const [name,value] of Object.entries({REDIS_URL:"redis://127.0.0.1:6379/0",TEST_REDIS_URL:"redis://127.0.0.1:6379/15"})) {
  if (!process.env[name] && !new RegExp(`^${name}=`,"m").test(readFileSync(".env","utf8"))) {
    appendFileSync(".env",`\n${name}=${value}\n`,{mode:0o600});
    console.log(`Đã bổ sung ${name} development; giữ các giá trị khác.`);
  }
}

// Khóa dùng cục bộ cho AES-GCM; không lấy từ proxy secret và không in giá trị.
if (
  !process.env.TOKEN_ENCRYPTION_KEY &&
  !/^TOKEN_ENCRYPTION_KEY=/m.test(readFileSync(".env", "utf8"))
) {
  appendFileSync(
    ".env",
    `\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Đã bổ sung khóa mã hóa token cục bộ; giữ nguyên các giá trị khác.",
  );
}
