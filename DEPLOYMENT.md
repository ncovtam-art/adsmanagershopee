# Chạy bản build và chuẩn bị triển khai

Hướng dẫn người dùng/ZIP: [USER_GUIDE.md](USER_GUIDE.md). Đoạn Giai đoạn 5 bên dưới là lịch sử; cấu hình mới nhất ở mục Bản1.0.0 cuối tài liệu.

Giai đoạn1–10 đã triển khai. Hướng dẫn lịch sử từng giai đoạn được giữ bên dưới; cấu hình production hiện tại ở mục Bản1.0.0.

```bash
npm ci
npm run env:init
npm run db:up
npm run queue:up
npm run db:migrate
npm run owner:create
npm run build
npm start
```

Chỉ chạy `owner:create` khi Database chưa có OWNER. `npm start` phục vụ bản build, cần PostgreSQL tiếp tục chạy. Đặt `APP_ORIGIN` đúng địa chỉ trình duyệt; production dùng HTTPS và `COOKIE_SECURE=true`. Có thể đặt `DATABASE_URL` đến PostgreSQL do bạn quản lý và bỏ `db:up` nếu không dùng Docker development. Không đưa `.env` vào image hoặc Git.

Trong Codex cloud, dùng checkout hiện có; môi trường đã cô lập, không cần worktree. Script cài đặt và hướng dẫn startup được lưu trong environment settings. Lưu draft không thực thi script hoặc Publish. Live processes không được giả định sống qua snapshot, nên startup cần khởi động Database và App lại.

Docker images/volumes có thể nằm ngoài snapshot workspace. Trước Publish/chuyển máy, chạy `npm run db:backup`; backup được lưu dưới `.cache/database` trong checkout. Startup chạy migrations nếu cần và `db:restore` trước migrations nếu có snapshot Database; restore tự từ chối Database có bảng ứng dụng để tránh ghi đè. Không mặc định một snapshot bảo đảm khôi phục Database production. Quy trình này dành cho development và đã được kiểm thử với Database tách biệt.

Sau khi người dùng review/lưu cấu hình, Publish môi trường theo sản phẩm. Không có preview URL public được tạo trong phiên onboarding; UI được kiểm tra nội bộ bằng Chromium. Muốn kiểm tra trên máy cá nhân, dùng hướng dẫn README và địa chỉ `APP_ORIGIN` đã cấu hình.

Cấu hình Meta theo META_CONNECTION.md. Giữ TOKEN_ENCRYPTION_KEY ổn định trong secret storage máy chủ; backup Database đã mã hóa token không thể thay backup khóa. Production đặt META_MOCK_ENABLED=false. Không cấu hình App Secret/khóa AES bằng proxy placeholder vì ứng dụng cần giá trị thực để tính HMAC/AES. Kết nối LIVE cần Graph version/Redirect URI và quyền Meta App đã cấp; không có default token.

Giai đoạn 4 không thêm dependency, service hoặc Shopee secrets/network requirement. Giữ install script và áp dụng migration 0002; build/start lại để có routes mới. Raw CSV được mã hóa bằng TOKEN_ENCRYPTION_KEY đang dùng. Sau import hoặc đổi link cần cập nhật backup development trước snapshot; test data luôn ở Database \_test riêng. Không chia sẻ dump/report trên Git hoặc chat. Publish chỉ thao tác trong environment settings; công cụ hiện có lưu draft, không thực hiện Publish.

## Giai đoạn 5: hai tiến trình

Giữ install script đã kiểm chứng (npm ci/env:init/db:up/restore trước migrate/build/backup), áp dụng migration 0003: 4/4, 25 tables. Dependency/network/credential requirements không đổi. Chạy `npm start` và `NODE_USE_ENV_PROXY=1 npm run worker:insights` ở hai terminal giữ tiến trình. Worker cần actual Meta secrets như web cho LIVE; không dùng proxy placeholder để HMAC/AES. Smoke một lượt: `npm run worker:insights -- --once`. Lịch mặc định off, user bật trong Quy tắc tài chính & lịch cập nhật; worker dừng thì report quá 24h cảnh báo STALE_DATA. Supervisor/restart/retention production thuộc hardening. Không ngầm coi worker sống qua snapshot: start lại trong task mới. Backup development cập nhật trước Publish, giữ original TOKEN_ENCRYPTION_KEY. Draft save chỉ lưu cấu hình, user review/lưu rồi Publish ở environment settings.

## Giai đoạn 6: ba tiến trình và media private

Cần FFmpeg/ffprobe trong PATH và Redis. Trình tự refresh: npm ci → env:init → db:up → queue:up → db:restore (chỉ DB trống) → db:migrate → db:status → build → db:backup. Hiện 6/6 migrations, 32 tables. Trong Linux cloud đã có /usr/bin/ffmpeg và /usr/bin/ffprobe; máy khác cài FFmpeg từ nguồn chính thức trước chạy setup.

Khởi động ba terminal giữ tiến trình: web npm start, Insights npm run worker:insights, Publisher npm run worker:publisher. NODE_USE_ENV_PROXY=1 nếu dùng proxy Node đã được cấp. Smoke publisher --once và start/stop/start được kiểm tra; startup đăng ký trong start_skill, không phụ thuộc tiến trình cũ.

REDIS_URL development DB0, TEST_REDIS_URL DB15 riêng. Redis loopback/noeviction; production dùng Redis riêng có auth/TLS và supervisor. Tests chỉ _test và Redis test prefix; không chạy suites đồng thời. VIDEO_STORAGE_DIR mặc định .cache/video-storage, ngoài public/, web/worker phải cùng storage và quyền. DB backup không chứa media. Backup cả media dưới workspace trước snapshot; giữ khóa mã hóa gốc. Redis jobs có thể đẩy lại từ PostgreSQL outbox nhưng trạng thái UNKNOWN phải xác minh, không reset để retry.

LIVE upload cần graph-video.facebook.com bên cạnh graph.facebook.com, www.facebook.com, developers.facebook.com; pages_manage_engagement cần cho comment. Không thêm domain Shopee cho luồng Manual/CSV. Chưa kiểm chứng upload LIVE/large-file reverse proxy; cần giới hạn body/timeouts/disk phù hợp và nghiệm thu Phase10 trước public deployment. ZIP không chứa .env/media/dumps/fixtures hoặc build dependencies; cài/build lại theo USER_GUIDE.md. Draft lưu instructions/requirements, review/lưu và Publish trong environment settings; công cụ không thực hiện Publish.

## Giai đoạn 7: worker thứ tư

Install script giữ nguyên (migrate áp dụng 0006, hiện 7/7 và 34 tables). Không thêm dependency/service/domain/secret. Bên cạnh web/Insights/Publisher chạy `NODE_USE_ENV_PROXY=1 npm run worker:ads`, với cùng Database/actual key/Meta configuration và nguồn. Smoke `npm run worker:ads -- --once`; worker không dựa Redis cho flow single request. PostgreSQL jobs/IDs retained theo DB backup, tiến trình cần restart mỗi máy/task. LIVE create chưa nghiệm thu; default luôn PAUSED, không tự bật Ads.

## Giai đoạn 8: Redis cho Bulk Ads

Không thêm dependency/domain/secret/service. Worker:ads hiện chờ BullMQ Redis rồi xử lý cả single PostgreSQL + bulk outbox, nên queue:up trước worker bắt buộc. Migrate0007:8/8,38tables; install script giữ frozen npm ci/restore-before-migrate/build/backup. Redis data/processes không mặc định sống qua snapshot, PG giữ IDs/jobs/lineage. Giữ bốn terminal. Source ZIP1–8 không có .env/dumps/media/cache/dependencies; build/cài lại theo USER_GUIDE. Cloud draft startup cập nhật, review/lưu→Publish mới kích hoạt; công cụ không Publish.

## Bản 1.0.0 — cấu hình triển khai hiện tại

Các mục Giai đoạn5–8 phía trên là lịch sử. Cấu hình hiện tại có1–10,10migrations/45tables và năm tiến trình. Hướng dẫn người dùng: USER_GUIDE.md; guard/limits/security/backup: HARDENING.md; Care/Telegram: ADS_CARE.md.

### Chạy native (đã kiểm chứng trong cloud)

Node>=22, PostgreSQL17, Redis7, FFmpeg/ffprobe. `npm ci` → `npm run env:init` (development) → `npm run db:up` → `npm run queue:up` → `npm run db:restore` (nếu có backup/DB trống) → `npm run db:migrate` → `npm run db:status` → `npm run build` → `npm start`. Bootstrap OWNER riêng bằng `npm run owner:create` nếu DB chưa có OWNER, không có user/password mặc định.

Bốn terminal/supervisor units khác: `npm run worker:insights`, `npm run worker:publisher`, `npm run worker:ads`, `npm run worker:care`. Smoke mỗi worker với `-- --once`; Ready cần truy vấn PostgreSQL và Redis cho Publisher/Ads. WorkerCare không cần Bot nếu chưa cấu hình/bật Telegram. Processes không sống qua snapshot; start lại trong task mới. Dùng supervisor/systemd/container restart để xử lý crash; xem lịch sử app với UNKNOWN, không resetjobs.

Production dùng secure env/secrets ngoài Git: DATABASE_URL PostgreSQL external, REDIS_URL auth/TLS, APP_ORIGIN HTTPS, COOKIE_SECURE=true, META_MOCK_ENABLED=false, TOKEN_ENCRYPTION_KEY ổn định và Meta App/directsecret. `.env` optional khi vars injected (Node --env-file-if-exists); không gọi env:init để tự sinh production secrets. VIDEO_STORAGE_DIR phải private ngoài public và dùng chung web/Publisher; local storage cần cùng máy/volume, nhiều máy cần thiết kế object storage riêng.

HTTPS reverse proxy chỉ tới loopback web3000, giữ CSP/security/no-store headers, giới hạn connections/unauthenticatedtraffic/body upload≤300MB và timeout phù hợp video, trust đúng hostname/origin. OAuth Redirect URI thuộc cùngorigin/api/meta/callback. Không tự tạo domain/HTTPS certificate hoặc deploy public trong phiên này.

### Docker (build và smoke được kiểm chứng)

`docker build -t aacc:1.0.0 .`. BaseNode24bookworm digest pin, full frozen dependencies cho TSX workers và FFmpeg. Image không .env/cache/media/secret/test artifacts; usernode. Corporate/cloud proxy cần trustedCA BuildKit secret: `--secret id=build_ca,src=/path/to/trusted-ca.pem`, build-args HTTP_PROXY/HTTPS_PROXY/NO_PROXY và DNS mapping được quản trị cấp. CA mount không nằm trong image; không disable TLS/GPG/integrity. Cập nhật digest/dependencies theo quy trình kiểm thử và audit trước rollout.

Set AACC_IMAGE=aacc:1.0.0 và AACC_ENV_FILE là đường dẫn env private trên máy chủ. `docker compose -f deploy/compose.production.yaml config --quiet` kiểm cú pháp; `docker compose -f deploy/compose.production.yaml up -d` khởi động5services. Không dùng env development localhost cho container bridge: DATABASE_URL/REDIS_URL phải reachable từcontainers. DB/Redis external chưa có trong Compose production; provision/backup chúng trước. Compose non-root/read-only/no-new-privileges/cap_drop, /tmp bounded, private media cachevolume chung, webbindloopback, logrotation/restart. Migrate/OWNER qua one-off container/terminal được quản trị, trước khi bật web/worker mới.

Containerwebhealth gọi/api/health và PostgreSQL; worker health dùng readiness logs/history/backlog/monitoring, không có HTTPhealth riêng. Giám sát pool/Redis/disk/backlog/UNKNOWN và errorcodes, redactiontokens/reports. Native/Docker smoke trong cloud không chứng minh domain/TLS/Meta LIVE của máy chủ bạn; cần nghiệm thu riêng trướcpublic.

### Backup và phục hồi

Dừng upload/workers trong maintenance window. Backup DB + `npm run media:backup` + keyAES riêng, giữ snapshots ngoài máy, mã hóa/quyền hạn. `db:restore` localDocker chỉ vàoDBtrống; externalPG dùng nhàcungcấp/PITR/pg_restore theoquyền. `media:restore` kiểmhash/metadata, chỉcopyfilethiếu; fileđãđổi khôngoverwrite. Saurestoremigrate/status, inspect UNKNOWN và actualMetaIDs, smokeweb/workers rồiresume cácquy trìnhđãbậtrõ. Redisoutboxrepopulate từPG. `npm run maintenance -- --apply` theo lịch hằngngày, chỉxóaauthstate/APIbucketexpire, khôngfinance/audit/media.

### Nghiệm thu LIVE và desktop

Cấp MetaApp/scopes/AppReview, OAuthPage/account hợp lệ, dry-run/cấu hìnhPAUSED và readback trên tài khoản test hợp lệ trước quy mô thật. TelegramBot/Chat phảiđượcngườidùngcấptrongUIvàbấmTestConnection. KhôngcóMetaLIVE/Telegramthậttrongsetupnày.

Tauri feasibility: wrapper HTTPSfrontend khả thi; không chứa secrets/backendDB/Redis. NextSSR/API vàfiveworkers/FFmpeg vẫn cầnserver. Installer/signing/WebView đa nền tảng cần công việc riêng, khôngcó.exe trong ZIPweb-first đã chọn. Release1.0.0 là mã nguồn triển khai1–10; productionacceptance phụ thuộccredentials/HTTPS/data/load thật.
