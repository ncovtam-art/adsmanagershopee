import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { testDatabaseUrl } from "../helpers";

test("Backup/restore thực tế vào Database test mới, giữ hash dữ liệu và migration; chạy lại không ghi đè", async () => {
  const sourceUrl = new URL(testDatabaseUrl());
  const source = new Pool({ connectionString: sourceUrl.toString(), max: 1 });
  const targetName = `restore_${randomBytes(6).toString("hex")}_test`;
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = `/${targetName}`;
  let target: Pool | null = null;
  const run = (...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [
        "--env-file=.env",
        "--import",
        "tsx",
        "scripts/database-backup.ts",
        ...args,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    const before = (
      await source.query(
        "SELECT id, email, password_hash, role FROM users ORDER BY id",
      )
    ).rows;
    assert(before.length > 0, "Suite foundation phải tạo fixture trước.");
    const shopeeBefore = (
      await source.query(
        "SELECT id, sub_id, amount, currency, status, tracking_id FROM commission_rows ORDER BY id",
      )
    ).rows;
    assert(
      shopeeBefore.length > 0,
      "Suite Shopee phải tạo fixture trước backup.",
    );
    const linksBefore = (
      await source.query(
        "SELECT id,tracking_id,version,url FROM tracking_link_versions ORDER BY id",
      )
    ).rows;
    const analyticsSql =
      "SELECT d.account_id,d.day,d.provider,d.currency,d.timezone,a.ad_id,a.spend,a.impressions,a.clicks FROM insight_days d JOIN insight_ads a ON a.day_id=d.id ORDER BY d.account_id,d.day,a.ad_id";
    const insightsBefore = (await source.query(analyticsSql)).rows;
    assert(
      insightsBefore.length > 0,
      "Suite Analytics phải tạo snapshot trước backup.",
    );
    const policySql =
      "SELECT account_id,estimated_statuses,mapping_acknowledged,other_cost_per_day,auto_sync,lifetime_start FROM analytics_policies ORDER BY account_id";
    const policiesBefore = (await source.query(policySql)).rows;
    const publishSql =
      "SELECT id,page_id,source,kind,state,asset_id,meta_video_id,post_id,comment_id,caption,comment_body,available_at FROM publish_jobs ORDER BY id";
    const publishBefore = (await source.query(publishSql)).rows;
    const videoSql =
      "SELECT id,page_id,source,filename,sha256,size,storage_key,duration_ms,width,height,aspect_ratio FROM video_assets WHERE state='READY' ORDER BY id";
    const videosBefore = (await source.query(videoSql)).rows;
    assert(
      publishBefore.length > 0 && videosBefore.length > 0,
      "Suite Publisher phải tạo fixture media/job trước backup.",
    );
    const adsSql =
      "SELECT id,source,state,mode,snapshot,campaign_id,ad_set_id,creative_id,ad_id,verified_at FROM ads_requests ORDER BY id";
    const adsBefore = (await source.query(adsSql)).rows;
    assert(
      adsBefore.some((j) => j.state === "SUCCEEDED"),
      "Ads fixture phải có request verified PAUSED trước backup.",
    );
    const bulkSql =
      "SELECT id,source,state,structure,counts,budgets FROM ads_batches ORDER BY id";
    const bulkBefore = (await source.query(bulkSql)).rows;
    assert(bulkBefore.length > 0, "Bulk fixtures phải có batch trước restore.");
    const lineageSql =
      "SELECT id,bulk_batch_id,bulk_index,campaign_ref_id,ad_set_ref_id,clone_source_id,clone_level FROM ads_requests ORDER BY id";
    const lineageBefore = (await source.query(lineageSql)).rows;
    const careTables = [
      "care_rules",
      "care_runs",
      "care_alerts",
      "care_pauses",
      "telegram_settings",
      "notification_jobs",
    ];
    const careBefore = new Map<string, unknown[]>();
    for (const table of careTables)
      careBefore.set(
        table,
        (await source.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
      );
    assert(
      (careBefore.get("care_runs")?.length ?? 0) > 0 &&
        (careBefore.get("care_pauses")?.length ?? 0) > 0,
      "Care fixtures phải có Dry Run và pause history.",
    );
    run("backup", "--test");
    await source.query(`CREATE DATABASE "${targetName}"`);
    target = new Pool({ connectionString: targetUrl.toString(), max: 1 });
    assert(
      run("restore", "--test", `--target=${targetName}`).includes(
        "Đã khôi phục",
      ),
    );
    const after = (
      await target.query(
        "SELECT id, email, password_hash, role FROM users ORDER BY id",
      )
    ).rows;
    assert.deepEqual(after, before);
    for (const table of careTables)
      assert.deepEqual(
        (await target.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
        careBefore.get(table),
      );
    assert.deepEqual((await target.query(bulkSql)).rows, bulkBefore);
    assert.deepEqual((await target.query(lineageSql)).rows, lineageBefore);
    assert.deepEqual((await target.query(adsSql)).rows, adsBefore);
    assert.deepEqual((await target.query(publishSql)).rows, publishBefore);
    assert.deepEqual((await target.query(videoSql)).rows, videosBefore);
    assert.deepEqual((await target.query(analyticsSql)).rows, insightsBefore);
    assert.deepEqual((await target.query(policySql)).rows, policiesBefore);
    assert.deepEqual(
      (
        await target.query(
          "SELECT id, sub_id, amount, currency, status, tracking_id FROM commission_rows ORDER BY id",
        )
      ).rows,
      shopeeBefore,
    );
    assert.deepEqual(
      (
        await target.query(
          "SELECT id,tracking_id,version,url FROM tracking_link_versions ORDER BY id",
        )
      ).rows,
      linksBefore,
    );
    assert.equal(
      (
        await target.query(
          "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
        )
      ).rows[0].count,
      JSON.parse(readFileSync("migrations/meta/_journal.json", "utf8")).entries
        .length,
    );
    assert(
      run("restore", "--test", `--target=${targetName}`).includes(
        "bỏ qua restore",
      ),
    );
  } finally {
    if (target) {
      await target.end();
      await source.query(`DROP DATABASE "${targetName}"`);
    }
    await source.end();
  }
});
