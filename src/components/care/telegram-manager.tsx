"use client";
import { useEffect, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { Notice } from "../ui";
import type { TelegramService } from "@/server/care/telegram";
type Config = Omit<Awaited<ReturnType<TelegramService["read"]>>, "events"> & {
  events: string[];
};
type Job = Awaited<ReturnType<TelegramService["jobs"]>>[number];
const events: Record<string, string> = {
  CAMPAIGN_ISSUE: "Campaign có vấn đề",
  SPEND_THRESHOLD: "Chi tiêu vượt ngưỡng",
  LOW_ROAS: "ROAS thấp",
  ADS_FAILED: "Tạo Ads thất bại",
  PUBLISH_FAILED: "Đăng video thất bại",
  SHOPEE_IMPORTED: "Đã nhập Shopee",
  UNMATCHED_SUBID: "SubID chưa khớp",
  PAGE_DISCONNECTED: "Page mất kết nối",
  AUTO_PAUSE: "Đã Auto Pause",
  WINNER: "Winner Detection",
};
export function TelegramManager() {
  const [config, setConfig] = useState<Config>({
      chatId: "",
      enabled: false,
      events: [],
      cooldownMinutes: 60,
      configured: false,
    }),
    [token, setToken] = useState(""),
    [jobs, setJobs] = useState<Job[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      requestApi<Config>("/api/telegram/settings"),
      requestApi<Job[]>("/api/telegram/jobs"),
    ])
      .then(([c, j]) => {
        if (active) {
          setConfig(c);
          setJobs(j);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setJobs(await requestApi<Job[]>("/api/telegram/jobs"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card care-manager">
      <h2>Telegram Notifications</h2>
      <p>
        Bot Token được mã hóa tại máy chủ. UNKNOWN cần kiểm tra chat, không gửi
        lại tự động.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <form
        className="form-stack settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            const c = await requestApi<Config>("/api/telegram/settings", {
              method: "POST",
              body: JSON.stringify({
                token: token || undefined,
                chatId: config.chatId,
                enabled: config.enabled,
                events: config.events,
                cooldownMinutes: config.cooldownMinutes,
              }),
            });
            setConfig(c);
            setToken("");
            setMessage("Đã lưu Telegram. Token không được trả về trình duyệt.");
          });
        }}
      >
        <label>
          Bot Token mới
          <input
            type="password"
            autoComplete="new-password"
            required={!config.configured}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              config.configured
                ? "Để trống để giữ token hiện tại"
                : "Nhập token của BotFather"
            }
          />
        </label>
        <label>
          Chat ID
          <input
            required
            inputMode="numeric"
            value={config.chatId}
            onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
          />
        </label>
        <label>
          Cooldown thông báo (phút)
          <input
            type="number"
            min={5}
            max={10080}
            required
            value={config.cooldownMinutes}
            onChange={(e) =>
              setConfig({ ...config, cooldownMinutes: Number(e.target.value) })
            }
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: e.target.checked })
            }
          />
          Bật gửi các thông báo đã chọn
        </label>
        <fieldset>
          <legend>Loại thông báo</legend>
          {Object.entries(events).map(([k, v]) => (
            <label className="checkbox-label" key={k}>
              <input
                type="checkbox"
                checked={config.events.includes(k)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    events: e.target.checked
                      ? [...config.events, k]
                      : config.events.filter((x) => x !== k),
                  })
                }
              />
              {v}
            </label>
          ))}
        </fieldset>
        <div className="care-actions">
          <button disabled={busy} className="button primary">
            Lưu Telegram
          </button>
          <button
            disabled={busy || !config.configured}
            className="button secondary"
            type="button"
            onClick={() =>
              void action(async () => {
                await requestApi("/api/telegram/test", {
                  method: "POST",
                  body: "{}",
                });
                setMessage("Bot và Chat ID hợp lệ; đã gửi một tin kiểm tra.");
              })
            }
          >
            Gửi tin kiểm tra kết nối
          </button>
        </div>
      </form>
      <h3>Lịch sử gửi</h3>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => void action(async () => {})}
      >
        Tải lại lịch sử gửi
      </button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>Message ID / lỗi</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{events[j.event] ?? j.event}</td>
                <td>{j.state}</td>
                <td>{j.messageId ?? j.errorCode ?? "—"}</td>
                <td>
                  {j.state === "FAILED" && (
                    <button
                      disabled={busy}
                      className="button secondary small"
                      onClick={() =>
                        void action(async () => {
                          await requestApi("/api/telegram/retry", {
                            method: "POST",
                            body: JSON.stringify({ id: j.id }),
                          });
                          setMessage("Đã xếp lại lỗi FAILED.");
                        })
                      }
                    >
                      Retry lỗi chắc chắn
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
