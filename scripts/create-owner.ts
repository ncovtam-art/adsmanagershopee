import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { db, pool } from "../src/server/db";
import { eq } from "drizzle-orm";
import { users } from "../src/server/database/schema";
import { AuthService } from "../src/server/auth/service";
import { errorPayload } from "../src/server/http/errors";

async function main() {
  if (!stdin.isTTY)
    throw new Error(
      "Lệnh cần terminal tương tác để không lộ mật khẩu. Không truyền mật khẩu qua tham số hoặc chat.",
    );
  if (
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "OWNER"))
        .limit(1)
    ).length
  )
    throw new Error("Đã có chủ sở hữu. Đăng nhập để quản lý nhân viên.");
  const input = createInterface({ input: stdin, output: stdout });
  const workspaceName = await input.question("Tên không gian làm việc: ");
  const name = await input.question("Tên chủ sở hữu: ");
  const email = await input.question("Email đăng nhập: ");
  input.close();
  let muted = false;
  const hiddenOutput = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) stdout.write(chunk);
      callback();
    },
  });
  const secretInput = createInterface({
    input: stdin,
    output: hiddenOutput,
    terminal: true,
  });
  stdout.write("Mật khẩu (ít nhất 12 ký tự, không hiển thị): ");
  muted = true;
  const password = await secretInput.question("");
  stdout.write("\nNhập lại mật khẩu: ");
  const confirmation = await secretInput.question("");
  secretInput.close();
  stdout.write("\n");
  if (password !== confirmation)
    throw new Error("Mật khẩu nhập lại không khớp.");
  await new AuthService(db).createOwner({
    workspaceName,
    name,
    email,
    password,
  });
  console.log(
    "Đã tạo chủ sở hữu. Mở ứng dụng để đăng nhập bằng email và mật khẩu vừa chọn.",
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error && !("code" in error) && !("cause" in error)
        ? error.message
        : errorPayload(error).body.error.message,
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
