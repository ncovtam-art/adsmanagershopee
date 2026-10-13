# Create Ads from Donor — Giai đoạn 7

Đã có Ads Wizard: video/bài đã đăng → Donor version → compatibility → preview/confirm → worker → Campaign/Ad Set/Creative/Ad IDs mới → xác minh PAUSED. Không tự bật quảng cáo, không dùng IDs nguồn để tạo đối tượng mới. MOCK chỉ mô phỏng; Meta LIVE chưa nghiệm thu vì môi trường chưa có Meta App/quyền.

## Chạy worker

Sau npm ci/env:init, PostgreSQL/Redis và migrations, build/start web như USER_GUIDE.md. Thêm terminal thứ tư cùng repository:

```bash
npm run worker:ads
```

Smoke một lượt: `npm run worker:ads -- --once`. Trong cloud có proxy Node dùng `NODE_USE_ENV_PROXY=1`; nếu thử MOCK, bật rõ META_MOCK_ENABLED=true cho web và workers. Ads worker dùng workflow PostgreSQL cho từng request, độc lập với BullMQ Publisher; Bulk/Cloning queue thuộc Giai đoạn 8. Jobs và IDs đã nhận được lưu bền; worker/task cần start lại sau chuyển máy.

## Điều kiện

- OWNER/ADMIN/MANAGER/MEDIA_BUYER có ads:write, quyền cả Page và TKQC đích; Donor account nguồn cũng phải được cấp. UPLOADER/VIEWER không tạo/đọc Ads requests.
- Video job SUCCEEDED, Post ID và Video ID riêng, đúng Page/nguồn; Page có TKQC chính và task ADVERTISE, TKQC ADVERTISE/MANAGE.
- Token không hết hạn, ads_management và pages_read_engagement; Meta App/Graph version/App Review phù hợp. LIVE preflight đọc lại TKQC currency/timezone/tasks/status và Post→Page/video, thumbnail lấy từ Meta.
- Template normalized là allowlist, không gửi RAW SNAPSHOT/source IDs/timestamps/ACTIVE/old pixel/old tracking vào create endpoint. Preview phải xác nhận targeting đã chuẩn hóa, audience/pixel/lịch cũ bị loại. Donor version không bị sửa.

## Existing Post

**Đăng video → Bài viết đã đăng → Chạy quảng cáo** mở Quảng cáo và chọn đúng video. Có thể bắt đầu từ **Quảng cáo → Tạo Ads từ Donor → Tạo Ads PAUSED**.

1. Chọn nguồn, video và version Donor; app tự lấy Page/TKQC chính/Post ID/currency/timezone.
2. Chọn **Existing Post**. Trong luồng hỗ trợ hiện tại cần **OUTCOME_ENGAGEMENT + POST_ENGAGEMENT**, billing IMPRESSIONS, Auction và Facebook Feed. Donor Traffic/Link Clicks sẽ báo UNSUPPORTED; chỉ sửa Objective/Optimization bằng dropdown, không nhập lại toàn bộ target/budget.
3. Tick đã kiểm tra normalized targeting; nếu cần chọn override Facebook Feed. App dùng object_story_id chính thức, không nhầm với video_id.
4. **Kiểm tra compatibility / Preview Ads**: đọc findings theo field, lý do/cách sửa, snapshot, ngân sách và cảnh báo attribution. READY là các điều kiện hỗ trợ/preflight đã đạt; Meta vẫn có thể từ chối create theo version/policy/account specifics.
5. Tick xác nhận nguồn và tạo PAUSED → **Xác nhận tạo Ads PAUSED**. Worker lưu/xác minh từng ID, bảng trả **Đã xác minh PAUSED** và history. MOCK không có đối tượng trên Facebook.

Existing Post giữ bài và link gốc. Không nhận CTA/message/link/SubID mới độc lập ở flow này; nếu yêu cầu thay, báo UNSUPPORTED và dùng New Creative. Không gán ba Ads IDs vào Organic/SHARED tracking, không nâng attribution thành per-Ad. Nhiều Ads dùng cùng bài/link chỉ có attribution mức SubID dùng chung khi dữ liệu không tách được.

## New Creative với Custom Link riêng

1. Chọn video/version, **New Creative**, đặt tên. Donor **OUTCOME_TRAFFIC + LINK_CLICKS**, billing IMPRESSIONS/Auction/Facebook Feed được hỗ trợ. App tái dùng targeting/budget hợp lệ, thay Page/video identity, message/CTA có thể override LEARN_MORE/SHOP_NOW.
2. Video cần gắn sản phẩm. Nhập đúng mã Affiliate → **Tạo ADS SubID riêng**. Tracking mới gắn contentId/Page/product/TKQC, chưa có Ads IDs.
3. Mở **Cài đặt → Shopee → Tracking & Custom Link**. Dùng SubID tạo Custom Link trong Shopee, dán URL và xác nhận trong app. Không tự thêm SubID query, không coi link user khai báo là Shopee API verified.
4. Quay về wizard, chọn tracking ADS đúng video, đợi refresh hoặc preview lại. Link phải READY/USER_DECLARED, chưa dùng cho Ads khác; URL từng gắn tracking khác bị chặn. Link và version được đóng băng khi confirm; không sửa link đó sau confirm, dùng tracking mới khi đổi đích. Hủy request chưa tạo sẽ mở lại khả năng đổi link.
5. Preview → READY → tick xác nhận → tạo PAUSED. Worker tạo video creative qua object_story_spec/page_id/video_data/video_id/CTA link riêng và thumbnail Meta. Sau xác minh đủ bốn IDs/quan hệ/PAUSED, mới gán ba Ads IDs thật vào tracking. Mapping vẫn USER_DECLARED; commission/ROAS giữ các guard Giai đoạn 5.

## Compatibility và ngân sách

- READY, NEEDS_FIX, UNSUPPORTED, UNKNOWN có field/reason/fix; không cho confirm nếu chưa READY. Có thể sửa từng trường bằng overrides rồi preview lại; API cũng kiểm quyền/nguồn/fingerprint.
- Hỗ trợ Auction, không Special Ad Categories, Facebook Feed, hai cặp Objective/Optimization nói trên, LOWEST_COST_WITHOUT_CAP và đúng một ngân sách Campaign hoặc Ad Set. Giữ CBO/ABO từ Donor, không chồng ngân sách cả hai.
- Ngân sách là chuỗi số nguyên dương theo đơn vị nhỏ nhất TKQC. Khác currency nguồn/đích bắt buộc nhập ngân sách override, không tự đổi tiền. Currency/timezone đích được đóng băng, worker chặn nếu thay sau confirm.
- Lịch cũ luôn bị loại. Start/end mới nhập ISO có offset (ví dụ +07:00); start ít nhất 1 phút tương lai; end sau start/current; lifetime bắt buộc end. Ngân sách minimum/policy riêng của Meta cần được API chấp nhận, local validation không cam kết Meta approval.
- Objective conversion/pixel/catalog, bid khác, Special Categories, Instagram identity/placements khác Feed chưa có flow xác minh nên bị chặn. CTA unavailable cần chọn override rõ ràng. Không suy nguồn thiếu thành cấu hình mặc định hợp lệ.

## Idempotency, lỗi và recovery

Confirm replay cùng actor/requestKey/fingerprint trả request cũ; đổi input/key đang dùng bị từ chối. Worker row lock/lease/heartbeat chống chạy trùng cùng request. Tên mới có marker AACC request/kind để recovery không nối nhầm object cũ.

Mỗi mutation ghi phase trước gửi, lưu ID ngay sau nhận, đọc xác minh ID/account/name/config/parents/status. Campaign, Ad Set, Ad gửi status PAUSED; Creative không có trường bật/tắt. Xác minh lại các đối tượng trước SUCCEEDED. IDs đã có được đọc lại khi tiếp tục, không tạo lại. Rate limit chắc chắn có backoff, tối đa 5 attempts rồi FAILED; retry thủ công giữ IDs cũ.

Timeout/mất kết nối sau create hoặc lỗi đọc sau lưu ID giữ UNKNOWN. Không tự retry/create mới. **Kiểm tra / nối Ads ID** chỉ đọc/xác minh. Nếu đã có ID, không cần nhập mới. Nếu thiếu ID, kiểm tra đúng bước trong Ads Manager, nhập ID/lý do/tick đã đối chiếu; server kiểm TKQC, tên marker, config, parents và PAUSED rồi tiếp tục bước còn thiếu. History/audit ghi recovery. Không dùng Donor IDs hoặc ID khác Page/TKQC. Hủy chỉ request QUEUED/phase NONE chưa tạo object; không xóa partial objects tự động. Nếu crash ở bước verify hoặc mất response, giữ phần đã tạo PAUSED để xử lý.

Hiện chưa có nút bật/pause/resume/delete Ads thật trong app. Với LIVE verified ID, có link mở Ads Manager để người dùng kiểm tra và quyết định riêng. Việc đăng/tạo/bật Ads LIVE không được thực hiện trong phiên setup này.

## Tự thử trên giao diện

Bật MOCK cho web/các workers. Tạo Meta Mock Page/TKQC VND, Donor với IDs gợi ý, sản phẩm và video MOCK đã đăng theo VIDEO_PUBLISHER.md. Thử Existing Post với Donor Traffic để thấy UNSUPPORTED; sửa Engagement/Post Engagement và xác nhận để thấy bốn MOCK IDs mới PAUSED. Thử New Creative với ADS SubID/link riêng, kiểm mapping sau thành công. VIEWER không có wizard và API Ads trả 403. Thu nhỏ 390px để kiểm form/preview không tràn document.

Kiểm thử adapter dựa SDK chính thức [AdAccount create methods](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py), [AdCreative](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py), [Campaign](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/campaign.py), [AdSet](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py), [Ad](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/ad.py). Không thêm domain/secret mới; dùng graph.facebook.com và existing Meta requirements.

Bulk cấu trúc nhiều Campaign/Ad Set/Ads, cloning, mở rộng compatibility, throughput/distributed limits và bật Ads trong app còn trong kế hoạch. LIVE adapter/approval/large datasets phải được nghiệm thu với quyền và dữ liệu của bạn trước production.

UI hiện hiển thị tối đa 200 video đã đăng có TKQC và 200 requests gần nhất theo grants/nguồn; pagination/search sâu và Bulk/Cloning thuộc giai đoạn tiếp theo.
