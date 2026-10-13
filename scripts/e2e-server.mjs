import { spawn } from "node:child_process";
const target = process.env.TEST_DATABASE_URL;
if (
  !target ||
  !new URL(target).pathname.endsWith("_test") ||
  new URL(target).pathname === new URL(process.env.DATABASE_URL).pathname
)
  throw new Error("E2E cần Database riêng kết thúc bằng _test.");
const env = {
  ...process.env,
  DATABASE_URL: target,
  APP_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: "false",
  META_MOCK_ENABLED: "true",
  VIDEO_STORAGE_DIR: process.cwd() + "/.cache/e2e-video-storage",
  PUBLISHER_TEST_MODE: "true",
  ADS_TEST_MODE: "true",
  CARE_POLL_SECONDS: "2",
};
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  { stdio: "inherit", env },
);
const publisher = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/publisher-worker.ts"],
  { stdio: "inherit", env },
);
const ads = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/ads-worker.ts"],
  { stdio: "inherit", env },
);
const care = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/care-worker.ts"],
  { stdio: "inherit", env },
);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    server.kill(signal);
    publisher.kill(signal);
    ads.kill(signal);
    care.kill(signal);
  });
server.on("exit", (code) => {
  publisher.kill("SIGTERM");
  ads.kill("SIGTERM");
  care.kill("SIGTERM");
  process.exitCode = code ?? 1;
});
publisher.on("exit", (code) => {
  if (!stopping && code !== 0) {
    console.error("Publisher E2E worker thất bại.");
    server.kill("SIGTERM");
    process.exitCode = 1;
  }
});

ads.on("exit", (code) => {
  if (!stopping && code !== 0) {
    server.kill("SIGTERM");
    publisher.kill("SIGTERM");
    process.exitCode = 1;
  }
});

care.on("exit", (code) => {
  if (!stopping && code !== 0) {
    server.kill("SIGTERM");
    publisher.kill("SIGTERM");
    ads.kill("SIGTERM");
    process.exitCode = 1;
  }
});
