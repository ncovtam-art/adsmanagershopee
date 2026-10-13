# Video Publisher — Giai đoạn 6

Đã triển khai luồng upload → preview → xác nhận → worker → Post ID → comment. MOCK chỉ mô phỏng kết quả; đăng Facebook LIVE chưa nghiệm thu vì môi trường chưa có Meta App/quyền. Upload vào Library không tự đăng.

## Chuẩn bị

Cần Node.js >=22, PostgreSQL, Redis và FFmpeg có cả `ffmpeg`/`ffprobe` trong PATH. `npm run queue:up` chạy Redis Docker, chỉ bind loopback. Web và worker phải dùng cùng Database, TOKEN_ENCRYPTION_KEY, VIDEO_STORAGE_DIR và chế độ nguồn. Chạy ba terminal riêng:

```bash
npm start
```

```bash
npm run worker:insights
```

```bash
npm run worker:publisher
```

Cloud có proxy Node: thêm `NODE_USE_ENV_PROXY=1` trước lệnh. Development thử nghiệm: bật rõ `META_MOCK_ENABLED=true` cho web và cả worker; mặc định reusable config là false. Smoke worker: `npm run worker:publisher -- --once`. Mọi worker cần khởi động lại sau chuyển máy/task; không coi tiến trình còn sống qua snapshot.

LIVE dùng kết nối Meta chính thức, Page token mã hóa, task CREATE_CONTENT và quyền pages_manage_posts; auto-comment cần pages_manage_engagement. App Review/Business verification phụ thuộc Meta App. Người dùng có kết nối cũ thiếu scope cần kết nối lại. Xem [META_CONNECTION.md](META_CONNECTION.md). Upload qua graph-video.facebook.com, comment/read qua graph.facebook.com. Không lấy ID MOCK làm bằng chứng LIVE.

## Thử trên giao diện

1. Đăng nhập OWNER. Chưa có Page: **Cài đặt → Kết nối Meta → Mở kết nối thử nghiệm**, chọn Page/TKQC, mapping rồi hoàn tất wizard. Chế độ Mock phải được bật trước khởi động. Tạo sản phẩm tại **Cài đặt → Shopee → Sản phẩm** nếu muốn gắn link.
2. Vào **Đăng video**, chọn nguồn MOCK và một Page. **Cấu hình đăng & comment** → bật cho phép đăng video → lưu. Mặc định mọi Page chưa bật đăng/comment. Nhân viên cần được cấp Page; VIEWER chỉ đọc.
3. **Video Library**: kéo/thả hoặc chọn nhiều MP4 H.264, tối đa 300 MiB/tệp và 100 tệp/lượt. Chọn sản phẩm/ngách từng file → **Upload video đã chọn**. Tiến độ thể hiện upload thực; server đọc metadata bằng ffprobe, tính SHA-256. Thư viện hiển thị thời lượng, kích thước, tỉ lệ, nguồn và sản phẩm. Bấm tên video để xem player có kiểm tra quyền. Upload cùng bytes báo trùng hash và vẫn giữ cả hai file.
4. **Caption Templates**: tạo Caption/Comment template theo Page, ngách hoặc chung. Biến: `{video_name}`, `{page_name}`, `{product_name}`, `{affiliate_url}`, `{sub_id}`. Thứ tự mặc định Page → ngách → chung. Chỉ quản trị được tạo template ngách/chung; biến không thực thi code.
5. **Đăng hàng loạt**: chọn video, caption/template. Không nhập lịch để đăng khi worker nhận job; hoặc chọn thời điểm tương lai trong UTC+7/UTC, tối đa 180 ngày. **Xem preview đăng video** → đọc từng caption/Page/nguồn/lịch/cảnh báo → tick xác nhận → **Xác nhận thêm vào hàng đợi**. Lịch và xác nhận đăng lại được xóa khỏi form sau batch để batch tiếp theo cần chọn lại.
6. **Publish Queue**: theo dõi trạng thái, progress, attempts, Video/Post/Comment IDs và lịch sử. Với MOCK sẽ có nhãn provenance thử nghiệm, không có bài trên Facebook. **Bài viết đã đăng** hiển thị video thành công. **Lịch đăng** hiển thị job đã lên lịch. Page Workspace cũng có Video Studio theo Page.
7. Kiểm tra schedule: đặt lịch tương lai → xác nhận → thấy **Đã lên lịch** → **Tạm dừng job** → **Tiếp tục job** → **Hủy job**. Chỉ hủy thao tác chưa gửi; tạm dừng không thu hồi request đang gửi Meta. OWNER/ADMIN được tạm dừng nhận job toàn queue.

## Link Shopee và auto-comment

Trong bulk preparation, chọn video đã gắn sản phẩm → tạo tracking Organic với đúng mã tài khoản Affiliate. App tạo SubID gắn `contentId` của file. Tạo Custom Link trong Shopee bằng SubID đó, dán link và xác nhận trong module Shopee; quay lại Publisher, tải lại dữ liệu rồi chọn tracking đúng video. App không tự chèn SubID vào URL và không khẳng định link được Shopee API xác minh.

OWNER/ADMIN bật auto-comment trong cấu hình Page, chọn template và delay 0–86400 giây. Preview kiểm tra link/sản phẩm/Page/nguồn/quyền, rồi đóng băng caption, link version, SubID và policy trong job. Sửa link/template sau xác nhận không đổi batch cũ. Comment job chỉ được tạo một lần sau video có Post ID được xác minh. Comment thành công lưu Comment ID.

**Gỡ preview link** hiện UNSUPPORTED: chưa có tham số chính thức được xác minh. Chọn yêu cầu này làm comment job UNSUPPORTED và không tự gửi; video vẫn có thể đăng. Không mô phỏng thành công hoặc gọi endpoint đoán.

## Retry và kết quả chưa rõ

- QUEUED/SCHEDULED: chưa được worker nhận; PROCESSING: đang upload/gửi; PROCESSING_META: đang chờ kiểm tra xử lý Meta; SUCCEEDED: có ID được provider xác minh.
- Lỗi chắc chắn: FAILED, có thể sửa cấu hình và retry. Rate limit có backoff, tối đa 5 attempts rồi DEAD_LETTER. Transfer retry giữ session/offset đã lưu. File phải còn nguyên hash.
- Timeout/mất kết nối sau mutation, lỗi đọc sau finish hoặc lease hết hạn sau dấu mốc gửi: UNKNOWN. Không tự đăng/comment lại. **Kiểm tra / nối ID** trước tiên chỉ đọc Meta. Nếu chưa biết ID, kiểm tra bài/comment thực trên Page, nhập ID và lý do rồi xác nhận nối; server kiểm tra Page, video hoặc nội dung comment và ghi audit. Không tự tạo ID LIVE từ filename/Page.
- Một file cùng hash/Page đang chờ, đang gửi hoặc UNKNOWN bị chặn batch trùng. Đã đăng thì phải xác nhận đăng lại rõ ràng. Confirm dùng request key và fingerprint để chống bấm lặp/cấu hình đổi sau preview.

## Storage, khôi phục và giới hạn

Video lưu riêng tại VIDEO_STORAGE_DIR, mặc định `.cache/video-storage` trong checkout; không nằm trong public/. Upload stream và ffprobe chỉ đọc file local. API media yêu cầu phiên/Page grants, hỗ trợ Range. UI/API không trả đường dẫn file, encrypted upload session hoặc token. Chưa có tính năng xóa file, chuyển mã hoặc object storage.

`npm run db:backup` sao lưu Database và metadata/job, **không chứa bytes video**. Trước chuyển máy cần backup cả thư mục media và giữ TOKEN_ENCRYPTION_KEY gốc riêng trong secret storage. Cloud snapshot phải giữ thư mục media dưới workspace; Redis/Docker volumes không mặc định được giữ. Jobs PostgreSQL là outbox, worker đẩy lại vào Redis sau mất queue; UNKNOWN vẫn chờ recovery, không gửi lại mù. Không nhập ZIP mã nguồn để khôi phục dữ liệu nghiệp vụ.

Library phân trang 50; chuẩn bị tối đa 100 asset/batch qua backend, UI chọn trên trang đang xem; Queue hiển thị 500 jobs gần nhất theo quyền. Có concurrency/limiter trong worker và Page lease trong Database; giới hạn phân tán toàn hệ thống, kiểm tải file lớn qua proxy, retention, giám sát và storage nhiều máy thuộc Giai đoạn 10. Scheduler là worker ứng dụng, không phải lịch đăng native Facebook. Triển khai hiện tại dùng Page video API; chưa có flow Reels riêng.

## Tham khảo API

Tham số resumable upload/comment và field được đối chiếu với SDK chính thức:

- [Page.create_video](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py)
- [AdVideo/status](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/advideo.py)
- [Post.create_comment](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/post.py)
- [Comment](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/comment.py)

Đối chiếu SDK và test adapter không thay nghiệm thu API LIVE với Graph version/quyền thực tế của bạn.
