# Khắc phục lỗi

| Hiện tượng                                  | Cách xử lý                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Không có tài khoản để đăng nhập             | Chạy `npm run owner:create` ở terminal tương tác sau migrations; chọn email/mật khẩu riêng                   |
| OWNER đã tồn tại                            | Không khởi tạo lại; dùng tài khoản ban đầu, không reset Database                                             |
| Email/mật khẩu sai hoặc tài khoản khóa      | Kiểm tra email; hỏi OWNER về trạng thái; không tiết lộ tài khoản tồn tại trong lỗi login                     |
| Đăng nhập bị giới hạn                       | Chờ 15 phút sau nhiều lần thất bại; counter lưu Database nên restart App không bỏ giới hạn                   |
| Yêu cầu không hợp lệ/403 Origin             | `APP_ORIGIN` phải đúng scheme/hostname/port trình duyệt; restart App sau đổi `.env`                          |
| Database chưa sẵn sàng                      | Kiểm tra Docker hoạt động, `npm run db:up`, `.env`, rồi `npm run db:status`; không xóa volume                |
| Migration thất bại                          | Kiểm tra kết nối, SQL và hash lịch sử; khôi phục migration đã sửa về bản gốc, tạo migration mới cho thay đổi |
| Test không chạy vì Database                 | `db:test:up`, `db:migrate -- --test`; TEST_DATABASE_URL phải khác DB ứng dụng và kết thúc `_test`            |
| Không tìm thấy Chromium                     | Đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` đến Chromium có sẵn hoặc cài Chromium chính thức bằng Playwright   |
| Nhân viên không được quản lý nhóm/tài chính | Kiểm tra vai trò; không chỉ đổi giao diện để bỏ RBAC backend                                                 |
| Các KPI hiển thị “—”                        | Đây là thiếu dữ liệu/tích hợp, không phải ROAS=0 hoặc lỗi render; module nghiệp vụ chưa triển khai           |
| Quên mật khẩu OWNER                         | Chưa có recovery UI; không xóa Database. Cần coding task bổ sung quy trình recovery an toàn trước production |

Không log/dump `.env`, password, cookie hoặc token để chẩn đoán. Kiểm tra tên/presence biến cấu hình, trạng thái service và thông báo lỗi đã được chuẩn hóa. Không tắt TLS/checksum khi tải dependencies.

## Meta & Ads Donor

- Nút Kết nối Facebook bị vô hiệu: thiếu cấu hình Meta App/Graph version/Redirect URI hoặc khóa mã hóa. Kiểm tra tên biến theo META_CONNECTION.md, không log giá trị.
- Không có nút Mở kết nối thử nghiệm: mặc định META_MOCK_ENABLED=false. Chỉ bật rõ ở development rồi restart.
- OAUTH_STATE: phiên quá 10 phút, dùng lại callback, đổi người đăng nhập hoặc state sai. Bắt đầu kết nối lại.
- META_TOKEN_EXPIRED/META_PERMISSION: token bị thu hồi/hết hạn hoặc scope/tasks/App Review thiếu. Kết nối lại, không retry loop hay đổi tài khoản để né hạn mức.
- TOKEN_UNREADABLE: khóa AES khác khóa đã dùng lưu token. Khôi phục khóa từ secret storage hoặc kết nối lại; không sửa token trong Database.
- INVENTORY_STALE: bấm Làm mới quyền rồi hoàn tất wizard; không dùng danh sách cũ quá 15 phút.
- DONOR_MISMATCH/DONOR_SOURCE_ACCOUNT: kiểm tra ba ID và TKQC nguồn, không đoán quan hệ theo tên.
- DONOR_CHANGED: cấu hình nguồn thay đổi sau preview. Đọc preview mới trước lưu.
- Library/Page rỗng với nhân viên: quản trị viên cấp đúng Page/TKQC ở tab Tài khoản quảng cáo; role và resource grants đều được kiểm tra backend.
- Import lỗi ID/tiền XLSX: lưu các cột dạng Text, dùng mẫu account_id,date,currency,spend. Một dòng tổng TKQC/ngày; một currency. Import chưa tự map các tiêu đề export khác.

## Shopee Tracking

- CSV_ENCODING: chọn đúng UTF-16/Windows encoding nếu biết hoặc xuất lại UTF-8; không đoán từ bytes hỏng.
- COMMISSION_COLUMNS/COMMISSION_ROW: ghép đúng commission/status/date, chọn dấu tiền và format YMD/DMY/múi giờ. Không dùng Product ID làm Order Item ID.
- Có dòng Cần xem xét: thiếu identity/status hoặc revision mâu thuẫn; chưa vào totals. Đối soát với CSV nguồn, apply/ignore kèm lý do. Order Completed không mặc định PAID.
- Không thấy dữ liệu vừa nhập: source và mã tài khoản phải khớp. Page MOCK cần báo cáo MOCK, không tự trộn vào LIVE. Financial roles chỉ thấy Page/TKQC được grant.
- LINK_SUBID: trả kết quả theo tracking_id + sub_id, không theo thứ tự. Một dòng sai rollback toàn batch.
- Mức Chỉ SubID: chưa có link hoặc URL từng dùng chung. Đổi URL không chứng minh nguồn của đơn cũ; dùng record/SubID mới để tách nguồn.
- File đã nhập: đổi tên/tái upload không cộng trùng. Preview đã APPLIED không dùng cấu hình khác để nhập lần nữa; xử lý review hoặc CSV hiệu chỉnh đúng nguồn.

## Ads Analytics & ROAS

Không có TKQC: chọn đúng source, hoàn tất Meta wizard và grants. Mock VND Ad không thuộc TKQC USD. Bảng không có spend: chọn kỳ và sync/nhập mẫu Ad/ngày; CSV cũ cấp Account không phải facts Analytics. SPEND_CONFLICT: preview/xác nhận thay ngày, không cộng hai nguồn. PREVIEW_CHANGED: xem lại preview đúng file/kỳ. REPORTING_DIMENSIONS_CHANGED: đồng bộ lại cả kỳ sau đổi currency/timezone; không đổi đơn vị tiền cũ. ROAS —: đọc Data Quality và xử lý missing/review/unmatched/shared/mapping; không ép giá trị 0. STALE_DATA: kiểm tra `npm run worker:insights`, autoSync/nextSyncAt, history và token/quyền; worker giữ CSV đã chọn. Other Costs/Page subset hoặc nhiều SubID/Ad cần tách mapping rõ; app không tự chia tài chính thiếu bằng chứng. LIVE Insights chưa cấu hình xem META_CONNECTION.md; không gửi secrets trong chat.

## Video Publisher

| Hiện tượng | Cách xử lý |
| --- | --- |
| Chưa có Page / không upload được | Chọn đúng LIVE/MOCK và một Page; kiểm tra cấp quyền Page, role và Meta wizard. |
| VIDEO_FORMAT/VIDEO_CODEC/VIDEO_METADATA | Dùng MP4 H.264 hợp lệ <=300 MiB, có metadata thực; kiểm tra ffprobe trong PATH. Không đổi đuôi file để bỏ qua. |
| Upload báo trùng hash | Cả hai file được giữ; chỉ cảnh báo. File đã đăng cần xác nhận đăng lại; job đang chạy/UNKNOWN vẫn chặn trùng. |
| PUBLISH_DISABLED / thiếu scope | OWNER/ADMIN bật Page publishing; kết nối lại nếu thiếu pages_manage_posts hoặc pages_manage_engagement/comment. |
| Không chọn được tracking | Tracking phải đúng contentId/Page/product/source, Organic/link đã xác nhận. Tạo từ video trong Publisher, không lấy ADS tracking khác. |
| Queue không chạy / Redis lỗi | npm run queue:up, kiểm REDIS_URL, worker:publisher và cấu hình nguồn; PostgreSQL giữ job, không xóa/reset job. |
| Lịch chưa chạy | Kiểm thời điểm UTC+7/UTC, pause toàn queue/job, worker và Page permissions. |
| UNKNOWN | Mở Kiểm tra / nối ID; đối chiếu bài/comment thật trước khi nối ID có lý do. Không tạo batch mới để gửi lại. |
| UNSUPPORTED preview | API gỡ preview link chưa được xác minh; comment không tự gửi. Tắt yêu cầu cho batch mới hoặc xử lý thủ công. |
| VIDEO_MISSING/VIDEO_CHANGED sau restore | Khôi phục media gốc đúng storage key/hash; dump DB không chứa file video. |

Mock IDs không phải bài Facebook thật. File/range API cũng kiểm session/Page grants. Không log đường dẫn bí mật, upload session, Page token hoặc .env để chẩn đoán.

## Ads from Donor

- Không có video: cần Publisher VIDEO SUCCEEDED, đúng nguồn/Post ID, Page mapped TKQC và grants cả hai.
- NEEDS_FIX: kiểm tra normalized targeting acknowledgement, link READY/đúng video, ngân sách hoặc lịch mới; sửa field trong wizard rồi preview lại.
- UNSUPPORTED: Existing Post Traffic/CTA/link mới hoặc placements/objective khác flow; dùng Engagement/Post Engagement hoặc New Creative phù hợp.
- ADS_PREVIEW_CHANGED: link/quyền/config vừa đổi; đọc preview mới. ADS_LINK_FROZEN: dùng SubID mới hoặc hủy request chưa tạo để đổi link.
- UNKNOWN: chỉ kiểm tra/nối ID đúng bước với account/marker/config/parents; không bấm retry hoặc tạo request mới để bỏ qua.
- Lỗi chắc chắn: sửa cấu hình/quyền rồi Retry Ads, IDs đã tạo được giữ/read lại. Không tự xóa partial objects.
- Jobs chờ: kiểm tra worker:ads/Database/availableAt/backoff. MOCK không tạo đối tượng Facebook thật; LIVE thiếu App/quyền còn chờ nghiệm thu.

## Bulk/Cloning

- Shared parent config conflict: đồng nhất target/budget/lịch hoặc chọn cấu trúc nhiều parents mới; không sửa parent PAUSED qua clone.
- Clone membership changed: đọc blueprint mới, không bỏ source members để ép confirm.
- WAITING: parent đang chưa verified/FAILED/UNKNOWN; xử lý parent, worker tự wake child sau verified.
- NEEDS_ACTION: retry chỉ FAILED; UNKNOWN phải read/verified adoption; PAUSED do user không bị recovery tự mở.
- Redis giữ failed job trước PGclaim: outbox có thể bump generation nếu PG QUEUED, không dùng đường này với PROCESSING/UNKNOWN.
- Shared link/SubID: tạo Custom Link riêng từng clone New Creative, không chỉ đổi SubID DB.
- Không hủy riêng bulk request: dùng Pause Batch giữ graph; request đang gửi chờ kết quả.

## Ads Care / Production

CARE_DRY_RUN_REQUIRED: chạy DryRun cùng cấu hình sau sửa, trong24h trước arm. CARE_DATA_GUARD: đọc blockers, sync đủ ngày API/maxage≤60, trạng thái ACTIVE; với finance kiểm báo cáo mới/độ đầy đủ/ngàycuối/attribution. Không sửa0 cho metric null. CARE_API_PERMISSION: refresh Meta/token/tasks/scopes và quyền; không forcepause. UNKNOWN: kiểm tra Ads Manager/chat, chỉ đọc recovery, không reset claims.

Telegram FAILED: kiểm Bot/Chat/permissions, selectedevents/enabled/worker/egressapi.telegram.org; retry chỉ definitefailed hiệnversion. 429chờ, UNKNOWNkiểmchat. Đổi config cancelsjobs cũ. REPORT_TOO_LARGE: thu nhỏ kỳ/level; không trả totals cắt. API_RATE_LIMIT chờ Retry-After. LỗiHTTPS/Origin: sửaAPP_ORIGIN/cookie/reverseproxy, không tắtguards. Media symlink/integrity: khôi phục file gốc/backup, dùngprivate root thực; không publicmedia.
