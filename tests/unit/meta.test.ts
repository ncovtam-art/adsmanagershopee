import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "../../src/server/meta/crypto";
import { MetaGateway, metaConfig } from "../../src/server/meta/gateway";
import { MockMetaProvider, MOCK_IDS } from "../../src/server/meta/mock";
import { normalize, sanitizeSnapshot } from "../../src/server/donors/normalize";
import {
  donorInput,
  parseAdsManagerUrl,
} from "../../src/server/donors/service";
import { parseMetaReport } from "../../src/server/meta/import";
import { AppError } from "../../src/server/http/errors";
const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.code === expected;
process.env.META_APP_ID = "123456";
process.env.META_APP_SECRET = randomBytes(24).toString("hex");
process.env.META_GRAPH_VERSION = "v25.0";
process.env.APP_ORIGIN = "https://command.example";
process.env.META_REDIRECT_URI = "https://command.example/api/meta/callback";
const response = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
function fetcher(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  return (async (url, init) =>
    handler(new URL(String(url)), init)) as typeof fetch;
}
test("AES-GCM: nonce riêng, round-trip và chặn sửa ciphertext/khóa sai", () => {
  const key = randomBytes(32),
    token = randomBytes(24).toString("hex"),
    a = seal(token, key),
    b = seal(token, key);
  assert.notEqual(a, b);
  assert(!a.includes(token));
  assert.equal(unseal(a, key), token);
  assert.throws(() => unseal(a, randomBytes(32)), code("TOKEN_UNREADABLE"));
  const parts = a.split(".");
  parts[2] = "0".repeat(32);
  assert.throws(() => unseal(parts.join("."), key), code("TOKEN_UNREADABLE"));
});
test("Meta config chặn redirect khác origin và đường dẫn", () => {
  const previous = process.env.META_REDIRECT_URI;
  process.env.META_REDIRECT_URI = "https://attacker.example/api/meta/callback";
  assert.throws(metaConfig, code("META_REDIRECT"));
  process.env.META_REDIRECT_URI = previous;
  assert.equal(metaConfig().version, "v25.0");
});
test("Gateway phân trang bằng cursor, không follow URL ngoại, token chỉ ở Authorization", async () => {
  const visited: URL[] = [];
  const gateway = new MetaGateway(
    fetcher((url, init) => {
      visited.push(url);
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-token",
      );
      assert(!url.searchParams.has("access_token"));
      return visited.length === 1
        ? response({
            data: [{ id: "1" }],
            paging: {
              next: "https://attacker.example/?access_token=leak",
              cursors: { after: "cursor-2" },
            },
          })
        : response({ data: [{ id: "2" }] });
    }),
  );
  assert.deepEqual(await gateway.list("me/accounts", "test-token"), [
    { id: "1" },
    { id: "2" },
  ]);
  assert(visited.every((url) => url.hostname === "graph.facebook.com"));
  assert.equal(visited[1].searchParams.get("after"), "cursor-2");
});
test("Gateway chặn cursor lặp, không trả danh sách thiếu", async () => {
  const gateway = new MetaGateway(
    fetcher(() =>
      response({
        data: [],
        paging: {
          next: "https://graph.facebook.com/next",
          cursors: { after: "same" },
        },
      }),
    ),
  );
  await assert.rejects(
    gateway.list("me/accounts", "test"),
    code("META_PAGINATION"),
  );
});
test("Rate limit dùng phản hồi Meta, không retry liên tục, không lộ lỗi/token", async () => {
  let calls = 0;
  const gateway = new MetaGateway(
    fetcher(() => {
      calls++;
      return response({ error: { code: 4, message: "secret-token" } }, 429, {
        "Retry-After": "7",
        "x-app-usage": '{"call_count":99}',
      });
    }),
  );
  await assert.rejects(
    gateway.read("test", MOCK_IDS.ad, ["id"]),
    (error) =>
      code("META_RATE_LIMIT")(error) && (error as AppError).retryAfter === 7,
  );
  await assert.rejects(
    gateway.read("test", MOCK_IDS.ad, ["id"]),
    code("META_RATE_LIMIT"),
  );
  assert.equal(calls, 1);
  assert.deepEqual(gateway.usage["x-app-usage"], { call_count: 99 });
});
test("Gateway lỗi hết hạn/thiếu quyền có hướng dẫn riêng và không trả raw message", async () => {
  for (const [metaCode, expected] of [
    [190, "META_TOKEN_EXPIRED"],
    [200, "META_PERMISSION"],
  ] as const) {
    const gateway = new MetaGateway(
      fetcher(() =>
        response({ error: { code: metaCode, message: "secret" } }, 400),
      ),
    );
    await assert.rejects(
      gateway.read("test", MOCK_IDS.ad, ["id"]),
      (error) =>
        code(expected)(error) && !(error as Error).message.includes("secret"),
    );
  }
});
test("Gateway retry giới hạn cho lỗi transient và giữ usage", async () => {
  let calls = 0,
    waits = 0;
  const gateway = new MetaGateway(
    fetcher(() =>
      ++calls < 3
        ? response({ error: { is_transient: true } }, 503)
        : response({ id: MOCK_IDS.ad }),
    ),
    async () => {
      waits++;
    },
  );
  assert.equal(
    (await gateway.read("test", MOCK_IDS.ad, ["id"])).id,
    MOCK_IDS.ad,
  );
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});
test("Donor normalization loại source IDs, schedule, pixel, audience, trạng thái ACTIVE", async () => {
  const mock = new MockMetaProvider();
  const snapshot = {
    campaign: await mock.read("", MOCK_IDS.campaign, []),
    adSet: await mock.read("", MOCK_IDS.adSet, []),
    ad: await mock.read("", MOCK_IDS.ad, []),
    creative: await mock.read("", MOCK_IDS.creative, []),
  };
  const { normalized, warnings } = normalize(snapshot);
  const json = JSON.stringify(normalized);
  for (const forbidden of [
    "old-pixel",
    "old-audience",
    "old-identity",
    "start_time",
    "ACTIVE",
    MOCK_IDS.creative,
    MOCK_IDS.ad,
    MOCK_IDS.account,
    "example.com",
  ]) {
    assert(!json.includes(forbidden), forbidden);
  }
  assert.equal(normalized.adSet.daily_budget, "150000");
  assert.equal(normalized.creative.cta, "LEARN_MORE");
  assert(warnings.some((v) => v.includes("unavailable")));
});
test("Snapshot lọc token, app secret, credential URL và thông tin liên hệ", () => {
  const value = sanitizeSnapshot({
    id: MOCK_IDS.ad,
    access_token: "bad",
    nested: {
      app_secret: "bad",
      email: "bad",
      authorization: "bad",
      url: "https://user:password@example.com/p?access_token=bad&product=1",
    },
  });
  const json = JSON.stringify(value);
  assert(!json.includes("bad"));
  assert(!json.includes("password"));
  assert(json.includes(MOCK_IDS.ad));
  assert(json.includes("product=1"));
});
test("Form giữ ID vượt Number.MAX_SAFE_INTEGER, từ chối số và URL không chính thức", () => {
  const input = {
    name: "Donor Test",
    accountId: "d8f943cb-53f0-4c50-946e-3392a49df431",
    campaignId: "",
    adSetId: "",
    adId: MOCK_IDS.ad,
  };
  assert.equal(donorInput.parse(input).adId, MOCK_IDS.ad);
  assert.throws(() =>
    donorInput.parse({ ...input, adId: Number(MOCK_IDS.ad) }),
  );
  assert.throws(
    () => parseAdsManagerUrl("https://attacker.example/?selected_ad_ids=123"),
    code("ADS_URL"),
  );
  assert.equal(
    parseAdsManagerUrl(
      `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${MOCK_IDS.ad}`,
    ).adId,
    MOCK_IDS.ad,
  );
  assert.throws(
    () =>
      parseAdsManagerUrl(
        "https://adsmanager.facebook.com/?selected_ad_ids=1,2",
      ),
    code("ADS_URL"),
  );
});
test("Import CSV tính tiền chính xác BigInt, giữ ID lớn và canonical chống trùng", async () => {
  const a = await parseMetaReport(
    Buffer.from(
      `account_id,date,currency,spend\n${MOCK_IDS.account},2026-01-01,USD,0.1\n${MOCK_IDS.account},2026-01-02,USD,0.2`,
    ),
    "report.csv",
  );
  const b = await parseMetaReport(
    Buffer.from(
      `account_id,date,currency,spend\n${MOCK_IDS.account},2026-01-02,USD,0.20\n${MOCK_IDS.account},2026-01-01,USD,0.10`,
    ),
    "report.csv",
  );
  assert.equal(a.total, "0.30");
  assert.equal(a.rows[0].accountId, MOCK_IDS.account);
  assert.equal(a.fingerprint, b.fingerprint);
});
test("Import chặn mixed currency, dòng trùng, số âm/ngày sai/format sai/tệp quá lớn", async () => {
  const head = "account_id,date,currency,spend\n";
  for (const body of [
    "123,2026-01-01,USD,1\n123,2026-01-02,VND,1",
    "123,2026-01-01,USD,1\n123,2026-01-01,USD,1",
    "123,2026-01-01,USD,-1",
    "123,2026-02-30,USD,1",
  ]) {
    await assert.rejects(
      parseMetaReport(Buffer.from(head + body), "report.csv"),
    );
  }
  await assert.rejects(
    parseMetaReport(Buffer.alloc(2 * 1024 * 1024 + 1), "report.csv"),
    code("IMPORT_SIZE"),
  );
  await assert.rejects(
    parseMetaReport(Buffer.from("{}"), "report.json"),
    code("IMPORT_FORMAT"),
  );
});

test("Read cache tách token, gộp yêu cầu giống nhau và không bị caller mutate", async () => {
  let calls = 0;
  const gateway = new MetaGateway(
    fetcher(() => {
      calls++;
      return response({ id: MOCK_IDS.ad });
    }),
  );
  const [a] = await Promise.all([
    gateway.read("a", MOCK_IDS.ad, ["id"]),
    gateway.read("a", MOCK_IDS.ad, ["id"]),
  ]);
  assert.equal(calls, 1);
  a.id = "changed";
  assert.equal((await gateway.read("a", MOCK_IDS.ad, ["id"])).id, MOCK_IDS.ad);
  await gateway.read("b", MOCK_IDS.ad, ["id"]);
  assert.equal(calls, 2);
  gateway.invalidateReads();
  await gateway.read("a", MOCK_IDS.ad, ["id"]);
  assert.equal(calls, 3);
});

test("Import XLSX thực tế giữ string ID/tiền và chặn archive giải nén quá lớn", async () => {
  const buffer = readFileSync("tests/fixtures/meta-report.xlsx");
  const result = await parseMetaReport(buffer, "report.xlsx");
  assert.equal(result.total, "0.30");
  assert.equal(result.rows[0].accountId, MOCK_IDS.account);
  const unsafe = Buffer.from(buffer);
  for (let i = 0; i + 46 < unsafe.length; i++) {
    if (unsafe.readUInt32LE(i) === 0x02014b50) {
      unsafe.writeUInt32LE(30 * 1024 * 1024, i + 24);
      break;
    }
  }
  await assert.rejects(
    parseMetaReport(unsafe, "large.xlsx"),
    code("IMPORT_EXPANSION"),
  );
});

test("Import chặn header prototype/duplicate/extra trước khi tạo row objects", async () => {
  for (const header of [
    "__proto__,date,currency,spend",
    "account_id,date,date,spend",
    "account_id,date,currency,spend,password",
  ]) {
    await assert.rejects(
      parseMetaReport(
        Buffer.from(header + "\n123,2026-01-01,USD,1,bad"),
        "bad.csv",
      ),
      code("IMPORT_HEADERS"),
    );
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("XLSX chặn ZIP bomb dù central directory khai báo kích thước giả", async () => {
  await assert.rejects(
    parseMetaReport(
      readFileSync("tests/fixtures/meta-expansion.xlsx"),
      "bomb.xlsx",
    ),
    code("IMPORT_EXPANSION"),
  );
});
