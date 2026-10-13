import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db";
// Đối chiếu toàn bộ lịch sử theo source/affiliate namespace bằng SQL; không tải URLs vào bộ nhớ.
export async function ambiguousTrackingIds(db: AppDatabase) {
  const result = await db.execute(sql`WITH ambiguous AS (
 SELECT t.source,t.affiliate_account,l.url_hash FROM tracking_link_versions l JOIN tracking_records t ON t.id=l.tracking_id
 GROUP BY t.source,t.affiliate_account,l.url_hash HAVING count(DISTINCT t.id)>1
 ) SELECT DISTINCT t.id FROM tracking_link_versions l JOIN tracking_records t ON t.id=l.tracking_id
 JOIN ambiguous a ON a.source=t.source AND a.affiliate_account=t.affiliate_account AND a.url_hash=l.url_hash`);
  return new Set(result.rows.map((r) => String(r.id)));
}
