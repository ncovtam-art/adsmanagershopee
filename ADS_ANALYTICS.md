# Ads Analytics & ROAS — Giai đoạn 5

Đã thêm module Analytics vào **Quảng cáo**, **Doanh thu & ROAS** và Page Workspace, giữ auth/Meta/Donor/Shopee đang hoạt động. Sáu menu chính giữ nguyên. Dashboard đọc PostgreSQL; chỉ nút đồng bộ và worker gọi Meta. Không tạo/bật/dừng/xóa Ads hoặc thay ngân sách.

## Cách kiểm tra

1. Đăng nhập OWNER/ADMIN. Cài đặt → Facebook: kết nối chính thức, chọn và lưu Page/TKQC, mapping đúng. Khi không có credentials, bật rõ `META_MOCK_ENABLED=true`, khởi động lại ứng dụng, dùng kết nối thử nghiệm. Mock được tách và ghi nhãn; dữ liệu thử nghiệm không phải thu nhập thật.
2. Doanh thu & ROAS → chọn **Nguồn Analytics**, **TKQC Analytics**, kỳ đã kết thúc theo reporting timezone. Với Mock dùng TKQC thử nghiệm VND, không dùng tài khoản USD cho Ad VND. Nhấn **Đồng bộ Insights**. Chi phí được lưu theo Ad/ngày, có Last Sync và coverage. Chưa có hoa hồng phù hợp thì hoa hồng/ROAS hiển thị —.
3. Nếu API chưa đủ quyền: **Nhập Ads CSV** → tải mẫu Ad/ngày → điền dữ liệu xuất từ Ads Manager, ID dạng Text, tiền dạng số thập phân không phân cách hàng nghìn, date YYYY-MM-DD, CSV UTF-8 dấu phẩy. File phải bao gồm tất cả Ads cho toàn bộ kỳ của đúng TKQC/currency/timezone, không breakdown. Preview kiểm tra 1–5.000 dòng, ≤2 MB. Xem tổng/ngày xung đột/ngày rỗng; xác nhận báo cáo đầy đủ rồi lưu. Ngày rỗng chỉ trở thành chi phí 0 sau xác nhận. Có nguồn khác thì phải xác nhận thay snapshot theo ngày.
4. Cài đặt → Shopee: tạo tracking **ADS**, chọn Page đã mapping đúng TKQC, khai báo 3 ID Meta hợp lệ, dùng Custom Link riêng có đúng SubID. Import commission CSV vào cùng source và mã tài khoản Affiliate; hoàn tất Unmatched/review. Không sửa tracking cũ để làm số liệu trông đúng.
5. Mở **Quy tắc tài chính & lịch cập nhật**: chọn trạng thái dự kiến, chi phí khác/ngày (đơn vị currency của TKQC) và xác nhận mapping/link khai báo. PAID luôn là thực nhận; REJECTED không cộng vào dự kiến/thực nhận. Cấu hình có audit. ROAS chỉ hiện khi có chi phí đầy đủ, dữ liệu mới và commission đủ điều kiện.
6. Đổi cấp Campaign → Ad Set → Ad, SubID hoặc nội dung; search, sort, lọc trạng thái, tùy chỉnh cột, lưu bộ lọc và xuất CSV. Click tên nhóm mở panel Ads/SubIDs/Donor/Post IDs, chi phí theo ngày và Reach Ad/ngày. Bảng đối soát bên dưới có lịch sử từng đơn; lịch sử link nằm ở Shopee. Page Workspace đã scope Page. Bộ lọc lưu trong trình duyệt theo user/context, tối đa 10, không lưu giá trị tài chính.
7. Nhập lại CSV hoặc đồng bộ lại cùng kỳ: spend không tăng. Đổi LIVE/MOCK không giữ KPI nguồn cũ. VIEWER/UPLOADER không nhận financial data; Buyer/Manager cần grant cả Page và TKQC để xem hoa hồng Ads của Page.

## Snapshot và chống trùng

`insight_days` là snapshot được chọn duy nhất cho TKQC/ngày. `insight_ads` unique Ad trong snapshot. Chỉ ingest **Ad-level/time_increment=1**, không cộng Campaign + Ad Set + Ad; các cấp cao được rollup từ Ad. API/CSV thay nguyên ngày trong một transaction/advisory lock, không cộng bổ sung. Same snapshot cập nhật freshness và giữ facts; snapshot khác thay cả ngày, nên Ads bị loại khỏi báo cáo mới không còn chi phí cũ. Run/audit giữ provider, source qua account, kỳ, kết quả và fingerprint; raw CSV mới AES-GCM, không gửi vào history API. Batch CSV/XLSX bốn cột cấp Account ở Giai đoạn 2 vẫn giữ lịch sử, **không tự đưa vào Analytics**.

Canonical CSV có 21 cột trong mẫu tải từ UI. Các cột metrics tuỳ chọn để trống → null; trạng thái thiếu → UNKNOWN. Mẫu hiện chưa tự ghép mọi tên cột/locale của Ads Manager; cần xuất/chuyển đúng schema, không đoán cấp báo cáo hay cấu trúc breakdown. IDs/currency/timezone/ngày/quan hệ phải nhất quán; currency hoặc timezone TKQC thay đổi làm báo cáo cũ bị chặn cho tới khi đồng bộ lại cả kỳ.

Gateway chỉ gọi Graph endpoint/version được cấu hình. Paging giữ host/path/time_range, không follow URL next. Đọc usage/rate/Retry-After, retry transient có giới hạn; hết quyền/token trả lỗi có hướng dẫn. Ads catalog cung cấp Page/Post/effective status; thiếu metadata không tự gán Page bằng tài khoản. Không đủ dữ liệu hoặc một page thất bại thì không ghi snapshot thiếu. LIVE còn cần Meta App, App Review/quyền thực; tests HTTP stub/Mock không thay nghiệm thu thật.

## Quy tắc tiền và thời gian

Tiền Decimal(30,6)/BigInt, ID string; không dùng Number cho tính tiền. Number chỉ dùng tỷ lệ độ cao đồ thị minh hoạ, giá trị tooltip/bảng/export vẫn exact. Không chuyển đổi tiền tệ. CPC/CPM/CTR tính lại từ spend/counts cộng được. Reach lưu từng Ad/ngày; không cộng unique reach xuyên ngày/Ads. Link Clicks/LPV không có trả —.

- Estimated Commission = tổng trạng thái cấu hình (mặc định PENDING + APPROVED + PAID).
- Realized Commission = PAID theo trạng thái báo cáo Shopee hiện tại, chưa phải đối chiếu ngân hàng.
- ROAS = commission đủ điều kiện / spend tương ứng; spend 0 hoặc dữ liệu thiếu → null/—.
- Profit = commission tương ứng − spend − Other Costs.
- Other Costs = chi phí khác/ngày × số ngày; phân bổ vào các nhóm theo tỷ trọng spend của toàn kỳ trước search. Phần dư Decimal giữ ở nhóm cuối. Khi chỉ xem một phần Page hoặc spend toàn kỳ 0, không tự phân bổ khoản phí TKQC: profit/ROAS để — nếu khoản phí khác >0.

Cohort dùng **ngày đặt đơn trong reporting timezone** và ngày spend của cùng kỳ, theo mapping Ad. Daily tách ngày đặt đơn/chi phí; không tạo ROAS cho ngày không có commission evidence. Lifetime đòi ngày bắt đầu Ads được xác nhận, kỳ bắt đầu đúng ngày đó và đủ coverage tới hôm qua; hiện tối đa 366 ngày mỗi báo cáo. Ngày cập nhật commission, settlement và import không thay ngày đặt đơn. Status/amount là trạng thái mới nhất của ledger, không phải báo cáo tài chính đóng sổ “as of” thời điểm quá khứ. Publisher/Video ID chưa có: nội dung là reference khai báo, không tự coi là Video FK.

Một Ad chỉ thuộc một nhóm trong cấp đang xem. Nếu nhiều SubID/nội dung dùng chung một Ad, không thể tự chia spend: hiển thị nhóm chưa tách và ROAS —, không nhân spend cho từng SubID.

## Attribution & Data Quality

Attribution là theo mapping khai báo đã xác nhận, **chưa có chứng minh traffic độc lập**. Phải khớp source, namespace Affiliate, Page của Ad, Campaign/Ad Set/Ad, currency, ngày đơn và link riêng. Link từng dùng chung luôn giữ cảnh báo ngay cả khi đổi link mới; Organic/Shared không bị ép sang Ads. Manual mapping giữ báo cáo gốc/history, có cảnh báo.

Các lỗi chặn ROAS/profit: MISSING_SPEND, STALE_DATA (>24h), PARTIAL_DAY, NO_COMMISSION, MISSING_ORDER_DATE, CURRENCY_MISMATCH, UNVERIFIED_MAPPING, SHARED_LINK, MAPPING_NOT_ACKNOWLEDGED, LIFETIME_INCOMPLETE, OPEN_REVIEW, UNATTRIBUTED_COMMISSION, UNALLOCATED_OTHER_COSTS. Unmatched cùng namespace Affiliate trong kỳ chặn tính cho tới khi xử lý. Thông báo không lộ dòng ngoài grants. CSV_DECLARED/MANUAL_MAPPING/PARTIAL_PAGE_SCOPE là cảnh báo nguồn/phạm vi; thiếu chi phí khác tách Page vẫn chặn riêng.

Commission tệp Shopee còn phụ thuộc mức đầy đủ mà người dùng cung cấp; coverage hiển thị là **coverage chi phí**, không phải chứng minh mọi đơn Shopee đã được nhập. Số commission được phân bổ được hiển thị với cảnh báo; phần không đủ điều kiện không âm thầm cộng vào ROAS.

## Worker

```bash
npm run worker:insights
# Smoke/cron một lượt:
npm run worker:insights -- --once
```

Tiến trình riêng, chạy bên cạnh web server; không phụ thuộc reload trình duyệt. Mỗi 30 giây tìm schedule tới hạn, claim nguyên tử bằng UPDATE có điều kiện, cập nhật 3 ngày kết thúc gần nhất mỗi giờ. Giữ các ngày CSV đã chọn. Chỉ OWNER/ADMIN còn active đã bật lịch mới được chạy, mặc định off. Retry-After được giữ, không né rate limit. Lịch bền trong PostgreSQL qua restart; SIGTERM/SIGINT dừng vòng lặp và đóng pool. Worker chết không xoá dữ liệu: báo cáo cũ sẽ STALE_DATA; kiểm tra lịch sử lỗi, token/quyền và tiến trình trước khi đồng bộ lại.

Phạm vi tiếp theo: rate limiter/queue phân tán, tối ưu aggregate SQL/retention/throughput ở Giai đoạn 10; Video Library/Publisher ở Giai đoạn 6. Hiện không claim production-ready hoặc LIVE-verified.
