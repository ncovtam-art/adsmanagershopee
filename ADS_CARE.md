# Ads Care — Giai đoạn 9

Mở **Quảng cáo → Mở Ads Care** hoặc **Cài đặt → Automation**. OWNER/ADMIN/MANAGER/MEDIA_BUYER có quyền TKQC/Page được tạo rule; VIEWER/UPLOADER không đọc tài chính. Lịch sử/cảnh báo kiểm lại quyền Page hiện tại, không tiếp tục lộ snapshot sau thu hồi quyền.

## Tạo rule và chạy Dry Run

1. Chọn nguồn LIVE/MOCK, TKQC/currency và cấp Campaign/Ad Set/Ad. Đặt số ngày đã kết thúc (1–30), độ mới tối đa (1–1440 phút) và cooldown (5–10080 phút).
2. Thêm 1–10 điều kiện AND: Spend, CPC, CTR (%), CPM, Link Clicks, LPV, Cost/LPV, Commission/ROAS/Profit dự kiến hoặc thực nhận. Ngưỡng do bạn nhập; so sánh Decimal/BigInt, không hard-code ví dụ.
3. Chọn cảnh báo Dashboard, cần kiểm tra, Telegram hoặc Winner Detection. Winner là nhãn theo chính ngưỡng bạn đặt, không dự báo thắng. Chọn tiền đúng currency TKQC; không quy đổi giữa tài khoản.
4. Lưu rule: mặc định **tắt**, kể cả chọn đề xuất Auto Pause. Chạy **Dry Run [tên rule]**, đọc giá trị, kết quả/nguyên nhân chặn. Dry Run lưu bằng chứng/audit; không tạo cảnh báo, Telegram hoặc dừng Ads.
5. **Bật cảnh báo** để worker đánh giá. Bảng Dashboard/cần kiểm tra/Winner nằm dưới module; Tổng quan hiển thị số OPEN. **Đã kiểm tra** giữ lịch sử. Cooldown/dedup nguyên tử theo rule/đối tượng giữa workers, tắt không xóa lịch sử.

Worker: `npm run worker:care`; smoke `npm run worker:care -- --once`. Web/Insights/Publisher/Ads/Care là năm tiến trình riêng, dùng chung PostgreSQL, key và cấu hình. Care dùng lịch/outbox PostgreSQL, không thêm Redis queue. Mặc định tick30 giây, rule đánh giá tối đa mỗi phút; `CARE_POLL_SECONDS`1–300 nếu cần. Chỉ rules đã bật được chạy. Reload UI không gọi Meta Insights; dùng snapshots Giai đoạn5 đã lưu.

## Độ đầy đủ dữ liệu

Kỳ là những ngày đã kết thúc theo reporting timezone TKQC. Thiếu snapshot, quá cũ, metric null hoặc mẫu số0 không được coi là0. Với Commission/ROAS/Profit cần chất lượng attribution Giai đoạn5 hợp lệ, báo cáo Shopee mới trong mọi affiliate namespace của TKQC, tick đã kiểm tra đầy đủ và ngày hoàn tất ≥ cuối kỳ. Khai báo này là xác nhận của bạn, không phải Shopee API kiểm chứng. Tệp Shopee chưa cập nhật không tự gây pause.

Alerts cho phép CSV có nhãn USER_DECLARED; Auto Pause chỉ Insights API, coverage đủ, trạng thái ACTIVE, độ mới ≤60 phút. Period/window dài có ngày cũ có thể bị chặn; cần sync lại đủ kỳ. ROAS dự kiến và thực nhận là hai metric riêng, giữ đúng recognition policy, không tự cộng REJECTED.

## Auto Pause tùy chọn

Chỉ OWNER/ADMIN có phạm vi toàn TKQC được tạo/bật đề xuất này. Cần Dry Run cùng cấu hình/tác giả trong24h, không blockers, dữ liệu hiện tại vẫn hợp lệ và tick **Tôi cho phép dừng…** → **Bật Auto Pause**. Sửa rule luôn tắt và hủy bằng chứng trước; thay đổi recognition policy tài chính chặn Auto Pause đến khi Dry Run/arm lại; bật cảnh báo thông thường cũng giữ Auto Pause tắt.

Worker kiểm lại actor/grants/config/rule, evidence hiện tại, account/tasks/ads_management/token, ID/account/parents và trạng thái Meta trước gửi duy nhất `status=PAUSED`, rồi đọc lại. Không có bật Ads hoặc auto-resume. Tắt rule chặn bước mới; request đã gửi cần chờ kết quả.

Claim riêng theo account/source/level/object, bền và unique giữa rules/workers. Timeout/readback lỗi/crash là UNKNOWN, không gửi lại. **Đọc xác minh PAUSED** chỉ đọc và audit; nếu còn ACTIVE, kiểm tra Ads Manager thủ công. BLOCKED/VERIFIED không tự reset để dừng lại; workflow lặp sau người dùng bật lại Ads cần quyết định thủ công/hardening mới. Scope/Graph permission/network chưa đủ giữ chặn, không suy quyền chỉ từ snapshot.

## Telegram

**Cài đặt → Telegram** chỉ OWNER/ADMIN. Bot Token nhập bằng password, mã hóa AES-GCM ở backend, không trả token về API/browser. Nhập Chat ID số, chọn loại thông báo/cooldown và bật rõ. Lưu cấu hình xong mới **Gửi tin kiểm tra kết nối** (thao tác này gửi một tin thật). Bot phải có quyền chat; group cần thêm Bot phù hợp. Chưa có token mặc định.

Chọn Campaign issue/Spend threshold/low ROAS/Winner từ rule có action Telegram; lifecycle: Ads failed, publish failed, Shopee import applied, unmatched SubID, Page disconnected và Auto Pause verified. Scanner lấy sự kiện gần đây24h kể từ tạo cấu hình, tối đa100/type/pass, bỏ qua sự kiện đã ghi outbox để xử lý tiếp backlog; cooldown suppression có bản ghi CANCELLED. Thông báo chứa loại/nguồn/tên hoặc ID, không đính CSV, customer data, token hay upload session. Giữ dấu LIVE/MOCK khi xem chi tiết app.

Outbox có cooldown/dedup, claim nguyên tử, config version và Message ID. Đổi Bot/chat/events khiến job cũ CANCELLED. 429 có backoff; FAILED chắc chắn có nút retry. Timeout/crash SENDING→UNKNOWN, kiểm tra chat, không retry mù. Bảo vệ key AES gốc khi backup/restore; token không nằm trong ZIP. Cần egress `api.telegram.org`; chưa nghiệm thu chat thật trong phiên triển khai.

## Tự kiểm tra MOCK

Bật rõ MOCK cho web/workers. Kết nối MOCK VND, sync Insights cho ngày hôm qua; tạo rule CTR≥ngưỡng do bạn đặt + Winner. Dry Run phải hiện giá trị thực từ Mock snapshots, không có alerts trước bật. Bật cảnh báo, chờ worker rồi xem WINNER/OPEN, đánh dấu REVIEWED. Dùng ngưỡng không đạt hoặc metric thiếu để thấy không hành động. Thử Auto Pause không Dry Run phải bị chặn. Kiểm thử tự động có provider spy/timeout/recovery; không gọi Telegram/Meta LIVE.

Giới hạn: 100rules/cảnh báo/operations mới nhất và50runs mỗi rule; report caps tại HARDENING.md. Không có rule OR, arbitrary scripts hoặc remote bulk ACTIVE control. LIVE cần Meta App/quyền và nghiệm thu trên dữ liệu của bạn.
