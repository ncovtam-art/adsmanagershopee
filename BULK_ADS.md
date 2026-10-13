# Bulk Ads & Cloning — Giai đoạn 8

Đã có batch preview/confirm, các cấu trúc dùng chung parent, Ads Presets, tracking preparation theo row key, cloning ba cấp, BullMQ queue, pause/resume/retry/recovery và log/lineage. Mọi Campaign/Ad Set/Ad mới mặc định PAUSED. Không thực hiện clone/tạo/bật Ads Facebook LIVE trong setup; MOCK có nhãn rõ.

## Khởi động

Dùng Node >=22, PostgreSQL/Redis/FFmpeg đã cấu hình theo USER_GUIDE.md. `npm run queue:up` cần chạy trước Ads worker. Giữ bốn terminal web/Insights/Publisher/Ads; worker Ads hiện xử lý cả single-request PostgreSQL và Bulk BullMQ:

```bash
npm run worker:ads
```

Smoke: `npm run worker:ads -- --once`. Trong cloud có proxy Node thêm NODE_USE_ENV_PROXY=1; thử nghiệm bật META_MOCK_ENABLED=true cho web và workers. Redis app DB0/prefix aacc_ads_bulk; tests DB15/prefix aacc_test_ads_bulk riêng. Không chạy integration và E2E cùng test DB. Sau chuyển task/máy cần start lại các tiến trình; PostgreSQL là outbox/states/IDs bền, Redis có thể đẩy lại từ DB.

## Tạo batch

1. Đăng nhập OWNER/ADMIN/MANAGER/MEDIA_BUYER có Page/TKQC grants. Cần video đã đăng SUCCEEDED, mapping TKQC chính và Donor version cùng source.
2. **Quảng cáo → Tạo hàng loạt & nhân bản Ads → Nguồn Bulk Ads → Mở Bulk Ads & Cloning**. Chọn đúng LIVE/MOCK; chọn video/Page, Donor version hoặc Ads Preset, tên/cấu trúc.
3. Existing Post dùng Engagement/Post Engagement, giữ bài/link gốc và attribution SHARED/SubID. New Creative dùng Traffic/Link Clicks, CTA/message có thể override, video/sản phẩm/SubID/link độc lập. Compatibility Giai đoạn 7 được dùng lại, không gửi RAW Donor/source IDs vào create.
4. Tick đã kiểm tra normalized targeting cho mọi rows. Chọn budget chung hoặc budget riêng từng row; lịch mới ISO có offset nếu cần. Không tái dùng lịch cũ vào object mới; lifetime cần end. Nếu chỉ một field cần sửa, sửa override rồi preview lại.
5. **Preview Bulk / ngân sách**: xem từng Page/TKQC/video/Donor/SubID/link, findings và snapshot, số object thực sự mới và tổng ngân sách. NEEDS_FIX/UNSUPPORTED/UNKNOWN chặn confirm; sửa toàn bộ lỗi rồi preview mới.
6. Tick đã kiểm tra tổng ngân sách/cấu trúc và xác nhận nguồn tạo PAUSED → **Xác nhận Bulk PAUSED**. Bảng batch hiển thị progress/success/failed/unknown/waiting; worker xử lý từng request, không bật Ads.

### Cấu trúc

| Lựa chọn | Kết quả |
| --- | --- |
| Một Campaign/video | Mỗi row tạo Campaign + Ad Set + Creative + Ad mới. |
| Một Campaign nhiều Ad Sets / Page | Trong mỗi Page/TKQC/source, một Campaign và nhiều Ad Sets; Campaign config/budget phải đồng nhất. |
| Một Ad Set nhiều Ads / Page | Một Campaign/Ad Set cho mỗi Page/TKQC/source, nhiều Creative/Ads; target/budget/lịch/optimization Ad Set phải đồng nhất. |
| Thêm Ad Sets vào Campaign PAUSED | Chọn parent đã verified trong app, readback PAUSED/config/account; chỉ tạo Ad Sets/Creative/Ads mới. |
| Thêm Ads vào Campaign/Ad Set PAUSED | Chọn parent verified, giữ đúng config/budget/lịch; chỉ tạo Creative/Ads mới. |

Không gom qua TKQC/Page/source khác. Parent đang ACTIVE, không khớp cấu hình hoặc chưa xác minh bị chặn. Có thể dùng parents mới nếu muốn ngân sách/lịch khác. Parent có lịch cũ cần phù hợp checker hiện tại; việc reuse lịch/optimization/phương thức Meta ngoài subset hỗ trợ phải được nghiệm thu thêm, không force READY.

### Ngân sách

CBO tính một lần mỗi Campaign; ABO một lần mỗi Ad Set, không nhân theo số Ads. Daily/Lifetime và currency/source tách các dòng, không cộng VND/USD hoặc tự quy đổi. Parent budget đã có được báo riêng; không sửa parent qua batch. Những row chia sẻ parent mà có config/budget khác nhau bị NEEDS_FIX. Tổng là cấu hình/cap theo đơn vị nhỏ nhất của currency, **không phải spend dự báo**. Xác nhận ngân sách bắt buộc ở cả UI và backend; Meta minimum/policy thực tế còn cần API chấp nhận.

## SubID/Custom Link theo row key

Chọn New Creative → nhập Affiliate account → **Chuẩn bị ADS SubID Bulk**. Mỗi row có key UUID riêng kể cả nhiều bản clone cùng video. Preparation idempotent theo actor/request key; nhập lại key với rows khác bị chặn. Không ghép theo thứ tự dòng.

Tạo Custom Link bên Shopee đúng từng SubID, dán vào Link Center hoặc Assisted CSV theo tracking ID/SubID. Quay lại wizard: mỗi row gắn tracking UUID đúng file/Page/product/TKQC. Preview kiểm link READY/USER_DECLARED, URL lịch sử chưa gắn tracking khác, mỗi New Creative có tracking riêng. App không tự chèn SubID query hoặc xác minh link bằng Shopee API.

Confirm đóng băng link version/caption/config. Link đang dùng trong request không sửa được; dùng SubID/link mới cho đích mới. Mapping ba Ads IDs chỉ ghi sau xác minh đủ object PAUSED. Clone không chỉ đổi SubID trong DB trong khi dùng link cũ. Existing Post dùng chung bài/link luôn giữ cảnh báo không chứng minh attribution per-Ad.

## Clone Campaign / Ad Set / Ad

Nguồn hiện là **cấu trúc đã verified và lưu trong app**, tối đa 100 rows sau nhân copies; không khẳng định sao chép toàn bộ Campaign ngoài app. Trong Ads request có link **Nhân bản Ads**, hoặc mở Bulk wizard → **Nhân bản Campaign / Ad Set / Ad**.

Chọn source, cấp CAMPAIGN/ADSET/AD, copies1–10; **Đọc Clone Blueprint**. Blueprint chưa ghi/tạo object. Membership được đọc lại khi preview/confirm; rows thiếu/trùng hoặc nguồn thêm/đổi làm confirm bị chặn.

- CAMPAIGN: lấy toàn bộ members đã lưu có Campaign ID đó, giữ nhóm Ad Set cũ trong mỗi copy, tạo parents mới.
- ADSET: lấy members cùng Ad Set ID, mặc định giữ Campaign PAUSED source, tạo Ad Set mới và children mới.
- AD: clone một Ad, mặc định dùng Campaign/Ad Set source đã verified PAUSED.
- Tick **Tạo Campaign/Ad Set mới để chỉnh ngân sách độc lập** nếu muốn đổi ngân sách parent. Budget override riêng từng clone/row; share parent thì không được thay cap riêng từng Ad.

Mỗi clone giữ source request FK/clone level và IDs mới; request snapshot giữ Donor version/Page/TKQC/content/link/SubID/budget. Parent source IDs đọc từ request nguồn đã verified, không dùng Campaign/Ad Set Donor làm IDs mới. Creative được tạo mới, identity/video đúng Page. New Creative clone bắt buộc chuẩn bị link/SubID mới; Existing Post clone giữ shared attribution và không nhận CTA/link mới độc lập.

## Queue, pause và recovery

- PostgreSQL job/phase/IDs là nguồn trạng thái. Redis `ads_create` chỉ vận chuyển id/generation; attempts=1 ở BullMQ để không retry mù khi API result chưa rõ.
- Shared parent là dependency: leader phải verified SUCCEEDED; child WAITING, chỉ wake sau parent verified. Worker đọc lại parent ID/account/name-marker/config/PAUSED; không tạo parent lần hai.
- **Pause Batch** ngăn bước create tiếp theo; request đang gửi chờ kết quả, lưu ID rồi dừng tại boundary. **Resume Batch** dispatch generation mới để tránh Redis job cũ bị giữ completed. Không hủy riêng child/parent trong bulk vì sẽ phá dependency graph.
- **Retry Failed Batch** chỉ lỗi chắc chắn FAILED, giữ IDs đã nhận. UNKNOWN không gửi lại. Trong log có link mở recovery Ads Giai đoạn 7: đọc hoặc nối ID đúng bước/name-marker/parents với lý do/xác nhận. Recovery verified mở lại NEEDS_ACTION, nhưng không override PAUSED do người dùng.
- Nếu Redis mất queue, outbox dispatch lại. Nếu Redis giữ failed/completed job nhưng PG vẫn QUEUED trước claim, bump generation để requeue; PG PROCESSING/UNKNOWN không đi qua đường này. Crash sau mutation marker giữ UNKNOWN; không reset state để chạy lại.
- Batch COMPLETED khi mọi rows SUCCEEDED; NEEDS_ACTION khi chỉ còn failed/unknown/waiting. Chi tiết/log có batch history, request history, partial IDs và lineage, không token/upload session.

## Presets và giới hạn

Preset lưu Donor version/structure/overrides; quyền theo account source, chỉ tác giả hoặc OWNER/ADMIN sửa. Acknowledgement và lịch không tự lưu/tự xác nhận. Preset đổi sau preview làm fingerprint mismatch. Hiện UI chọn/tạo preset, backend hỗ trợ update; không có delete.

Tối đa100rows/batch, copies<=10, options200video/requests và batch list100 gần nhất. Source LIVE và MOCK không trộn; Page/TKQC grants kiểm ở preview/confirm/worker. Chỉ hỗ trợ subset Auction/Facebook Feed/không special categories như ADS_CREATION.md. Bulk/clone LIVE và cấu hình khác cần Meta App/quyền và nghiệm thu; full scale/retention/object storage/advanced layouts còn hardening Giai đoạn10.

## Tự kiểm tra nhanh

Bật MOCK rõ cho web và workers. Đăng ít nhất hai video cùng Page/TKQC VND, có Donor Mock. Chọn một Ad Set nhiều Ads: preview **1 Campaign/1 Ad Set/2 Creative/2 Ads**, budget150000 ở fixture được tính một lần. Confirm, xem success2/2 và shared parent IDs. Chọn Source→Clone CAMPAIGN một copy: thấy hai members và parents mới. Chọn New Creative: chuẩn bị hai SubID, tạo link riêng rồi preview/confirm; kiểm mapping khác nhau. Thử Pause/Resume, xem UNKNOWN/recovery bằng test automation; Viewer/API403. Hướng dẫn cài và dữ liệu: USER_GUIDE.md.
