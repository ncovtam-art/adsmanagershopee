# MASTER PROMPT CHO OPENAI CODEX
# DỰ ÁN: AFFILIATE ADS COMMAND CENTER
## Phiên bản 4.0 — Đặc tả tổng hợp, tối ưu cho Coding Agent

---

# PHẦN 1. VAI TRÒ CỦA CODEX

Bạn là một kỹ sư phần mềm cấp Principal/Senior, đảm nhiệm đồng thời các vai trò:

- Kiến trúc sư hệ thống phần mềm (Software Architect).
- Lập trình viên Full-stack chuyên nghiệp.
- Chuyên gia Meta Graph API và Marketing API.
- Chuyên gia xây dựng công cụ quản lý Facebook Ads.
- Kỹ sư cơ sở dữ liệu và xử lý dữ liệu quảng cáo.
- Chuyên gia tự động hóa quy trình.
- Nhà thiết kế giao diện SaaS cao cấp.
- Kỹ sư bảo mật, kiểm thử và triển khai hệ thống.

Bạn đang làm việc trực tiếp trong repository của tôi thông qua OpenAI Codex.

**Nhiệm vụ là xây dựng phần mềm thực tế, không chỉ thiết kế giao diện hoặc trả lời lý thuyết.**

Bạn phải chủ động:
- Khảo sát source code.
- Thiết kế kiến trúc.
- Lập kế hoạch.
- Viết code.
- Chỉnh sửa các file liên quan.
- Xây dựng database.
- Viết migrations.
- Tạo API backend.
- Xây frontend.
- Viết kiểm thử.
- Chạy ứng dụng trong môi trường khả dụng.
- Sửa lỗi.
- Viết hướng dẫn sử dụng.

Toàn bộ nội dung giải thích, hướng dẫn, báo cáo tiến độ và thông báo giao diện phải sử dụng **tiếng Việt**.

Giữ nguyên các thuật ngữ lập trình cần thiết như Campaign, Ad Set, Ad, API, SubID, ROAS, Database, Worker, Queue, Meta Marketing API.

Không dịch tên biến, hàm, interface, database table và những khái niệm kỹ thuật nếu việc dịch khiến source code khó bảo trì.

---

# PHẦN 2. MỤC TIÊU KINH DOANH

Tôi vận hành khoảng 40 Facebook Pages và dự kiến mở rộng lên 100 Page hoặc nhiều hơn.

Mỗi Page có:
- Một tên riêng.
- Một ngách sản phẩm riêng.
- Một kho video riêng.
- Một tài khoản quảng cáo Facebook chính.
- Nhiều Campaign.
- Nhiều Ad Set.
- Nhiều Ads.
- Nhiều sản phẩm Shopee Affiliate.
- Các SubID để theo dõi đơn và hoa hồng.

Các Page có thể đăng những video khác nhau, không phải 40 Page đều đăng một video.

Tôi thường xuyên đăng nhiều video mới mỗi ngày.

Tôi chạy quảng cáo Facebook và Instagram để kéo người dùng đến sản phẩm Shopee thông qua affiliate link.

Tôi muốn một hệ thống giúp quản lý toàn bộ quy trình:

**QUẢN LÝ PAGE → ĐĂNG VIDEO → TẠO LINK SHOPEE → TẠO QUẢNG CÁO → THEO DÕI CHI PHÍ → NHẬP BÁO CÁO HOA HỒNG → ĐỐI SOÁT SUBID → TÍNH ROAS → QUẢN LÝ LÃI/LỖ.**

Tôi không muốn phải chuyển qua quá nhiều công cụ hoặc kiểm tra từng Page thủ công.

Mục tiêu là phần lớn các thao tác hằng ngày được thực hiện từ một giao diện duy nhất.

---

# PHẦN 3. NHỮNG QUY TẮC BẮT BUỘC

Đây là các quy tắc quan trọng nhất khi triển khai.

## 3.1. Không xây ứng dụng giả

Không chỉ tạo giao diện rồi hiển thị những con số mẫu như dữ liệu thật.

Mỗi chức năng hoàn thành phải có:
- Giao diện hoạt động.
- Backend thực thi.
- Database tương ứng.
- Xử lý lỗi.
- Kiểm thử.
- Thông báo trạng thái chính xác.

Nếu chưa có Meta API credentials, được phép dùng Mock Provider để kiểm thử nhưng phải ghi rõ đó là môi trường thử nghiệm.

## 3.2. Không làm lại code không cần thiết

Nếu repository đã có:
- Authentication.
- Database.
- Page Manager.
- Dashboard.
- API client.
- Ads Manager.
- Video Manager.

Thì ưu tiên tái sử dụng và mở rộng.

Không tự ý xóa hoặc viết lại toàn bộ dự án.

## 3.3. Không tự thực hiện hành động làm mất tiền

Có thể tự tạo code, database, migration và chạy kiểm thử.

Nhưng không được tự:
- Bật quảng cáo thật.
- Tăng ngân sách quảng cáo thật.
- Xóa Campaign thật.
- Dừng Campaign đang chạy.
- Đăng nội dung lên Page thật.
- Xóa dữ liệu production.

Những hành động trên cần được người dùng xác nhận rõ ràng trước khi thực hiện.

## 3.4. Không bịa API

Tất cả chức năng Meta phải dựa trên API chính thức và quyền thực tế.

Nếu chức năng không được hỗ trợ:
- Giải thích giới hạn.
- Đề xuất phương án hợp lệ.
- Có chế độ thao tác thủ công nếu cần.

Không dùng cách vượt CAPTCHA, checkpoint, 2FA hoặc rate limit.

## 3.5. Không tính sai dữ liệu tài chính

Không:
- Cộng hoa hồng trùng.
- Cộng chi phí Ads hai lần.
- Phân bổ hoa hồng cho sai Campaign.
- Nhầm dữ liệu Organic và Ads.
- Xem hoa hồng chưa duyệt là tiền thực nhận.
- Kết luận Camp lỗ khi dữ liệu Shopee chưa cập nhật đầy đủ.
- Tự phân bổ doanh thu cho nhiều Ads dùng chung link mà không đủ dữ liệu.

Độ chính xác dữ liệu phải được ưu tiên hơn sự đẹp mắt của Dashboard.

---

# PHẦN 4. LỰA CHỌN NỀN TẢNG

Xây dựng **Web App trước**.

Ưu điểm:
- Một máy chủ quản lý toàn bộ dữ liệu.
- Nhân viên truy cập từ nhiều máy.
- Dễ cập nhật.
- Dễ đồng bộ.
- Phù hợp quản lý nhiều Page và tài khoản quảng cáo.
- Có thể mở rộng.

Sau khi Web App hoạt động ổn định, có thể đóng gói thành Desktop App Windows bằng Tauri.

Không cần viết lại hai hệ thống khác nhau.

## Công nghệ đề xuất

Frontend:
- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Motion.
- TanStack Query.
- TanStack Table.
- React Hook Form.
- Zod.
- ECharts hoặc Recharts.

Backend:
- Node.js.
- TypeScript.
- NestJS hoặc backend modular phù hợp với repository hiện tại.

Database:
- PostgreSQL.
- Prisma.

Queue:
- Redis.
- BullMQ.

Storage:
- Local Storage cho development.
- Object Storage tương thích S3 cho production.

Deployment:
- Docker.
- Docker Compose.

Nếu repository đã dùng stack khác nhưng vẫn đáp ứng tốt, hãy đánh giá trước khi quyết định thay đổi.

Không thêm dependencies lớn nếu không cần thiết.

---

# PHẦN 5. GIAO DIỆN CỰC KỲ ĐẸP NHƯNG PHẢI DỄ DÙNG

Đây là yêu cầu quan trọng.

Tôi muốn giao diện giống một phần mềm SaaS cao cấp, không phải trang quản trị HTML cơ bản.

Phong cách:
- Premium Dark Mode.
- Hiện đại.
- Gọn gàng.
- Có chiều sâu.
- Có animation.
- Có biểu đồ đẹp.
- Có hiệu ứng tương tác.
- Dữ liệu dễ đọc.
- Thao tác nhanh.

Tham khảo phong cách của:
- Linear.
- Stripe Dashboard.
- Vercel.
- Raycast.

Không sao chép nguyên bản giao diện thương hiệu khác.

## Màu sắc

Màu gợi ý:

Background: #080B12

Secondary Background: #111827

Card Background: #151B2B

Primary: #765BFF

Secondary: #00C8FF

Success: #21C58E

Danger: #F35E75

Warning: #FFBC55

Primary Text: #F4F7FF

Secondary Text: #95A1B8

Đảm bảo độ tương phản và khả năng đọc.

## Hiệu ứng

Có thể sử dụng:
- Smooth sidebar transition.
- Animated KPI.
- Animated charts.
- Glass effect nhẹ.
- Hover effects.
- Smooth modal.
- Loading skeleton.
- Toast notifications.
- Progress bar.
- Page transitions.

Không lạm dụng animation.

Không làm hiệu ứng khiến bảng quảng cáo hoặc Dashboard bị chậm.

Hỗ trợ reduced motion.

## Quy tắc UX

1. Mở App lên là biết cần làm gì.
2. Các thao tác quan trọng chỉ cần ít bước.
3. Những trường cấu hình đã có phải tự điền.
4. Không yêu cầu nhập lại Page ID, Ad Account ID nếu hệ thống đã biết.
5. Cấu hình kỹ thuật phải nằm ở Advanced Settings.
6. Lỗi phải có hướng dẫn sửa bằng tiếng Việt.
7. Có Empty State rõ ràng.
8. Có Loading State.
9. Có Confirmation Dialog cho hành động quan trọng.
10. Có tìm kiếm toàn hệ thống.
11. Có thao tác hàng loạt.
12. Có lưu cấu hình mẫu.
13. Có Last Sync và Data Freshness.
14. Không tải tất cả dữ liệu khi người dùng chỉ xem một Page.

---

# PHẦN 6. CẤU TRÚC MENU

Sidebar chính chỉ có 6 mục:

1. Tổng quan.
2. Quản lý Page.
3. Đăng video.
4. Quảng cáo.
5. Doanh thu & ROAS.
6. Cài đặt.

## Quản lý Page

Các tab:
- Tất cả Page.
- Page Workspace.
- Tài khoản quảng cáo.
- Nội dung theo Page.

## Đăng video

Các tab:
- Video Library.
- Đăng hàng loạt.
- Lịch đăng.
- Bài viết đã đăng.
- Caption Templates.

## Quảng cáo

Các tab:
- Campaign Manager.
- Tạo quảng cáo.
- Ads Donor.
- Nhân bản Ads.
- Ads Care.
- Ads Presets.

## Doanh thu & ROAS

Các tab:
- Dashboard lợi nhuận.
- Shopee Commission.
- Đối soát SubID.
- Phân tích Campaign.
- Phân tích Page.
- Báo cáo.

## Cài đặt

Các tab:
- Kết nối Meta.
- Shopee.
- Telegram.
- Nhân viên.
- Automation.
- System Health.
- Advanced Settings.

Không đặt tất cả module kỹ thuật lên Sidebar chính.

---

# PHẦN 7. KẾT NỐI FACEBOOK DỄ DÙNG

Tôi không biết lập trình và không muốn copy thủ công 40 token.

Hãy tạo Setup Wizard.

## Bước 1 — Kết nối Facebook

Có nút:

"Kết nối Facebook".

Dùng cơ chế xác thực chính thức của Meta.

Không yêu cầu người dùng nhập mật khẩu Facebook vào app.

## Bước 2 — Chọn Page

Sau khi xác thực, app hiển thị các Page thực sự được cấp quyền truy cập.

Có:
- Checkbox.
- Chọn tất cả.
- Tìm kiếm.
- Lọc.
- Kết nối hàng loạt.

## Bước 3 — Chọn Ad Account

App hiển thị các tài khoản quảng cáo mà kết nối hiện tại có quyền truy cập.

Hiển thị:
- Tên.
- ID.
- Currency.
- Timezone.
- Quyền hiện có.
- Connection status.

## Bước 4 — Ghép Page với Ad Account

Mặc định:
1 Page → 1 Ad Account chính.

Cho phép chọn Ad Account tương ứng bằng dropdown.

Không tự ghép theo tên gần giống khi chưa xác nhận.

Lưu lịch sử mapping nếu thay đổi sau này.

## Bước 5 — Kiểm tra kết nối

Kiểm tra:
- Page permissions.
- Publishing permissions.
- Ads read permissions.
- Ads management permissions.
- Token validity.
- API access status.

Nếu thiếu quyền, hiển thị bằng tiếng Việt và có hướng dẫn sửa.

## Bước 6 — Hoàn tất

Lưu cấu hình.

Sau này không bắt người dùng thiết lập lại nếu không có thay đổi quyền hoặc token.

## Phương án dự phòng

Nếu chưa có Marketing API access hoặc quyền phù hợp:

Cho phép import Meta Ads CSV/XLSX.

Không giả lập rằng app đã có khả năng tạo Ads qua API.

---

# PHẦN 8. QUẢN LÝ PAGE

Mỗi Page có một Workspace riêng.

Lưu:
- Internal Page ID.
- Facebook Page ID.
- Page Name.
- Page Code.
- Niche.
- Primary Ad Account.
- Connection Status.
- Publish Settings.
- Created At.
- Updated At.

Có hai chế độ hiển thị:
- Grid View.
- Table View.

## Page Workspace

Khi mở Page:

Hiển thị:
- Tên Page.
- Avatar.
- Ngách.
- Tài khoản quảng cáo.
- Số video.
- Số Campaign.
- Ad Spend.
- Shopee Commission.
- ROAS.
- Profit.

Các tab:
- Tổng quan.
- Video.
- Campaign.
- Hoa hồng.
- Cài đặt.

Mọi dữ liệu phải được lọc đúng Page.

---

# PHẦN 9. ĐĂNG VIDEO HÀNG LOẠT

Tôi đăng nhiều video mới mỗi ngày.

Mỗi Page có thể đăng một ngách khác nhau.

Tôi muốn thao tác:

Chọn Page
→ Kéo thả Video
→ Gắn sản phẩm
→ Gắn SubID
→ Gắn link Shopee
→ Chọn Caption
→ Đăng.

## Content Library

Lưu:
- Content ID.
- File Name.
- File Hash.
- Duration.
- Resolution.
- Aspect Ratio.
- Storage Path.
- Niche.
- Product ID.

Có phát hiện video trùng bằng file hash.

Nếu trùng:
Cảnh báo.

Không tự xóa.

## Bulk Publisher

Có:
- Drag & Drop.
- Chọn nhiều video.
- Chọn Page.
- Product Mapping.
- Caption Template.
- Schedule.
- Preview.
- Publish Queue.
- Status.
- Retry.

Mọi thao tác đăng bài phải thực hiện qua API Meta chính thức được hỗ trợ.

Không gửi hàng trăm request đồng thời thiếu kiểm soát.

Lưu Post ID thực tế sau khi đăng thành công.

Nếu API timeout và chưa xác định bài đã đăng hay chưa, không retry một cách mù quáng.

Phải kiểm tra trạng thái để tránh trùng bài.

---

# PHẦN 10. AUTO COMMENT LINK SHOPEE

Sau khi video đăng thành công:

Nếu Page đã bật tính năng, tạo Comment Job.

Ví dụ comment:

"Link sản phẩm mình để ở đây 👇 {affiliate_url}"

Cho phép:
- Template chung.
- Template theo Page.
- Template theo niche.
- Comment delay.
- Auto-comment.
- Retry.
- Comment status.
- Comment ID storage.

Không comment trùng khi retry.

## Gỡ Preview của Link

Tôi muốn có tùy chọn gỡ phần bản xem trước của link trong bình luận.

Codex phải kiểm tra xem Meta API hiện hành có hỗ trợ trực tiếp hay không.

Nếu hỗ trợ:
Triển khai hợp lệ.

Nếu không hỗ trợ:
Hiển thị MANUAL_ACTION_REQUIRED hoặc UNSUPPORTED.

Không giả endpoint và không bypass hạn chế.

---

# PHẦN 11. SHOPEE SUBID ENGINE

SubID là khóa tracking quan trọng.

Tôi muốn:
- Tự tạo SubID.
- Không bị trùng.
- Không cần nhập thủ công.
- Dễ tìm kiếm.
- Map chính xác đến Page, Video, Campaign và Ad.

Format đề xuất:

P07-X82KF

Trong đó:
P07 là Page Code.

X82KF là mã định danh ngắn.

Hệ thống phải đảm bảo tính duy nhất bằng database constraints và cơ chế sinh ID phù hợp.

Có thể tăng độ dài mã khi cần.

Không lưu toàn bộ thông tin sản phẩm, Campaign hoặc ngày tháng trong SubID.

Database lưu quan hệ thực tế.

## Tracking Mapping

Page
→ Ad Account
→ Campaign
→ Ad Set
→ Ad
→ Content
→ Product
→ SubID
→ Affiliate Link
→ Commission.

Một video có thể có:
- Tracking Organic.
- Tracking Ads.

Nếu các nguồn dùng cùng link và không thể phân biệt, app phải cảnh báo.

Không tự phân bổ hoa hồng sai.

---

# PHẦN 12. SHOPEE CUSTOM LINK CENTER

Shopee workflow của tôi hiện không có API Custom Link được cấp quyền.

Tôi phải tạo link affiliate thông qua chức năng Custom Link Shopee thì SubID mới được ghi nhận theo quy trình tương ứng.

Không tự thêm SubID vào query string rồi coi đó là link hợp lệ.

Thiết kế Shopee Link Center.

## Chế độ 1 — Manual

App tạo:
- Product URL.
- SubID.

Người dùng tạo Custom Link trong Shopee và dán kết quả vào app.

## Chế độ 2 — Assisted Bulk

App chuẩn bị hàng loạt:
- Video.
- Product URL.
- SubID.

Có thể copy/export và nhập lại kết quả theo từng tracking record.

Không ghép nhầm link do lệch thứ tự.

## Chế độ 3 — Automation nếu được hỗ trợ hợp lệ

Nếu có thể tự động thao tác bằng phương pháp được Shopee cho phép, triển khai thành worker riêng.

Không bypass CAPTCHA, 2FA hoặc các biện pháp bảo vệ.

Nếu không thể:
Dừng và yêu cầu xử lý thủ công.

## Link Status

WAITING.

PROCESSING.

READY.

FAILED.

MANUAL_ACTION_REQUIRED.

UNKNOWN.

Một tracking record phải liên kết với affiliate URL đã được Shopee tạo phù hợp.

Không suy ra rằng URL mở được đồng nghĩa với SubID đã được Shopee xác thực.

---

# PHẦN 13. FACEBOOK ADS MANAGER

Tool phải có chức năng tạo quảng cáo trực tiếp bằng Marketing API chính thức khi có đủ quyền.

Hỗ trợ:

Campaign.

Ad Set.

Ad Creative.

Ad.

Các thao tác:
- Create.
- Read.
- Update những trường được hỗ trợ.
- Pause.
- Resume.
- Clone.
- View Insights.
- Open in Ads Manager.

Mọi chiến dịch tạo mới mặc định ở trạng thái PAUSED.

Không tự chạy quảng cáo thật nếu chưa được xác nhận.

---

# PHẦN 14. ADS DONOR — CHỨC NĂNG ƯU TIÊN CAO

Tôi đã tự tạo cấu hình quảng cáo mẫu trong Facebook Ads Manager.

Tôi muốn lấy mẫu đó bằng cách nhập 3 ID:

1. Campaign ID.
2. Ad Set ID.
3. Ad ID.

Đây là mẫu quảng cáo của chính tôi, không phải quảng cáo đối thủ.

## Giao diện tạo Donor

Nút:

"+ Tạo Donor"

Form:
- Tên Donor.
- Campaign ID.
- Ad Set ID.
- Ad ID.

Có thêm tùy chọn dán URL Ads Manager.

Nếu chỉ nhập Ad ID, có thể truy ngược hai ID cha khi API hỗ trợ và tài khoản có quyền.

Sử dụng kiểu string cho các ID của Meta.

## Khi nhập 3 ID

Backend phải:

1. Lấy thông tin Ad.
2. Xác định Ad Set.
3. Kiểm tra Ad Set ID.
4. Xác định Campaign.
5. Kiểm tra Campaign ID.
6. Đọc Campaign Configuration.
7. Đọc Ad Set Configuration.
8. Đọc Ad Configuration.
9. Đọc Ad Creative.
10. Xác định Source Ad Account.
11. Kiểm tra quyền.
12. Chuẩn hóa cấu hình.
13. Hiển thị Preview.
14. Lưu Donor.

Nếu 3 ID không thuộc cùng cấu trúc:
Báo lỗi.

Nếu thiếu quyền:
Báo lỗi kèm hướng dẫn.

Nếu Meta không trả một số trường:
Hiển thị trạng thái unavailable.

## Dữ liệu cần lưu

Campaign:
- Objective.
- Buying Type.
- Budget Strategy.
- Campaign Budget nếu có.
- Special Ad Categories.
- Các cấu hình hợp lệ khác.

Ad Set:
- Optimization Goal.
- Performance Goal khi có.
- Destination.
- Targeting.
- Location.
- Age.
- Gender.
- Budget.
- Schedule.
- Bid.
- Placements.
- Facebook/Instagram settings.

Ad:
- Creative Type.
- CTA.
- Existing Post reference.
- Creative ID.
- Destination URL.
- Facebook Identity.
- Instagram Identity.
- Tracking fields phù hợp.

Không giả định mọi field đều có thể đọc hoặc tái sử dụng.

## Donor Storage

Lưu hai bản:

RAW SNAPSHOT:
Dữ liệu gốc Meta trả về đã được xử lý an toàn.

NORMALIZED TEMPLATE:
Cấu hình có thể tái sử dụng.

Không gửi nguyên JSON đọc được từ API vào endpoint tạo Ads.

Loại bỏ các trường:
- Read-only.
- Source object IDs.
- Timestamps.
- Performance metrics.
- Deprecated fields.
- Account-specific identifiers không tương thích.

## Donor Versioning

Mỗi Donor có phiên bản.

Nếu cập nhật:
Tạo version mới.

Ads đã tạo từ version cũ không bị thay đổi.

---

# PHẦN 15. SỬ DỤNG DONOR ĐỂ LÊN ADS

Sau khi video được đăng lên Facebook:

Trong Video Studio có nút:

"Chạy quảng cáo".

Workflow:

1. Chọn Video.
2. App tự lấy Page.
3. App tự lấy Ad Account chính.
4. App lấy Facebook Post ID.
5. Chọn Donor.
6. Load Campaign Settings.
7. Load Ad Set Settings.
8. Load Ad Settings.
9. Thay các thông tin thuộc Page/TKQC đích.
10. Kiểm tra Creative.
11. Kiểm tra Link Shopee.
12. Kiểm tra SubID.
13. Hiển thị Preview.
14. Tạo các đối tượng Ads ở trạng thái PAUSED.
15. Lưu ID mới.
16. Cho phép người dùng xác nhận bật quảng cáo.

Không cần nhập lại target, ngân sách và placements nếu Donor đã có và còn hợp lệ.

Không dùng Campaign ID nguồn làm ID của Campaign mới.

Không dùng Post ID của Page cũ cho Page mới.

Không dùng lại SubID cũ khi cần tracking độc lập.

---

# PHẦN 16. EXISTING POST ADS

Đây là yêu cầu rất quan trọng.

Tôi thường đăng video lên Page trước, sau đó chạy quảng cáo từ bài viết có sẵn.

App phải có hai chế độ:

**A. Sử dụng bài viết có sẵn.**

**B. Tạo Ad Creative riêng từ video.**

## Existing Post

Nếu video đã được đăng:
- App sử dụng Post ID phù hợp.
- Kiểm tra media type.
- Kiểm tra quyền.
- Kiểm tra creative compatibility.
- Kiểm tra CTA.

Sử dụng cơ chế Existing Post được Meta hỗ trợ, chẳng hạn object_story_id khi phù hợp.

Không nhầm Video ID với Post ID.

## CTA và SubID

Nếu Existing Post không hỗ trợ gắn link CTA mới độc lập cho mỗi Ad:
- Hiển thị cảnh báo.
- Không giả lập thành công.
- Đề xuất New Creative nếu phù hợp.

Nếu nhiều Ads dùng chung bài viết và cùng link Shopee:
Không được tính hoa hồng riêng từng Ad khi dữ liệu không đủ phân biệt.

---

# PHẦN 17. DONOR COMPATIBILITY CHECKER

Trước khi tạo quảng cáo từ Donor, kiểm tra:

- Meta Connection.
- Ad Account permissions.
- Page permissions.
- Campaign Objective.
- Buying Type.
- Budget.
- Optimization.
- Targeting.
- Location.
- Placements.
- Instagram Identity.
- Creative Type.
- Existing Post eligibility.
- CTA.
- Shopee Affiliate URL.
- SubID.
- Currency.
- Timezone.
- Schedule.

Các trạng thái:

READY.

NEEDS_FIX.

UNSUPPORTED.

UNKNOWN.

Mỗi lỗi cần:
- Nguyên nhân bằng tiếng Việt.
- Trường bị lỗi.
- Cách sửa.
- Nút "Sửa ngay" nếu phù hợp.

Nếu chỉ một trường không tương thích:
Không yêu cầu cấu hình lại toàn bộ Donor.

Sau khi sửa:
Kiểm tra lại.

Không hiển thị READY nếu chưa xác minh được điều kiện quan trọng.

---

# PHẦN 18. TẠO ADS HÀNG LOẠT

Tôi muốn chọn nhiều video và áp dụng Donor hàng loạt.

Ví dụ:
- Page 01 có 10 video.
- Page 02 có 8 video.
- Page 03 có 12 video.

Các Page có Ad Account riêng.

Cho phép chọn:
- Các Page.
- Video.
- Donor.
- Ads Preset.
- Budget.
- Campaign structure.

Hỗ trợ các cấu trúc:
- Một Campaign cho mỗi video.
- Một Campaign có nhiều Ad Sets.
- Một Ad Set có nhiều Ads.
- Thêm Ads vào Campaign/Ad Set hiện có khi hợp lệ.

Không mặc định luôn tạo một Campaign mới cho mỗi video.

## Batch Preview

Trước khi tạo:
Hiển thị số lượng Campaign, Ad Set, Ad dự kiến.

Hiển thị:
- Page.
- Video.
- Donor.
- Ad Account.
- SubID.
- Link.
- Budget.
- Validation Status.

Kiểm tra tổng ngân sách dự kiến và cảnh báo cấu hình bất thường.

Mặc định tạo PAUSED.

Dùng job queue để xử lý.

Có:
- Progress.
- Success.
- Failed.
- Retry.
- Pause Batch.
- Resume Batch.
- Logs.

Không tạo trùng nếu job chạy lại.

---

# PHẦN 19. NHÂN BẢN ADS VÀ SCALE

Tôi muốn có chức năng nhân bản:

Campaign.

Ad Set.

Ad.

Mỗi bản nhân bản lưu:
- Parent ID.
- Clone ID.
- Source Donor.
- Page.
- Ad Account.
- Content.
- SubID.
- Affiliate URL.
- Budget.
- Status.

Có thể chỉnh ngân sách từng clone.

Nếu muốn CTA khác nhau:
Kiểm tra phương thức Creative có thực sự hỗ trợ.

Nếu không hỗ trợ, sử dụng workflow New Creative thích hợp.

Không chỉ thay SubID trong database nhưng vẫn dùng cùng link thực tế.

---

# PHẦN 20. META ADS METRICS

Khi có quyền Meta Marketing API phù hợp, đồng bộ các chỉ số:

- Spend.
- Impressions.
- Reach.
- Clicks.
- Link Clicks.
- CPC.
- CPM.
- CTR.
- Landing Page Views nếu hỗ trợ.
- Campaign Status.
- Ad Set Status.
- Ad Status.

Tổ chức dữ liệu theo:
- Ad Account.
- Campaign.
- Ad Set.
- Ad.
- Date.

Lưu đúng:
- Currency.
- Reporting Timezone.
- Reporting Level.
- Reporting Period.

Không cộng dữ liệu Campaign-level và Ad-level gây trùng.

Không gọi Meta API mỗi khi Dashboard reload.

Worker cập nhật định kỳ.

Dashboard đọc database.

Có Last Synced At.

Có lỗi:
STALE_DATA.

Nếu API không đủ quyền:
Hỗ trợ import Facebook Ads CSV.

Không cộng trùng Spend từ API và CSV.

---

# PHẦN 21. SHOPEE COMMISSION REPORT

Mỗi ngày tôi tự tải file:

AffiliateCommissionReport.csv

từ Shopee.

Tôi sẽ upload file đó vào app.

App tự:
1. Đọc CSV.
2. Kiểm tra encoding.
3. Nhận diện cột.
4. Chuẩn hóa SubID.
5. Đọc Order ID nếu có.
6. Đọc Order Date.
7. Đọc Commission.
8. Đọc Order/Commission Status.
9. Kiểm tra trùng.
10. Match SubID.
11. Phân bổ theo mapping hợp lệ.
12. Cập nhật báo cáo.

## Chống trùng

Một file được upload nhiều lần:
Không cộng hoa hồng nhiều lần.

Một Order xuất hiện ở nhiều báo cáo:
Không tạo nhiều đơn độc lập nếu thực tế là cùng một đơn.

Một đơn đổi trạng thái:
Cập nhật trạng thái và hoa hồng.

Nếu file có nhiều dòng sản phẩm trong một đơn:
Phải thiết kế khóa dedup theo cấu trúc thực tế.

Không chỉ dùng Order ID nếu Order ID không xác định duy nhất từng commission row.

Nếu không có định danh đáng tin cậy:
Hiển thị giới hạn và yêu cầu xem xét.

Lưu raw import và lịch sử thay đổi.

## Unmatched SubID

Nếu SubID không tồn tại:
Đưa vào danh sách Unmatched.

Không bỏ qua.

Có chức năng manual mapping với audit log.

---

# PHẦN 22. ROAS VÀ LỢI NHUẬN

Hệ thống cần tính:

**Commission ROAS = Hoa hồng Shopee được phân bổ / Chi phí quảng cáo Facebook tương ứng.**

Phân biệt:

Pending Commission.

Approved Commission.

Paid/Finalized Commission.

Cancelled/Rejected Commission.

## Profit

Estimated Profit =
Estimated Commission - Ad Spend - Other Costs.

Realized Profit =
Finalized Commission - Relevant Ad Spend - Other Costs.

Quy tắc ghi nhận tài chính phải được hiển thị và cấu hình rõ ràng.

Không xem tiền dự kiến là tiền thực nhận.

Không trả ROAS bằng 0 khi chưa có dữ liệu phù hợp.

Không chia cho 0.

Không tự gán hoa hồng vào sai ngày chi phí.

## Phân biệt thời gian

Video Publish Date.

Ads Spend Date.

Order Date.

Commission Update Date.

Settlement Date.

Import Date.

Cho phép xem:
- Theo ngày.
- Theo Campaign.
- Theo SubID.
- Theo Video.
- Theo cohort.
- Theo lifetime.

Hiển thị cảnh báo nếu ngày ghi nhận hoa hồng không tương ứng trực tiếp với ngày quảng cáo tiêu tiền.

---

# PHẦN 23. CAMPAIGN MANAGER

Giao diện quản lý quảng cáo phải trực quan, nhanh và đẹp.

Hiển thị theo cấu trúc:

CAMPAIGN → AD SET → AD.

Bảng mặc định:
- Campaign Name.
- Page.
- Spend.
- Commission.
- ROAS.
- Profit.
- Status.

Các cột nâng cao:
- Ad Account.
- Ad Set.
- Ad.
- SubID.
- CPC.
- CTR.
- CPM.
- LPV.
- Clicks.
- Donor.
- Post ID.
- Last Sync.

Có:
- Search.
- Sort.
- Filter.
- Date Range.
- Column customization.
- Export.
- Saved views.

Click Campaign mở side panel.

Hiển thị:
- Spend.
- Commission.
- Profit.
- ROAS.
- Chart.
- Ads.
- SubIDs.
- Donor.
- Tracking history.

---

# PHẦN 24. ADS CARE

Tôi muốn tự đặt quy tắc chăm sóc Campaign.

Các chỉ số:
- Spend.
- CPC.
- CTR.
- CPM.
- Link Clicks.
- LPV.
- Cost per LPV.
- Commission.
- ROAS.
- Profit.

Cho phép người dùng đặt ngưỡng.

Ví dụ:

Spend >= 100.000đ.

AND

CPC > 2.000đ.

THEN

Gửi cảnh báo.

Hoặc:

Spend >= 200.000đ.

AND

CTR < ngưỡng do người dùng đặt.

THEN

Đánh dấu cần kiểm tra.

Các con số chỉ là ví dụ, không hard-code.

## Actions

Bước đầu:
- Dashboard Alert.
- Telegram Notification.
- Mark for Review.

Bước nâng cao:
- Auto Pause Ad.
- Auto Pause Ad Set.
- Auto Pause Campaign.

Chỉ bật Auto Pause nếu:
- Có quyền API.
- Rule được người dùng bật rõ ràng.
- Dữ liệu đủ mới.
- Dữ liệu không bị thiếu.
- Đã qua kiểm thử Dry Run.
- Có Audit Log.
- Có cơ chế chống lặp hành động.

Không tự tắt camp chỉ vì file Shopee chưa cập nhật.

---

# PHẦN 25. TELEGRAM

Tích hợp Telegram Bot.

Cho phép:
- Cấu hình Bot Token an toàn.
- Cấu hình Chat ID.
- Test Connection.
- Chọn loại thông báo.

Thông báo:
- Campaign có vấn đề.
- Chi tiêu vượt ngưỡng.
- ROAS thấp.
- Ads creation failed.
- Publish failed.
- Shopee import completed.
- Unmatched SubID.
- Page disconnected.
- Auto Pause executed.

Không gửi spam thông báo trùng.

Có cooldown và deduplication.

---

# PHẦN 26. PHÂN QUYỀN NHÂN VIÊN

Các quyền:

OWNER.

ADMIN.

MANAGER.

MEDIA_BUYER.

UPLOADER.

VIEWER.

Cho phép phân quyền theo:
- Page.
- Ad Account.
- Module.
- Financial Data Access.

Ví dụ:
Nhân viên A chỉ quản lý Page 01–10.

Nhân viên B chỉ quản lý Page 11–20.

Uploader được đăng video nhưng không được xem API secrets.

Media Buyer chỉ được quản lý những Ad Accounts đã được phân quyền.

Kiểm tra quyền ở backend.

Không chỉ ẩn nút giao diện.

---

# PHẦN 27. DATABASE

Thiết kế database có các thực thể chính:

users

roles

user_permissions

pages

ad_accounts

page_ad_account_links

contents

products

facebook_posts

post_comments

tracking_records

tracking_link_versions

shopee_link_jobs

campaigns

adsets

ads

ad_creatives

ads_donors

ads_donor_versions

ads_donor_snapshots

ads_donor_applications

publish_jobs

ads_creation_jobs

meta_insights_daily

meta_report_imports

commission_imports

commission_rows

commission_attributions

reconciliation_runs

care_rules

care_actions

notifications

audit_logs

system_jobs

settings

Không nhất thiết tạo tất cả table ngay từ đầu.

Chỉ tạo khi module thực sự cần, nhưng thiết kế phải không gây khó khăn khi mở rộng.

## Yêu cầu dữ liệu

Meta IDs dùng string.

SubID có unique constraint thích hợp.

Tiền sử dụng Decimal hoặc số nguyên theo đơn vị tiền tệ phù hợp.

Thời gian lưu nhất quán và có timezone rõ ràng.

Các quan hệ dùng foreign keys khi phù hợp.

Có index theo:
- Page ID.
- Ad Account ID.
- Campaign ID.
- Ad Set ID.
- Ad ID.
- SubID.
- Post ID.
- Order ID/Order Item ID khi có.
- Date.

Không tính tiền bằng floating point tùy tiện.

---

# PHẦN 28. BACKGROUND WORKERS

Sử dụng hệ thống hàng đợi.

Các queue chính:

video_publish.

post_comment.

shopee_link.

ads_create.

ads_sync.

metrics_sync.

commission_import.

reconciliation.

alerts.

telegram.

care_rules.

Có:
- Retry.
- Exponential Backoff.
- Pause.
- Resume.
- Progress.
- Error Logs.
- Idempotency.
- Dead-letter handling.
- Unknown-result recovery.

Không để một HTTP request xử lý toàn bộ hàng trăm video.

Không tạo hàng trăm Campaign đồng thời thiếu kiểm soát.

---

# PHẦN 29. META API RATE LIMIT

Thiết kế Central MetaGateway.

Các chức năng:
- Shared API client.
- Request queue.
- Per-account controls.
- Global rate awareness.
- Adaptive throttling.
- Retry.
- Backoff.
- API error normalization.
- Usage monitoring.
- Token validation.
- Caching.

Không hard-code một con số rate limit duy nhất.

Không dùng nhiều tài khoản/token/app để cố vượt giới hạn của Meta.

Ưu tiên:
- Ít request.
- Đồng bộ tăng dần.
- Lưu cache.
- Đọc dữ liệu từ database.
- Chỉ cập nhật những đối tượng cần thiết.

---

# PHẦN 30. DASHBOARD & PHÂN TÍCH

Dashboard tổng hiển thị:

Total Pages.

Active Ad Accounts.

Active Campaigns.

Ad Spend.

Pending Commission.

Approved Commission.

Paid Commission.

ROAS.

Estimated Profit.

Realized Profit.

Campaigns Losing.

Campaigns Profitable.

Campaigns With Missing Data.

Unmatched SubIDs.

Có:
- Charts.
- Date filters.
- Page filters.
- Niche filters.
- Campaign filters.
- Top performers.
- Needs Attention.
- Last Sync.

Không dùng số liệu mẫu trong Production Mode.

---

# PHẦN 31. BACKUP, SECURITY VÀ AUDIT

Các dữ liệu quan trọng phải có backup và recovery strategy.

Bảo vệ:
- Meta Access Tokens.
- Telegram Bot Token.
- Employee credentials.
- Database credentials.
- Other secrets.

Không lưu secret ở frontend.

Không log cookie, password hoặc token.

Audit các hành động:
- Tạo quảng cáo.
- Bật quảng cáo.
- Tắt quảng cáo.
- Sửa ngân sách.
- Đổi SubID.
- Đổi link Shopee.
- Import Commission.
- Map dữ liệu thủ công.
- Xóa hoặc chỉnh Donor.

Các hành động quan trọng phải truy vết được.

---

# PHẦN 32. THỨ TỰ PHÁT TRIỂN TỐI ƯU

Không triển khai mọi module cùng lúc.

Xây từng giai đoạn hoàn chỉnh.

## GIAI ĐOẠN 0 — KHẢO SÁT DỰ ÁN

- Đọc source code.
- Đọc README.
- Đọc AGENTS.md nếu có.
- Xác định framework.
- Kiểm tra database.
- Kiểm tra API integrations.
- Xác định module sẵn có.
- Phát hiện lỗi kiến trúc quan trọng.
- Lập implementation plan.

Tạo file IMPLEMENTATION_PLAN.md.

Không phá code cũ.

## GIAI ĐOẠN 1 — CORE FOUNDATION

- Authentication.
- Database setup.
- RBAC cơ bản.
- Premium App Shell.
- Sidebar.
- Routing.
- Base Components.
- API structure.
- Error Handling.
- Base tests.

Giai đoạn này phải tạo được ứng dụng có thể chạy, không chỉ các trang tĩnh.

## GIAI ĐOẠN 2 — PAGE & META CONNECTION

- Meta OAuth.
- Page Manager.
- Ad Account Manager.
- Mapping.
- Connection Health.
- Permission Checks.
- Token Security.
- CSV fallback.

Kết quả:
Có thể kết nối, quản lý và xác định quyền các Page/TKQC được phép truy cập.

## GIAI ĐOẠN 3 — ADS DONOR

- Import 3 ID.
- Meta Donor Reader.
- Relationship validation.
- Snapshot storage.
- Template normalization.
- Versioning.
- Donor Library.
- Donor Preview.
- Tests.

Kết quả:
Có thể tạo Donor từ cấu hình quảng cáo thật khi API được cấp quyền.

## GIAI ĐOẠN 4 — SHOPEE TRACKING

- Product Center.
- SubID Engine.
- Tracking Records.
- Shopee Link Center.
- Manual/Assisted Link Workflow.
- Import Commission CSV.
- Deduplication.
- Unmatched SubID Handling.

Kết quả:
Có thể import file Shopee và biết hoa hồng thuộc SubID nào.

## GIAI ĐOẠN 5 — ADS ANALYTICS & ROAS

- Meta Insights Integration.
- Ads CSV Import.
- Campaign Manager.
- Attribution Engine.
- ROAS Engine.
- Profit Dashboard.
- Data Quality.

Kết quả:
Có thể xem chi phí và hoa hồng đã đối soát theo Page/Campaign/Ad khi dữ liệu đủ.

## GIAI ĐOẠN 6 — VIDEO PUBLISHER

- Video Library.
- Bulk Upload.
- Publisher Queue.
- Scheduling.
- Facebook Publishing.
- Post ID Storage.
- Auto Comment.
- Comment Status.

Kết quả:
Có thể đăng hàng loạt video lên các Page có quyền phù hợp.

## GIAI ĐOẠN 7 — CREATE ADS FROM DONOR

- Existing Post Selection.
- Apply Donor.
- Compatibility Checker.
- Ads Wizard.
- Create Campaign.
- Create Ad Set.
- Create Creative.
- Create Ad PAUSED.
- Save New IDs.
- Verify Results.

Kết quả:
Có thể dùng một video mới đăng và Donor để tạo Ads mới mà không nhập lại toàn bộ cấu hình.

## GIAI ĐOẠN 8 — BULK ADS & CLONING

- Bulk Apply Donor.
- Bulk Ad Creation.
- Campaign Cloning.
- Ad Set Cloning.
- Ad Cloning.
- Batch Validation.
- Retry and Recovery.

Kết quả:
Có thể chuẩn bị quảng cáo hàng loạt cho nhiều video/Page.

## GIAI ĐOẠN 9 — ADS CARE

- Rule Engine.
- Threshold Settings.
- Alerts.
- Telegram.
- Winner Detection.
- Dry Run.
- Optional Auto Pause.

Kết quả:
Có thể theo dõi, cảnh báo và thực hiện những automation đã được bật hợp lệ.

## GIAI ĐOẠN 10 — PRODUCTION HARDENING

- Security Review.
- Performance Optimization.
- Database Optimization.
- Full Integration Tests.
- Backup/Restore.
- Documentation.
- Deployment.
- Desktop packaging feasibility.

---

# PHẦN 33. NGUYÊN TẮC HOÀN THÀNH MỖI GIAI ĐOẠN

Mỗi giai đoạn phải hoàn chỉnh theo chiều dọc.

Ví dụ module Ads Donor:

Không chỉ làm form nhập 3 ID.

Phải có:
- Frontend.
- Backend.
- API Client.
- Validation.
- Database.
- Error Handling.
- Tests.
- Documentation.

Sau mỗi giai đoạn:

1. Chạy typecheck.
2. Chạy lint.
3. Chạy tests liên quan.
4. Chạy build.
5. Kiểm tra database migrations.
6. Kiểm tra regression.
7. Báo file đã tạo.
8. Báo file đã sửa.
9. Báo chức năng hoạt động.
10. Báo giới hạn chưa kiểm chứng.

Nếu không thể chạy test do môi trường thiếu dependency hoặc credential, phải nêu rõ và tiếp tục những phần có thể thực hiện được.

Không báo PASS khi chưa thực sự chạy kiểm thử.

---

# PHẦN 34. CÁCH XỬ LÝ KHI GẶP LỖI

Khi có lỗi:

1. Xác định module bị ảnh hưởng.
2. Đọc code liên quan.
3. Tìm nguyên nhân gốc.
4. Đưa ra hướng sửa.
5. Sửa tối thiểu.
6. Chạy test.
7. Chạy build.
8. Kiểm tra các chức năng liên quan.

Không sửa một lỗi bằng cách xóa toàn bộ module.

Không xóa database để sửa lỗi migration.

Không loại bỏ tính năng chỉ để build thành công.

Không che lỗi bằng fake return value.

---

# PHẦN 35. TÀI LIỆU HƯỚNG DẪN

Tạo hoặc cập nhật:

README.md.

IMPLEMENTATION_PLAN.md.

ARCHITECTURE.md.

DATABASE.md.

META_CONNECTION.md.

ADS_DONOR.md.

ADS_CREATION.md.

SHOPEE_WORKFLOW.md.

COMMISSION_RECONCILIATION.md.

ADS_CARE.md.

DEPLOYMENT.md.

TROUBLESHOOTING.md.

.env.example.

Tài liệu phải viết dễ hiểu bằng tiếng Việt.

Hướng dẫn:
- Cài đặt.
- Chạy local.
- Cấu hình database.
- Kết nối Meta App.
- Kiểm tra quyền.
- Thêm Page.
- Ghép TKQC.
- Tạo Donor.
- Đăng video.
- Chạy Ads.
- Nhập Shopee CSV.
- Xem ROAS.
- Sửa lỗi thường gặp.

Không đưa secrets thật vào tài liệu.

---

# PHẦN 36. TIÊU CHÍ NGHIỆM THU

Hệ thống chỉ được coi là hoàn thành khi các workflow tương ứng được triển khai và kiểm chứng.

## Quản lý Page

Tôi có thể quản lý nhiều Facebook Page và tài khoản quảng cáo hợp lệ.

## Ads Donor

Tôi có thể nhập 3 ID:

Campaign ID.
Ad Set ID.
Ad ID.

Tool đọc cấu hình có quyền truy cập, xác minh quan hệ và lưu thành mẫu.

## Đăng Video

Tôi có thể upload hàng loạt video và đăng lên Page khi có quyền.

## Shopee SubID

Tôi có thể tự sinh và quản lý SubID, gắn link được Shopee tạo hợp lệ.

## Tạo Ads

Tôi có thể chọn video đã đăng, chọn Donor và tạo Campaign/Ad Set/Ad mới ở trạng thái PAUSED nếu quyền API và cấu hình cho phép.

## Doanh thu

Tôi có thể upload báo cáo Shopee và app đối chiếu SubID tự động.

## ROAS

Tôi xem được Ad Spend, Attributed Commission, ROAS và lợi nhuận với thông tin về độ đầy đủ dữ liệu.

## Ads Care

Tôi có thể đặt ngưỡng và nhận cảnh báo.

## Độ tin cậy

Hệ thống không tự tạo quảng cáo trùng khi retry.

Không cộng hoa hồng trùng.

Không đánh dấu dữ liệu chưa xác minh là chính xác.

Không tự bật quảng cáo tiêu tiền.

## Giao diện

Giao diện đẹp, nhanh, có animation hợp lý, dễ sử dụng và phù hợp người không biết lập trình.

---

# PHẦN 37. CÁCH CODEX PHẢI BÁO CÁO

Khi hoàn thành một giai đoạn, sử dụng định dạng:

**GIAI ĐOẠN ĐÃ HOÀN THÀNH**

Tên giai đoạn.

**CHỨC NĂNG ĐÃ XÂY DỰNG**

Liệt kê tính năng hoạt động thực tế.

**FILES ĐÃ TẠO/SỬA**

Liệt kê đường dẫn chính.

**DATABASE**

Các migrations và thay đổi schema.

**KẾT QUẢ KIỂM THỬ**

Test nào đã chạy.

Pass/Fail.

Build status.

**CHƯA HOÀN THÀNH**

Những vấn đề và giới hạn còn lại.

**CÁCH KIỂM TRA TRÊN GIAO DIỆN**

Các bước để tôi tự mở app và thử.

**BƯỚC TIẾP THEO**

Module cần triển khai tiếp.

Không gửi báo cáo dài về những chi tiết không liên quan.

---

# PHẦN 38. LỆNH THỰC THI CUỐI CÙNG

Bây giờ hãy bắt đầu thực hiện công việc trong repository hiện tại.

Ưu tiên tuân thủ kiến trúc sẵn có, không tùy tiện thay framework.

Thực hiện theo thứ tự:

1. Khảo sát dự án.
2. Xây dựng IMPLEMENTATION_PLAN.md.
3. Xác định kiến trúc và các dependencies.
4. Triển khai giai đoạn đầu tiên chưa hoàn thành.
5. Chạy kiểm thử.
6. Sửa lỗi.
7. Ghi nhận kết quả.
8. Tiếp tục các phần khả thi theo kế hoạch.

Không chỉ trả lời bằng ý tưởng.

Không tạo giao diện giả rồi tuyên bố hoàn thành.

Không tự chạy quảng cáo thật hoặc phát sinh chi phí.

Nếu thiếu API credentials, triển khai phần code và Mock Provider có kiểm thử, đồng thời ghi rõ bước cần thiết để kết nối thật.

Nếu phạm vi công việc vượt quá khả năng hoàn thành trong một lần chạy, hãy hoàn thiện một giai đoạn có thể kiểm chứng, cập nhật tiến độ và nêu rõ phần tiếp theo. Không bỏ dở ở giữa một thay đổi có thể khiến dự án không build được.

Khi viết code:
- Ưu tiên clean architecture.
- Modular services.
- Typed interfaces.
- Database consistency.
- Reusable UI components.
- Explicit error handling.
- Security.
- Idempotency.
- Maintainability.

**MỤC TIÊU CUỐI CÙNG:**

Xây dựng một phần mềm để tôi có thể quản lý toàn bộ công việc:

40+ Facebook Pages
→ Đăng video hàng loạt
→ Tạo và quản lý Shopee SubID
→ Lấy Donor quảng cáo từ 3 ID
→ Áp dụng Donor cho video mới
→ Chạy Facebook/Instagram Ads
→ Nhân bản/Scale Ads
→ Đồng bộ chi phí quảng cáo
→ Nhập báo cáo hoa hồng Shopee
→ Đối chiếu doanh thu từng Page/Campaign/Ad
→ Tính ROAS và lợi nhuận
→ Cảnh báo và chăm sóc Campaign
→ Quản lý tất cả trong một giao diện Web App cao cấp.

**BẮT ĐẦU KIỂM TRA SOURCE CODE VÀ TRIỂN KHAI NGAY.**