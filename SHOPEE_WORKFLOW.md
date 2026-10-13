# Shopee Tracking — Giai đoạn 4

## Workflow hoạt động

Không cần API Shopee để dùng luồng Manual/Assisted. **Cài đặt → Shopee** có Product Center và Link Center. Từng **Page Workspace** cũng có Link Center lọc riêng theo Page. Sáu mục sidebar giữ nguyên.

1. Tab **Sản phẩm → Thêm sản phẩm**: tên, URL HTTPS sản phẩm Shopee Việt Nam, ngách. URL được chuẩn hóa bỏ fragment, unique trong danh mục; không gọi Shopee để lấy giá/ảnh hoặc xác minh sản phẩm. Đây là danh mục do bạn khai báo.
2. Tab **Tracking & Custom Link → Tạo tracking**: chọn sản phẩm, mã tài khoản Affiliate, Organic/Ads/Shared, tham chiếu nội dung và một/nhiều Page. Mã tài khoản ví dụ `shopee_vn`, dùng nhất quán với báo cáo; đặt mã khác cho tài khoản Affiliate khác. Không nhập password/API token Shopee.
3. App tạo SubID `PAGECODE-12HEX`, uppercase, tối đa 21 ký tự, random 48 bit với UNIQUE toàn Database và retry collision. Prefix rút gọn Page Code; quan hệ thật nằm ở tracking record. Page Code đổi không sửa SubID cũ.
4. Mở Custom Link của Shopee bên ngoài app, dùng đúng Product URL và SubID app đã chuẩn bị. **Gắn Custom Link**, dán URL kết quả, xác nhận đã tạo link với đúng SubID rồi lưu. App không tự gắn SubID vào query và không coi URL mở được là được Shopee xác minh.
5. Trạng thái **Cần tạo Custom Link** = MANUAL_ACTION_REQUIRED; **Sẵn sàng · xác nhận thủ công** = READY với confirmation USER_DECLARED. Đây là xác nhận của người dùng, không phải API validation.

URL sản phẩm nhận shopee.vn/www.shopee.vn; affiliate URL thêm shope.ee, s.shopee.vn, vn.shp.ee. Chỉ HTTPS, không credentials/port lạ; app không truy cập URL ở server. URL ngắn mới ngoài danh sách cần đánh giá chính thức trước khi hỗ trợ, không nới host tùy ý.

## Assisted Bulk

Chọn tối đa 100 records → **Xuất danh sách chuẩn bị**: CSV UTF-8 BOM có tracking_id, sub_id, product_url, content_ref, page_name, affiliate_account, source, channel, affiliate_url. Spreadsheet formulas trong text được neutralize. Tạo link bằng Shopee thủ công.

**Tải mẫu trả kết quả** tạo CSV ba cột `tracking_id,sub_id,affiliate_url`. Điền URL kết quả vào đúng record, có thể đổi thứ tự dòng. Chọn **CSV kết quả Custom Link**, xác nhận link đã được tạo đúng SubID và **Nhập kết quả link**. Backend kiểm ID + SubID + Page/TKQC grants + URL cho toàn batch trước lưu transaction. Một dòng sai không lưu các dòng còn lại. Upload tối đa 2 MB, batch tối đa 100; không ghép theo thứ tự hoặc tên giống nhau.

Một URL mới tạo version mới; URL không đổi không tạo version thừa. **Lịch sử link** giữ mọi version; Database trigger cấm sửa/xóa versions. Mapping Page/product/channel/account/3 Meta IDs là snapshot lúc tạo record. Source LIVE/MOCK theo Page; không chuyển nguồn khi ghi link/hoa hồng.

## Mapping và giới hạn phân bổ

Organic và Ads dùng records/SubID riêng. Shared được khai báo rõ; nếu một URL từng dùng cho nhiều records trong cùng nguồn/tài khoản, app đánh dấu giới hạn ở mức SubID. Đổi sang URL mới không làm các đơn cũ tự trở thành nguồn phân biệt được; dùng record/SubID mới để tách nguồn. Không dùng Mock link để ảnh hưởng attribution dữ liệu LIVE.

Ads lấy TKQC chính đã lưu của Page, cần cả Page và account grant. Có thể chuẩn bị Ads tracking trước khi có Campaign (3 ID để trống); khi nhập 3 ID, backend tái sử dụng Meta Donor reader để xác minh Ad/cha/account. Tracking chưa có Ads thực chỉ có mapping Page/SubID, không bịa Campaign. Meta relationship verification không xác minh Shopee URL đã được gắn vào quảng cáo.

`contentRef` là tham chiếu bạn ghi, chưa phải FK đến video thật; Video Library/Post ID/Jobs ở Giai đoạn 6, Ads creation ở 7. Không có Automation/Worker Shopee hoặc bypass CAPTCHA/2FA. Enum giữ các trạng thái WAITING/PROCESSING/FAILED/UNKNOWN cho worker tương lai, luồng thủ công hiện chỉ thực sự dùng MANUAL_ACTION_REQUIRED/READY.

## Quyền

OWNER/ADMIN quản lý toàn workspace. MANAGER/MEDIA_BUYER chỉ thao tác records thuộc Page được grant; Ads cần account grant thêm. UPLOADER tạo sản phẩm/tracking Organic và gắn link trên Page được grant, không sửa Ads/Shared hoặc đọc commission. VIEWER chỉ đọc metadata/records có Page/account phù hợp, không mutation hay dữ liệu tài chính. API kiểm quyền, không chỉ ẩn nút.

## Kiểm tra không có credentials

Chạy app với META_MOCK_ENABLED=true theo META_CONNECTION.md, mở kết nối thử nghiệm và lưu Page/TKQC. Source tracking tự thành MOCK, UI ghi **Dữ liệu thử nghiệm**. Tạo sản phẩm minh họa, tạo Organic records trên hai Page, thử gắn link/đổi link/xuất-nhập đảo thứ tự. Không gọi Shopee/Meta mutation hoặc xác minh affiliate thật trong tests.

Sau đó theo COMMISSION_RECONCILIATION.md để nhập CSV mẫu, chọn **Dữ liệu thử nghiệm** và mã tài khoản khớp tracking. Trang hoa hồng và nguồn upload có lựa chọn riêng, chọn MOCK ở cả hai để xem dữ liệu thử nghiệm. Mẫu CSV chứa định danh minh họa; thay SubID bằng SubID đã tạo.

Danh sách Link Center hiện trả tối đa 1.000 records gần nhất; import history 30 batches, review list 100 dòng mở; paging/search cho toàn bộ dữ liệu lớn sẽ mở rộng cùng Analytics/hardening. Backend đã có indexes và import tối đa 5.000 dòng, chưa chạy benchmark production.
