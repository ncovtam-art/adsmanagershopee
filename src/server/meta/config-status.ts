type Environment = Readonly<Record<string, string | undefined>>;

export function metaConfigurationIssues(env: Environment = process.env) {
  const issues: Array<{
    name: string;
    status: "MISSING" | "INVALID";
    message: string;
  }> = [];
  function check(name: string, valid: boolean, message: string) {
    if (!env[name] || !valid)
      issues.push({ name, status: env[name] ? "INVALID" : "MISSING", message });
  }
  check("META_APP_ID", /^\d+$/.test(env.META_APP_ID ?? ""), "Điền App ID dạng số trong cấu hình riêng của máy chủ.");
  check("META_APP_SECRET", Boolean(env.META_APP_SECRET?.trim()), "Điền App Secret mới; không sử dụng secret đã bị lộ.");
  check("META_GRAPH_VERSION", /^v\d+\.\d+$/.test(env.META_GRAPH_VERSION ?? ""), "Dùng phiên bản được Meta App hỗ trợ, đúng dạng vN.N.");
  let originValid = false;
  try {
    const url = new URL(env.APP_ORIGIN ?? "");
    originValid = url.origin === env.APP_ORIGIN &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch { /* Chỉ trả trạng thái, không trả URL hoặc exception. */ }
  check("APP_ORIGIN", originValid, "Dùng Origin chính xác của ứng dụng, không có đường dẫn hoặc dấu / cuối; Codespaces cần HTTPS.");
  let redirectValid = false;
  try {
    const url = new URL(env.META_REDIRECT_URI ?? "");
    redirectValid = originValid && url.origin === env.APP_ORIGIN &&
      url.pathname === "/api/meta/callback";
  } catch { /* Không phản chiếu giá trị cấu hình. */ }
  check("META_REDIRECT_URI", redirectValid, "Đặt bằng APP_ORIGIN + /api/meta/callback và đăng ký cùng URI trong Meta Dashboard.");
  check("TOKEN_ENCRYPTION_KEY", /^[a-f0-9]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY ?? ""), "Giữ khóa mã hóa cũ gồm 64 ký tự hex; đây không phải access token Facebook. Không tạo đè khóa đang dùng.");
  return issues;
}
