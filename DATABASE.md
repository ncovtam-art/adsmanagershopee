# Database

Hiện tại sau Giai đoạn 8: **8/8 migrations, 38 bảng**. Các mục trước mô tả lịch sử từng giai đoạn; không sửa migration đã áp dụng.

PostgreSQL 17 với Drizzle ORM; schema typed trong `src/server/database/schema.ts`. Migration đầu tiên trong `migrations/0000_mean_plazm.sql` và metadata trong `migrations/meta`. Chỉ tạo bảng khi module cần:

| Bảng         | Nội dung                                          | Bảo đảm                                          |
| ------------ | ------------------------------------------------- | ------------------------------------------------ |
| users        | Email chuẩn hóa, tên, password hash, Role, active | Email unique; Role enum 6 giá trị; timestamp UTC |
| sessions     | Token hash, user, expiration                      | Hash unique, FK cascade, index user/expiry       |
| login_guards | Hash email, attempts, window/cooldown             | Durable, advisory lock cho login theo email      |
| settings     | Workspace singleton `main`, tên/múi giờ           | Khởi tạo transaction cùng OWNER                  |
| audit_logs   | Actor, action, resource, metadata an toàn         | FK actor Set Null, index actor/date và resource  |

Migration `0001_daffy_preak.sql` thêm:

| Bảng             | Nội dung                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| meta_connections | Kết nối theo actor/source/Meta user; encrypted token + inventory, scopes, expiry/check time                       |
| oauth_states     | Hash state, actor FK, expiry; xóa khi dùng                                                                        |
| pages            | ID string, source namespace, code unique, niche, encrypted Page token/tasks, publish settings, primary account FK |
| ad_accounts      | ID string/source unique, connection FK, currency/timezone/tasks/status                                            |
| page_mappings    | Page, previous/current account FK, actor, thời điểm                                                               |
| resource_grants  | User + đúng một Page hoặc TKQC, unique và CHECK                                                                   |
| donors           | Tên, source, account FK, actor                                                                                    |
| donor_versions   | Donor/version unique, 3 ID string, snapshot/template/warnings, actor; version dương, trigger append-only          |
| meta_imports     | Fingerprint unique, batch rows, total Decimal(30,2), currency, actor                                              |

Trigger/CHECK nghiệp vụ bổ sung ở SQL migration; không sửa file đã áp dụng. Khóa TOKEN_ENCRYPTION_KEY nằm ngoài Database, phải giữ/sao lưu an toàn cùng hệ thống secrets. Đổi khóa không tự tái mã hóa bản ghi cũ. Batch meta_imports cấp Account của Giai đoạn 2 chỉ giữ lịch sử, không cộng vào Analytics; Giai đoạn 5 dùng snapshot Ad/ngày riêng. Không có số liệu mẫu trong Database ứng dụng. Development và test nằm ở hai PostgreSQL service/volume khác nhau, cổng lần lượt 5432 và 5433, chỉ bind loopback.

```bash
npm run db:up
npm run db:migrate
npm run db:status
```

Migration chỉ áp dụng thay đổi mới và kiểm hash của các file đã chạy. Có thể chạy lại `db:migrate` mà không tạo lại bảng hoặc xóa dữ liệu. Không sửa SQL migration đã áp dụng. Sau khi thay đổi schema trong một coding task, dùng `npm run db:generate` tạo migration mới rồi review SQL trước khi áp dụng.

`TEST_DATABASE_URL` chỉ dùng cho test; tên phải kết thúc `_test` và khác Database ứng dụng. Tests có dọn bảng test, không dùng giá trị này cho production.

Docker named volume lưu dữ liệu ở Docker daemon, không được mặc định coi là được snapshot cùng `/workspace`. Trước khi chuyển máy/Publish, dùng `npm run db:backup` để lưu backup development trong `.cache/database/` với quyền 0600; startup có `npm run db:restore` chỉ khôi phục nếu chưa có bảng ứng dụng hoặc lịch sử migration. Backup có password hash và dữ liệu riêng: không commit hoặc đăng lên nơi công khai. Backup/restore production cần quy trình riêng với mã hóa, retention và nghiệm thu Giai đoạn 10.

## Giai đoạn 4 — migration 0002

| Bảng                   | Bảo đảm                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| products               | URL unique, actor FK; metadata công khai trong workspace                                                            |
| tracking_records       | SubID unique, Page/Product/Account FK, source/account/channel và URL snapshot; Meta IDs string, UTC                 |
| tracking_link_versions | Unique(record,version), version dương, append-only trigger, URL hash indexed                                        |
| commission_imports     | Unique(source,affiliateAccount,file hash), encrypted raw, preview fingerprint/config/candidates/result              |
| commission_rows        | Unique(source,account,externalKey), Order/Item/Row IDs string, Decimal(30,6), dates UTC, tracking/import FK/indexes |
| commission_reviews     | Unique(import,line), open/resolved state/reason/actor; không cộng vào ledger trước giải quyết                       |
| commission_history     | Row/import/actor FK, before/after snapshots, append-only trigger                                                    |

Migration 0000/0001 giữ nguyên. Giai đoạn 4 có 21 tables, 3 migrations; hiện tại xem Giai đoạn 5 bên dưới. Test backup/restore có đối chiếu commission tiền/trạng thái/mapping và link versions ngoài users/migration. Khóa mã hóa raw báo cáo dùng TOKEN_ENCRYPTION_KEY gốc ngoài Database; không tự đổi khóa khi restore.

## Giai đoạn 5 — migration 0003_thin_vindicator

Hiện **25 tables, 4 migrations**. Migrations 0000–0002 giữ nguyên.

| Bảng | Nội dung / ràng buộc |
| --- | --- |
| insight_runs | Account/actor FK, API hoặc CSV, since/until, APPLIED/FAILED, safe errorCode, fingerprint, encrypted raw CSV; CHECK provider/state/period |
| insight_days | Unique account/day, selected provider, currency/timezone, sync time, run FK; CHECK provider |
| insight_ads | FK snapshot cascade/account, unique day/ad, parent/Page/Post/status, Decimal spend/counters, nullable reach/linkClicks/LPV; CHECK metrics nonnegative |
| analytics_policies | PK/FK account, estimated statuses, explicit mapping acknowledgment, Other Cost/day, lifetimeStart, autoSync/nextSyncAt, actor/timestamps; CHECK cost >=0 |

Idempotent snapshot update giữ rows khi fingerprint/provider không đổi. Replacement xoá/ghi cả snapshot ngày trong transaction với advisory lock theo account; run/audit/raw CSV mới giữ bằng chứng. Schedules claim bằng UPDATE có điều kiện, dữ liệu còn qua restart. Backup/restore test so sánh facts/currency/timezone/provider và recognition policy ngoài dữ liệu Shopee/users/migrations. Raw/token cần original AES key bên ngoài dump.

## Giai đoạn 6 — migration 0004 và 0005

0004_fluffy_miek thêm video_assets, caption_templates, publisher_page_settings, publish_batches, publish_jobs, publish_history, publisher_controls và tracking_records.content_id FK. 0005_nostalgic_captain_universe bổ sung end_offset cho resumable upload. Migration 0004 đã áp dụng không bị sửa lại; ALTER bổ sung ở 0005.

video_assets giữ Page/source/file SHA/metadata/private storage key/product/duplicate reference. Batch unique actor/requestKey; job unique batch/asset/kind và parent comment, caption/link version/policy snapshot, availableAt UTC, phase/progress/lease/generation/session mã hóa/offset/actual IDs. publish_history append-only. Page token và upload session dùng AES-GCM gốc; API không trả trường bí mật. Parent comment chỉ tạo sau Post ID được xác minh; UNKNOWN không tự retry. Redis chỉ vận chuyển jobs, Database là nguồn trạng thái bền.

Backup/restore đã đối chiếu video metadata/hash/storage key và publish jobs với nguồn/IDs/nội dung/lịch bên cạnh dữ liệu 1–5. Dump **không chứa video bytes**; backup media riêng và TOKEN_ENCRYPTION_KEY trong secret storage. Giữ file cùng storage key/source sau restore, không sinh media từ filename hoặc bỏ qua hash. 32 bảng, migration 6/6 trên app và test.

## Giai đoạn 7 — migration 0006_flaky_eternals

Thêm ads_requests và ads_history. Unique actor/request key; partial unique ADS tracking New Creative chưa cancelled; snapshot version/link/payload, từng ID mới, phase/lease/heartbeat/error/verifiedAt. CHECK state/mode/phase/attempts và history append-only. Mapping ba IDs vào ADS tracking chỉ sau verified PAUSED; Existing Post không gán IDs vào Organic/SHARED. Link version dùng New Creative request bị freeze, dữ liệu schema cũ giữ nguyên. Backup/restore đối chiếu snapshot/mode/source/IDs/status/verifiedAt.

## Giai đoạn 8 — migration 0007_thick_naoko

Thêm ads_batches, ads_batch_history append-only, ads_preparations idempotent actor/key và ads_presets scoped donor version. Ads requests thêm batch/index, campaign/adset reference FK, clone source/level, generation/enqueuedAt và state WAITING. Shared parents không được hủy riêng, IDs source/clone giữ qua source FK và snapshot. Original migrations/schema dữ liệu1–7 giữ nguyên. Backup/restore đối chiếu counts/budgets/structure/source/state và parent refs/lineage bên cạnh Ads snapshots/IDs.

## Giai đoạn 9–10

Additive0008/0009,10migrations/45tables. Thêm care_rules,care_runs,care_alerts,care_pauses,telegram_settings,notification_jobs,api_rate_buckets. FKdryRun/actor/account, CHECKautoEnabledrequiresenabled/evidence, alert/pause/notification states, Telegram cooldown/version và APIhits. care_runs append-only, alerts review cóaudit, pauseobjectclaim unique(account/source/level/ID). Indexes finance/report/workerdue. Không sửa migration đã áp dụng; không reset DB. Backup/restore giữ token mã hóa, config/results/alerts/IDs/outbox; media bytes backup riêng.
