# Ads Donor — Giai đoạn 3

## Workflow đã triển khai

Quảng cáo → **Tạo Donor**: tên, TKQC nguồn, Campaign ID, Ad Set ID, Ad ID, URL Ads Manager tùy chọn. Chỉ Ad ID là bắt buộc; backend truy ngược hai cha. URL chỉ nhận HTTPS hostname Meta chính thức, kiểm ID nếu có; máy chủ không truy cập URL dán vào. ID Meta là string xuyên suốt form, validation, API và Database, kể cả lớn hơn Number.MAX_SAFE_INTEGER.

**Đọc & kiểm tra preview** đọc Ad, xác minh Ad Set/Campaign/Account, đọc cấu hình hai cha và Creative. Kiểm token, ads_read/ads_management và grant tài nguyên trước đọc. Creative phải đúng ID do Ad tham chiếu. ID cha/tài khoản không khớp, thiếu quyền, API rate limit/hết hạn hoặc thiếu field quan hệ quan trọng: báo lỗi tiếng Việt, chưa ghi Donor. Field tùy chọn unsupported không làm mất các field còn lại; field unavailable hiện cảnh báo, không bịa giá trị.

Preview hiển thị nguồn, tài khoản/currency, 3 ID, objective, optimization goal, ngân sách/CTA thực sự đọc được, warnings, Raw Snapshot và Normalized Template riêng. **Lưu Donor** đọc lại nguồn, đối chiếu fingerprint với preview để tránh lưu cấu hình đã thay đổi. Lưu bản version mới trong transaction có audit. Không có quảng cáo thật được tạo/thay đổi.

## Snapshot và normalization

Raw Snapshot giữ cấu trúc Campaign/Ad Set/Ad/Creative đã đọc; bỏ token/secret/authorization/password/email/phone theo key, lọc credential/query bí mật trong URL, giới hạn cấu trúc/kích thước. ID nguồn và lịch sử cấu hình nằm ở snapshot để review. Không có API nhận JSON raw từ trình duyệt làm template.

Normalized Template schemaVersion 1 dùng allowlist: objective/buying type/special categories/budget/bid strategy; optimization/billing/destination type/budget/bid; targeting tuổi/giới tính/countries/platform/placements có hỗ trợ; creative type/message/CTA. Tiền ngân sách giữ chuỗi số nguyên ở đơn vị nhỏ nhất của currency nguồn.

Đã loại source IDs, status ACTIVE, metrics, timestamps/lịch chạy cũ, custom audience/pixel/account identity/old post/old creative/old tracking. Location ngoài countries và targeting chưa hỗ trợ bị loại có cảnh báo. Identity/nội dung/đích và tracking phải xác nhận lại ở tài khoản đích. URL đích/identity/post/creative cũ nếu API trả nằm ở snapshot tham khảo; không được dùng thẳng trong template. Template chưa có compatibility đầy đủ và **chưa sẵn sàng tạo Ads**; bước đó thuộc Giai đoạn 7 và cần PAUSED.

## Versioning và quyền

Library lọc tên/nguồn, hiển thị latest version, xem preview và chọn từng version. **Tạo version mới** đọc lại ID nguồn, giữ cùng Donor/TKQC, append version 2/3…; không sửa version cũ. Database có unique(donor_id,version), CHECK version dương và trigger cấm UPDATE/DELETE. Chưa có model Ads Application vì Giai đoạn 7 chưa triển khai; khi bổ sung phải FK đến donor_version_id để giữ version đã dùng.

OWNER/ADMIN có quyền tất cả TKQC. MANAGER/MEDIA_BUYER chỉ tạo/đọc Donor trên TKQC đã được grant. Các vai trò chỉ đọc vẫn cần account grant để xem library/detail; không có grant thì list rỗng và detail đoán ID trả 403. UPLOADER không đọc account/Donor kể cả account grant, không có quyền Ads. Thu hồi grant có hiệu lực ở request tiếp theo.

## Kiểm tra giao diện bằng dữ liệu thử nghiệm

1. Theo [META_CONNECTION.md](META_CONNECTION.md), mở kết nối thử nghiệm, chọn TKQC VND và hoàn tất wizard.
2. Quảng cáo → Tạo Donor → đặt tên → chọn **TKQC thử nghiệm VND** → **Điền ID thử nghiệm**.
3. Thay Campaign ID bằng `123`, đọc preview: nhận lỗi sai cấu trúc; chưa tạo bản ghi.
4. Dùng Campaign `90071992547409931`, Ad Set `90071992547409932`, Ad `90071992547409933`; hoặc để trống hai cha và chỉ dùng Ad ID.
5. Đọc preview, kiểm source **Dữ liệu thử nghiệm**, warnings/unavailable và template đã loại old-pixel/old-audience/identity. Lưu Donor → thấy version 1.
6. Tạo version mới → preview → lưu → version 2. Xem preview, chọn version 1: snapshot cũ còn nguyên.
7. Với nhân viên Media Buyer, chưa grant TKQC thì không thấy library. Quản trị viên cấp quyền ở Quản lý Page → Tài khoản quảng cáo → Phân quyền, rồi kiểm tra lại.

Đã kiểm thử unit, PostgreSQL và Chromium với mock. Đối chiếu field với SDK Meta chính thức [Ad](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/ad.py), [AdSet](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py), [Campaign](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/campaign.py), [Creative](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py). Đọc mẫu quảng cáo thật cần LIVE connection và Marketing API permissions, chưa được xác minh trong môi trường chưa có credentials.
