import { test } from "node:test";
import assert from "node:assert/strict";
import { MetaGateway } from "../../src/server/meta/gateway";
import { AppError } from "../../src/server/http/errors";

test("All Meta writes fail closed before config parsing or fetch unless explicitly unlocked", async () => {
  const previous = { DRY_RUN: process.env.DRY_RUN, META_WRITES_ENABLED: process.env.META_WRITES_ENABLED };
  let calls = 0;
  const gateway = new MetaGateway(async () => { calls++; return Response.json({ success: true }); });
  try {
    for (const [dryRun, enabled] of [
      [undefined, undefined], ["true", "true"], ["false", undefined],
      ["false", "false"], ["FALSE", "true"], [undefined, "true"],
    ]) {
      if (dryRun === undefined) delete process.env.DRY_RUN;
      else process.env.DRY_RUN = dryRun;
      if (enabled === undefined) delete process.env.META_WRITES_ENABLED;
      else process.env.META_WRITES_ENABLED = enabled;
      for (const action of [
        () => gateway.publisherWrite("fixture", "123/videos", {}),
        () => gateway.publisherWrite("fixture", "123_456/comments", {}),
        () => gateway.adsWrite("fixture", "123", "campaigns", { status: "PAUSED" }),
        () => gateway.adsWrite("fixture", "123", "adsets", {}),
        () => gateway.adsWrite("fixture", "123", "adcreatives", {}),
        () => gateway.adsWrite("fixture", "123", "ads", {}),
        () => gateway.adsPause("fixture", "456"),
      ]) await assert.rejects(action, (e: unknown) => e instanceof AppError && e.code === "META_WRITES_LOCKED");
    }
    assert.equal(calls, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("DRY_RUN permits read-only Meta and OAuth fixture responses", async () => {
  const previous = { ...Object.fromEntries([
    "DRY_RUN", "META_WRITES_ENABLED", "META_APP_ID", "META_APP_SECRET",
    "META_GRAPH_VERSION", "APP_ORIGIN", "META_REDIRECT_URI",
  ].map(key => [key, process.env[key]])) };
  Object.assign(process.env, {
    DRY_RUN: "true", META_WRITES_ENABLED: "false", META_APP_ID: "123",
    META_APP_SECRET: "fixture-secret", META_GRAPH_VERSION: "v25.0",
    APP_ORIGIN: "https://fixture.example",
    META_REDIRECT_URI: "https://fixture.example/api/meta/callback",
  });
  let calls = 0;
  try {
    const gateway = new MetaGateway(async (_url, init) => {
      calls++;
      assert.notEqual(init?.method, "POST");
      return Response.json({ access_token: "fixture-token", expires_in: 60, id: "123" });
    });
    assert.equal((await gateway.adsRead("fixture", "123", ["id"])).id, "123");
    assert.equal((await gateway.exchange("fixture-code")).token, "fixture-token");
    assert.equal(calls, 2);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
