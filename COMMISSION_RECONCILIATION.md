# Shopee Commission CSV & đối soát — Giai đoạn 4

## Nhập trên giao diện

OWNER/ADMIN vào **Doanh thu & ROAS**. Chọn file AffiliateCommissionReport.csv → nguồn LIVE hoặc MOCK → mã tài khoản Shopee cùng tracking → **Đọc & nhận diện cột**. Ghép cột nếu header khác; chọn currency mặc định, dấu tiền, format ngày và múi giờ. **Kiểm tra preview hoa hồng** hiển thị tối đa 25 dòng đầu/cảnh báo; chưa ghi ledger. **Xác nhận nhập báo cáo** kiểm toàn bộ và ghi transaction. Chọn cùng nguồn ở bảng hoa hồng để xem kết quả.

Backend nhận UTF-8/UTF-8 BOM, UTF-16 LE/BE BOM; có lựa chọn encoding rõ khi biết file Windows-1258/1252. Auto không đoán encoding hỏng. Delimiter comma/semicolon/tab được nhận cấu trúc hoặc chọn rõ. Header trùng/prototype/malformed CSV bị từ chối. Tệp tối đa 2 MB/5.000 dòng; không hỗ trợ commission XLSX trong giai đoạn này.

| Trường                       | Cách xử lý                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Commission Row ID            | Định danh từng dòng commission, ưu tiên để chống trùng                                                                    |
| Order ID + Order Item ID     | Khóa dự phòng khi thiếu Row ID; không dùng Product ID thay Order Item ID                                                  |
| SubID                        | Trim, NFC, uppercase; không bỏ dòng trống/không tìm thấy                                                                  |
| Commission                   | Decimal(30,6), giữ tiền chính xác; tổng BigInt, không float; hỗ trợ âm nếu báo cáo là điều chỉnh                          |
| Status                       | PENDING, APPROVED, PAID/FINALIZED, REJECTED/CANCELLED; unknown vào review                                                 |
| Currency                     | Cột CSV hoặc default do bạn chọn; từng currency riêng, không cộng VND và USD                                              |
| Order/Update/Settlement Date | Riêng từng trường; ISO có offset hoặc YMD/DMY theo lựa chọn; lưu UTC; ngày không có giờ = midnight theo timezone khai báo |

Một số header tiếng Anh/Việt được gợi ý: Commission ID, Order ID, Order Item ID, Sub_id1, Hoa hồng, Trạng thái hoa hồng… UI luôn cho chọn lại. Nếu báo cáo có nhiều cột commission/SubID, cần chọn đúng cột theo quy trình của bạn. Không có file Shopee thật của bạn trong phiên này; không tuyên bố tự nhận mọi phiên bản export.

## Chống trùng và lịch sử

Namespace `(source, affiliateAccount, externalKey)`. Khóa SHA-256 từ Row ID hoặc Order + Order Item ID, giữ ID gốc dạng string. Hai sản phẩm một đơn không bị gộp thành một đơn; không tự cộng hai dòng mâu thuẫn cùng key.

- Cùng file bytes, cùng nguồn/tài khoản: một import; đổi tên không tạo thêm ledger. Chuyển encoding/tệp khác vẫn dedup theo định danh dòng.
- Preview có fingerprint và commit một lần dưới advisory lock. Người khác đổi preview trong lúc mở thì phải đọc lại.
- Cùng dòng/nội dung: duplicate; không cộng lại.
- Revision mới có Update Date muộn hơn: cập nhật trạng thái/tiền, append history. Báo cáo cũ bị bỏ qua, không làm PAID quay về PENDING.
- Nội dung đổi nhưng thiếu/same revision, đổi SubID/currency hoặc định danh mâu thuẫn: review, chưa ghi đè.
- Report bổ sung Row ID sau khi đã dùng Order Item key: chỉ nối khi nhận diện một dòng phù hợp; không tạo dòng thứ hai. Không có đủ thông tin để phân biệt nhiều candidates: review. Dates/Order metadata đã biết không bị xóa khi report mới thiếu cột.

Raw CSV gốc được mã hóa AES-GCM bằng TOKEN_ENCRYPTION_KEY, lưu trong commission_imports; không đưa raw customer columns hoặc encryptedRaw vào API list. Giữ/sao lưu khóa gốc. Candidate chỉ chứa cột cần đối soát, history append-only và audit có actor. Cùng file đã APPLIED không được tái áp bằng config khác; xử lý review hoặc chuẩn bị CSV hiệu chỉnh có nguồn đáng tin cậy, không thay mã tài khoản để né dedup.

## Cần xem xét

Dòng thiếu Row ID/Order Item ID hoặc status chưa rõ vào **Cần xem xét**, chưa cộng totals. Order “Completed/Hoàn thành” không tự coi là commission PAID. Có thể map status trong preview nếu bạn đã xác minh nghĩa trạng thái nguồn.

**Xem xét dòng** → chọn status đúng; nếu thiếu định danh, nhập key ổn định phân biệt dòng hoặc chọn dòng đã có; ghi lý do → **Xác nhận xử lý**. Apply là quyết định của người đối soát, có thể sửa revision mâu thuẫn khi đã kiểm tra CSV; không áp dòng khác vào dòng cũ. Nếu không đủ bằng chứng chọn **Bỏ qua**. Lần báo cáo sau của dòng thiếu identity phải ghép đúng dòng đã có, không tạo key mới tùy tiện. Mọi xử lý có audit/history, lần xử lý lại bị từ chối.

## Unmatched SubID

Dòng valid có định danh nhưng không khớp record vẫn lưu và xuất hiện **Unmatched SubID**. OWNER/ADMIN **Gán tracking**, chọn record cùng source + affiliate account, ghi lý do và xác nhận. Giữ SubID nguyên gốc trong CSV; trackingId/matchMethod MANUAL được lưu riêng và có history. Mapping thủ công được giữ khi update report với cùng SubID; không âm thầm chuyển Page.

Scope SUBID_ONLY khi record chưa có link, Shared hoặc URL từng dùng nhiều records; không tự phân bổ Organic/Ads/Ad hoặc nâng scope cho đơn cũ sau khi đổi URL. PAGE/AD là mức mapping đã khai báo (Meta IDs được kiểm relationship khi có), chưa phải attribution traffic được API Shopee độc lập xác minh. Giai đoạn 5 đã thêm Meta spend, attribution guard, cohort và ROAS trong panel Analytics; xem ADS_ANALYTICS.md. Dữ liệu ở bảng này vẫn là ledger để đối soát, không tự suy traffic được API xác minh.

## Quyền và tổng

Chỉ OWNER/ADMIN import/review/manual map/raw-batch metadata. MANAGER/MEDIA_BUYER đọc hoa hồng của Page được grant, Ads còn cần TKQC grant; không xem Unmatched chưa xác định Page hoặc dữ liệu finance của Page khác. VIEWER/UPLOADER API financial trả 403. Source LIVE/MOCK, currency và trạng thái tách riêng; response được gắn ngữ cảnh filter, UI không hiển thị totals nguồn cũ trong lúc đổi filter.

Bảng phân trang 25 dòng, tổng tính trên toàn bộ kết quả được lọc (không chỉ trang hiện tại). Hiển thị pending/approved/paid/rejected theo CSV; “đã thanh toán” là trạng thái báo cáo, chưa đối chiếu tài khoản ngân hàng. Tổng quan chỉ dùng LIVE PAID theo quyền, một currency khi hiển thị một số; nhiều currency chuyển xem chi tiết. “—” khi chưa có dữ liệu, không ROAS=0 hoặc chia cho 0.

Backend hiện đọc/sắp xếp tập ledger của source rồi lọc scope trong server; không gửi dữ liệu ngoài quyền đến client. Query/aggregation/paging SQL cho khối lượng lớn, retention batch/review UI và benchmark sẽ mở rộng trong Analytics/hardening.
