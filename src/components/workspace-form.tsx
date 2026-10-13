"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestApi } from "@/lib/client-api";
import { Notice } from "./ui";

export function WorkspaceForm({
  name,
  timezone,
}: {
  name: string;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);
    try {
      await requestApi("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      setSaved(true);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="form-stack settings-form" onSubmit={submit}>
      {saved && <Notice>Đã lưu cấu hình không gian làm việc.</Notice>}
      {error && <Notice error>{error}</Notice>}
      <label>
        Tên không gian làm việc
        <input
          name="name"
          defaultValue={name}
          minLength={2}
          maxLength={80}
          required
        />
      </label>
      <label>
        Múi giờ hiển thị
        <select name="timezone" defaultValue={timezone}>
          <option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option>
          <option value="UTC">UTC</option>
        </select>
      </label>
      <p className="form-help">
        Thời gian luôn được lưu theo UTC trong Database. Múi giờ này áp dụng khi
        hiển thị nhật ký và các báo cáo sau này.
      </p>
      <div>
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
