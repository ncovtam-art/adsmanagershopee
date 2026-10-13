# Hướng dẫn sử dụng — Affiliate Ads Command Center

Bản web tiếng Việt hiện có Giai đoạn 1–10. ZIP đi kèm là mã nguồn có thể cài/build, không chứa dữ liệu tài khoản, token, video riêng hoặc Database. Bản mã nguồn1.0.0 đã hoàn thành triển khai1–10; Meta LIVE/Telegram thật và triển khai HTTPS cần nghiệm thu trên tài khoản/máy chủ của bạn.

## Cài đặt bản ZIP trên máy của bạn

Cài Node.js >=22, npm, Docker với Compose v2 và FFmpeg. Kiểm tra `node --version`, `docker compose version`, `ffmpeg -version`, `ffprobe -version` tại terminal. Giải nén ZIP, mở terminal trong thư mục adsmanagershopee:

```bash
npm ci
npm run env:init
npm run db:up
npm run queue:up
npm run db:migrate
npm run db:status
npm run owner:create
npm run build
npm start
```

`owner:create` chỉ chạy khi chưa có OWNER; nhập thông tin riêng, mật khẩu ít nhất 12 ký tự và không echo trong terminal. Không có tài khoản mặc định. `env:init` giữ cấu hình đã có; mật khẩu Database/khóa development sinh ngẫu nhiên. Giữ TOKEN_ENCRYPTION_KEY để đọc token/report đã mã hóa sau này.

Mở app bằng địa chỉ APP_ORIGIN trong `.env`. APP_ORIGIN phải trùng scheme/hostname/port trình duyệt; đổi thì restart web. Production cần HTTPS và COOKIE_SECURE=true. Không đưa `.env` vào Git/chia sẻ.

Mở hai terminal nữa, cùng thư mục, chạy lần lượt:

```bash
npm run worker:insights
```

```bash
npm run worker:publisher
```

Mở terminal thứ tư chạy `npm run worker:ads`. Mở terminal thứ năm chạy `npm run worker:care`. Giữ năm tiến trình web/Insights/Publisher/Ads/Care và PostgreSQL/Redis chạy. Worker Insights cập nhật theo lịch khi được bật; Publisher chỉ nhận batch đã xác nhận. Chạy `npm run db:backup` trước chuyển máy; backup media riêng. Xem [DEPLOYMENT.md](DEPLOYMENT.md) khi cấu hình máy chủ.

## Bắt đầu thử mà chưa kết nối Facebook thật

Trong `.env`, đặt META_MOCK_ENABLED=true và restart web/cả worker. **Cài đặt → Kết nối Meta → Mở kết nối thử nghiệm** → chọn Page/TKQC → mapping → hoàn tất. MOCK luôn có nhãn thử nghiệm, không đăng bài hoặc tạo quảng cáo trên Facebook. Chọn đúng nguồn MOCK trong các màn hình. Khi dùng LIVE, tắt Mock và cấu hình Meta App theo [META_CONNECTION.md](META_CONNECTION.md).

## Sáu mục giao diện

| Mục | Cách dùng chính |
| --- | --- |
| Tổng quan | Xem tài nguyên đã lưu; số liệu thiếu giữ “—”. |
| Quản lý Page | Xem Grid/Table, mở Workspace, đổi mã/ngách/TKQC, xem lịch sử và dữ liệu đúng Page. |
| Đăng video | Library, upload, templates, preview/bulk publish, lịch, queue và Post/Comment IDs. |
| Quảng cáo | Đọc/lưu version Ads Donor; Campaign Manager từ dữ liệu Insights/CSV. Tạo Ads PAUSED từ Donor; chưa bật Ads trong app. |
| Doanh thu & ROAS | Import commission, xử lý Unmatched/review; xem spend/attribution/ROAS/profit khi dữ liệu đủ. |
| Cài đặt | Meta, Shopee, nhân viên/quyền tài nguyên, workspace, health và audit. |

## Nhân viên và quyền

OWNER/ADMIN tạo/khóa/mở khóa nhân viên ở Cài đặt, cấp đúng Page/TKQC. OWNER mới được quản lý ADMIN. Khóa nhân viên thu hồi phiên đăng nhập. MANAGER/MEDIA_BUYER cần scope tài nguyên để đọc/viết nghiệp vụ; UPLOADER có quyền nội dung theo Page nhưng không xem tài chính/quản lý cấu hình toàn cục; VIEWER chỉ đọc, không upload/confirm. Hệ thống kiểm quyền ở backend. Không thể khóa chính mình hoặc OWNER.

## Page và Ads Donor

Kết nối Meta → chọn inventory được cấp quyền → mapping Page/TKQC → hoàn tất. Page Workspace giữ lịch sử thay mapping. **Quảng cáo → Tạo Donor** → chọn TKQC → nhập Campaign/Ad Set/Ad ID → đọc preview → kiểm nguồn và warnings → lưu. Mở version cũ để xem snapshot bất biến; không sửa version đã lưu. Import báo cáo fallback không cấp quyền Ads API. Chi tiết [ADS_DONOR.md](ADS_DONOR.md).

## Shopee Tracking và commission

1. **Cài đặt → Shopee → Sản phẩm**: tạo sản phẩm đúng link/currency.
2. **Tracking & Custom Link**: chọn Page/sản phẩm/mã Affiliate, tạo SubID. Với video, dùng nút tạo tracking trong Publisher để gắn contentId chính xác.
3. Tạo Custom Link bên Shopee với SubID được sinh → dán URL vào app → xác nhận. App lưu version/link history, không tự thêm query SubID và không coi link khai báo là API verified.
4. Bulk: xuất danh sách chuẩn bị, nhập file trả kết quả theo tracking ID/SubID, không theo thứ tự dòng.
5. **Doanh thu & ROAS**: cùng nguồn/mã Affiliate → tải commission CSV → map cột/encoding/status/date/tiền → preview → xác nhận nhập. File giống nhau không cộng trùng. Đọc Unmatched/Cần xem xét, ghi lý do khi xử lý thủ công; thiếu identity/status giữ trong review.

Xem [SHOPEE_WORKFLOW.md](SHOPEE_WORKFLOW.md) và [COMMISSION_RECONCILIATION.md](COMMISSION_RECONCILIATION.md). Có thể thử bằng mẫu; CSV thực tế của bạn cần kiểm chứng mapping trước commit.

## Ads Analytics và ROAS

Chọn nguồn/TKQC/kỳ → Đồng bộ Insights hoặc Nhập Ads CSV theo mẫu Ad/ngày → preview/xác nhận. **Quy tắc tài chính & lịch cập nhật** cấu hình statuses dự kiến/Other Costs và bật lịch nếu muốn. Không cộng đồng thời API/CSV cho cùng account/ngày. PAID là thực nhận; mapping ADS phải đúng Meta IDs/link riêng, commission cùng namespace. ROAS/profit giữ “—” khi thiếu/không đủ dữ liệu, shared/unmatched/review, currency khác hoặc dữ liệu quá cũ. Daily/cohort theo order date trong timezone TKQC. Chi tiết [ADS_ANALYTICS.md](ADS_ANALYTICS.md).

## Kiểm tra Video Publisher trong 5 phút

1. Chọn MOCK/một Page → cấu hình cho phép đăng; auto-comment tạm tắt.
2. Library → chọn MP4 H.264 <=300 MiB → sản phẩm/ngách → upload. Bấm tên để xem; upload lại file thấy cảnh báo trùng hash.
3. Đăng hàng loạt → chọn file, nhập caption hoặc template → preview → tick xác nhận → thêm queue.
4. Publish Queue → thấy SUCCEEDED/Thành công và Post ID **MOCK**; mở lịch sử/Posted Videos. Không có bài Facebook thật trong thử nghiệm.
5. Upload file khác → đặt lịch tương lai → preview/xác nhận → thử pause/resume/cancel.
6. Muốn comment link: tạo tracking gắn video, nhập/xác nhận Custom Link trong Shopee, bật auto-comment Page và delay, chọn tracking ở Publisher → preview/xác nhận → thấy comment sau Post ID. Yêu cầu gỡ preview link báo UNSUPPORTED.

Hướng dẫn đầy đủ, trạng thái UNKNOWN và recovery: [VIDEO_PUBLISHER.md](VIDEO_PUBLISHER.md). UNKNOWN phải kiểm tra ID trước; không bấm tạo batch mới để vượt chặn trùng.

## Tạo Ads từ Donor

Video đã đăng → **Chạy quảng cáo**, hoặc Quảng cáo → **Tạo Ads PAUSED**. Chọn video/version, Existing Post (Engagement/Post Engagement) hoặc New Creative (Traffic/Link Clicks và ADS SubID/Custom Link riêng). Đọc compatibility/preview, sửa từng field, tick xác nhận targeting và nguồn → xác nhận tạo. Worker trả bốn IDs mới và verified PAUSED; MOCK không có Ads thật. UNKNOWN phải kiểm tra/nối ID, không tạo lại mù. Hướng dẫn đầy đủ: [ADS_CREATION.md](ADS_CREATION.md).

## Bulk Ads & Cloning

Quảng cáo → **Tạo hàng loạt & nhân bản Ads** → chọn source/video/Donor/preset/cấu trúc → preview counts/tổng ngân sách → tick hai xác nhận → tạo PAUSED. Theo dõi batch/logs, Pause/Resume và Retry Failed; UNKNOWN mở Ads recovery. Clone source Campaign/Ad Set/Ad chỉ từ dữ liệu đã verified trong app; New Creative clone cần link/SubID riêng từng row. Worker Ads nay cần Redis/BullMQ cùng PostgreSQL; giữ năm terminal web/Insights/Publisher/Ads/Care. Hướng dẫn [BULK_ADS.md](BULK_ADS.md).

## Dữ liệu và hỗ trợ lỗi

Giữ Database, media và TOKEN_ENCRYPTION_KEY gốc. ZIP mã nguồn không phải backup dữ liệu. `db:restore` development chỉ khôi phục vào DB chưa có bảng, trước migrate; không reset DB đang có dữ liệu. Khi app không cập nhật, kiểm tra web/worker, Database/Redis, quyền/nguồn và thông báo lỗi. Xem [TROUBLESHOOTING.md](TROUBLESHOOTING.md); không gửi token/password/raw báo cáo qua chat.

## Tình trạng phát hành hiện tại

Giai đoạn1–10 đã triển khai. Bản mã nguồn1.0.0 có đầy đủ các module trong phạm vi đã mô tả; bước tiếp theo là cài đặt và nghiệm thu với Meta LIVE, Telegram thật, HTTPS/máy chủ và dữ liệu thực của bạn. Các adapter và giới hạn hỗ trợ được nêu trong tài liệu từng module.

Hướng phát hành đã chọn là web + ZIP mã nguồn. Nếu dùng Windows cá nhân, bắt đầu với [START_HERE_WINDOWS.md](START_HERE_WINDOWS.md). Kế hoạch và giới hạn tại [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Ads Care và Telegram

Cài đặt → Automation → Mở Ads Care. Chọn đúng nguồn/TKQC/cấp, tự nhập ngưỡng AND và hành động; lưu rule tắt → Dry Run → đọc bằng chứng → Bật cảnh báo. Winner Detection dùng ngưỡng bạn đặt. Tổng quan hiển thị số cảnh báo chưa kiểm tra; Quảng cáo/Automation có bảng chi tiết và Đã kiểm tra.

Auto Pause chỉ OWNER/ADMIN, dữ liệu API đầy đủ/mới≤60phút, quyền ads_management và DryRun cùng cấu hình hợp lệ. Checkbox xác nhận riêng mới cho bật; sửa rule hủy quyền cũ. UNKNOWN chỉ đọc xác minh, không gửi lại. Với ROAS/Commission/Profit cần nhập Shopee đủ kỳ và xác nhận độ đầy đủ/ngày cuối; báo cáo thiếu/cũ giữ chặn. Chi tiết [ADS_CARE.md](ADS_CARE.md).

Cài đặt → Telegram: nhập Bot Token/Chat ID riêng, chọn loại thông báo, Lưu; token không trả về sau lưu. Bật gửi là lựa chọn riêng. Gửi tin kiểm tra kết nối gửi một tin thật, chỉ bấm khi bạn muốn kiểm tra chat. Không có token/chat mặc định. Worker Care cần chạy; network cần api.telegram.org. Giữ key AES và backup riêng, không gửi token trong chat trợ giúp.

## Bản phát hành và vận hành

Đọc [HARDENING.md](HARDENING.md), [DEPLOYMENT.md](DEPLOYMENT.md) và [RELEASE_NOTES.md](RELEASE_NOTES.md). Bản ZIP không chứa dữ liệu/credentials; SHA256 manifest kiểm tính nguyên vẹn, không phục hồi dữ liệu tài khoản. Kiểm tra MOCK trước rồi cấu hình Meta LIVE, HTTPS, backup và quyền thật. App không tự bật Ads tiêu tiền. Năm worker/process cần được supervisor khởi động lại sau đổi máy/task; review/lưu → Publish environment settings là thao tác của nền tảng, không phải deploy web public.
