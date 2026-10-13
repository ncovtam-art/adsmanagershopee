"use client";
import { useEffect, useState, useRef } from "react";
import { requestApi } from "@/lib/client-api";
import { Modal } from "../modal";
import { Notice, Badge, EmptyState } from "../ui";
import type { AdsService } from "@/server/ads/service";
import type { BulkAdsService } from "@/server/ads/bulk/service";
import type { BulkInput } from "@/server/ads/bulk/validation";
type Option = Awaited<ReturnType<AdsService["options"]>>[number];
type Job = Awaited<ReturnType<AdsService["list"]>>[number];
type Preview = Awaited<ReturnType<BulkAdsService["preview"]>>;
type Batch = Awaited<ReturnType<BulkAdsService["list"]>>[number];
type Preset = Awaited<ReturnType<BulkAdsService["presets"]>>[number];
type Donor = {
  name: string;
  source: "LIVE" | "MOCK";
  versions: { id: string; version: number }[];
};
const structures = {
  PER_VIDEO: "Một Campaign/video",
  CAMPAIGN_PER_PAGE: "Một Campaign nhiều Ad Sets / Page",
  ADSET_PER_PAGE: "Một Ad Set nhiều Ads / Page",
  APPEND_ADSETS: "Thêm Ad Sets vào Campaign PAUSED",
  APPEND_ADS: "Thêm Ads vào Campaign/Ad Set PAUSED",
};
export function BulkAdsManager({
  userId,
  initialCloneId,
}: {
  userId: string;
  initialCloneId?: string;
}) {
  const [options, setOptions] = useState<Option[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [batches, setBatches] = useState<Batch[]>([]),
    [presets, setPresets] = useState<Preset[]>([]),
    [donors, setDonors] = useState<Donor[]>([]);
  const [source, setSource] = useState<"LIVE" | "MOCK">("LIVE"),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [input, setInput] = useState<BulkInput>({
    name: "Bulk Ads",
    structure: "PER_VIDEO",
    overrides: {
      mode: "EXISTING_POST",
      objective: "OUTCOME_ENGAGEMENT",
      optimization: "POST_ENGAGEMENT",
      facebookOnly: true,
      acknowledgeDonorChanges: false,
    },
    items: [],
  });
  const [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [budgetAck, setBudgetAck] = useState(false),
    [requestKey, setRequestKey] = useState(""),
    [prepareKey, setPrepareKey] = useState(""),
    [affiliate, setAffiliate] = useState("shopee_vn"),
    [presetName, setPresetName] = useState("");
  const [cloneId, setCloneId] = useState(initialCloneId ?? ""),
    [cloneLevel, setCloneLevel] = useState<"CAMPAIGN" | "ADSET" | "AD">("AD"),
    [copies, setCopies] = useState(1),
    [newParents, setNewParents] = useState(false);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<BulkAdsService["detail"]>
  > | null>(null);
  const identity = useRef(userId),
    initial = useRef(false);
  useEffect(() => {
    identity.current = userId;
  }, [userId]);
  async function refresh() {
    const key = userId;
    const [o, j, b, p, d] = await Promise.all([
      requestApi<Option[]>("/api/ads/options"),
      requestApi<Job[]>("/api/ads/requests"),
      requestApi<Batch[]>("/api/ads/bulk/batches"),
      requestApi<Preset[]>("/api/ads/bulk/presets"),
      requestApi<Donor[]>("/api/donors"),
    ]);
    if (identity.current !== key) return;
    setOptions(o);
    setJobs(j);
    setBatches(b);
    setPresets(p);
    setDonors(d);
    if (initialCloneId && !initial.current) {
      const seed = j.find((j) => j.id === initialCloneId);
      if (seed) {
        initial.current = true;
        setSource(seed.source);
        setOpen(true);
      }
    }
  }
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  function edit(patch: Partial<BulkInput>, trackingChanged = false) {
    setInput((v) => ({ ...v, ...patch }));
    setPreview(null);
    setConfirmed(false);
    setBudgetAck(false);
    if (trackingChanged) setPrepareKey(crypto.randomUUID());
  }
  async function act(fn: () => Promise<unknown>, success = "") {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (success) setMessage(success);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const currentOptions = options.filter((o) => o.source === source),
    parents = jobs.filter(
      (j) => j.source === source && j.state === "SUCCEEDED",
    );
  return (
    <section className="card ads-manager" id="bulk-ads">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BULK ADS & CLONING</span>
          <h2>Tạo hàng loạt & nhân bản Ads</h2>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setOpen(true);
            setPrepareKey(crypto.randomUUID());
            setPreview(null);
          }}
        >
          Mở Bulk Ads & Cloning
        </button>
      </div>
      <p className="muted">
        Preview số Campaign/Ad Set/Creative/Ad và ngân sách theo currency trước
        khi tạo PAUSED. Queue dùng lại IDs đã xác minh, UNKNOWN cần recovery.
      </p>
      <label>
        Nguồn bulk
        <select
          aria-label="Nguồn Bulk Ads"
          value={source}
          onChange={(e) => {
            setSource(e.target.value as "LIVE" | "MOCK");
            edit(
              {
                items: [],
                clone: undefined,
                donorVersionId: undefined,
                presetId: undefined,
              },
              true,
            );
          }}
        >
          <option>LIVE</option>
          <option>MOCK</option>
        </select>
      </label>
      {source === "MOCK" && (
        <Notice>MOCK · không tạo/nhân bản quảng cáo Facebook thật</Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {!batches.filter((b) => b.source === source).length ? (
        <EmptyState
          icon="ads"
          title="Chưa có Bulk batch"
          description="Chọn cấu trúc, xem từng row và ngân sách rồi xác nhận."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch / cấu trúc</th>
                <th>Trạng thái / progress</th>
                <th>Counts mới</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {batches
                .filter((b) => b.source === source)
                .map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.name}
                      <small>
                        {b.structure} · {b.source}
                      </small>
                    </td>
                    <td>
                      <Badge>{b.state}</Badge>
                      <small>
                        {b.progress.percent}% · Thành công {b.progress.success}/
                        {b.progress.total} · Failed {b.progress.failed} ·
                        UNKNOWN {b.progress.unknown} · Chờ parent{" "}
                        {b.progress.waiting}
                      </small>
                    </td>
                    <td>
                      {b.counts.campaigns} Campaign · {b.counts.adSets} Ad Sets
                      · {b.counts.ads} Ads
                    </td>
                    <td>
                      <div className="job-actions">
                        <button
                          className="button secondary small"
                          onClick={() =>
                            act(async () =>
                              setDetail(
                                await requestApi(
                                  `/api/ads/bulk/detail?id=${b.id}`,
                                ),
                              ),
                            )
                          }
                        >
                          Chi tiết / log batch
                        </button>
                        {b.state === "RUNNING" && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  requestApi("/api/ads/bulk/actions", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      id: b.id,
                                      action: "pause",
                                    }),
                                  }),
                                "Đã pause batch; request đang gửi cần chờ kết quả.",
                              )
                            }
                          >
                            Pause Batch
                          </button>
                        )}
                        {b.state === "PAUSED" && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  requestApi("/api/ads/bulk/actions", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      id: b.id,
                                      action: "resume",
                                    }),
                                  }),
                                "Đã resume batch.",
                              )
                            }
                          >
                            Resume Batch
                          </button>
                        )}
                        {b.progress.failed > 0 && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  requestApi("/api/ads/bulk/actions", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      id: b.id,
                                      action: "retry",
                                    }),
                                  }),
                                "Đã retry lỗi chắc chắn; UNKNOWN không được retry.",
                              )
                            }
                          >
                            Retry Failed Batch
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Modal
          labelledBy="bulk-wizard"
          onClose={() => setOpen(false)}
          pending={busy}
        >
          <div className="ads-wizard">
            <h2 id="bulk-wizard">Bulk Ads & Cloning · PAUSED</h2>
            <fieldset disabled={busy} className="bulk-fieldset">
              <label>
                Tên batch
                <input
                  data-autofocus
                  aria-label="Tên Bulk batch"
                  value={input.name}
                  maxLength={60}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              </label>
              <label>
                Ads Preset
                <select
                  aria-label="Ads Preset Bulk"
                  value={input.presetId ?? ""}
                  onChange={(e) => {
                    const p = presets.find((p) => p.id === e.target.value);
                    edit(
                      p
                        ? {
                            presetId: p.id,
                            donorVersionId: p.donorVersionId,
                            structure: p.structure as BulkInput["structure"],
                            overrides: {
                              ...p.overrides,
                              acknowledgeDonorChanges: false,
                            },
                          }
                        : { presetId: undefined },
                    );
                  }}
                >
                  <option value="">Không dùng preset</option>
                  {presets
                    .filter((p) =>
                      donors.some(
                        (d) =>
                          d.source === source &&
                          d.versions.some((v) => v.id === p.donorVersionId),
                      ),
                    )
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Donor version chung
                <select
                  aria-label="Donor version Bulk"
                  value={input.donorVersionId ?? ""}
                  onChange={(e) =>
                    edit({ donorVersionId: e.target.value || undefined })
                  }
                >
                  <option value="">Theo từng clone hoặc preset</option>
                  {donors
                    .filter((d) => d.source === source)
                    .flatMap((d) =>
                      d.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {d.name} v{v.version}
                        </option>
                      )),
                    )}
                </select>
              </label>
              <label>
                Cấu trúc batch
                <select
                  aria-label="Cấu trúc Bulk Ads"
                  value={input.structure}
                  disabled={!!input.clone}
                  onChange={(e) =>
                    edit({
                      structure: e.target.value as BulkInput["structure"],
                    })
                  }
                >
                  {Object.entries(structures).map(([v, label]) => (
                    <option value={v} key={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {["APPEND_ADS", "APPEND_ADSETS"].includes(input.structure) &&
                !input.clone && (
                  <label>
                    Parent verified PAUSED
                    <select
                      aria-label="Parent Bulk Ads"
                      value={input.parentRequestId ?? ""}
                      onChange={(e) =>
                        edit({ parentRequestId: e.target.value || undefined })
                      }
                    >
                      <option value="">Chọn parent đã tạo trong app</option>
                      {parents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.mode} · Campaign {p.campaignId} · Set {p.adSetId}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              <label>
                Chế độ chung
                <select
                  aria-label="Chế độ Bulk Creative"
                  value={input.overrides.mode ?? "EXISTING_POST"}
                  onChange={(e) => {
                    const mode = e.target.value as
                        | "EXISTING_POST"
                        | "NEW_CREATIVE",
                      objective =
                        mode === "EXISTING_POST"
                          ? ("OUTCOME_ENGAGEMENT" as const)
                          : ("OUTCOME_TRAFFIC" as const),
                      optimization =
                        mode === "EXISTING_POST"
                          ? ("POST_ENGAGEMENT" as const)
                          : ("LINK_CLICKS" as const);
                    edit(
                      {
                        overrides: {
                          ...input.overrides,
                          mode,
                          objective,
                          optimization,
                          cta:
                            mode === "EXISTING_POST"
                              ? undefined
                              : input.overrides.cta,
                          message:
                            mode === "EXISTING_POST"
                              ? undefined
                              : input.overrides.message,
                        },
                        items: input.items.map((i) => ({
                          ...i,
                          overrides: {
                            ...i.overrides,
                            mode,
                            objective,
                            optimization,
                            cta:
                              mode === "EXISTING_POST"
                                ? undefined
                                : i.overrides?.cta,
                            message:
                              mode === "EXISTING_POST"
                                ? undefined
                                : i.overrides?.message,
                          },
                        })),
                      },
                      true,
                    );
                  }}
                >
                  <option value="EXISTING_POST">
                    Existing Post · shared attribution
                  </option>
                  <option value="NEW_CREATIVE">
                    New Creative · link/SubID riêng
                  </option>
                </select>
              </label>
              {input.overrides.mode === "NEW_CREATIVE" && (
                <>
                  <label>
                    CTA override toàn bộ rows
                    <select
                      aria-label="CTA Bulk override"
                      value={input.overrides.cta ?? ""}
                      onChange={(e) => {
                        const cta = e.target.value
                          ? (e.target.value as "LEARN_MORE" | "SHOP_NOW")
                          : undefined;
                        edit({
                          overrides: { ...input.overrides, cta },
                          items: input.items.map((i) => ({
                            ...i,
                            overrides: { ...i.overrides, cta },
                          })),
                        });
                      }}
                    >
                      <option value="">Theo Donor/source</option>
                      <option>LEARN_MORE</option>
                      <option>SHOP_NOW</option>
                    </select>
                  </label>
                  <label>
                    Message override
                    <textarea
                      aria-label="Message Bulk override"
                      maxLength={8000}
                      value={input.overrides.message ?? ""}
                      onChange={(e) => {
                        const message = e.target.value || undefined;
                        edit({
                          overrides: { ...input.overrides, message },
                          items: input.items.map((i) => ({
                            ...i,
                            overrides: { ...i.overrides, message },
                          })),
                        });
                      }}
                    />
                  </label>
                </>
              )}
              <label>
                Budget override chung
                <input
                  aria-label="Ngân sách Bulk chung"
                  value={input.overrides.budget ?? ""}
                  inputMode="numeric"
                  onChange={(e) =>
                    edit({
                      overrides: {
                        ...input.overrides,
                        budget: e.target.value || undefined,
                      },
                    })
                  }
                />
              </label>
              <label>
                Start mới · ISO UTC offset
                <input
                  aria-label="Start Bulk ISO"
                  value={input.overrides.startTime ?? ""}
                  onChange={(e) =>
                    edit({
                      overrides: {
                        ...input.overrides,
                        startTime: e.target.value || undefined,
                      },
                    })
                  }
                />
              </label>
              <label>
                End mới · lifetime bắt buộc
                <input
                  aria-label="End Bulk ISO"
                  value={input.overrides.endTime ?? ""}
                  onChange={(e) =>
                    edit({
                      overrides: {
                        ...input.overrides,
                        endTime: e.target.value || undefined,
                      },
                    })
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={input.overrides.acknowledgeDonorChanges ?? false}
                  onChange={(e) =>
                    edit({
                      overrides: {
                        ...input.overrides,
                        acknowledgeDonorChanges: e.target.checked,
                      },
                    })
                  }
                />
                Tôi đã kiểm tra normalized targeting cho toàn bộ rows
              </label>
              <details>
                <summary>Nhân bản Campaign / Ad Set / Ad</summary>
                <label>
                  Source đã verified
                  <select
                    aria-label="Clone Source Ads"
                    value={cloneId}
                    onChange={(e) => setCloneId(e.target.value)}
                  >
                    <option value="">Chọn nguồn trong app</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        Ad {p.adId} · Campaign {p.campaignId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cấp clone
                  <select
                    aria-label="Cấp Clone Ads"
                    value={cloneLevel}
                    onChange={(e) =>
                      setCloneLevel(e.target.value as typeof cloneLevel)
                    }
                  >
                    <option>CAMPAIGN</option>
                    <option>ADSET</option>
                    <option>AD</option>
                  </select>
                </label>
                <label>
                  Số bản clone
                  <input
                    aria-label="Số bản Clone Ads"
                    type="number"
                    min={1}
                    max={10}
                    value={copies}
                    onChange={(e) => setCopies(Number(e.target.value))}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={newParents}
                    onChange={(e) => setNewParents(e.target.checked)}
                  />
                  Tạo Campaign/Ad Set mới để chỉnh ngân sách độc lập
                </label>
                <button
                  className="button secondary"
                  disabled={!cloneId}
                  onClick={() =>
                    act(async () => {
                      const b = await requestApi<
                        Awaited<ReturnType<BulkAdsService["cloneBlueprint"]>>
                      >("/api/ads/bulk/clone", {
                        method: "POST",
                        body: JSON.stringify({
                          sourceRequestId: cloneId,
                          level: cloneLevel,
                          copies,
                          newParents,
                        }),
                      });
                      edit(
                        {
                          clone: b.clone,
                          items: b.items,
                          name: b.name,
                          structure: b.structure,
                          overrides: { acknowledgeDonorChanges: false,mode:b.items[0]?.overrides?.mode },
                          presetId:undefined,donorVersionId:undefined,parentRequestId:undefined,
                        },
                        true,
                      );
                    }, "Đã đọc clone blueprint. New Creative cần link/SubID mới; chưa tạo Ads.")
                  }
                >
                  Đọc Clone Blueprint
                </button>
              </details>
              {input.clone ? (
                <Notice>
                  CLONE {input.clone.level} · {input.clone.copies} bản ·{" "}
                  {input.items.length} rows. Membership sẽ kiểm lại khi confirm.
                </Notice>
              ) : (
                <div className="bulk-selection">
                  <p>Chọn video đã đăng ({input.items.length}/100)</p>
                  {currentOptions.map((o) => (
                    <label className="check-label" key={o.id}>
                      <input
                        type="checkbox"
                        aria-label={`Chọn Bulk video ${o.filename}`}
                        checked={input.items.some(
                          (i) => i.publishJobId === o.id,
                        )}
                        onChange={(e) =>
                          edit(
                            {
                              items: e.target.checked
                                ? [
                                    ...input.items,
                                    {
                                      key: crypto.randomUUID(),
                                      publishJobId: o.id,
                                    },
                                  ]
                                : input.items.filter(
                                    (i) => i.publishJobId !== o.id,
                                  ),
                            },
                            true,
                          )
                        }
                      />
                      {o.filename} · {o.pageName} · {o.accountName} ·{" "}
                      {o.currency}
                    </label>
                  ))}
                </div>
              )}
              {!!input.items.length && (
                <>
                  <label>
                    Mã Affiliate
                    <input
                      aria-label="Affiliate Bulk Ads"
                      value={affiliate}
                      onChange={(e) => {
                        setAffiliate(e.target.value);
                        setPrepareKey(crypto.randomUUID());
                      }}
                    />
                  </label>
                  <button
                    className="button secondary"
                    onClick={() =>
                      act(async () => {
                        const items = input.items
                          .filter(
                            (i) =>
                              (i.overrides?.mode ?? input.overrides.mode) ===
                              "NEW_CREATIVE",
                          )
                          .map((i) => ({
                            key: i.key,
                            publishJobId: i.publishJobId,
                          }));
                        if (!items.length)
                          throw new Error(
                            "Chỉ New Creative cần chuẩn bị ADS SubID riêng.",
                          );
                        const rows = await requestApi<
                          Array<{
                            key: string;
                            trackingId: string;
                            subId: string;
                          }>
                        >("/api/ads/bulk/tracking", {
                          method: "POST",
                          body: JSON.stringify({
                            requestKey: prepareKey || crypto.randomUUID(),
                            affiliateAccount: affiliate,
                            items,
                          }),
                        });
                        edit({
                          items: input.items.map((i) => ({
                            ...i,
                            trackingId:
                              rows.find((r) => r.key === i.key)?.trackingId ??
                              i.trackingId,
                          })),
                        });
                      }, "Đã chuẩn bị SubID theo row key. Tạo Custom Link bên Shopee rồi nhập đúng tracking ID/SubID.")
                    }
                  >
                    Chuẩn bị ADS SubID Bulk
                  </button>
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href="/settings?tab=shopee"
                  >
                    Mở Shopee Link Center
                  </a>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Row / video</th>
                          <th>Tracking ADS / budget riêng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {input.items.map((i, index) => (
                          <tr key={i.key}>
                            <td>
                              Row {index + 1} ·{" "}
                              {options.find((o) => o.id === i.publishJobId)
                                ?.filename ?? i.publishJobId}
                              <small>
                                {i.key} · source {i.cloneSourceId ?? "bulk"}
                              </small>
                            </td>
                            <td>
                              <input
                                aria-label={`Tracking Bulk row ${index + 1}`}
                                placeholder="Tracking UUID, không theo thứ tự CSV"
                                value={i.trackingId ?? ""}
                                onChange={(e) =>
                                  edit({
                                    items: input.items.map((x) =>
                                      x.key === i.key
                                        ? {
                                            ...x,
                                            trackingId:
                                              e.target.value || undefined,
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              <input
                                aria-label={`Budget Bulk row ${index + 1}`}
                                placeholder="Theo Donor/chung"
                                value={i.overrides?.budget ?? ""}
                                onChange={(e) =>
                                  edit({
                                    items: input.items.map((x) =>
                                      x.key === i.key
                                        ? {
                                            ...x,
                                            overrides: {
                                              ...x.overrides,
                                              budget:
                                                e.target.value || undefined,
                                            },
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <label>
                Tên preset mới
                <input
                  aria-label="Tên Ads Preset Bulk"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={
                  !presetName ||
                  !input.donorVersionId ||
                  ![
                    "PER_VIDEO",
                    "CAMPAIGN_PER_PAGE",
                    "ADSET_PER_PAGE",
                  ].includes(input.structure)
                }
                onClick={() =>
                  act(
                    () =>
                      requestApi("/api/ads/bulk/presets", {
                        method: "POST",
                        body: JSON.stringify({
                          name: presetName,
                          donorVersionId: input.donorVersionId,
                          structure: input.structure,
                          overrides: input.overrides,
                        }),
                      }),
                    "Đã lưu preset; acknowledgement/lịch không tự áp dụng.",
                  )
                }
              >
                Lưu Ads Preset
              </button>
              <button
                className="button primary"
                disabled={!input.items.length}
                onClick={() =>
                  act(async () => {
                    const p = await requestApi<Preview>(
                      "/api/ads/bulk/preview",
                      { method: "POST", body: JSON.stringify(input) },
                    );
                    setPreview(p);
                    setRequestKey(crypto.randomUUID());
                    setConfirmed(false);
                    setBudgetAck(false);
                  })
                }
              >
                Preview Bulk / ngân sách
              </button>
            </fieldset>
            {preview && (
              <section className="card">
                <h3>Batch Validation: {preview.state}</h3>
                <p>
                  {preview.counts.campaigns} Campaign mới ·{" "}
                  {preview.counts.adSets} Ad Sets mới ·{" "}
                  {preview.counts.creatives} Creative mới · {preview.counts.ads}{" "}
                  Ads mới
                </p>
                {preview.budgets.map((b, i) => (
                  <Notice key={i}>
                    {b.source} · {b.currency} · {b.kind}: mới {b.newBudget},
                    parent hiện có {b.existingBudget} · đơn vị nhỏ nhất
                  </Notice>
                ))}
                {preview.warnings.map((w, i) => (
                  <p className="muted" key={i}>
                    {w}
                  </p>
                ))}
                {preview.rows.map((r, i) => (
                  <article className="publish-preview-row" key={r.key}>
                    <h4>
                      Row {i + 1}: {r.pageName} → {r.accountName} ·{" "}
                      {r.donorName}
                    </h4>
                    <p>
                      {r.source} · SubID {r.snapshot.subId ?? "SHARED/—"} · Link{" "}
                      {r.snapshot.affiliateUrl ?? "—"}
                    </p>
                    <p>
                      Campaign parent{" "}
                      {r.campaignRefId ?? r.campaignOwnerKey ?? "mới"} · Ad Set
                      parent {r.adSetRefId ?? r.adSetOwnerKey ?? "mới"}
                    </p>
                    {r.findings.map((f, j) => (
                      <Notice error key={j}>
                        {f.state} · {f.field}: {f.reason}
                        <br />
                        Sửa: {f.fix}
                      </Notice>
                    ))}
                    <details>
                      <summary>Cấu hình row</summary>
                      <pre className="json-preview">
                        {JSON.stringify(r.snapshot, null, 2)}
                      </pre>
                    </details>
                  </article>
                ))}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={budgetAck}
                    onChange={(e) => setBudgetAck(e.target.checked)}
                  />
                  Tôi đã kiểm tra tổng ngân sách theo currency/Daily/Lifetime và
                  cấu trúc
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Tôi xác nhận tạo toàn bộ {source} Ads mới PAUSED
                </label>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    preview.state !== "READY" ||
                    !confirmed ||
                    !budgetAck
                  }
                  onClick={() =>
                    act(async () => {
                      await requestApi("/api/ads/bulk/confirm", {
                        method: "POST",
                        body: JSON.stringify({
                          input,
                          requestKey,
                          fingerprint: preview.fingerprint,
                          confirmed: true,
                          budgetAcknowledged: true,
                        }),
                      });
                      setOpen(false);
                      setPreview(null);
                    }, "Đã xác nhận batch PAUSED vào queue. Theo dõi progress/IDs/logs.")
                  }
                >
                  Xác nhận Bulk PAUSED
                </button>
              </section>
            )}
            {error && <Notice error>{error}</Notice>}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Đóng Bulk wizard
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal labelledBy="bulk-detail" onClose={() => setDetail(null)}>
          <div className="ads-wizard">
            <h2 id="bulk-detail">Batch logs / lineage / IDs</h2>
            <p>
              UNKNOWN chỉ kiểm tra/nối ID trong luồng Ads hiện có; retry batch
              chỉ lỗi chắc chắn.
            </p>
            {detail.requests.map((r) => (
              <p key={r.id}>
                {r.state} · {r.phase} · parent/clone {r.cloneSourceId ?? "—"} ·
                Campaign {r.campaignId ?? "—"} · Set {r.adSetId ?? "—"} · Ad{" "}
                {r.adId ?? "—"}{" "}
                <a href={`/ads#ads-from-donor`}>Mở Ads recovery</a>
              </p>
            ))}
            <pre className="json-preview">
              {JSON.stringify(detail, null, 2)}
            </pre>
            <button
              className="button secondary"
              onClick={() => setDetail(null)}
            >
              Đóng log batch
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
