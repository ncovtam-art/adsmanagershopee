# Production Hardening — Giai đoạn 10

Bản web + mã nguồn1.0.0 đã triển khai1–10. Chất lượng được kiểm chứng trong cloud bằng PostgreSQL/Redis/Chromium và adapters giả lập/contract tests. Nghiệm thu Meta LIVE, Telegram chat thật, HTTPS/domain máy chủ và tải production thực vẫn là bước vận hành bên ngoài. Không có secret/dữ liệu mặc định, không công bố đã chạy quảng cáo thật.

## Security review và thay đổi

- Giữ scrypt/session opaque, RBAC backend, Origin exact cho mutation, cookie HttpOnly/SameSite, AES-GCM, private uploads, bounded JSON/CSV và idempotency/UNKNOWN của1–8.
- CSP nonce ngẫu nhiên mỗi request: production script không unsafe-inline/unsafe-eval; strict-dynamic, object-src none, frame/base/form restricted. Styles inline vẫn cho phép vì giao diện React/CSS; API responses no-store. HSTS gửi khi APP_ORIGIN HTTPS; reverse proxy phải giữ headers và thực sự bật TLS.
- PostgreSQL API rate buckets nguyên tử theo actor + read/write, 600/300 mỗi phút; không tin X-Forwarded-For do client gửi. Login brute force hiện có vẫn giữ. Proxy phía trước cần giới hạn connection/body và unauthenticated traffic.
- Pool max10/process, statement timeout30s và lock timeout5s; tối đa50connections cho năm processes, cần sizing PG/PgBouncer theo triển khai. Migration/backup dùng pool riêng.
- Telegram settings chỉ admin, token encrypted, không response/log; saved Care evidence lọc lại Page grants. Auto Pause tắt mặc định, authorization/data/readback/unique claim bền; không cung cấp status ACTIVE endpoint.
- Storage portable ngoài public/, root/namespace symlink bị chặn, file lstat+O_NOFOLLOW; checksum trước gửi. Thư mục700/files600; service chạy dưới user riêng. Không cho user shell/filesystem access vào private storage.
- Không đặt .env, dump/media, Bot token, fixtures/password hoặc key trong image/ZIP/log. CA cho corporate proxy chỉ mount BuildKit secret public certificate khi build; không tắt TLS/GPG/npm integrity verification.

## Performance/Database

Indexes mới cho commission tracking/order, source/affiliate/order, import recent, Insights day/campaign/Page, Care due/creator/claim và notification due/resource. SQL aggregate phát hiện shared-link history thay tải tất cả URL; giữ đúng lịch sử ambiguity. Maps thay repeated scans theo tracking/ad/day/Page/Donor; ledger lọc kỳ theo reporting timezone nhưng giữ rows thiếu order date để không nâng chất lượng giả.

Giới hạn báo cáo:10.000 Ad/day facts,10.000 tracking/account,50.000 commission rows/kỳ và2.000nhóm. Vượt trả REPORT_TOO_LARGE, không cắt dữ liệu và không cộng totals thiếu; chọn kỳ ngắn hơn hoặc phân vùng/nâng giải pháp trước tăng scale. Date range cũ tối đa366ngày giữ nguyên. Care window≤30ngày; Bulk≤100rows/copies≤10. PG source of truth, Redis app/test táchnamespace; worker concurrency/Meta throttling vẫn theo1–8. Không tự đổi TKQC để né quota.

Benchmark fixture2.001Ad facts/ngày, Campaign aggregate kiểm tổng tiền chính xác; thời gian quan sát trong docs/VALIDATION.md. Đây là phép kiểm trong môi trường hiện tại, không SLA hay load test đa-tenant. Nên dùng EXPLAIN ANALYZE và đo p95/CPU/RAM trên dữ liệu/thông lượng thật trước mở public.

## Backup/restore và maintenance

`npm run db:backup` giữ backup Docker development có checksum. Restore chỉ DB trống, transaction, advisory lock; không overwrite DB có bảng. Integration khôi phục sang DB `_test` mới, so sánh toàn bộ workflows1–10 kể cả encrypted Telegram/rules/DryRun/alerts/pause/outbox và migration history. Production PostgreSQL external dùng pg_dump/PITR của nhà cung cấp và restore drill riêng.

`npm run media:backup` sao chép READY MP4/hash/size vào .cache/media-backups, pointerlatest; `npm run media:restore` kiểm manifest/metadata/hash, chỉ thêm file thiếu, không overwrite file đã đổi. Tests dùng MP4 H264/ffprobe thật, restore bytes, corruption, existing file và symlink guards. Dừng workers/upload trong cửa sổ backup để đồng bộ DB/media; dump không thay video bytes. Backup **TOKEN_ENCRYPTION_KEY** riêng trong secret manager; mất key không giải mã token/report. Backup ngoài máy, mã hóa at-rest/access restricted; đặt retention/RPO/RTO theo vận hành của bạn.

`npm run maintenance` chỉ giải thích; `npm run maintenance -- --apply` dọn sessions/OAuth/API buckets đã hết hạn. Không xóa finance/jobs/audit/history/media. Lịch hằng ngày qua supervisor/cron; retention nghiệp vụ cần quyết định pháp lý/nghiệp vụ và backup trước. Không tự reset UNKNOWN khi restore; đọc xác minh trước recovery.

## Deploy và desktop

DEPLOYMENT.md có native web/five workers, Dockerfile và Compose production với user non-root/read-only/cap-drop/log rotation, private media volume, external PostgreSQL/Redis và HTTPS reverse proxy. Kiểm tra APP_ORIGIN, COOKIE_SECURE=true, MOCK=false, secure secrets, Meta redirect và egress. ZIP có lockfile/migrations/docs/tests/manifest; giải nén/cài/build/typecheck được kiểm chứng riêng.

Desktop: Tauri wrapper chỉ nên kết nối HTTPS backend; không nhúng App Secret/AES/Bot Token, không biến frontend thành DB/Redis client. Next SSR/API, jobs lâu và FFmpeg cần backend/supervisor, nên không thể xuất .exe đơn file từ web này. Chưa cài Tauri/signing/runtime WebView; tạo installer Windows/macOS cần task riêng và môi trường ký/cross-platform kiểm thử. Lựa chọn hiện tại web + ZIP được giữ.

## Dependency audit và phạm vi còn lại

Npm audit runtime (--omit=dev)0. TSX4.23.15 chuyển thành dependency runtime có lock, nested esbuild của drizzle-kit được override0.25.12 để bỏ advisory dev-server cũ. Image production prune devDependencies sau build, không mang ESLint/Drizzle Kit/fast-glob/braces.

Full audit vẫn báo5high theo chuỗi ESLint/fast-glob/micromatch/braces (một advisory GHSA-vfj7-8cjw-p6xm). Registry hiện braces3.0.3 chưa có bản vá; không downgrade Next/eslint để làm mất báo cáo. Công cụ lint chỉ chạy patterns trong repository được tin cậy, không nhận glob từ request/user; không mở dev/lint server ra Internet. Theo dõi upstream, cập nhật lock và chạy lại suite trước đưa untrusted config vào tooling. Không tuyên bố toàn bộ dev dependency graph không có cảnh báo. ZIP gồm devDependencies để phát triển; image runtime loại bỏ chúng.
