"use client";
import { useState } from "react";
import { requestApi } from "@/lib/client-api";
import { Notice, Badge } from "../ui";
import { uploadCsv, downloadCsv } from "./link-center";
import type {
  ColumnField,
  ImportOptions,
  Candidate,
} from "@/server/shopee/csv";
const labels: Record<ColumnField, string> = {
  rowId: "Commission Row ID",
  orderId: "Order ID",
  orderItemId: "Order Item ID (dòng đơn)",
  subId: "SubID",
  amount: "Hoa hồng",
  status: "Trạng thái",
  currency: "Currency",
  orderedAt: "Ngày đặt đơn",
  reportedAt: "Ngày cập nhật hoa hồng",
  settledAt: "Ngày thanh toán",
};
type Inspection = {
  headers: string[];
  columns: Record<ColumnField, string>;
  statuses: string[];
  encoding: string;
  delimiter: string;
  count: number;
};
type Preview = {
  id: string;
  applied: boolean;
  fingerprint: string;
  count: number;
  reviewCount: number;
  samples: Candidate[];
  result: Record<string, number> | null;
};
export function CommissionImport({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<ImportOptions>({
    source: "LIVE",
    affiliateAccount: "shopee_vn",
    encoding: "auto",
    delimiter: "auto",
    columns: {},
    statusMap: {},
    currency: "VND",
    decimal: ".",
    dateFormat: "YMD",
    timezone: "Asia/Ho_Chi_Minh",
  });
  async function act(callback: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await callback();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(patch: Partial<ImportOptions>) {
    setOptions({ ...options, ...patch });
    setPreview(null);
  }
  return (
    <section className="card settings-card">
      <div className="section-heading">
        <div>
          <h2>Nhập Shopee Commission CSV</h2>
          <p>
            Kiểm tra encoding, ghép cột và preview trước khi nhập. Không cộng
            trùng báo cáo.
          </p>
        </div>
        <Badge tone="purple">CSV → đối soát SubID</Badge>
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="import-settings">
        <label>
          Tệp hoa hồng Shopee
          <input
            type="file"
            accept=".csv"
            aria-label="Tệp hoa hồng Shopee"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setInspection(null);
              setPreview(null);
            }}
          />
        </label>
        <label>
          Nguồn báo cáo
          <select
            value={options.source}
            onChange={(e) =>
              change({ source: e.target.value as "LIVE" | "MOCK" })
            }
          >
            <option value="LIVE">Báo cáo thật</option>
            <option value="MOCK">Dữ liệu thử nghiệm</option>
          </select>
        </label>
        <label>
          Tài khoản Shopee báo cáo
          <input
            value={options.affiliateAccount}
            onChange={(e) => change({ affiliateAccount: e.target.value })}
          />
        </label>
        <label>
          Encoding CSV
          <select
            value={options.encoding}
            onChange={(e) => {
              change({ encoding: e.target.value as ImportOptions["encoding"] });
              setInspection(null);
            }}
          >
            {[
              "auto",
              "utf-8",
              "utf-16le",
              "utf-16be",
              "windows-1258",
              "windows-1252",
            ].map((v) => (
              <option key={v} value={v}>
                {v === "auto" ? "Tự nhận UTF-8/UTF-16 BOM" : v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Delimiter
          <select
            value={options.delimiter}
            onChange={(e) => {
              change({
                delimiter: e.target.value as ImportOptions["delimiter"],
              });
              setInspection(null);
            }}
          >
            <option value="auto">Tự nhận diện</option>
            <option value=",">Dấu phẩy</option>
            <option value=";">Chấm phẩy</option>
            <option value="&#9;">Tab</option>
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={!file || busy}
          onClick={() =>
            act(async () => {
              const result = await uploadCsv<Inspection>(
                "/api/commissions/inspect",
                file!,
                { encoding: options.encoding, delimiter: options.delimiter },
              );
              setInspection(result);
              setPreview(null);
              setOptions({
                ...options,
                columns: result.columns,
                statusMap: {},
              });
            })
          }
        >
          Đọc & nhận diện cột
        </button>
        <button
          className="button secondary"
          onClick={() =>
            downloadCsv(
              "shopee-commission-template.csv",
              "\uFEFFcommission_id,order_id,order_item_id,sub_id,commission,status,currency,order_date,updated_at,settlement_date\r\nROW_EXAMPLE,ORDER_EXAMPLE,ITEM_EXAMPLE,REPLACE_WITH_SUBID,1000,PENDING,VND,2026-01-01,2026-01-02,\r\n",
            )
          }
        >
          Tải mẫu commission CSV
        </button>
      </div>
      <p>
        Mẫu dùng định danh minh họa. Thay bằng dữ liệu của bạn; chọn nguồn thử
        nghiệm khi dùng Page MOCK.
      </p>
      {inspection && (
        <>
          <p>
            Đã nhận {inspection.count} dòng · {inspection.encoding} · delimiter{" "}
            {inspection.delimiter === "\t" ? "Tab" : inspection.delimiter}.
          </p>
          <div className="import-settings">
            {(Object.keys(labels) as ColumnField[]).map((field) => (
              <label key={field}>
                {labels[field]}
                <select
                  aria-label={`Cột ${labels[field]}`}
                  value={options.columns[field] ?? ""}
                  onChange={(e) =>
                    change({
                      columns: { ...options.columns, [field]: e.target.value },
                    })
                  }
                >
                  <option value="">Không có / chưa chọn</option>
                  {inspection.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Currency mặc định
              <input
                value={options.currency}
                maxLength={3}
                onChange={(e) =>
                  change({ currency: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label>
              Định dạng tiền
              <select
                value={options.decimal}
                onChange={(e) =>
                  change({ decimal: e.target.value as "." | "," })
                }
              >
                <option value=".">1,234.56 · thập phân chấm</option>
                <option value=",">1.234,56 · thập phân phẩy</option>
              </select>
            </label>
            <label>
              Format ngày
              <select
                value={options.dateFormat}
                onChange={(e) =>
                  change({ dateFormat: e.target.value as "YMD" | "DMY" })
                }
              >
                <option value="YMD">YYYY-MM-DD</option>
                <option value="DMY">DD/MM/YYYY</option>
              </select>
            </label>
            <label>
              Múi giờ báo cáo
              <select
                value={options.timezone}
                onChange={(e) =>
                  change({
                    timezone: e.target.value as ImportOptions["timezone"],
                  })
                }
              >
                <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
          </div>
          <p>
            Chống trùng dùng Commission Row ID hoặc Order ID + Order Item ID.
            Product ID/Order ID riêng không đủ để xác định dòng sản phẩm. Đơn
            “Completed/Hoàn thành” không mặc định là hoa hồng đã thanh toán.
          </p>
          <details>
            <summary>Xác định trạng thái trong báo cáo</summary>
            {inspection.statuses.map((raw) => {
              const known = [
                "PENDING",
                "APPROVED",
                "PAID",
                "REJECTED",
              ].includes(raw.toUpperCase())
                ? raw.toUpperCase()
                : raw.toUpperCase() === "FINALIZED"
                  ? "PAID"
                  : ["CANCELLED", "CANCELED"].includes(raw.toUpperCase())
                    ? "REJECTED"
                    : "UNKNOWN";
              return (
                <label className="mapping-row" key={raw}>
                  <span>{raw || "(trống)"}</span>
                  <select
                    aria-label={`Trạng thái CSV ${raw}`}
                    value={options.statusMap[raw] ?? known}
                    onChange={(e) =>
                      change({
                        statusMap: {
                          ...options.statusMap,
                          [raw]: e.target
                            .value as ImportOptions["statusMap"][string],
                        },
                      })
                    }
                  >
                    <option value="UNKNOWN">Chưa rõ · cần xem xét</option>
                    <option value="PENDING">Chờ duyệt</option>
                    <option value="APPROVED">Đã duyệt</option>
                    <option value="PAID">Đã thanh toán/finalized</option>
                    <option value="REJECTED">Hủy/từ chối</option>
                  </select>
                </label>
              );
            })}
          </details>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                setPreview(
                  await uploadCsv<Preview>("/api/commissions/preview", file!, {
                    options: JSON.stringify(options),
                  }),
                );
              })
            }
          >
            Kiểm tra preview hoa hồng
          </button>
        </>
      )}
      {preview && (
        <div className="commission-preview">
          <h3>Preview trước khi nhập</h3>
          {preview.applied ? (
            <Notice>Báo cáo đã nhập; không ghi nhận thêm hoa hồng.</Notice>
          ) : (
            <>
              <p>
                {preview.count} dòng · {preview.reviewCount} dòng cần xem xét
                trước khi ghi nhận. Bảng hiển thị tối đa 25 dòng đầu; khi nhập
                sẽ kiểm tra cả xung đột với dữ liệu đã có.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng / Order</th>
                      <th>SubID</th>
                      <th>Hoa hồng</th>
                      <th>Trạng thái / kiểm tra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.samples.map((row) => (
                      <tr key={row.line}>
                        <td>
                          {row.line}
                          <small>
                            {row.orderId ??
                              row.externalRowId ??
                              "Thiếu định danh"}
                          </small>
                        </td>
                        <td>{row.subId || "(trống)"}</td>
                        <td>
                          {row.amount} {row.currency}
                        </td>
                        <td>
                          {row.status ?? "Chưa rõ"}
                          {row.reasons.map((reason) => (
                            <small className="tracking-warning" key={reason}>
                              {reason}
                            </small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const result = await requestApi<
                      Record<string, number | boolean>
                    >("/api/commissions/commit", {
                      method: "POST",
                      body: JSON.stringify({
                        id: preview.id,
                        fingerprint: preview.fingerprint,
                      }),
                    });
                    setMessage(
                      result.duplicateFile
                        ? "Báo cáo đã nhập; không ghi trùng."
                        : `Đã nhập: ${result.created} mới, ${result.updated} cập nhật, ${result.duplicate} trùng, ${result.stale} cũ, ${result.review} cần xem xét.`,
                    );
                    setPreview(null);
                    await onSaved();
                  })
                }
              >
                Xác nhận nhập báo cáo
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
