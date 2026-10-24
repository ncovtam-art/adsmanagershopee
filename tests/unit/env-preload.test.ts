import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("CLI preloader uses Next development precedence before application imports", async () => {
  const cwd = process.cwd();
  const preload = pathToFileURL(resolve("scripts/load-env.mjs")).href;
  const dir = mkdtempSync(join(tmpdir(), "aacc-env-fixture-"));
  const names = ["NODE_ENV", "AACC_FIXTURE_PROCESS", "AACC_FIXTURE_DEV_LOCAL", "AACC_FIXTURE_LOCAL", "AACC_FIXTURE_DEV", "AACC_FIXTURE_BASE", "AACC_FIXTURE_EXAMPLE", "__NEXT_PROCESSED_ENV"];
  const previous = Object.fromEntries(names.map(n => [n, process.env[n]]));
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.AACC_FIXTURE_PROCESS = "process";
    writeFileSync(join(dir, ".env"), "AACC_FIXTURE_PROCESS=base\nAACC_FIXTURE_DEV_LOCAL=base\nAACC_FIXTURE_LOCAL=base\nAACC_FIXTURE_DEV=base\nAACC_FIXTURE_BASE=base\n");
    writeFileSync(join(dir, ".env.development"), "AACC_FIXTURE_DEV=development\nAACC_FIXTURE_LOCAL=development\n");
    writeFileSync(join(dir, ".env.local"), "AACC_FIXTURE_LOCAL=local\nAACC_FIXTURE_DEV_LOCAL=local\n");
    writeFileSync(join(dir, ".env.development.local"), "AACC_FIXTURE_DEV_LOCAL=development-local\nAACC_FIXTURE_PROCESS=file\n");
    writeFileSync(join(dir, ".env.example"), "AACC_FIXTURE_EXAMPLE=must-not-load\n");
    process.chdir(dir);
    await import(preload);
    assert.equal(process.env.AACC_FIXTURE_PROCESS, "process");
    assert.equal(process.env.AACC_FIXTURE_DEV_LOCAL, "development-local");
    assert.equal(process.env.AACC_FIXTURE_LOCAL, "local");
    assert.equal(process.env.AACC_FIXTURE_DEV, "development");
    assert.equal(process.env.AACC_FIXTURE_BASE, "base");
    assert.equal(process.env.AACC_FIXTURE_EXAMPLE, undefined);
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
