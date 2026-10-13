import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db";
import { metaImports, auditLogs } from "../database/schema";
import { requirePermission, type Actor } from "../auth/policy";
import { AppError } from "../http/errors";
const rowSchema = z.object({
  account_id: z.string().regex(/^\d+$/, "account_id cần là chuỗi chữ số."),
  date: z.iso.date("date cần theo YYYY-MM-DD."),
  currency: z.string().regex(/^[A-Z]{3}$/, "currency cần mã 3 chữ hoa."),
  spend: z
    .string()
    .regex(
      /^\d{1,25}(\.\d{1,2})?$/,
      "spend cần số không âm, tối đa 2 chữ số thập phân; không dùng dấu phân cách hàng nghìn.",
    ),
});
function checkHeaders(headers: unknown[]) {
  const expected = ["account_id", "date", "currency", "spend"];
  if (
    headers.length !== 4 ||
    new Set(headers).size !== 4 ||
    headers.some((h) => typeof h !== "string" || !expected.includes(h))
  )
    throw new AppError(
      422,
      "IMPORT_HEADERS",
      "Tiêu đề cần đúng 4 cột account_id,date,currency,spend, mỗi cột xuất hiện một lần.",
    );
  return headers as string[];
}
function canonicalMoney(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}
function checkXlsxArchive(buffer: Buffer) {
  const maximum = 20 * 1024 * 1024;
  let expanded = 0,
    entries = 0;
  for (let offset = 0; offset + 46 <= buffer.length; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const declared = buffer.readUInt32LE(offset + 24),
      compressed = buffer.readUInt32LE(offset + 20),
      method = buffer.readUInt16LE(offset + 10),
      local = buffer.readUInt32LE(offset + 42);
    entries++;
    if (declared + expanded > maximum || entries > 200)
      throw new AppError(
        413,
        "IMPORT_EXPANSION",
        "XLSX giải nén quá lớn. Xuất báo cáo CSV nhỏ hơn.",
      );
    if (
      local + 30 > buffer.length ||
      buffer.readUInt32LE(local) !== 0x04034b50 ||
      buffer.readUInt16LE(local + 8) !== method ||
      ![0, 8].includes(method) ||
      buffer.readUInt16LE(offset + 8) & 1
    )
      throw new AppError(
        422,
        "IMPORT_PARSE",
        "XLSX có cấu trúc ZIP không hỗ trợ.",
      );
    const dataStart =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (dataStart + compressed > buffer.length)
      throw new AppError(422, "IMPORT_PARSE", "XLSX bị thiếu nội dung.");
    const data = buffer.subarray(dataStart, dataStart + compressed);
    let actual: number;
    try {
      actual =
        method === 0
          ? data.length
          : inflateRawSync(data, {
              maxOutputLength: Math.max(1, maximum - expanded),
            }).length;
    } catch {
      throw new AppError(
        413,
        "IMPORT_EXPANSION",
        "XLSX không thể giải nén trong giới hạn an toàn. Dùng CSV nhỏ hơn.",
      );
    }
    expanded += actual;
    if (actual !== declared || expanded > maximum)
      throw new AppError(
        413,
        "IMPORT_EXPANSION",
        "XLSX khai báo sai kích thước giải nén. Dùng tệp hợp lệ.",
      );
    offset +=
      45 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  if (entries === 0)
    throw new AppError(422, "IMPORT_PARSE", "XLSX không có cấu trúc hợp lệ.");
}
export async function parseMetaReport(buffer: Buffer, filename: string) {
  if (!buffer.length || buffer.length > 2 * 1024 * 1024)
    throw new AppError(413, "IMPORT_SIZE", "Tệp cần từ 1 byte đến 2 MB.");
  let records: Record<string, unknown>[];
  try {
    if (filename.toLowerCase().endsWith(".csv"))
      records = parse(buffer, {
        columns: (headers: string[]) => checkHeaders(headers),
        bom: true,
        skip_empty_lines: true,
        max_record_size: 10000,
      });
    else if (filename.toLowerCase().endsWith(".xlsx")) {
      checkXlsxArchive(buffer);
      const rows = await readXlsxFile(buffer);
      const header = rows.shift();
      if (!header) throw new Error("empty");
      checkHeaders(header);
      records = rows.map((row) =>
        Object.fromEntries(
          header.map((key, index) => [String(key), row[index]]),
        ),
      );
    } else
      throw new AppError(415, "IMPORT_FORMAT", "Chỉ nhận CSV UTF-8 hoặc XLSX.");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      "IMPORT_PARSE",
      "Không thể đọc tệp. Kiểm tra định dạng và dùng mẫu CSV của ứng dụng.",
    );
  }
  if (!records.length || records.length > 5000)
    throw new AppError(422, "IMPORT_ROWS", "Báo cáo cần từ 1 đến 5.000 dòng.");
  const rows = records.map((row, index) => {
    const result = rowSchema.safeParse(row);
    if (!result.success)
      throw new AppError(
        422,
        "IMPORT_ROW",
        `Dòng ${index + 2}: ${result.error.issues[0].message} ID/tiền/ngày trong XLSX phải lưu dạng Text.`,
      );
    return {
      accountId: result.data.account_id,
      date: result.data.date,
      currency: result.data.currency,
      spend: canonicalMoney(result.data.spend),
    };
  });
  if (new Set(rows.map((r) => r.currency)).size !== 1)
    throw new AppError(
      422,
      "IMPORT_CURRENCY",
      "Mỗi tệp chỉ dùng một currency; không cộng tiền khác đơn vị.",
    );
  const keys = rows.map((r) => `${r.accountId}:${r.date}`);
  if (new Set(keys).size !== rows.length)
    throw new AppError(
      422,
      "IMPORT_DUPLICATE_ROWS",
      "Chỉ nhận một dòng tổng theo TKQC/ngày, tránh cộng trùng Campaign/Ad Set/Ad.",
    );
  rows.sort((a, b) =>
    `${a.accountId}:${a.date}`.localeCompare(`${b.accountId}:${b.date}`),
  );
  const total = rows.reduce((sum, row) => {
    const [whole, fraction = ""] = row.spend.split(".");
    return sum + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);
  return {
    rows,
    currency: rows[0].currency,
    total: `${total / 100n}.${String(total % 100n).padStart(2, "0")}`,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex"),
  };
}
export class MetaImportService {
  constructor(private db: AppDatabase) {}
  async list(actor: Actor | null) {
    requirePermission(actor, "meta:manage");
    return this.db
      .select({
        id: metaImports.id,
        filename: metaImports.filename,
        count: metaImports.count,
        total: metaImports.total,
        currency: metaImports.currency,
        createdAt: metaImports.createdAt,
      })
      .from(metaImports)
      .orderBy(desc(metaImports.createdAt))
      .limit(20);
  }
  async upload(actor: Actor | null, buffer: Buffer, filename: string) {
    requirePermission(actor, "meta:manage");
    const report = await parseMetaReport(buffer, filename);
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(metaImports)
        .where(eq(metaImports.fingerprint, report.fingerprint));
      if (existing)
        return { id: existing.id, duplicate: true, count: existing.count };
      const [saved] = await tx
        .insert(metaImports)
        .values({
          ...report,
          count: report.rows.length,
          filename: filename.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120),
          createdBy: actor.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!saved) return { duplicate: true, count: report.rows.length };
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: "META_CSV_IMPORTED",
        resourceId: saved.id,
        metadata: { count: saved.count, currency: saved.currency },
      });
      return { id: saved.id, duplicate: false, count: saved.count };
    });
  }
}
