# Page & Meta Connection — Giai đoạn 2

## Chức năng đã có

Cài đặt → Kết nối Meta có OAuth chính thức và wizard: chọn các Page được cấp quyền, chọn TKQC, xác nhận Page → TKQC chính, kiểm tra scopes/tasks/thời hạn rồi lưu PostgreSQL. Tìm tên/ID, lọc quyền, chọn tất cả các Page đang hiển thị. Lưu ánh xạ theo xác nhận, không suy đoán từ tên; kết nối lại giữ Page Code/ngách/mapping. Page mất quyền được đánh dấu REVOKED, không xóa lịch sử. Thông tin kiểm tra ghi thời gian, không coi quyền đọc được là đã thử đăng bài/tạo Ads.

Quản lý Page có Grid/Table, tìm kiếm/lọc nguồn, từng Workspace, chỉnh Page Code/ngách/TKQC chính, lịch sử ánh xạ, trạng thái quyền. Avatar hiện dùng icon dự phòng, chưa đồng bộ ảnh đại diện. Video, Campaign, chi tiêu, hoa hồng và ROAS chưa đồng bộ nên hiển thị “—”.

OWNER/ADMIN quản lý kết nối, Page và grant. Tab Tài khoản quảng cáo có phân quyền Page/TKQC riêng cho nhân viên; quyền được kiểm tra ở backend cho list/detail/mutation. Người chỉ được cấp Page không nhận tên/ID TKQC qua API. MANAGER/MEDIA_BUYER đọc Donor từ TKQC được cấp; vai trò không có quyền viết không thể tạo Donor.

## Cấu hình OAuth thật

Đặt tại môi trường máy chủ hoặc `.env` riêng, không commit và không gửi giá trị bí mật vào chat:

| Biến                 | Mục đích                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| META_APP_ID          | ID ứng dụng Meta của bạn                                                           |
| META_APP_SECRET      | App Secret thực để đổi code và tính appsecret_proof                                |
| META_GRAPH_VERSION   | Version Graph API đang hỗ trợ cho ứng dụng, dạng `vN.N`; không có default suy đoán |
| META_REDIRECT_URI    | `APP_ORIGIN` + `/api/meta/callback`, đúng URI đã đăng ký trong Meta App            |
| TOKEN_ENCRYPTION_KEY | Khóa AES-256-GCM 64 ký tự hex; development được `env:init` sinh riêng              |
| META_MOCK_ENABLED    | `false` mặc định; chỉ bật rõ cho môi trường thử nghiệm                             |

Meta App cần Facebook Login phù hợp, Redirect URI đã đăng ký, app mode và người dùng thử nghiệm hợp lệ; quyền nâng cao/Marketing API access, Business Verification/App Review tùy yêu cầu của Meta. Cấp `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement` (Publisher auto-comment), `ads_read`, `ads_management`. Người kết nối phải có Page tasks và quyền TKQC tương ứng. Không bắt người dùng nhập mật khẩu Facebook vào ứng dụng hoặc copy token từng Page.

Ứng dụng thật cần HTTPS và cookie Secure. Sau khi sửa cấu hình, khởi động lại tiến trình. Nếu mở app qua hostname khác, sửa APP_ORIGIN và Redirect URI cùng lúc; không tin Host header để tạo redirect. App Secret và khóa mã hóa cần giá trị thực ở máy chủ để tính HMAC/AES; không dùng placeholder của proxy secret làm khóa cục bộ. Khi cloud dùng proxy HTTP(S), Node 24 có thể khởi động với `NODE_USE_ENV_PROXY=1`; giữ CA/TLS xác minh của nền tảng.

Token mã hóa AES-GCM, nonce ngẫu nhiên, lưu server; inventory có Page token cũng được mã hóa. Response UI/audit không có access token/App Secret. Giữ và sao lưu khóa mã hóa qua hệ thống secrets riêng; đổi/mất khóa sẽ không đọc được token đã lưu và phải kết nối lại. Không có nút hoặc API trả token.

OAuth state được hash trong PostgreSQL, bind với actor đang đăng nhập, hết hạn 10 phút và tiêu thụ một lần. Callback kiểm tra session/quyền/state trước đổi code. Người hủy quyền nhận thông báo riêng. Không lưu mã code/token trong audit. Bấm làm mới quyền đọc API lại; inventory quá 15 phút không được hoàn tất wizard cho đến khi refresh.

## Kiểm tra không cần Meta App

Chạy development với chế độ thử nghiệm rõ ràng:

```bash
META_MOCK_ENABLED=true npm run dev
```

Trong cloud, có thể dùng `META_MOCK_ENABLED=true npm start` sau build. Không bật đồng thời hai tiến trình cùng cổng. Đăng nhập OWNER → Cài đặt → Kết nối Meta → **Mở kết nối thử nghiệm**. Chọn Page, TKQC, ghép tài khoản bằng dropdown, kiểm quyền và **Hoàn tất thiết lập**. Mọi bản ghi MOCK mang nhãn **Dữ liệu thử nghiệm** và namespace riêng, không thay bản ghi LIVE. Page Làm đẹp cố ý thiếu CREATE_CONTENT để kiểm tra trạng thái thiếu quyền. MOCK không phải xác thực Facebook thật.

## CSV/XLSX dự phòng

Nhập báo cáo ở cuối tab Meta; tải mẫu CSV. Cột chính xác `account_id,date,currency,spend`; ID/ngày/tiền XLSX dạng Text. Ngày YYYY-MM-DD, tiền không âm dạng `150000` hoặc `0.30`, không phân cách hàng nghìn; một currency mỗi tệp. Một dòng tổng cấp TKQC/ngày, không trộn tổng Campaign/Ad Set/Ad. Tối đa 2 MB, 5.000 dòng, XLSX giải nén tối đa 20 MB/200 entries. Parser đọc worksheet đầu tiên.

Import kiểm tra toàn bộ trước ghi, canonical tiền và thứ tự để nhận diện báo cáo giống nhau kể cả đổi tên tệp. Decimal(30,2), tổng tính bằng BigInt; không dùng float. Nguồn nhập tệp lưu riêng và không tạo kết nối API. Các báo cáo khác nhau/chồng ngày được lưu theo batch, **chưa được cộng vào Analytics/ROAS**; hợp nhất/đối soát theo TKQC/ngày thuộc Giai đoạn 5. Format hiện nhận schema mẫu, chưa tự map mọi tiêu đề export khác nhau của Ads Manager.

## MetaGateway và giới hạn kiểm chứng

Chỉ HTTPS đến graph.facebook.com, official OAuth ở www.facebook.com. Authorization header, appsecret_proof, timeout; pagination dùng cursor ở endpoint cố định, không follow URL bên ngoài. Phản hồi rate limit/Retry-After và usage headers được ghi nhận trong gateway; cooldown, retry transient có backoff/jitter, read cache 30 giây và gộp yêu cầu giống nhau, tách token. Khi lưu Donor vô hiệu cache và đọc lại nguồn. Chưa có distributed limiter/Queue, dashboard usage hay tự refresh token nền.

Chỉ gọi API đọc và đổi OAuth code. Chưa có endpoint đăng Page/tạo/bật/dừng/xóa Ads. Token validity UI dựa thời hạn cấp token và lần gọi API thành công gần nhất; API có thể thu hồi trước thời hạn, khi đó yêu cầu đọc tiếp báo kết nối lại. Chưa gọi debug_token hoặc kiểm chứng khả năng đăng bài/tạo Ads bằng hành động thật.

Các field/endpoint được đối chiếu SDK chính thức của Meta: [User](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/user.py), [AdAccount](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py), [Login manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/). Tài liệu developers.facebook.com bị proxy của phiên này chặn; SDK GitHub đọc được. OAuth/token/Marketing API thật chưa được kiểm chứng vì chưa có Meta App/credentials/quyền. Tests dùng Mock Provider và các phản hồi HTTP có kiểm soát; không tuyên bố App Review hoặc LIVE connection đã thành công.
