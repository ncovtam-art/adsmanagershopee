# Kế hoạch triển khai — Affiliate Ads Command Center

## Khảo sát Giai đoạn 0

Đã đọc toàn bộ đặc tả v4.0 do người dùng cung cấp, lưu tại [docs/SPECIFICATION.md](docs/SPECIFICATION.md). Checkout `/workspace/adsmanagershopee` ban đầu chỉ có `.git`, nhánh `work` chưa có commit. `git ls-remote origin` thành công nhưng không trả refs, nhánh `main` chưa tồn tại. Không có README, AGENTS.md, framework, Database, Authentication hay tích hợp API để tái sử dụng. Không có chức năng đang hoạt động bị viết lại.

## Kiến trúc và phạm vi lần triển khai này

Next.js App Router + React + TypeScript; API Route Handlers với service modular; PostgreSQL 17 + Drizzle ORM. Session opaque lưu hash trong Database, mật khẩu scrypt, cookie HttpOnly/SameSite, kiểm tra Origin cho mutation. Sáu vai trò được kiểm tra ở backend; đã thêm phân quyền từng Page/Ad Account cùng Giai đoạn 2. CSS dùng design tokens và component tái sử dụng, icon Lucide. Giai đoạn 6 bổ sung BullMQ/Redis cho Video Publisher; Insights vẫn dùng lịch PostgreSQL.

Quyết định ORM: đặc tả đề xuất Prisma, nhưng `binaries.prisma.sh` bị proxy từ chối HTTP 403 khi tải engine/checksum. Không bỏ qua xác minh. Trong repository mới chưa có ORM đang hoạt động, chọn Drizzle + pg để có migration SQL và kiểm thử PostgreSQL thật qua các dependencies npm được phép. Không có mã nguồn hoặc dữ liệu cũ bị thay thế. Không còn cần domain tải Prisma trong cấu hình cuối.

## Thứ tự ưu tiên và phụ thuộc

| Ưu tiên | Giai đoạn                 | Hiện trạng ban đầu                         | Tiêu chí nghiệm thu                                                                                                                       | Phụ thuộc                          |
| ------- | ------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| P0      | 0. Khảo sát               | Hoàn tất khảo sát                          | Đọc đặc tả, kiểm tra Git, kế hoạch có bằng chứng                                                                                          | Không                              |
| P0      | 1. Core Foundation        | Đã hoàn tất, giữ nguyên chức năng          | Đăng nhập/đăng xuất, OWNER bootstrap, Database migration, RBAC backend, quản lý nhân viên, App Shell, API lỗi, unit/integration/E2E/build | 0                                  |
| P1      | 2. Page & Meta Connection | Đã triển khai; LIVE chờ credentials/quyền  | OAuth chính thức, Page/TKQC, mapping có lịch sử, health/quyền, bảo vệ token, CSV fallback                                                 | 1; Meta App/quyền để xác minh thật |
| P1      | 3. Ads Donor              | Đã triển khai; kiểm chứng Mock/Database/UI | Đọc 3 ID, xác minh quan hệ, snapshot an toàn, normalization, versions, library/preview; mock ghi nhãn rõ khi thiếu API                    | 2                                  |
| P1      | 4. Shopee Tracking        | Đã triển khai                                    | Product, SubID unique, Manual/Assisted Custom Link, import CSV chống trùng, Unmatched/manual audit                                        | 1, 2                               |
| P1      | 5. Analytics & ROAS       | Đã triển khai; LIVE chờ cấu hình                                    | Insights/CSV không cộng trùng, attribution chắc chắn, Decimal, freshness/cohort và phân biệt pending/approved/paid                        | 4; dữ liệu Meta                    |
| P2      | 6. Video Publisher        | Đã triển khai; LIVE chờ nghiệm thu         | Upload/hash, BullMQ/Redis, scheduling, publish/comment chính thức, lưu Post ID, recovery khi UNKNOWN                                      | 2; storage/quyền publishing        |
| P2      | 7. Create Ads from Donor  | Đã triển khai; LIVE chờ nghiệm thu                                    | Existing Post/New Creative, compatibility, link/SubID đúng, tạo PAUSED, ID thực và xác minh                                               | 3, 4, 6                            |
| P2      | 8. Bulk Ads & Cloning     | Đã triển khai; LIVE chờ nghiệm thu                                    | Preview ngân sách, queue, idempotency, clone tracking độc lập, retry/recovery                                                             | 7                                  |
| P2      | 9. Ads Care               | Đã triển khai; LIVE chờ nghiệm thu                                    | Ngưỡng cấu hình, alerts/Telegram dedup, Dry Run; auto pause chỉ khi bật rõ và đủ dữ liệu/quyền                                            | 5, 8                               |
| P3      | 10. Production Hardening  | Đã triển khai; deployment thực chờ nghiệm thu                                    | Security/performance, backup/restore kiểm chứng, full integration, triển khai, đánh giá Tauri                                             | Các giai đoạn trước                |

Không coi dữ liệu chưa có là 0; không sinh KPI giả. Không tạo link Shopee bằng cách tự thêm SubID query. Giai đoạn 2–3 chỉ đọc API Meta và đổi OAuth code khi cấu hình hợp lệ; chưa đăng Page hoặc tạo/bật/dừng/xóa Ads thật. Không tuyên bố production-ready trước Giai đoạn 10.

## Các kiểm tra bắt buộc Giai đoạn 1

- Migration trên PostgreSQL sạch; deploy lại không phá dữ liệu; Database health query thực.
- Mật khẩu hash, session hash/expiry/revocation, đăng nhập sai, chống brute force lưu bền trong Database.
- API 401/403, chống CSRF Origin, role escalation, không lộ passwordHash/session token.
- Tạo/cập nhật trạng thái nhân viên có audit, khóa tài khoản vô hiệu session ngay.
- E2E trình duyệt thật: login, routing 6 mục, team management, permission denial, logout.
- Typecheck, ESLint, unit/integration, production build; kiểm tra UI responsive/reduced motion.

## Tiến độ

Giai đoạn 0 và Giai đoạn 1 đã hoàn tất trong phạm vi nền tảng. Đã chạy typecheck, lint, 11 unit tests, 15 integration tests (PostgreSQL thật, có backup/restore), 9 E2E tests (Chromium) và production build: đều PASS, không có test skipped. Đã chạy lại script cài đặt với npm ci, migration giữ dữ liệu và trạng thái 1/1; kiểm tra CLI OWNER tại terminal không echo mật khẩu; khởi động bản production và kiểm tra health/login/401 nội bộ.

Đã lưu install_script và start_skill vào draft môi trường; domain Prisma thử thêm đã được bỏ vì stack cuối không còn dùng. Chưa Publish, chưa kiểm chứng khôi phục trong cloud task mới, chưa commit/push mã nguồn lên GitHub. Database development không chứa user demo hoặc dữ liệu nghiệp vụ; người dùng tự tạo OWNER qua terminal riêng.

Các khả năng Foundation được giữ nguyên. Giai đoạn 2–6 đã triển khai theo yêu cầu tiếp theo; 9–10 còn trong kế hoạch. Chi tiết kiểm chứng và giới hạn: [docs/VALIDATION.md](docs/VALIDATION.md).

## Kế hoạch thực thi Giai đoạn 2–3 và kết quả

1. Giữ auth/team/settings, thêm schema/migration và encryption/OAuth state.
2. MetaGateway/provider; wizard/permission health; Page/Account/mapping history/resource grants; CSV/XLSX fallback.
3. Donor read/parent/account verification; snapshot/normalization; preview fingerprint; append-only versions/library.
4. Unit/Database/E2E desktop-mobile, hồi quy Giai đoạn 1, build và cập nhật docs/config startup.

Đã thực hiện các bước trên. Nghiệm thu LIVE vẫn cần người dùng cung cấp Meta App trong environment settings và quyền Meta App phù hợp; không đánh đồng Mock với kết nối thật. Page avatar dùng icon dự phòng, health dựa lần kiểm tra gần nhất; chưa có debug_token, scheduled refresh hoặc distributed gateway limiter. Import dùng schema mẫu CSV/XLSX, chưa tự map mọi định dạng Ads Manager và chưa đưa batch vào Analytics. Không viết lại chức năng Foundation đang hoạt động.

Ưu tiên tiếp theo sau Giai đoạn 4: Giai đoạn 5 Analytics với commission thật đã đối soát; sau đó 6 Video Publisher → 7 tạo Ads PAUSED từ Donor.

Lượt kiểm chứng cuối Giai đoạn 2–3: typecheck/lint/build PASS; **27 unit + 33 integration + 15 E2E = 75 tests PASS**, không skipped. Migration 2/2 trên development và test; frozen install/startup/backup được kiểm tra lại. Runtime audit 0 lỗ hổng được báo. Chi tiết cả lỗi phát hiện/cách sửa và giới hạn LIVE: docs/VALIDATION.md.

## Giai đoạn 4 — thực thi theo yêu cầu tiếp theo

Đã giữ auth/Meta/Donor, thêm 7 bảng ở migration 0002: products, tracking_records, tracking_link_versions, commission_imports, commission_rows, commission_reviews, commission_history. Product/SubID/bulk preparation + return CSV theo record ID; Manual Custom Link versions/confirmation; source/account namespaces. Commission importer preview/commit, column/encoding/status/date/Decimal normalization, dedup, revision/history, Unmatched/manual review/mapping với audit. Link từng dùng chung không tự nâng attribution của đơn cũ. Không tạo Shopee/Meta API mutation hoặc ROI giả.

UI nối vào Cài đặt → Shopee, Page Workspace và Doanh thu & ROAS; sáu menu giữ nguyên. Quyền Page/TKQC và financial roles được kiểm backend. RAW CSV encrypted, customer fields không gửi trong API list.

Phụ thuộc kế tiếp: Giai đoạn 5 Ads Analytics & ROAS để ghép spend/attribution/cohort và đánh giá tài chính. Video/Content FK và Post IDs thuộc 6, tạo Ads PAUSED thuộc 7. Chưa có Automation Shopee vì quy trình hiện dùng Custom Link thủ công và không được cấp API.

Nghiệm thu Giai đoạn 4: **38 unit + 46 integration + 21 E2E = 105 PASS**, typecheck/lint/build PASS, migration 3/3, backup/restore cả financial rows/link versions và runtime audit 0. Chưa kiểm chứng file Shopee thật của người dùng hoặc API Custom Link; chỉ Manual/Assisted và CSV có kiểm tra rõ. Tiếp theo Giai đoạn 5.

## Giai đoạn 5 — kết quả thực thi

1. P0: additive migration 0003, 4 bảng snapshot/run/policy; không sửa migrations đã áp dụng. Chuẩn Ad/ngày, atomic API/CSV replacement và fingerprints/preview, scope và source/currency/timezone.
2. P0: Attribution + Decimal ROAS/Profit theo order date, configurable estimated statuses/Other Costs, guard zero/missing/stale/shared/currency/Unmatched/review, lifetime bắt đầu rõ.
3. P1: Campaign/Ad Set/Ad/SubID/content, daily/cohort/lifetime, dashboard, chart, drilldown, search/sort/status/columns/export/saved views ở browser, scoped Page Workspace.
4. P1: worker schedule/claim PostgreSQL, hourly 3 ngày đã kết thúc, giữ CSV, retry/rate và SIGTERM; không gọi API khi dashboard reload.
5. P0: tests/hồi quy, backup/restore cả Insights/policy và docs/start skill.

Đã triển khai các bước trên; dữ liệu Meta LIVE và CSV thực của người dùng chưa được nghiệm thu do thiếu cấu hình/quyền/tệp. CSV hiện theo schema mẫu chuẩn hoá, không tự nhận mọi locale Ads Manager. Video reference chưa phải Video Library; nhiều SubID chung một Ad không được tự chia spend. Tối ưu SQL aggregate/distributed limits/retention/throughput thuộc Giai đoạn 10. Tiếp theo P2 Giai đoạn 6 Video Publisher, rồi 7 Ads PAUSED từ Donor. Chi tiết: ADS_ANALYTICS.md và docs/VALIDATION.md.

Nghiệm thu Giai đoạn 5: **45 unit + 66 integration + 25 E2E = 136 PASS**, không skipped; typecheck/lint/build PASS, 4/4 migrations, backup/restore Insights/policy/commission/link và runtime audit 0. Hướng dẫn UI/worker/cảnh báo tại ADS_ANALYTICS.md.

## Giai đoạn 6 — kết quả thực thi

1. P0: 7 bảng Publisher, FK contentId của tracking, media private/stream upload/probe/hash, RBAC theo Page; không đổi dữ liệu/migrations cũ.
2. P0: templates/policy/Organic tracking, preview fingerprint, confirm idempotent và snapshot; mặc định đăng/comment tắt.
3. P1: resumable Meta video adapter, actual Post ID, auto-comment sau Post ID, session/offset bền, lease/heartbeat, rate backoff và UNKNOWN recovery. Chỉ mock/API contract tests; LIVE còn thiếu cấu hình/quyền.
4. P1: BullMQ/Redis từ outbox PostgreSQL, schedule UTC+7, pause/resume/cancel, history, UI Library/Bulk/Schedule/Posted/Queue/Templates và Page Workspace.
5. P0: hồi quy 1–5, kiểm thử file MP4 thực, Redis thật, PostgreSQL backup/restore cả jobs/media metadata và Chromium; tài liệu/ZIP mã nguồn theo lựa chọn web-first.

**53 unit + 84 integration + 30 E2E = 167 PASS**, không skipped; typecheck/lint/build PASS. 6/6 migrations, 32 tables. Runtime audit 0. Hướng dẫn [USER_GUIDE.md](USER_GUIDE.md), [VIDEO_PUBLISHER.md](VIDEO_PUBLISHER.md).

Chưa có flow Reels riêng; gỡ preview link UNSUPPORTED; upload lớn qua proxy/nhiều worker/retention/object storage cần hardening. Database dump không chứa bytes video. Không thực hiện đăng Facebook thật trong setup. Còn 4 giai đoạn: 7 Ads from Donor → 8 Bulk/Cloning → 9 Ads Care → 10 nghiệm thu LIVE, bảo mật/hiệu năng và phát hành web + ZIP đầy đủ. Bản ZIP hiện tại là bản kiểm thử 1–6, không tuyên bố production-ready.

## Giai đoạn 7 — thực thi

Đã thêm workflow Ads request/history, compatibility theo field, preview/confirm idempotent, snapshot immutable theo request và bốn mutation/resume/read verification. UI nối Posted Videos/Page Workspace và Quảng cáo. Default Campaign/Ad Set/Ad PAUSED; Existing Post giữ tracking chung, New Creative dùng SubID/link riêng, gán IDs sau verify và đóng băng link. Quyền ads:write chỉ Owner/Admin/Manager/Media Buyer; Page/account/source scopes và actual credentials giữ nguyên. Không mở bật Ads tự động, không thực hiện LIVE mutations trong setup.

Hỗ trợ bước đầu Auction/Facebook Feed/Traffic-Link Clicks hoặc Existing Post Engagement-Post Engagement. Những cấu hình ngoài flow bị chặn rõ, không gửi RAW donor. LIVE cần nghiệm thu Meta App/quyền. Tiếp theo 8 Bulk/Cloning → 9 Ads Care → 10 production/live/security/performance. Hướng dẫn ADS_CREATION.md và USER_GUIDE.md.

Nghiệm thu Giai đoạn 7: **60 unit + 92 integration + 33 E2E = 185 PASS**, typecheck/lint/build PASS; 7/7 migrations, 34 bảng, backup/restore Ads snapshot/IDs và runtime audit0. Frozen install và worker startup/shutdown/restart đã kiểm chứng. Không tạo/bật Ads LIVE trong setup.

## Giai đoạn 8 — kết quả thực thi

Tái sử dụng AdsService/compatibility/tracking và provider Giai đoạn7. Thêm batch/preparation/preset/history, shared-parent references, clone source lineage, generation/outbox. Cấu trúc per-video/campaign-per-Page/adset-per-Page/append parents verified; budget CBO/ABO/Daily/Lifetime/currency không cộng sai. Clone membership/source verified, copies, fresh SubID/URL, PAUSED/readback IDs. BullMQ queue trên Redis hiện có, pause boundary, waiting parent, definite retry và UNKNOWN verified recovery. UI nối Quảng cáo/Ads request link, preset/blueprint/preview/logs. Không viết lại chức năng1–7, không tạo/bật Ads LIVE trong setup.

Migrations8/8,38tables. Hướng dẫn BULK_ADS.md/USER_GUIDE.md. LIVE/quyền/API configurations ngoài subset, full scale/retention/performance/remote campaign discovery còn nghiệm thu/hardening. Tiếp theo9 AdsCare→10 production.

Nghiệm thu Giai đoạn8: **65unit +101PostgreSQL +37Chromium =203 PASS**, không skipped; typecheck/lint/build PASS, 8/8migrations/38tables và backup/restore graph/lineage. Giới hạn/API LIVE tại BULK_ADS.md.

## Giai đoạn 9–10 — triển khai theo yêu cầu

9: giữ Analytics/attribution/providers/auth1–8; thêm Care rules/config hash/runs/alerts/pause claims/Telegram encrypted config/outbox. Ngưỡng AND exact, Winner theo rule, DryRun không effects, alerts/review/cooldown, financial freshness/ack coverage, Auto Pause explicit admin/API/fresh complete/readback/UNKNOWN, current Page scope cho cached evidence. Telegram selected events/test connection/version/dedup/rate/unknown, worker thứ5. Không gửi Telegram hoặc dừng Meta LIVE trong triển khai.

10: CSP nonce/HSTS, PostgreSQL distributed rate buckets, query timeouts/indexes, bounded report/period ledger/SQL ambiguity/maps, portable private storage/symlink guard, byte-level media backup/restore/no overwrite, full DB restore1–10, maintenance chỉ authstate expiry, Docker/native/five-process deploy và desktop feasibility. Web + ZIP1.0.0 theo lựa chọn hiện tại; không tạo installer Tauri hoặc tự publish web public.

Code stages1–10 đã có. Nghiệm thu Meta App/quyền/CSV thực/Telegram thật/HTTPS và thông lượng production là bước vận hành của người dùng; không đánh đồng MOCK/contract tests với LIVE. Kết quả kiểm chứng cuối tại docs/VALIDATION.md.
