"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestApi } from "@/lib/client-api";
import { Icon, Notice } from "./ui";

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await requestApi("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      {error && <Notice error>{error}</Notice>}
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="ban@congty.vn"
          required
          maxLength={254}
        />
      </label>
      <label>
        Mật khẩu
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu của bạn"
          required
          maxLength={128}
        />
      </label>
      <button className="button primary full" type="submit" disabled={pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        <Icon name="arrow" size={18} />
      </button>
      <p className="form-help">
        Chưa có tài khoản hoặc quên mật khẩu? Liên hệ chủ sở hữu không gian làm
        việc để được hỗ trợ.
      </p>
    </form>
  );
}
