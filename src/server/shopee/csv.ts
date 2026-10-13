import { parse } from "csv-parse/sync";
import { z } from "zod";
import { AppError } from "../http/errors";
import { accountKey, normalizeSubId, sha } from "./validation";
export const fields = [
  "rowId",
  "orderId",
  "orderItemId",
  "subId",
  "amount",
  "status",
  "currency",
  "orderedAt",
  "reportedAt",
  "settledAt",
] as const;
export type ColumnField = (typeof fields)[number];
export const optionsSchema = z
  .object({
    source: z.enum(["LIVE", "MOCK"]),
    affiliateAccount: accountKey,
    encoding: z
      .enum([
        "auto",
        "utf-8",
        "utf-16le",
        "utf-16be",
        "windows-1258",
        "windows-1252",
      ])
      .default("auto"),
    delimiter: z.enum(["auto", ",", ";", "\t"]).default("auto"),
    columns: z
      .object(
        Object.fromEntries(
          fields.map((f) => [f, z.string().max(120).optional()]),
        ) as Record<ColumnField, z.ZodOptional<z.ZodString>>,
      )
      .strict(),
    statusMap: z
      .record(
        z.string().max(100),
        z.enum(["PENDING", "APPROVED", "PAID", "REJECTED", "UNKNOWN"]),
      )
      .default({}),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("VND"),
    decimal: z.enum([".", ","]).default("."),
    dateFormat: z.enum(["YMD", "DMY"]).default("YMD"),
    timezone: z.enum(["UTC", "Asia/Ho_Chi_Minh"]).default("Asia/Ho_Chi_Minh"),
  })
  .strict();
export type ImportOptions = z.infer<typeof optionsSchema>;
export type Candidate = {
  line: number;
  externalKey: string | null;
  externalRowId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  subId: string;
  amount: string;
  currency: string;
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | null;
  orderedAt: string | null;
  reportedAt: string | null;
  settledAt: string | null;
  reasons: string[];
};
const aliases: Record<ColumnField, string[]> = {
  rowId: ["commissionrowid", "commissionid", "rowid", "mahoahong"],
  orderId: ["orderid", "madonhang"],
  orderItemId: ["orderitemid", "lineitemid", "madongdonhang"],
  subId: ["subid", "subid1"],
  amount: [
    "commissionamount",
    "commission",
    "totalcommission",
    "hoahong",
    "tonghoahong",
    "hoahongrong",
  ],
  status: [
    "commissionstatus",
    "trangthaihoahong",
    "orderstatus",
    "trangthaidonhang",
    "status",
  ],
  currency: ["currency", "tiente", "donvitiente"],
  orderedAt: [
    "orderdate",
    "ordertime",
    "ngaydatdon",
    "ngaydat",
    "thoigiandathang",
  ],
  reportedAt: [
    "commissionupdatedate",
    "updatedat",
    "updatedate",
    "ngaycapnhat",
    "thoigiancapnhat",
  ],
  settledAt: ["settlementdate", "paidat", "ngaythanhtoan"],
};
const headerKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function inspectCsv(
  buffer: Buffer,
  encoding = "auto",
  delimiter = "auto",
) {
  if (!buffer.length || buffer.length > 2 * 1024 * 1024)
    throw new AppError(413, "COMMISSION_SIZE", "CSV cần 1 byte đến 2 MB.");
  const detected =
    encoding !== "auto"
      ? encoding
      : buffer[0] === 0xff && buffer[1] === 0xfe
        ? "utf-16le"
        : buffer[0] === 0xfe && buffer[1] === 0xff
          ? "utf-16be"
          : "utf-8";
  let text: string;
  try {
    text = new TextDecoder(detected, { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(
      422,
      "CSV_ENCODING",
      "Không đọc được encoding. Chọn encoding đúng hoặc xuất CSV UTF-8 từ Shopee.",
    );
  }
  let rows: string[][] | undefined,
    best = 0,
    used = "";
  for (const sep of delimiter === "auto" ? [",", ";", "\t"] : [delimiter]) {
    try {
      const parsed: string[][] = parse(text, {
        delimiter: sep,
        bom: true,
        skip_empty_lines: true,
        max_record_size: 20000,
      });
      if (parsed[0]?.length > best) {
        rows = parsed;
        best = parsed[0].length;
        used = sep;
      }
    } catch {
      /* Chỉ chọn delimiter có cấu trúc CSV hợp lệ. */
    }
  }
  if (!rows || best < 2 || rows.length < 2 || rows.length > 5001)
    throw new AppError(
      422,
      "CSV_STRUCTURE",
      "CSV cần header và 1–5.000 dòng với cùng số cột; kiểm tra delimiter.",
    );
  const headers = rows.shift()!.map((v) => v.trim());
  if (
    headers.some(
      (h) =>
        !h ||
        h.length > 120 ||
        ["__proto__", "constructor", "prototype"].includes(h),
    ) ||
    new Set(headers).size !== headers.length
  )
    throw new AppError(
      422,
      "CSV_HEADERS",
      "Header không hợp lệ hoặc trùng. Đổi tên cột rồi thử lại.",
    );
  const columns = Object.fromEntries(
    fields.map((field) => [
      field,
      aliases[field]
        .map((alias) => headers.find((h) => headerKey(h) === alias))
        .find(Boolean) ?? "",
    ]),
  ) as Record<ColumnField, string>;
  const statusIndex = headers.indexOf(columns.status);
  const statuses =
    statusIndex >= 0
      ? [...new Set(rows.map((r) => r[statusIndex].trim()))].slice(0, 50)
      : [];
  return {
    headers,
    rows,
    encoding: detected,
    delimiter: used,
    columns,
    statuses,
  };
}
export function moneyUnits(value: string) {
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (
    (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"))) *
    (negative ? -1n : 1n)
  );
}
export function unitsMoney(value: bigint) {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 1000000n}.${String(abs % 1000000n).padStart(6, "0")}`;
}
export function parseMoney(
  value: string,
  decimal: "." | ",",
  currency: string,
) {
  let text = value.trim().replace(/[\u00a0\u202f ]/g, "");
  const suffix =
    currency === "VND"
      ? "(?:VND|₫|đ)"
      : currency === "USD"
        ? "(?:USD|\\$)"
        : currency === "EUR"
          ? "(?:EUR|€)"
          : currency;
  text = text.replace(new RegExp(`^(?:${suffix})|(?:${suffix})$`, "gi"), "");
  const grouping = decimal === "." ? "," : ".";
  const groups = text.split(decimal);
  if (groups.length > 2) throw new Error("decimal");
  if (groups[0].includes(grouping)) {
    if (!new RegExp(`^-?\\d{1,3}(?:\\${grouping}\\d{3})+$`).test(groups[0]))
      throw new Error("grouping");
    groups[0] = groups[0].split(grouping).join("");
  }
  text = groups.join(".");
  if (!/^-?\d{1,24}(?:\.\d{1,6})?$/.test(text)) throw new Error("money");
  return unitsMoney(moneyUnits(text));
}
function parseDate(value: string, format: "YMD" | "DMY", timezone: string) {
  if (!value.trim()) return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const parsed = z.iso.datetime({ offset: true }).parse(text);
    return new Date(parsed).toISOString();
  }
  const pattern =
    format === "YMD"
      ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
      : /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const match = text.match(pattern);
  if (!match) throw new Error("date");
  const [, a, b, c, h = "00", m = "00", s = "00"] = match;
  const day = format === "YMD" ? `${a}-${b}-${c}` : `${c}-${b}-${a}`;
  z.iso.date().parse(day);
  if (Number(h) > 23 || Number(m) > 59 || Number(s) > 59)
    throw new Error("time");
  return new Date(
    `${day}T${h}:${m}:${s}${timezone === "UTC" ? "Z" : "+07:00"}`,
  ).toISOString();
}
const defaultStatuses: Record<string, Candidate["status"]> = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  PAID: "PAID",
  FINALIZED: "PAID",
  REJECTED: "REJECTED",
  CANCELLED: "REJECTED",
  CANCELED: "REJECTED",
};
export function parseCommission(buffer: Buffer, input: unknown) {
  const options = optionsSchema.parse(input),
    csv = inspectCsv(buffer, options.encoding, options.delimiter);
  if (
    !options.columns.amount ||
    !options.columns.status ||
    Object.values(options.columns)
      .filter(Boolean)
      .some((column) => !csv.headers.includes(column!))
  )
    throw new AppError(
      422,
      "COMMISSION_COLUMNS",
      "Chọn cột hoa hồng/trạng thái và kiểm tra các cột được ghép.",
    );
  const candidates: Candidate[] = csv.rows.map((row, index) => {
    const value = (field: ColumnField) => {
      const column = options.columns[field];
      return column ? (row[csv.headers.indexOf(column)]?.trim() ?? "") : "";
    };
    const rowId = value("rowId"),
      orderId = value("orderId"),
      itemId = value("orderItemId");
    if ([rowId, orderId, itemId, value("subId")].some((v) => v.length > 128))
      throw new AppError(
        422,
        "COMMISSION_ID",
        `Dòng ${index + 2}: định danh quá dài.`,
      );
    const key = rowId
      ? sha(JSON.stringify(["row", rowId]))
      : orderId && itemId
        ? sha(JSON.stringify(["item", orderId, itemId]))
        : null;
    const rawStatus = value("status"),
      mapped = Object.hasOwn(options.statusMap, rawStatus)
        ? options.statusMap[rawStatus]
        : undefined;
    const status =
      mapped === "UNKNOWN"
        ? null
        : (mapped ?? defaultStatuses[rawStatus.toUpperCase()] ?? null);
    const reasons: string[] = [];
    if (!key)
      reasons.push(
        "Thiếu Commission Row ID hoặc Order ID + Order Item ID; không suy đoán từ Order ID/Product ID.",
      );
    if (!status)
      reasons.push(
        `Trạng thái “${rawStatus}” chưa rõ; không xem đơn hoàn tất là hoa hồng đã thanh toán.`,
      );
    const currency = (value("currency") || options.currency).toUpperCase();
    if (!Intl.supportedValuesOf("currency").includes(currency))
      throw new AppError(
        422,
        "COMMISSION_CURRENCY",
        `Dòng ${index + 2}: currency không hợp lệ.`,
      );
    try {
      return {
        line: index + 2,
        externalKey: key,
        externalRowId: rowId || null,
        orderId: orderId || null,
        orderItemId: itemId || null,
        subId: normalizeSubId(value("subId")),
        amount: parseMoney(value("amount"), options.decimal, currency),
        currency,
        status,
        orderedAt: parseDate(
          value("orderedAt"),
          options.dateFormat,
          options.timezone,
        ),
        reportedAt: parseDate(
          value("reportedAt"),
          options.dateFormat,
          options.timezone,
        ),
        settledAt: parseDate(
          value("settledAt"),
          options.dateFormat,
          options.timezone,
        ),
        reasons,
      };
    } catch {
      throw new AppError(
        422,
        "COMMISSION_ROW",
        `Dòng ${index + 2}: tiền hoặc ngày không hợp lệ. Kiểm tra dấu thập phân, format ngày và múi giờ; tiền tối đa 6 chữ số thập phân.`,
      );
    }
  });
  const byKey = new Map<string, Candidate[]>();
  for (const row of candidates)
    if (row.externalKey)
      byKey.set(row.externalKey, [...(byKey.get(row.externalKey) ?? []), row]);
  for (const rows of byKey.values())
    if (rows.length > 1) {
      const signatures = new Set(
        rows.map((r) => JSON.stringify({ ...r, line: 0, reasons: [] })),
      );
      if (signatures.size > 1)
        rows.forEach((row) =>
          row.reasons.push(
            "Nhiều dòng có cùng định danh nhưng khác nội dung; cần đối chiếu, không tự cộng hoặc ghi đè.",
          ),
        );
    }
  return { options, candidates, encoding: csv.encoding, headers: csv.headers };
}
