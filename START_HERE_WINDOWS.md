# Bắt đầu trên Windows cá nhân — Affiliate Ads Command Center 1.0.0

Hướng dẫn này dành cho Windows cá nhân dùng PowerShell + Docker Desktop. Các bộ kiểm thử của ứng dụng đã chạy trên Linux cloud; cần kiểm tra thực tế trên máy Windows của bạn theo từng mốc bên dưới. ZIP là mã nguồn, không phải file .exe: cần cài môi trường, tạo OWNER và giữ web/workers chạy.

## 1. Chuẩn bị phần mềm

Cần Windows 64-bit hỗ trợ Docker Desktop/WSL2, Node.js24 LTS, Docker Desktop và FFmpeg. Cài từ trang chính thức: https://nodejs.org/en/download, https://www.docker.com/products/docker-desktop/, https://ffmpeg.org/download.html (chọn Windows; trang dẫn tới builds phù hợp).

Nếu máy có winget, có thể mở PowerShell và cài bằng các lệnh sau, từng lệnh một. Chấp nhận hộp thoại cài đặt/UAC khi hệ điều hành yêu cầu. Các package ID là cách cài qua Windows Package Manager, không phải lệnh đã được chạy trên máy bạn:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
winget install --id Docker.DockerDesktop -e --source winget
winget install --id Gyan.FFmpeg -e --source winget
```

Sau cài, đóng rồi mở lại PowerShell để PATH cập nhật. Mở Docker Desktop, dùng Linux containers, chờ Engine running. Nếu Docker báo WSL chưa có, mở PowerShell quyền Administrator, chạy `wsl --install`, khởi động lại Windows theo yêu cầu rồi mở Docker Desktop. Nếu vẫn lỗi virtualization, làm theo chẩn đoán Docker; không chạy tiếp các lệnh DB khi Engine chưa sẵn sàng.

Kiểm tra:

```powershell
node --version
npm --version
docker --version
docker compose version
ffmpeg -version
ffprobe -version
```

Mong đợi: Node24 LTS hoặc bản22 được hỗ trợ, npm có version, Docker/Compose có version, FFmpeg và ffprobe có thông tin phiên bản. Nếu PowerShell chặn npm.ps1 do Execution Policy, dùng `npm.cmd` thay `npm` trong các lệnh bên dưới; không cần tắt chính sách bảo mật toàn máy.

## 2. Giải nén mã nguồn

Tải ZIP1.0.0 bản có hướng dẫn cập nhật. Chuột phải ZIP → Extract All. Đặt thư mục dự án tại `C:\aacc\adsmanagershopee` hoặc một đường dẫn ngắn bạn tự chọn. Bên trong phải thấy package.json, package-lock.json, src, scripts và migrations. Nếu chỉ thấy một thư mục adsmanagershopee khác, vào thêm một cấp.

Mở PowerShell trong đúng thư mục:

```powershell
cd C:\aacc\adsmanagershopee
Get-Item package.json
```

Các lệnh sau luôn chạy trong thư mục này. Thay đường dẫn nếu bạn giải nén nơi khác. Giữ thư mục dự án trên ổ có đủ dung lượng; không dùng thư mục chỉ đọc hoặc public web folder.

## 3. Cài dependencies và tạo cấu hình development

```powershell
npm ci
npm run env:init
```

Chờ từng lệnh kết thúc rồi chạy lệnh kế tiếp. `npm ci` cài đúng package-lock. `env:init` tạo .env development với password DB/khóa mã hóa ngẫu nhiên, hoặc giữ .env đã có. Không copy nguyên .env.example làm cấu hình chạy vì có placeholders. Không sửa/xóa mật khẩu DB hay TOKEN_ENCRYPTION_KEY đã được sinh khi chỉ muốn bật MOCK.

Mở .env:

```powershell
notepad .env
```

Tìm META_MOCK_ENABLED; đổi thành `true`. Nếu chưa có, thêm đúng một dòng này:

```dotenv
META_MOCK_ENABLED=true
```

Giữ APP_ORIGIN mà env:init đã tạo cho máy cá nhân và COOKIE_SECURE=false trong development local. Lưu rồi đóng Notepad. Chưa cần Meta App ID/Secret để thử MOCK. Khi đổi .env sau khi app đang chạy, cần dừng bằng Ctrl+C rồi chạy lại web và workers.

## 4. Khởi động Database và Redis

Docker Desktop phải đang chạy:

```powershell
npm run db:up
npm run queue:up
npm run db:migrate
npm run db:status
```

Mong đợi: database/redis healthy, migration thành công và `Migration: 10/10 đã áp dụng; 0 đang chờ.` Có thể kiểm tra thêm `docker compose ps`. Không dùng `docker compose down -v` để sửa lỗi: tùy chọn -v xóa volumes dữ liệu.

## 5. Tạo tài khoản OWNER

Trong PowerShell tương tác (không phải chạy qua cửa sổ log/batch bị mất stdin):

```powershell
npm run owner:create
```

Nhập lần lượt:

1. Tên không gian làm việc: tên nhóm của bạn.
2. Tên chủ sở hữu: tên hiển thị.
3. Email đăng nhập: email bạn chọn.
4. Mật khẩu: ít nhất12ký tự.
5. Nhập lại mật khẩu.

Khi gõ mật khẩu, terminal không hiện chữ; đó là hành vi bình thường. Mong đợi thông báo đã tạo chủ sở hữu. Nếu báo đã có OWNER, dùng tài khoản đã tạo trước; không reset DB để tạo lại. Mật khẩu/secret không gửi trong chat hỗ trợ.

## 6. Build và mở web

```powershell
npm run build
npm start
```

Sau build thành công, `npm start` phải hiện Ready. Giữ cửa sổ này mở. Trên chính máy Windows của bạn, mở trình duyệt và nhập giá trị APP_ORIGIN trong .env vào thanh địa chỉ (development mặc định cổng3000). Đăng nhập bằng email/mật khẩu OWNER.

Mong đợi: có sáu mục Tổng quan, Quản lý Page, Đăng video, Quảng cáo, Doanh thu & ROAS, Cài đặt. Lúc chưa nhập dữ liệu, chỉ số tài chính có thể hiện —. Không có tài khoản hoặc dữ liệu nghiệp vụ mặc định.

## 7. Mở bốn workers

Mở thêm bốn cửa sổ/tab PowerShell. Mỗi cửa sổ chạy `cd C:\aacc\adsmanagershopee`, rồi chạy một lệnh riêng:

| Cửa sổ | Lệnh | Dùng cho |
| --- | --- | --- |
| 1 | `npm start` | Giao diện web đã mở ở bước6 |
| 2 | `npm run worker:insights` | Đồng bộ Insights theo lịch bật |
| 3 | `npm run worker:publisher` | Đăng video/comment đã xác nhận |
| 4 | `npm run worker:ads` | Tạo Ads/Bulk/Clone đã xác nhận |
| 5 | `npm run worker:care` | Đánh giá rule và Telegram đã bật |

Không chạy hai web cùng cổng. Giữ Docker Desktop và năm cửa sổ chạy. Worker phải hiện thông báo khởi động/sẵn sàng, không thoát ngay vì lỗi. Sau tắt/restart Windows, mở Docker Desktop, chạy db:up/queue:up rồi mở lại các tiến trình; không cần tạo OWNER lại.

## 8. Kết nối Page/TKQC MOCK

1. Đăng nhập OWNER → Cài đặt → Kết nối Meta.
2. Bấm Mở kết nối thử nghiệm.
3. Chọn Page thử nghiệm — Gia dụng; Page Làm đẹp cố ý thiếu quyền đăng, nên chưa dùng cho bài thử đầu.
4. Bấm bước tiếp theo, chọn TKQC thử nghiệm VND.
5. Ở Ghép tài khoản, ghép Page Gia dụng với TKQC VND.
6. Kiểm tra quyền, bấm Hoàn tất thiết lập.
7. Vào Quản lý Page; Page phải có nhãn thử nghiệm và TKQC chính đã ghép.

MOCK mô phỏng dữ liệu/kết quả trong app. Chọn MOCK ở từng module khi thử; không lấy ID thử nghiệm làm ID Facebook thật.

## 9. Bài thử đầu tiên: Analytics → Ads Care

Đây là cách kiểm tra nhanh nhất, chưa cần đăng video hoặc nhập Shopee.

### Lưu Insights ngày hôm qua

Quảng cáo → khu Analytics:

- Nguồn: MOCK — thử nghiệm.
- TKQC: TKQC thử nghiệm VND.
- Từ ngày và Đến ngày: cùng ngày hôm qua theo Việt Nam UTC+7.
- Cấp báo cáo: Campaign; thời gian: Cohort ngày đặt đơn.
- Bấm Đồng bộ Insights.

Mong đợi fixture VND một ngày: Spend150000, CPC600, CTR2.5%, LPV160. Nếu chưa có commission/link evidence, ROAS hiển thị — là đúng. Tài khoản USD MOCK không có cùng fixture; dùng VND cho bài này.

### Tạo rule Winner

Cài đặt → Automation → Mở Ads Care:

1. Tên rule: `Winner thử nghiệm`.
2. Nguồn Ads Care: MOCK; TKQC: VND; cấp: Campaign.
3. Số ngày đã kết thúc:1; dữ liệu mới tối đa:60phút; cooldown:60phút.
4. Chỉ số1: CTR (%); so sánh≥; ngưỡng2.
5. Chọn Cảnh báo Dashboard và Winner Detection. Giữ Telegram/Auto Pause tắt.
6. Bấm Lưu rule tắt.
7. Trong bảng rule, bấm Dry Run Winner thử nghiệm.
8. Kiểm bằng chứng: CTR2.5000, đạt ngưỡng, Dry Run chưa tạo cảnh báo/gửi tin/dừng Ads.
9. Bấm Bật cảnh báo, chờ khoảng30–60giây khi workerCare đang chạy.
10. Bảng cảnh báo xuất hiện WINNER/OPEN; bấm Đã kiểm tra, trạng thái chuyển REVIEWED.

Ngưỡng2 chỉ là ví dụ cho fixture thử; khi dùng dữ liệu thật hãy đặt theo tiêu chí của bạn. Không bấm Auto Pause trong bài đầu. Rule tài chính cần đủ dữ liệu Shopee và kiểm chất lượng; không thay null thành0.

## 10. Thử Video và Ads từ Donor

### Tạo Donor MOCK

Quảng cáo → nguồn Donor MOCK → Tạo Donor. Đặt tên, chọn TKQC VND, bấm Điền ID thử nghiệm:

- Campaign90071992547409931.
- Ad Set90071992547409932.
- Ad90071992547409933.

Bấm Đọc & kiểm tra preview, đọc cảnh báo/normalization rồi lưu Donor version.

### Upload và đăng video MOCK

1. Đăng video → nguồn MOCK → chọn Page Gia dụng.
2. Cấu hình đăng & comment → tick Cho phép đăng video trên Page này, auto-comment tắt → Lưu cấu hình Publisher.
3. Video Library: chọn MP4 H.264 hợp lệ,≤300MiB; chọn sản phẩm nếu muốn thử tracking sau → Upload video đã chọn.
4. Đăng hàng loạt: chọn file, nhập caption, không đặt lịch cho bài thử ngay.
5. Xem preview đăng video → đọc nguồn/Page → tick xác nhận → Xác nhận thêm vào hàng đợi.
6. Publish Queue/Bài viết đã đăng: đợi Thành công/SUCCEEDED và Post ID MOCK. Không có bài Facebook thật.

### Tạo Existing Post Ads

Bài viết đã đăng → Chạy quảng cáo. Chọn video/Donor version, Existing Post; chọn OUTCOME_ENGAGEMENT và POST_ENGAGEMENT ở flow hỗ trợ. Donor Traffic/Link Clicks ban đầu có thể bị chặn; sửa đúng hai trường này trước preview. Tick đã kiểm targeting; kiểm Facebook Feed/các findings; Kiểm tra compatibility / Preview Ads.

Chỉ xác nhận khi READY. Xác nhận tạo Ads PAUSED → chờ workerAds → Đã xác minh PAUSED với Campaign/Ad Set/Creative/Ad IDs MOCK. Nếu UNKNOWN, xem recovery/lịch sử, không tạo request mới để vượt chặn. Chi tiết ADS_CREATION.md.

### Bulk và Clone

Sau có ít nhất một request verified: Quảng cáo → Bulk Ads & Cloning. Chọn video/Donor/cấu trúc, preview số object và ngân sách, tick hai xác nhận rồi tạo PAUSED. Clone nguồn từ request đã verified trong app. New Creative cần sản phẩm và ADS SubID/Custom Link riêng từng row; đọc BULK_ADS.md trước thực hiện. Existing Post giữ attribution chung, không dùng để chứng minh ROAS riêng từng Ad.

## 11. Shopee và ROAS

Cài đặt → Shopee → tạo sản phẩm bằng link thật của bạn. Sinh tracking đúng Page/sản phẩm/channel/affiliate namespace. Với video/New Creative, dùng chức năng chuẩn bị tracking trong wizard để gắn contentId đúng.

Dùng SubID trong Shopee Affiliate để tạo Custom Link, dán link được Shopee tạo vào app và xác nhận. App không tự thêm SubID vào query. Doanh thu & ROAS → nhập báo cáo commission CSV, chọn đúng nguồn/mã Affiliate, ghép cột/status/date/currency, preview rồi xác nhận nhập. Kiểm Unmatched/Cần xem xét trước đánh giá ROAS. ADS IDs, link/SubID, namespace/currency/kỳ ngày đặt đơn và data quality phải khớp; dữ liệu thiếu/shared/cũ vẫn giữ —.

Hướng dẫn sâu: SHOPEE_WORKFLOW.md, COMMISSION_RECONCILIATION.md và ADS_ANALYTICS.md. Không kỳ vọng ROAS xuất hiện chỉ vì đã tạo Ads MOCK; cần bộ dữ liệu commission/mapping tương ứng.

## 12. Chuyển sang Meta LIVE và Telegram

Khi MOCK đã đạt các mốc trên, đọc META_CONNECTION.md/DEPLOYMENT.md để chuẩn bị Meta App, Graph version, App Secret/direct server values, OAuth Redirect URI và App/quyền Page/TKQC. Redirect phải thuộc cùng APP_ORIGIN và được đăng ký trong Meta App. Khi chạy production cần HTTPS/COOKIE_SECURE=true; Publish môi trườngCodex chỉ kích hoạt cấu hình cloud, không cấp domain/HTTPS public cho máy Windows.

Không đổi TOKEN_ENCRYPTION_KEY gốc. Đặt META_MOCK_ENABLED=false, restart web/workers, Cài đặt → Kết nối Meta → OAuth chính thức → chọn tài nguyên được cấp quyền/mapping. Không dùng ID MOCK cho LIVE. Kiểm tra quyền thật và từng mutation PAUSED có readback trước scale. Live chưa được nghiệm thu trên tài khoản của bạn.

Telegram: tạo Bot của bạn qua BotFather, thêm Bot vào chat/group phù hợp, lấy Chat ID bằng cách được Telegram hỗ trợ. Cài đặt → Telegram → nhập Bot Token/Chat ID, chọn events/cooldown và Lưu. Bấm Gửi tin kiểm tra kết nối khi bạn muốn gửi một tin thật. Sau kết nối thành công mới bật các thông báo mong muốn. Không có Bot/token/chat mặc định; token không gửi trong chat trợ giúp. Auto Pause giữ tắt đến khi dữ liệu/quyền/Dry Run và xác nhận riêng đạt.

## 13. Backup, tắt và mở lại

Trong một PowerShell khác cùng thư mục, khi không upload/không chạy batch mới:

```powershell
npm run db:backup
npm run media:backup
```

Giữ cả .env/TOKEN_ENCRYPTION_KEY và thư mục backup private ở nơi bảo vệ ngoài máy. ZIP mã nguồn không chứa DB/media/secret của bạn. Restore chỉ theo hướng dẫn, không overwrite DB/file đã có để chữa lỗi.

Để tắt: Ctrl+C lần lượt ở web và workers; Docker có thể để chạy. Để mở lại: mở Docker Desktop → cd thư mục → db:up → queue:up → mở năm lệnh ở bước7. Không chạy env:init/owner:create lại nếu cấu hình và user vẫn có.

## 14. Lỗi hay gặp

| Dấu hiệu | Cách xử lý |
| --- | --- |
| npm/node/ffmpeg/ffprobe not recognized | Cài phần mềm/PATH, đóng và mở PowerShell mới; kiểm lại từng version. |
| npm.ps1 cannot be loaded | Dùng npm.cmd thay npm. |
| Cannot connect to Docker daemon | Mở Docker Desktop, chờ Engine running/kiểm WSL2. |
| Không tìm thấy package.json | cd vào thư mục có package.json; thường bị giải nén lồng một cấp. |
| Port5432/6379 already allocated | Xác định ứng dụng đang chiếm cổng; dừng dịch vụ đó nếu thuộc về bạn, hoặc cấu hình ports và URL nhất quán theo DEPLOYMENT. Không xóa volumes. |
| EADDRINUSE port3000 | Dừng web cũ bằng Ctrl+C; chỉ chạy một web. Đổi port thì phải đổi APP_ORIGIN và cách khởi động nhất quán. |
| MOCK_DISABLED/nút thử nghiệm không hiện | .env có META_MOCK_ENABLED=true; restart web và workers; chọn đúng nguồn MOCK. |
| INVALID_ORIGIN | Địa chỉ trình duyệt khác APP_ORIGIN; dùng cùng scheme/hostname/port, rồi restart sau sửa. |
| QUEUED/WAITING mãi | Kiểm Publisher/Ads worker, Docker/Redis, dependency parent và lịch; xem log/code trong app. |
| OWNER không tạo được | Terminal phải tương tác; password≥12ký tự; nếu đã có OWNER thì đăng nhập tài khoản cũ. |
| Auto Pause bị chặn | Đọc blockers; không force bypass. Chỉ bật sau Dry Run/quyền/API/coverage/freshness/checkbox đủ. |
| ROAS hiện — | Kiểm commission/mapping/link riêng/namespace/currency/kỳ/freshness; chưa đủ dữ liệu không phải0. |

Nếu cần hỗ trợ, gửi tên bước, lệnh đã chạy và thông báo lỗi đã che thông tin nhạy cảm. Không gửi .env, mật khẩu, Bot Token/App Secret hoặc báo cáo khách hàng.
