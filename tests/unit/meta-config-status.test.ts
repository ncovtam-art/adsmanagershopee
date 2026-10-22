import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metaConfigurationIssues } from "../../src/server/meta/config-status";

const fixture = () => ({
  APP_ORIGIN: "https://workspace-3000.app.github.dev",
  META_REDIRECT_URI: "https://workspace-3000.app.github.dev/api/meta/callback",
  META_APP_ID: "123456",
  META_APP_SECRET: "fixture-only-not-a-live-secret",
  META_GRAPH_VERSION: "v25.0",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
});

test("Committed template leaves Meta secret and encryption key empty", () => {
  const template = readFileSync(".env.example", "utf8");
  for (const name of ["META_APP_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
    const line = template.match(new RegExp("^" + name + "=(.*)$", "m"));
    assert(Boolean(line && line[1].trim() === ""), "Template credential fields must be empty");
  }
});

test("Meta diagnostics accept exact HTTPS Codespaces config without remote calls", () => {
  assert.deepEqual(metaConfigurationIssues(fixture()), []);
});

test("Missing configuration identifies every required field, without values", () => {
  const issues = metaConfigurationIssues({});
  assert.deepEqual(new Set(issues.map(i => i.name)), new Set(Object.keys(fixture())));
  assert(issues.every(i => i.status === "MISSING"));
});

test("Diagnostics distinguish invalid graph version, origin, callback and encryption key", () => {
  const issues = metaConfigurationIssues({
    ...fixture(),
    META_GRAPH_VERSION: "25.0",
    APP_ORIGIN: fixture().APP_ORIGIN + "/",
    META_REDIRECT_URI: "https://another.example/api/meta/callback",
    TOKEN_ENCRYPTION_KEY: "EAA-fixture-facebook-token-not-an-encryption-key",
  });
  assert.deepEqual(issues.map(i => i.name), [
    "META_GRAPH_VERSION", "APP_ORIGIN", "META_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY",
  ]);
  assert(issues.every(i => i.status === "INVALID"));
});

test("Malformed URLs, whitespace secret and nonnumeric App ID fail closed without reflection", () => {
  const env = {
    ...fixture(),
    META_APP_ID: "sensitive-fixture-app-value",
    META_APP_SECRET: "   ",
    APP_ORIGIN: "sensitive-fixture-origin",
    META_REDIRECT_URI: "sensitive-fixture-callback",
    TOKEN_ENCRYPTION_KEY: "sensitive-fixture-key",
  };
  const issues = metaConfigurationIssues(env);
  const serialized = JSON.stringify(issues);
  assert.equal(issues.length, 5);
  for (const name of ["META_APP_ID", "APP_ORIGIN", "META_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY"] as const)
    assert(!serialized.includes(env[name]));
  assert(!serialized.includes(fixture().META_APP_SECRET));
});

test("Only local loopback origins may use HTTP; wrong callback paths are rejected", () => {
  assert.deepEqual(metaConfigurationIssues({
    ...fixture(), APP_ORIGIN: "http://localhost:3000",
    META_REDIRECT_URI: "http://localhost:3000/api/meta/callback",
  }), []);
  assert(metaConfigurationIssues({
    ...fixture(), APP_ORIGIN: "http://public.example",
    META_REDIRECT_URI: "http://public.example/api/meta/callback",
  }).some(i => i.name === "APP_ORIGIN"));
  assert(metaConfigurationIssues({
    ...fixture(), META_REDIRECT_URI: fixture().APP_ORIGIN + "/other",
  }).some(i => i.name === "META_REDIRECT_URI"));
});
