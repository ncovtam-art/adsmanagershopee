# Kiểm chứng hiện tại — Giai đoạn 1–5

**136 tests PASS**: 45 unit, 66 PostgreSQL integration, 25 Chromium E2E; không skipped/cancelled/todo. Typecheck, lint (không warning), production build PASS; migration 4/4, 25 tables; backup/restore bao gồm Insights/recognition policy/hoa hồng/link versions; runtime audit 0. Chi tiết Giai đoạn 5 ở cuối file. Các phần 1–4 bên dưới giữ làm lịch sử nghiệm thu.

# Kết quả kiểm chứng Giai đoạn 1–3

## Lượt kiểm tra cuối trên mã hiện tại

| Kiểm tra                                                                                  | Kết quả    | Phạm vi                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                                       | PASS       | TypeScript strict, gồm services/UI/tests mới                                                                                                                             |
| `npm run lint`                                                                            | PASS       | Không có lỗi hoặc warning ESLint                                                                                                                                         |
| `npm test`                                                                                | 27/27 PASS | Auth/security nền tảng + AES-GCM, Meta pagination/authorization/retry/rate/cache, normalization/sanitization/ID string, CSV Decimal/headers và XLSX thật/ZIP bomb        |
| `npm run test:integration`                                                                | 33/33 PASS | PostgreSQL thật: 14 Foundation cases + 18 Meta/Donor cases + 1 backup/restore; state, mapping, grants, FK/CHECK, versions append-only, source đổi/unavailable/permission |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`                  | 15/15 PASS | 9 hồi quy Foundation + 6 Page/Meta/Donor/import/scope/desktop/mobile cases trên bản production build                                                                     |
| `npm run build`                                                                           | PASS       | Routes Page/Account/Meta/Donor được build đầy đủ; XLSX Node parser dùng serverExternalPackages                                                                           |
| `npm run db:status` và `-- --test`                                                        | PASS       | 2/2 migration; không pending, không reset                                                                                                                                |
| Script install đầy đủ `npm ci` → env/init → db/up/restore/migrate/status → build → backup | PASS       | Lockfile khớp, giữ `.env`, restore bỏ qua Database có bảng, áp dụng lại không phá dữ liệu                                                                                |
| `npm audit --omit=dev`                                                                    | PASS       | 0 lỗ hổng runtime được báo ở lượt cuối; không thay thế security review production                                                                                        |
| Instance development chạy production build                                                | PASS       | Health 200/PostgreSQL connected, login 200; team/Meta/Donor 401 khi chưa đăng nhập                                                                                       |

Tổng cộng **75 tests PASS**, không skipped/cancelled/todo. Test fixtures chỉ ở PostgreSQL `_test`, không đưa vào Database development. Trước/sau setup đã kiểm tra Database development: users=0, pages=0, donors=0; cần chạy `npm run owner:create` ở terminal riêng để tạo tài khoản của bạn. Chưa có credentials mặc định hoặc tài khoản OWNER demo.

Các lỗi phát hiện và đã xử lý:

- Build XLSX vướng nhánh AWS S3 tùy chọn trong unzipper khi webpack bundle; dùng external Node package cho read-excel-file, không cài AWS SDK không cần thiết. Import XLSX thực tế được kiểm thử cả unit và UI.
- ESLint kiểm tra setState-in-effect: chuyển việc khởi tạo state sang callback fetch, không tắt rules.
- Selector Playwright `getByLabel` exact không tìm được select có option nằm trong label. Đã chẩn đoán bằng trình duyệt: labelCount=0, roleCount=1 và options đầy đủ. Dùng combobox theo ARIA name và assertion tự đợi đủ options; không bỏ assertion. Form Workspace cũng đợi đồng thời Page/TKQC và được remount theo Page ID.
- Lượt diagnostic để lại tiến trình riêng ở cổng test; đã xác định PID do mình khởi động, dừng bằng SIGTERM và chạy lại suite, không bật reuseExistingServer.
- Audit parser CSV ban đầu báo GHSA-8cw4-87c7-c6xx. Đã nâng csv-parse lên 7.0.3, validate header trước tạo row objects và chạy lại checks. Không có cảnh báo runtime ở lượt cuối.

Backup/restore đã đối chiếu user/password hash/role và toàn bộ lịch sử migration trong Database test mới; restore lại không ghi đè. Version Donor có trigger chặn UPDATE/DELETE; kiểm thử trên PostgreSQL thật. API save Donor không nhận template từ client, đọc nguồn lại và kiểm fingerprint. Không có Meta/Shopee/Ads/Page mutation thật được thực hiện.

## Files được bổ sung/thay đổi trong Giai đoạn 2–3

- Backend mới: `src/server/meta/{gateway,service,crypto,access,mock,import,types}.ts`; `src/server/donors/{service,normalize}.ts`.
- Schema mới: `src/server/database/schema.ts`, `migrations/0001_daffy_preak.sql`, migration metadata; giữ nguyên migration 0000 đã áp dụng.
- API mới: `src/app/api/meta` (start/callback/mock/refresh/complete/grants/import), `pages`, `ad-accounts`, `donors` (preview/detail/save).
- UI mới: `src/components/meta`, routes `src/app/(workspace)/pages`, `pages/[id]`, `ads`. Cập nhật tab Meta, overview/sidebar trạng thái và CSS, giữ sáu menu.
- Tích hợp nền tảng: `services.ts`, policy thêm quyền Meta/Donor; HTTP AppError/Retry-After hỗ trợ cooldown Meta; System Health cấu hình thật. Không viết lại auth/team/session/settings đang hoạt động.
- Runtime: package/lockfile (csv-parse, read-excel-file), next.config.ts external Node parser, .env.example, init-env thêm khóa cục bộ nếu thiếu, E2E server bật Mock chỉ trên Database test.
- Tests: `tests/unit/meta.test.ts`, `tests/integration/meta-donors.test.ts`, `tests/e2e/meta-donors.spec.ts`, XLSX fixtures; cập nhật schema-count/migration-count và trạng thái module trong hồi quy Foundation.
- Docs: README, IMPLEMENTATION_PLAN, ARCHITECTURE, DATABASE, META_CONNECTION, ADS_DONOR, DEPLOYMENT, TROUBLESHOOTING và file kiểm chứng này. Giữ đặc tả gốc docs/SPECIFICATION.md.

Ảnh/traces nằm trong `artifacts/`, `test-results/`, `playwright-report/` được ignore. Đã xem ảnh Page Workspace desktop và Donor preview mobile: nhãn thử nghiệm, quyền/history/versions rõ, không tràn màn hình. Mọi tên/dữ liệu trong ảnh là fixture E2E.

Checkout có toàn bộ source mới từ Giai đoạn 1 và phần bổ sung này; nhánh local `work` chưa có commit. `git ls-remote origin HEAD refs/heads/main` không trả ref. Chưa commit/push trong yêu cầu này; source không bị xóa/reset. `.env`, Database dumps, credentials, artifacts và node_modules không nằm trong source review.

## Cấu hình và giới hạn

Đã lưu network custom domains `graph.facebook.com`, `www.facebook.com`, `developers.facebook.com` cùng tên biến Meta App, không giá trị credentials. Giữ network presets/package-manager domains. Install/start instructions cập nhật cho Giai đoạn 1–3 và giữ checkpoint Database/khóa mã hóa. Saving draft không apply runtime/restart/Publish; người dùng cần review/lưu trong environment settings rồi Publish. Chưa kiểm chứng khôi phục trong cloud task mới.

Current instance có Web App chạy, Mock bật rõ cho kiểm tra UI; Database development chưa có user hoặc dữ liệu mock. Giá trị mặc định/suggested của cấu hình reusable vẫn META_MOCK_ENABLED=false. Live processes phải được khởi động lại sau snapshot.

**Chưa kiểm chứng LIVE OAuth/Marketing API/đọc Donor thật**: chưa có Meta App ID/Secret/Graph version/Redirect URI/quyền phù hợp. Tài liệu developers.facebook.com bị proxy chặn trong phiên; SDK chính thức trên GitHub đọc được và được đối chiếu field/endpoint. Domain draft save không chứng minh egress runtime đã đổi. Token health dựa expiry/scopes/tasks/lần đọc thành công gần nhất; chưa gọi debug_token hoặc thực hiện publish/ads create để thử quyền. Không có distributed rate limiter/auto refresh nền; chưa có avatar Page thật.

Import chỉ nhận schema mẫu CSV/XLSX và lưu batch riêng, chưa tự map mọi export Ads Manager hoặc hợp nhất báo cáo chồng ngày vào Analytics. Donor normalization có allowlist hẹp/cảnh báo unavailable; targeting nâng cao, identity, schedule, pixel/audience/tracking cần chọn và kiểm compatibility lại trước tạo Ads ở Giai đoạn 7. Chưa có Ads Application nên chưa có FK ứng dụng tới donor_version.

Giai đoạn 4–10 còn trong kế hoạch: Shopee tracking, commission reconciliation/attribution/ROAS, Video/Queue, tạo Ads PAUSED, Bulk/Clone/Care/Telegram và production hardening. Chưa tuyên bố production-ready, kiểm tra tải, recovery/MFA hoặc hoàn tất tất cả finance/module scopes.

## Kiểm chứng bổ sung Giai đoạn 4 (mã hiện tại)

Giai đoạn 4 đã triển khai; phần Giai đoạn 1–3 ở trên là lịch sử nghiệm thu, các giới hạn Shopee chưa có trong phần cũ được thay thế bởi SHOPEE_WORKFLOW.md và COMMISSION_RECONCILIATION.md.

| Kiểm tra cuối              | Kết quả                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict / ESLint | PASS, không lỗi/warning                                                                                                 |
| Unit                       | 38/38 PASS (27 cũ + 11 Shopee)                                                                                          |
| PostgreSQL integration     | 46/46 PASS (32 Foundation/Meta/Donor + 13 Shopee + 1 backup/restore)                                                    |
| Chromium E2E               | 21/21 PASS (15 hồi quy + 6 Shopee desktop/mobile)                                                                       |
| Production build           | PASS, routes products/tracking/links/commissions/revenue đầy đủ                                                         |
| Migration                  | 3/3 development và test, không pending; áp dụng lại giữ dữ liệu                                                         |
| Runtime audit              | 0 lỗ hổng được báo; dependencies/lockfile không đổi trong Giai đoạn 4                                                   |
| Backup/restore             | PASS; đối chiếu users, migration, commission Decimal/status/mapping và link versions; restore lại skip Database có bảng |

**105 tests PASS**, không skipped/cancelled/todo. Lượt E2E cuối chạy trên mã sau guard source/filter và xử lý lịch sử URL dùng chung. Test file persistence đổi thành zz-persistence.test.ts để fixture Shopee tồn tại trước backup. Development users/products/tracking/commissions đều 0 sau tests; không seed dữ liệu thử nghiệm vào môi trường của người dùng.

Test coverage mới: URL validation/SubID uniqueness/CSV formula safety/UTF-8 và UTF-16 BOM/aliases/delimiter/money locale/date UTC/status unknown; bulk links đảo thứ tự và rollback; Page/account/finance RBAC; preview chưa ghi ledger/encrypted RAW/file fingerprint/commit replay; hai item cùng Order; update/stale/history; đổi từ Order Item sang Row ID không tạo thêm dòng; dates không mất khi report thiếu cột; Unmatched/manual audit/review; Shared link lịch sử không tự nâng attribution sau khi đổi URL; tách LIVE/MOCK/currency.

Lỗi kiểm thử ban đầu đã sửa: kiểu response commit duplicate thiếu counter fields trong inference; E2E selector global role=status trùng hai live regions của Import và Mapping (scoped đúng thông báo, không bỏ assertion). Bảng mobile được đổi sang scroll trong container để số tiền/ID không bị chia thành nhiều dòng; kiểm tra document không tràn viewport. Ảnh cuối trong artifacts/shopee-links-desktop.png, shopee-reconciliation-desktop.png, shopee-commission-mobile.png; đều dùng fixture E2E.

Files mới: src/server/shopee/{validation,csv,tracking,commissions,link-ambiguity}.ts, src/server/http/upload.ts, src/components/shopee, src/app/api/products/shopee/commissions, src/app/(workspace)/revenue/page.tsx, migrations/0002_nebulous_giant_girl.sql + metadata, tests/unit/shopee.test.ts, tests/integration/shopee.test.ts, tests/e2e/shopee.spec.ts. Cập nhật schema/services/policy, Page Workspace/Settings/Overview/sidebar/System Health, CSS và các tài liệu module/kế hoạch. Foundation/Meta/Donor được tái sử dụng; không viết lại các chức năng đã hoạt động.

Không nhận API Custom Link Shopee, không gọi Shopee/Meta mutation. URL được user xác nhận, chưa được Shopee độc lập xác minh; chưa thử file export Shopee thật của người dùng. CSV có column mapping rõ, unknown/unstable vào review thay vì giả dữ liệu. Không ROAS/profit/Meta spend ở giai đoạn này. Video FK/Publisher và Ads create còn ở giai đoạn sau. Limits UI hiện 1.000 tracking records gần nhất/30 batches/100 reviews; throughput/SQL aggregation/retention lớn còn cần hardening. Source chưa commit/push, môi trường chưa Publish hoặc kiểm chứng restore task mới.

# Giai đoạn 5 — Ads Analytics & ROAS

Lượt cuối trên bản production build:

| Kiểm tra | Kết quả | Bằng chứng/phạm vi |
| --- | --- | --- |
| Typecheck / lint / build | PASS | TypeScript strict, ESLint không lỗi/warning, routes Analytics được build |
| Unit | 45/45 | 7 Analytics tests + 38 hồi quy: Decimal/negative fractions/large values, date/timezone, strict CSV/dimensions/duplicate/headers, Graph daily Ad level/actions/status/host paging |
| PostgreSQL integration | 66/66 | 20 Analytics + 45 hồi quy + 1 backup/restore; scopes, idempotency/replace, preview, raw encryption, cohort/status/OtherCosts, zero/currency/freshness/Unmatched/manual/shared/lifetime, concurrent worker claim |
| Chromium E2E | 25/25 | 4 Analytics + 21 hồi quy: Insights/policy/KPI, hierarchy/drilldown/reach/columns/export/views/source switch, CSV preview/replace/repeat, mobile no document overflow, Viewer/CSRF |
| Database | 4/4 | Additive 0003; rerun migration không reset; 25 tables, provider/state/nonnegative checks/unique/FKs |
| Backup/restore | PASS | Database test mới: đối chiếu spend/counts/provider/currency/timezone, recognition policy, commission trạng thái/tiền/mapping, link versions/users/migration; restore lần 2 skip |
| Runtime | PASS | Web 3000 health/login 200; Analytics/accounts/policy/history/export 401 trước login; worker --once, start/stop/start; app DB users/tracking/commissions/insight_ads =0 |
| Runtime audit | 0 | npm audit --omit=dev không báo vulnerabilities |

Các lỗi được kiểm thử phát hiện và sửa: Zod refined schema dùng safeExtend; CSV fingerprint phải canonical hoá riêng since/until, không hash flags complete/replace khác giữa preview/commit; ngày không có commission evidence để —; snapshot đổi currency/timezone bị chặn; negative fractional UI giữ dấu âm; layout grid/table min-width ngăn mobile overflow. E2E fixture phải chọn rõ TKQC VND và restore Page mapping từ bài trước, logout trước login Viewer, dùng Chromium đã cài. Không xoá assertion nghiệp vụ hoặc skip test để làm suite qua.

Ảnh desktop/mobile: artifacts/analytics-desktop.png và artifacts/analytics-mobile.png (ignored/private); báo cáo Playwright và traces không commit. Tệp/spec gốc không sửa; auth/team/settings/Meta/Donor/Shopee vẫn qua hồi quy. Source Git vẫn local/uncommitted/unpushed từ checkout unborn, không reset/push trong tác vụ này.

Giới hạn: Meta LIVE còn thiếu META_APP_ID/SECRET/GRAPH_VERSION/REDIRECT_URI; chưa OAuth/Insights thật hoặc file CSV Ads/Shopee thật của người dùng. Attribution theo mapping/link khai báo, chưa chứng minh traffic độc lập. CSV Ads hiện dùng schema mẫu Ad/ngày, chưa tự map mọi export/locale; lifetime tối đa 366 ngày với start được xác nhận; content reference chưa phải Video FK. Lịch mặc định off, worker giữ CSV và chỉ backfill 3 ngày đã kết thúc mỗi giờ; lịch sử cũ có thể cần sync lại nếu STALE_DATA. Distributed limits/SQL aggregate/retention/throughput/production hardening thuộc Giai đoạn 10.

Cấu hình: install script giữ nguyên, start_skill được cập nhật hướng dẫn Giai đoạn 1–5 và hai tiến trình. Draft save không Apply/restart/Publish; cần review/lưu và Publish ở environment settings. Không khẳng định fresh-task restoration đã được nghiệm thu.

## Giai đoạn 6 — Video Publisher (2026-10-12)

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript / ESLint | PASS |
| Unit | 53/53 PASS, gồm 8 Publisher |
| PostgreSQL integration | 84/84 PASS, gồm 18 Publisher; Redis thật và backup/restore metadata/job |
| Chromium E2E | 30/30 PASS, gồm 5 Publisher; không skipped |
| Production build | PASS, Library/media/Publisher APIs và /videos |
| Migration | 6/6, 32 bảng; app và test, không reset dữ liệu |
| Runtime audit | 0 lỗ hổng được npm audit --omit=dev báo |

Tổng **167 PASS**. Giữ đầy đủ hồi quy 1–5. Test MP4 H.264 thực từ FFmpeg, bounded streaming/hash/metadata/private media/range, role/Page scope và revocation, product/content tracking, template priority/fingerprint/idempotency, outbox Redis, scheduling/pause/resume/cancel, actual provider Post IDs và auto-comment sau Post ID. Kiểm UNKNOWN do start/finish/read failure/crash lease, manual adoption, comment identity/dedup, scope engagement, resumable rate retry/offset, UNSUPPORTED không gửi endpoint đoán. Fixtures ở DB _test/Redis DB15/test prefix và private test storage, không seed vào app.

Lỗi đã sửa qua kiểm thử: tracking list thiếu contentId khiến UI không chọn tracking video; giữ end_offset bền bằng migration mới; cancel child comment phân biệt Post ID của parent và Comment ID của child; read failure sau finish là UNKNOWN; confirm replay không bị từ chối bởi lịch đã qua; clear schedule/allow-repost sau confirm tránh batch tiếp vô tình dùng lịch cũ; sửa Page template khi bộ lọc đang All giữ Page scope ban đầu. E2E selector Comment chỉ match cột kind, không match cột IDs của cả video.

Desktop/mobile screenshots dùng fixture MOCK dưới artifacts/publisher-desktop.png và publisher-mobile.png; mobile không tràn document. Backup/restore persistence đối chiếu media metadata/hash/path và jobs/source/IDs/nội dung/lịch, không kiểm dump video bytes vì bytes cần backup riêng. Facebook LIVE và report thực của người dùng chưa nghiệm thu; Page video API, chưa Reels flow; large-file proxy/distributed limits/retention/object storage/hardening còn Phase10. Không thực hiện đăng Facebook thật hoặc Publish môi trường trong phiên này.

Kiểm chứng setup cuối Phase6: frozen npm ci + script install đầy đủ PASS; restore skip DB đang có bảng, migrate 6/6, build/backup PASS. Redis PONG; Publisher --once PASS; hai chu kỳ ready → SIGTERM → exit 0 PASS. Web production health/database connected và login 200; videos/jobs/templates/control/analytics/products 401 trước login. .env mode 600, khóa AES gốc giữ nguyên. App users/tracking/commissions/insight_ads/videos/publish_jobs đều 0; không seed fixture. Mock được bật rõ cho instance kiểm thử, reusable config mặc định false.

## Giai đoạn 7 — Create Ads from Donor

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript / ESLint | PASS |
| Unit | 60/60 PASS (7 Ads mới) |
| PostgreSQL integration | 92/92 PASS (8 Ads mới và backup/restore Ads snapshot/IDs) |
| Chromium E2E | 33/33 PASS (3 Ads mới), không skipped |
| Build | PASS |
| Migration | 7/7, 34 bảng; additive 0006 |
| Runtime audit | 0 theo npm audit --omit=dev |

Tổng **185 tests PASS**, giữ hồi quy 1–6. Coverage: strict input/no ACTIVE/no raw assignment, Donor allowlist/budgets/placements/objectives, Existing Post constraints, independent ADS content/link mapping, link freeze, scoped roles/Page/account/source, preview mismatch/confirm replay, four new IDs PAUSED, actual parent/read verification contract, definite failure retaining parent ID, UNKNOWN timeout/read failure/manual adoption, expired lease/scope revocation, cancelled job, original finance/media/job backup/restore plus Ads snapshots/mode/IDs/verifiedAt.

E2E browser: Posted Video Chạy quảng cáo chọn đúng bài, Existing Post Traffic báo UNSUPPORTED rồi sửa từng field thành READY; New Creative tạo SubID/Custom Link riêng/ID mapping, mobile 390px không tràn document; Viewer/API403 và wrong Origin403. Screenshots trong artifacts/ads-create-desktop.png và ads-create-mobile.png, dữ liệu MOCK. Lỗi test đã sửa: direct TrackingService.links nhận array như contract, chờ async tracking dropdown có ID trước đọc; test Analytics daily dùng key ngày thay index tùy thứ tự Database. Giữ assertions và logic Analytics, không tắt test.

Frozen install script npm ci/env:init/db:up/queue:up/restore-before-migrate/build/backup đã PASS. Ads worker --once PASS, hai chu kỳ ready→SIGTERM→exit0 PASS, không tạo Ads LIVE. App users/video/jobs/ads_requests0; fixtures riêng _test. Original AES/.env giữ nguyên. LIVE vẫn thiếu META_APP_ID/META_APP_SECRET/META_GRAPH_VERSION/META_REDIRECT_URI, đã có requirements trong draft; không khai báo trùng secrets/domains. Không thực hiện Publish hoặc xác nhận phục hồi sang task mới. Giai đoạn 8–10 chưa triển khai, không claim production-ready.

Readback schedule so sánh cùng instant khi Graph trả offset +0700/+0000 thay ISO +07:00; unit kiểm giờ khác vẫn bị chặn. CTA unavailable trong Donor phải chọn override trước READY; không dùng mặc định để bỏ qua thiếu dữ liệu.

Runtime cuối Giai đoạn7: web production khởi động lại và Ads worker sẵn sàng; health200/database connected, login200, Ads options/requests/history401 trước login. Startup instructions đã lưu draft, giữ install/network/requirements cũ; chưa Publish.

## Giai đoạn 8 — Bulk Ads & Cloning

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript / ESLint / production build | PASS |
| Unit | 65/65 PASS (5 Bulk mới) |
| PostgreSQL integration | 101/101 PASS (9 Bulk mới), không skipped |
| Chromium E2E | 37/37 PASS (4 Bulk mới), không skipped |
| Migration | 8/8; 38 bảng, additive0007 |

Tổng **203 PASS**. Test planner exact BigInt, CBO/ABO parent counts, currency/Daily/Lifetime isolation, sharing conflict; full preview/no mutation, actor/RBAC, stale fingerprint/confirm replay, structures per-video/campaign/adset/append validated PAUSED, IDs unique/shared as intended. Clone Campaign/AdSet/Ad membership/copies/source lineage và no source-ID duplication; rows SubID/link preparation replay theo key, New Creative mapping sau verify; preset scoped/ack stripped. Redis thật với generation/restart/outbox/pause, dependency WAITING, UNKNOWN không bị batch retry, verified recovery mở batch, failure trước PGclaim bump generation không duplicate Ad. Backup/restore đối chiếu counts/budgets/structure/state/source và parent refs/lineage cùng fixtures1–7.

Chromium: two-video shared set có1Campaign/1Set/2Creative/2Ads, budget không nhân hai; saved preset; clone Campaign đủ2members; New Creative row-key links/IDs; mobile390px không tràn document; Viewer/wrongOrigin403. Screenshots fixturesMOCK: artifacts/bulk-ads-desktop.png và bulk-ads-mobile.png.

Lỗi đã sửa: ghi nhầm TSX vào CSS khi bổ sung UI, khôi phục CSS byte-for-byte từ ZIPstage7 có manifest SHA256 đã kiểm chứng rồi chỉ thêm Bulk CSS; build/hồi quy đầy đủ PASS. Bulk detail bổ sung request history để log có verify phases; fixture link test trùng URL với fixture cũ được đổi URL riêng theo trackingID (giữ guard shared). Selector Page Workspace role=status scoped đúng thông báo lưu, không match các live regions load khác; giữ assertions và logic Page cũ.

Meta LIVE chưa nghiệm thu vì thiếu App/quyền; không tạo/clone/bật Ads thật. Only saved/verified app membership, tối đa100rows và10copies; không remote full campaign discovery. Subset/throughput/retention và advanced Meta configs thuộc nghiệm thu/hardening. Draft save không Publish, chưa kiểm chứng restore sang task mới.

Frozen install script đầy đủ PASS (npm ci/env:init/db:up/queue:up/restore skip DB có bảng/migrate8/build/backup). Runtime web health/database connected200, login200, Bulk batches/presets/detail401 trước login. Ads/Bulk --once ready PASS; app users/ads_requests/batches/presets0, không seed fixtures. Runtime audit0, giữ .env/originalAES và network/Meta requirements cũ.

## Giai đoạn 9–10 — Ads Care & Production Hardening (2026-10-13, UTC+7)

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript / ESLint / production build | PASS |
| Unit | 71/71 PASS (4 Care +2 Operations mới) |
| PostgreSQL integration | 117/117 PASS (13 Care +3 hardening mới), không skipped |
| Chromium E2E | 41/41 PASS (4 Care/Telegram/CSP mới), không skipped |
| Migration | 10/10;45tables; SQL migrations0–7 byte-for-byte giữ nguyên |
| Frozen install đầy đủ | npm ci/env:init/services/restore skip/migrate/status/build/backup PASS |
| Runtime dependency audit | 0; full dev audit5high theo braces chain, chưa có upstreampatch |
| Docker | PinnedNode24/non-root/pruneddevtools/FFmpeg build PASS; Compose config PASS |
| Runtime smoke | Native/container health databaseconnected200, login200, Care/Telegram401 trước login; 4 workers container --once PASS |
| Care shutdown/restart | 2cycles ready→SIGTERM→exit0 PASS |
| Backup/restore | FullDB1–10 sangDBtestmới, dữ liệu/encryptedconfig/histories/claims/outbox giữ nguyên; media bytes/corruption/nooverwrite/symlink PASS |

Tổng **229 PASS**, giữ hồi quy1–8. Care tests realPGsnapshots/Decimalmetrics/thresholdAND/missingmetrics/stale/fullperiod/financialack, currentaccount/Pagepermissions trên cached evidence, dryrun noeffects, explicitautoarm/config/policyhash, permissionsrevoked/disablebeforemutation, shareduniqueclaim/readback/UNKNOWN/read-onlyrecover, concurrenttick/cooldown/audit. Telegram adapters chỉ fetchmock/spies, fixedhost/redirerror/nohtmlparse, encryptedtoken/noAPIleak, outboxversion/claim/429/UNKNOWN/definitefailure/retry/lifecycle dedup; không gửi tin hoặc Auto Pause LIVE.

Hardening regression kiểm canonicalFinance totals sau periodfilter/maps/SQLsharedlink, PGlimiter10requests/limit5 atomic và resetwindow, securityconstraints và indexes. Fixture2.001Ad/day facts aggregateCampaign giữ đúng spend, khoảng75ms quan sát lần khảo sát; vượt10.000facts trảREPORT_TOO_LARGE thay totals cắt. Không coi đây là SLA/loadtestproduction.

Lỗi qua kiểm thử: mockprovider chỉ sinh Insights cho TKQC fixture chính, testscopeaccount riêng dùngprovider fixture tương ứng thay bỏ data guards; nhãn Chỉ số/So sánh được bổ sung aria-label rõ; E2E selector chặn DryRun scopednotice và WINNER exactcell để không match Next route-announcer/rulehistorytext. Không xóa assertion hoặc skip tests. Mobile390px không tràn document, bảngCarecuộn ngang để giữ tên/điều kiện đọc được. Screenshots riêng artifacts/care-desktop.png và care-mobile.png.

Buildcontainer cần dùngproxyDNS/trustedCA được cấp và CAsecretmount0444 cho aptuser đọc; TLS/GPG/npm integrity luôn giữ. Rootdockerconfig mặcđịnhreadonly được chuyểnhelperconfig vào/workspace/scratch. Không đưaCA/proxysecrets vào image. Image có productionTSXruntime, bỏeslint/drizzlekit/braces; sourceZIP giữdevtools với auditcảnhbáo đã nêuHARDENING. Không downgradeframework để mấtcảnhbáo.

Lượt kiểm cuối gặpENOSPC saucácimagebuild vàZIPfreshinstallcũ; không phảiapp/testassertionfail. Đã xóa đúngimage/cache build và dependencies/.next trong các thư mục verify doagenttạo, giữ ZIP/source/DB/media/key. Saugiảiphóngdunglượng chạy lại browser/container smoke đã PASS. Appusers/ads_requests/care_rules/telegram_config/notification_jobs=0; không seedfixture.

Nghiệm thu Meta LIVE/Telegram chat thật/HTTPS/domain/productionload chưa thực hiện do credentials/quyền/máy chủ bên ngoài chưa có. Desktopfeasibility đã viết, không cóinstaller Tauri theo lựa chọnweb-first. Draftsave khôngPublish hoặc xácnhậnrestoresangtaskmới. Gitlocalunborn/untracked đượcgiữ, khôngcommit/push/reset.
