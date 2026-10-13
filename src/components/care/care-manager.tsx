"use client";
import { useEffect, useState } from "react";
import { requestApi } from "@/lib/client-api";
import { Notice, Badge } from "../ui";
import type { CareService } from "@/server/care/service";
import type { RuleInput } from "@/server/care/validation";
type Data = Awaited<ReturnType<CareService["list"]>>;
type Run = Awaited<ReturnType<CareService["dryRun"]>>;
const metricLabels: Record<string, string> = {
  spend: "Chi tiêu",
  cpc: "CPC",
  ctr: "CTR (%)",
  cpm: "CPM",
  linkClicks: "Link Clicks",
  lpv: "LPV",
  costPerLpv: "Cost per LPV",
  estimatedCommission: "Hoa hồng dự kiến",
  realizedCommission: "Hoa hồng đã thanh toán",
  estimatedRoas: "ROAS dự kiến",
  realizedRoas: "ROAS thực nhận",
  estimatedProfit: "Lợi nhuận dự kiến",
  realizedProfit: "Lợi nhuận thực nhận",
};
const actionLabels: Record<string, string> = {
  ALERT: "Cảnh báo Dashboard",
  TELEGRAM: "Thông báo Telegram",
  REVIEW: "Đánh dấu cần kiểm tra",
  WINNER: "Winner Detection",
  AUTO_PAUSE: "Đề xuất Auto Pause (chưa bật)",
};
const initial = (): RuleInput => ({
  name: "",
  accountId: "",
  source: "LIVE",
  level: "campaign",
  windowDays: 1,
  maxAgeMinutes: 60,
  cooldownMinutes: 60,
  conditions: [{ metric: "spend", op: "GTE", value: "" }],
  actions: ["ALERT"],
  commissionCompleteThrough: null,
  financialAcknowledged: false,
});
export function CareManager({
  write,
  admin,
}: {
  write: boolean;
  admin: boolean;
}) {
  const [data, setData] = useState<Data>({ rules: [], alerts: [], pauses: [] }),
    [accounts, setAccounts] = useState<
      Array<{ id: string; name: string; currency: string }>
    >([]),
    [input, setInput] = useState(initial),
    [editing, setEditing] = useState<string | undefined>(),
    [run, setRun] = useState<Run | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [autoConfirm, setAutoConfirm] = useState<Record<string, boolean>>({}),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const d = await requestApi<Data>("/api/care/rules");
        if (active) setData(d);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void requestApi<typeof accounts>(
      `/api/analytics/accounts?source=${input.source}`,
    )
      .then((a) => {
        if (active) setAccounts(a);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [input.source]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setData(await requestApi<Data>("/api/care/rules"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function post(url: string, body: unknown) {
    return requestApi(url, { method: "POST", body: JSON.stringify(body) });
  }
  return (
    <section className="card care-manager" aria-label="Ads Care">
      <div className="section-heading">
        <div>
          <h2>Ads Care & Winner Detection</h2>
          <p>Đặt ngưỡng của bạn, kiểm tra Dry Run và theo dõi cảnh báo.</p>
        </div>
        <button className="button secondary" onClick={() => setOpen(!open)}>
          {open ? "Thu gọn Ads Care" : "Mở Ads Care"}
        </button>
      </div>
      <p className="form-help">
        Rule mới tắt mặc định. Auto Pause cần xác nhận riêng, dữ liệu API đầy
        đủ/mới và Dry Run hợp lệ. UNKNOWN không tự gửi lại.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {open && (
        <>
          {write && (
            <form
              className="form-stack care-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await post("/api/care/rules", { id: editing, rule: input });
                  setInput(initial());
                  setEditing(undefined);
                  setRun(null);
                  setMessage(
                    "Đã lưu rule ở trạng thái tắt. Chạy Dry Run rồi bật cảnh báo.",
                  );
                });
              }}
            >
              <div className="care-grid">
                <label>
                  Tên rule
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    value={input.name}
                    onChange={(e) =>
                      setInput({ ...input, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Nguồn Ads Care
                  <select
                    disabled={!!editing}
                    value={input.source}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        source: e.target.value as RuleInput["source"],
                        accountId: "",
                      })
                    }
                  >
                    <option value="LIVE">LIVE</option>
                    <option value="MOCK">MOCK · thử nghiệm</option>
                  </select>
                </label>
                <label>
                  TKQC Ads Care
                  <select
                    required
                    disabled={!!editing}
                    value={input.accountId}
                    onChange={(e) =>
                      setInput({ ...input, accountId: e.target.value })
                    }
                  >
                    <option value="">Chọn tài khoản</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.currency}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cấp đối tượng
                  <select
                    value={input.level}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        level: e.target.value as RuleInput["level"],
                      })
                    }
                  >
                    <option value="campaign">Campaign</option>
                    <option value="adset">Ad Set</option>
                    <option value="ad">Ad</option>
                  </select>
                </label>
                <label>
                  Số ngày đã kết thúc
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={input.windowDays}
                    onChange={(e) =>
                      setInput({ ...input, windowDays: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Dữ liệu mới tối đa (phút)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    required
                    value={input.maxAgeMinutes}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        maxAgeMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Cooldown cảnh báo (phút)
                  <input
                    type="number"
                    min={5}
                    max={10080}
                    required
                    value={input.cooldownMinutes}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        cooldownMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <fieldset>
                <legend>
                  Điều kiện AND · tiền theo currency TKQC; CTR theo %
                </legend>
                {input.conditions.map((c, i) => (
                  <div className="care-condition" key={i}>
                    <label>
                      Chỉ số {i + 1}
                      <select
                        aria-label={`Chỉ số ${i + 1}`}
                        value={c.metric}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            conditions: input.conditions.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    metric: e.target.value as typeof c.metric,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        {Object.entries(metricLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      So sánh {i + 1}
                      <select
                        aria-label={`So sánh ${i + 1}`}
                        value={c.op}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            conditions: input.conditions.map((x, n) =>
                              n === i
                                ? { ...x, op: e.target.value as typeof c.op }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="GTE">≥</option>
                        <option value="GT">&gt;</option>
                        <option value="LTE">≤</option>
                        <option value="LT">&lt;</option>
                      </select>
                    </label>
                    <label>
                      Ngưỡng {i + 1}
                      <input
                        required
                        inputMode="decimal"
                        pattern="-?[0-9]+(\.[0-9]{1,6})?"
                        value={c.value}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            conditions: input.conditions.map((x, n) =>
                              n === i ? { ...x, value: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={input.conditions.length === 1}
                      onClick={() =>
                        setInput({
                          ...input,
                          conditions: input.conditions.filter(
                            (_, n) => n !== i,
                          ),
                        })
                      }
                    >
                      Xóa điều kiện {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  className="button secondary"
                  type="button"
                  disabled={input.conditions.length >= 10}
                  onClick={() =>
                    setInput({
                      ...input,
                      conditions: [
                        ...input.conditions,
                        { metric: "cpc", op: "GT", value: "" },
                      ],
                    })
                  }
                >
                  Thêm điều kiện AND
                </button>
              </fieldset>
              <fieldset>
                <legend>Hành động khi đạt đủ điều kiện</legend>
                {Object.entries(actionLabels)
                  .filter(([key]) => admin || key !== "AUTO_PAUSE")
                  .map(([key, label]) => (
                    <label className="checkbox-label" key={key}>
                      <input
                        type="checkbox"
                        checked={input.actions.includes(
                          key as RuleInput["actions"][number],
                        )}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            actions: e.target.checked
                              ? [
                                  ...input.actions,
                                  key as RuleInput["actions"][number],
                                ]
                              : input.actions.filter((a) => a !== key),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
              </fieldset>
              <label>
                Đã nhập báo cáo Shopee đầy đủ đến ngày
                <input
                  type="date"
                  value={input.commissionCompleteThrough ?? ""}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      commissionCompleteThrough: e.target.value || null,
                    })
                  }
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={input.financialAcknowledged}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      financialAcknowledged: e.target.checked,
                    })
                  }
                />
                Tôi đã kiểm tra độ đầy đủ hoa hồng và kỳ báo cáo (bắt buộc với
                chỉ số tài chính)
              </label>
              <div className="care-actions">
                <button className="button primary" disabled={busy}>
                  Lưu rule tắt
                </button>
                {editing && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setEditing(undefined);
                      setInput(initial());
                    }}
                  >
                    Hủy sửa
                  </button>
                )}
              </div>
            </form>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rule / nguồn</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>
                        {r.source} · {r.config.level} · {r.config.windowDays}{" "}
                        ngày
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          r.autoEnabled
                            ? "warning"
                            : r.enabled
                              ? "success"
                              : "muted"
                        }
                      >
                        {r.autoEnabled
                          ? "Auto Pause đã bật"
                          : r.enabled
                            ? "Cảnh báo đã bật"
                            : "Đang tắt"}
                      </Badge>
                    </td>
                    <td>
                      <div className="care-actions">
                        {write && (
                          <>
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  setRun(
                                    await requestApi<Run>("/api/care/dry-run", {
                                      method: "POST",
                                      body: JSON.stringify({ id: r.id }),
                                    }),
                                  );
                                  setMessage(
                                    "Dry Run hoàn tất; chưa tạo cảnh báo, gửi Telegram hoặc dừng Ads.",
                                  );
                                })
                              }
                            >
                              Dry Run {r.name}
                            </button>
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await post("/api/care/control", {
                                    id: r.id,
                                    enabled: !r.enabled,
                                    autoEnabled: false,
                                  });
                                  setMessage(
                                    r.enabled
                                      ? "Đã tắt rule."
                                      : "Đã bật cảnh báo; Auto Pause vẫn tắt.",
                                  );
                                })
                              }
                            >
                              {r.enabled ? "Tắt rule" : "Bật cảnh báo"}
                            </button>
                            <button
                              className="button secondary small"
                              onClick={() => {
                                setEditing(r.id);
                                setInput(r.config);
                                setRun(null);
                              }}
                            >
                              Sửa rule
                            </button>
                          </>
                        )}
                        <button
                          className="button secondary small"
                          onClick={() =>
                            void action(async () => {
                              const h = await requestApi<Run[]>(
                                `/api/care/history?id=${r.id}`,
                              );
                              setRun(h[0] ?? null);
                              setMessage(
                                h.length
                                  ? "Đang xem lần đánh giá gần nhất."
                                  : "Chưa có lịch sử.",
                              );
                            })
                          }
                        >
                          Lịch sử {r.name}
                        </button>
                      </div>
                      {admin &&
                        r.config.actions.includes("AUTO_PAUSE") &&
                        !r.autoEnabled && (
                          <>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={autoConfirm[r.id] ?? false}
                                onChange={(e) =>
                                  setAutoConfirm({
                                    ...autoConfirm,
                                    [r.id]: e.target.checked,
                                  })
                                }
                              />
                              Tôi cho phép dừng {r.config.level} đạt ngưỡng sau
                              Dry Run
                            </label>
                            <button
                              className="button secondary small"
                              disabled={busy || !autoConfirm[r.id]}
                              onClick={() =>
                                void action(async () => {
                                  await post("/api/care/control", {
                                    id: r.id,
                                    enabled: true,
                                    autoEnabled: true,
                                    confirmAutoPause: true,
                                  });
                                  setAutoConfirm({
                                    ...autoConfirm,
                                    [r.id]: false,
                                  });
                                  setMessage(
                                    "Auto Pause đã bật rõ; worker kiểm tra lại trước thao tác.",
                                  );
                                })
                              }
                            >
                              Bật Auto Pause
                            </button>
                          </>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {run && (
            <div className="care-evidence">
              <h3>
                {run.dryRun ? "Kết quả Dry Run" : "Lần đánh giá gần nhất"}
              </h3>
              <p>
                {run.state} · cấu hình {run.configHash.slice(0, 12)}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Đối tượng</th>
                      <th>Kết quả</th>
                      <th>Dữ liệu / lý do chặn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      (run.result.items ?? []) as Array<{
                        objectId: string;
                        name: string;
                        matched: boolean;
                        values: Record<string, string | null>;
                        blockers: string[];
                        autoBlockers: string[];
                      }>
                    ).map((i) => (
                      <tr key={i.objectId}>
                        <td>
                          {i.name}
                          <small>{i.objectId}</small>
                        </td>
                        <td>{i.matched ? "Đạt ngưỡng" : "Không hành động"}</td>
                        <td>
                          <div>
                            {Object.entries(i.values)
                              .filter(([k]) =>
                                data.rules
                                  .find((r) => r.id === run.ruleId)
                                  ?.config.conditions.some(
                                    (c) => c.metric === k,
                                  ),
                              )
                              .map(([k, v]) => (
                                <span key={k}>
                                  {metricLabels[k]}: {v ?? "—"} ·{" "}
                                </span>
                              ))}
                          </div>
                          <small>
                            Chặn cảnh báo: {i.blockers.join(", ") || "Không"}
                          </small>
                          <small>
                            Chặn Auto Pause:{" "}
                            {i.autoBlockers.join(", ") || "Không"}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Boolean(run.result.code) && <p>{String(run.result.code)}</p>}
            </div>
          )}
        </>
      )}
      <h3>Cảnh báo Dashboard / cần kiểm tra / Winner</h3>
      {data.alerts.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Loại</th>
                <th>Đối tượng / rule</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.type}</td>
                  <td>
                    {String(a.payload.name ?? a.objectId)}
                    <small>
                      {data.rules.find((r) => r.id === a.ruleId)?.name} ·{" "}
                      {data.rules.find((r) => r.id === a.ruleId)?.source}
                    </small>
                  </td>
                  <td>{a.state}</td>
                  <td>
                    {write && a.state === "OPEN" && (
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await post("/api/care/review", { id: a.id });
                            setMessage("Đã đánh dấu kiểm tra.");
                          })
                        }
                      >
                        Đã kiểm tra
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          Chưa có cảnh báo. Chỉ dữ liệu đã lưu được dùng để đánh giá.
        </p>
      )}
      {data.pauses.length > 0 && (
        <>
          <h3>Nhật ký Auto Pause</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID / cấp</th>
                  <th>Kết quả</th>
                  <th>Kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {data.pauses.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.objectId}
                      <small>
                        {p.source} · {p.level}
                      </small>
                    </td>
                    <td>
                      {p.state}
                      <small>{p.errorCode}</small>
                    </td>
                    <td>
                      {admin && p.state === "UNKNOWN" && (
                        <button
                          className="button secondary small"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await post("/api/care/recover", { id: p.id });
                              setMessage(
                                "Đã đọc xác minh PAUSED; không gửi lại thao tác.",
                              );
                            })
                          }
                        >
                          Đọc xác minh PAUSED
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
