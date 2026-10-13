# Affiliate Ads Command Center

Web App tiếng Việt cho quy trình quản lý Facebook Page, Ads Donor và Shopee Affiliate. Đặc tả đầy đủ nằm trong [docs/SPECIFICATION.md](docs/SPECIFICATION.md).

## Hiện trạng

Giai đoạn 1 được giữ nguyên; đã bổ sung **Giai đoạn 2 — Page & Meta Connection** và **Giai đoạn 3 — Ads Donor** và **Giai đoạn 4 — Shopee Tracking**: OAuth, wizard chọn Page/TKQC, mapping có lịch sử, Workspace, phân quyền tài nguyên, CSV/XLSX fallback, Donor reader/preview/normalization và version bất biến. Có Mock Provider bật rõ với nhãn thử nghiệm và dữ liệu riêng. Kết nối Meta thật chưa được kiểm chứng vì chưa có Meta App/credentials/quyền.

Shopee tracking đã có Product/SubID/Manual Link/Assisted CSV và commission import/review. Giai đoạn 5 đã có Meta Insights/Ads CSV, Campaign Manager, Attribution/ROAS/Profit, Data Quality và worker định kỳ. Giai đoạn 6 đã có Video Library, upload/hash/metadata, caption templates, scheduling, BullMQ/Redis, publish/comment adapter và recovery UNKNOWN. Giai đoạn 7 đã có Ads Wizard, Existing Post/New Creative, compatibility, create/verify PAUSED, IDs mới và UNKNOWN recovery. Giai đoạn 8 đã có Bulk/Cloning, presets, budget preview, cấu trúc dùng chung parent, BullMQ, pause/resume và lineage. Ads Care có rules/Dry Run/Winner/alerts/Telegram và Auto Pause bật rõ; hardening có CSP/rate-limit/indexes/private media backup và deployment. Không có KPI tài chính giả; Meta LIVE chưa nghiệm thu.

Hướng dẫn sử dụng tiếng Việt: [USER_GUIDE.md](USER_GUIDE.md). ZIP mã nguồn1.0.0 đã triển khai1–10, có thể cài/build; nghiệm thu Meta LIVE/Telegram/HTTPS cần tài khoản và máy chủ thực.

Stack: Next.js 16, React 19, TypeScript, PostgreSQL 17, Drizzle ORM, Zod. Prisma là công nghệ đề xuất trong đặc tả; engine/checksum bị chính sách mạng từ chối. Chọn Drizzle cho repository mới để migration và kiểm thử PostgreSQL chạy được qua dependencies npm chính thức. Không tắt xác minh TLS/checksum.

## Chạy trên máy phát triển

Cần Node.js 22 trở lên, npm, Docker Compose v2 và FFmpeg/ffprobe trong PATH. Mở terminal tại thư mục repository:

```bash
npm ci
npm run env:init
npm run db:up
npm run queue:up
npm run db:migrate
npm run owner:create
npm run dev
```

Chạy `npm run worker:insights` và `npm run worker:publisher` trong hai terminal riêng cùng thư mục; thêm `npm run worker:ads` và `npm run worker:care`. Web và worker cần cùng cấu hình nguồn/storage/Database. Mock chỉ bật rõ trong development, không thay nghiệm thu Facebook LIVE.

`env:init` tạo `.env` với mật khẩu Database ngẫu nhiên; giữ nguyên cấu hình có sẵn và bổ sung TOKEN_ENCRYPTION_KEY nếu chưa có. Khóa mã hóa phải được giữ để đọc token đã lưu. `owner:create` hỏi tên workspace, tên chủ sở hữu, email và mật khẩu (ít nhất 12 ký tự); nhập mật khẩu không hiển thị. Không có tài khoản/mật khẩu mặc định. Khởi tạo OWNER chỉ được chạy một lần; không có API đăng ký OWNER công khai.

Mở ứng dụng tại địa chỉ `APP_ORIGIN` trong `.env`. Địa chỉ này phải trùng **scheme + hostname + port** mà trình duyệt sử dụng, nếu không các thao tác sẽ bị từ chối để chống CSRF. Chỉ dùng HTTP/`COOKIE_SECURE=false` cho development cô lập; production phải HTTPS và `COOKIE_SECURE=true`. Không đưa mật khẩu/token vào chat hoặc Git.

## Tự kiểm tra trên giao diện

1. Đăng nhập bằng tài khoản OWNER vừa tạo. Nhập sai mật khẩu để thấy lỗi tiếng Việt; sau 5 lần sai, tài khoản được giới hạn đăng nhập trong 15 phút.
2. Tổng quan đếm Page LIVE được lưu, tách Page thử nghiệm; Campaign/Shopee/ROAS giữ “—” khi chưa đồng bộ. Điều hướng qua đúng 6 mục; module chưa triển khai có thông báo rõ.
3. Vào **Cài đặt → Nhân viên → Thêm nhân viên**. Tạo tài khoản vai trò **Chỉ xem**; dữ liệu lưu PostgreSQL, tải lại trang vẫn còn.
4. Tạo lại cùng email: hệ thống báo trùng. Email được chuẩn hóa chữ thường.
5. Khóa nhân viên: hộp thoại yêu cầu xác nhận. Nhân viên đang đăng nhập sẽ không còn quyền truy cập; mở khóa cho phép đăng nhập lại. Không thể khóa chính mình hoặc OWNER.
6. Mở cửa sổ trình duyệt riêng và đăng nhập tài khoản Chỉ xem. Vào Nhân viên hoặc Doanh thu & ROAS: hiển thị thiếu quyền; gọi API quản lý trực tiếp cũng bị 403.
7. Vào **Cài đặt → Advanced Settings**, đổi tên workspace/múi giờ, lưu và tải lại. Sidebar phản ánh tên mới.
8. Vào **System Health → Xem nhật ký thao tác**: thấy các lần đăng nhập, tạo/khóa nhân viên và đổi cấu hình. Thời gian dùng múi giờ đã chọn.
9. Đăng xuất rồi thử mở lại trang được bảo vệ: quay về Đăng nhập.
10. Thu nhỏ cửa sổ: menu chuyển thành menu mở/đóng; dùng ô tìm kiếm để tìm **mục điều hướng**. Tìm kiếm dữ liệu toàn hệ thống sẽ bổ sung khi các module nghiệp vụ tồn tại.

## Kiểm tra Page & Ads Donor

Chưa có Meta App: chạy `META_MOCK_ENABLED=true npm run dev` (hoặc `META_MOCK_ENABLED=true npm start` sau build). Đăng nhập OWNER, vào **Cài đặt → Kết nối Meta → Mở kết nối thử nghiệm**, chọn Page/TKQC, ghép bằng dropdown rồi hoàn tất. Vào **Quản lý Page** xem Grid/Table, mở Workspace, sửa mã/ngách/TKQC và xem lịch sử. Vào **Quảng cáo → Tạo Donor**, chọn TKQC thử nghiệm VND, điền ID thử nghiệm, đọc preview rồi lưu. Tạo version mới, mở preview và chọn version cũ để kiểm tra dữ liệu giữ nguyên.

Cấu hình/kiểm chứng Facebook thật và import báo cáo: [META_CONNECTION.md](META_CONNECTION.md). Chi tiết Donor, field unavailable/normalization/versioning: [ADS_DONOR.md](ADS_DONOR.md). Hai module giữ nhãn nguồn rõ; import tệp không tạo khả năng Ads API.

## Kiểm thử

```bash
npm run typecheck
npm run lint
npm test
npm run db:test:up
npm run queue:up
npm run db:migrate -- --test
npm run test:integration
npm run build
npm run test:e2e
npm run db:status
```

E2E cần Chromium. Dùng Chromium có sẵn bằng biến `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, hoặc cài phiên bản tương ứng bằng `npx playwright install chromium` (cần quyền mạng đến CDN chính thức). Trong môi trường đã kiểm chứng, Chromium ở `/usr/bin/chromium`.

Integration/E2E chỉ dùng `TEST_DATABASE_URL`, tên Database kết thúc bằng `_test` và khác Database ứng dụng. Chúng dọn **Database kiểm thử** trước khi chạy; không chạy đồng thời hai suite trên cùng Database kiểm thử. E2E chạy bản build tại cổng 3001, kiểm thử qua trình duyệt thật và API. Credentials phát sinh ngẫu nhiên chỉ dành cho fixture kiểm thử, nằm trong `artifacts/` bị Git ignore; không dùng để đăng nhập ứng dụng development. Không chạy test dùng Database production.

## Tài liệu

- [Kế hoạch và trạng thái từng giai đoạn](IMPLEMENTATION_PLAN.md)
- [Kiến trúc](ARCHITECTURE.md) · [Database](DATABASE.md)
- [Triển khai](DEPLOYMENT.md) · [Khắc phục lỗi](TROUBLESHOOTING.md)
- [Meta](META_CONNECTION.md) · [Ads Donor](ADS_DONOR.md) · [Tạo Ads](ADS_CREATION.md)
- [Shopee](SHOPEE_WORKFLOW.md) · [Đối soát hoa hồng](COMMISSION_RECONCILIATION.md) · [Ads Care](ADS_CARE.md)

Kiểm chứng và giới hạn của phiên triển khai được ghi trong [docs/VALIDATION.md](docs/VALIDATION.md). Hướng dẫn Ads Care: [ADS_CARE.md](ADS_CARE.md); vận hành/hardening: [HARDENING.md](HARDENING.md).

## Kiểm tra Shopee Tracking

Cài đặt → Shopee → Sản phẩm → Thêm sản phẩm. Tracking & Custom Link → Tạo tracking, chọn Page/sản phẩm và mã tài khoản `shopee_vn` (hoặc mã riêng đúng tài khoản của bạn). Tạo Custom Link trong Shopee với SubID đã sinh, dán vào app và xác nhận; xem lịch sử link. Bulk xuất danh sách chuẩn bị, tải mẫu trả kết quả ba cột, nhập lại theo ID/SubID, không theo thứ tự dòng.

Doanh thu & ROAS → chọn source, tải CSV commission, cùng mã tài khoản; đọc cột → ghép cột/format/status → preview → xác nhận nhập. Nhập lại cùng file/đổi tên không cộng trùng. Mở Unmatched và Cần xem xét, ghi lý do khi mapping/đối soát thủ công. Dòng chưa có identity/status đáng tin cậy không vào totals. Dùng Page MOCK thì chọn Dữ liệu thử nghiệm ở cả upload và bảng hoa hồng.

Hướng dẫn chi tiết: SHOPEE_WORKFLOW.md và COMMISSION_RECONCILIATION.md. Không cần credentials Shopee cho luồng thủ công; URL/subID chưa được Shopee API xác minh.

## Kiểm tra Video Publisher

Vào Đăng video → chọn MOCK/một Page → Cấu hình đăng & comment → bật đăng. Upload MP4 H.264, chọn video/caption/template/lịch → preview → xác nhận → Publish Queue. Worker trả IDs có nhãn nguồn; Mock không có bài trên Facebook. Gắn sản phẩm, tạo Organic tracking theo video và nhập Custom Link trong Shopee trước khi bật auto-comment. Chi tiết từng bước, storage/backup và UNKNOWN: [VIDEO_PUBLISHER.md](VIDEO_PUBLISHER.md).

## Kiểm tra Ads Analytics & ROAS

Doanh thu & ROAS hoặc Quảng cáo → chọn nguồn/TKQC/kỳ → Đồng bộ Insights hoặc Nhập Ads CSV theo mẫu Ad/ngày → Quy tắc tài chính & lịch cập nhật. Tracking ADS phải có Page/account/3 Meta IDs/link riêng và commission cùng namespace. ROAS/profit để — khi dữ liệu thiếu hoặc chưa xác nhận mapping. Worker chạy bằng `npm run worker:insights` trong terminal riêng bên cạnh web app. Xem [ADS_ANALYTICS.md](ADS_ANALYTICS.md) để kiểm tra từng bước và hiểu giới hạn CSV/cohort/lifetime.

## Kiểm tra Create Ads from Donor

Đăng video → Bài viết đã đăng → Chạy quảng cáo; hoặc Quảng cáo → Tạo Ads PAUSED. Chọn video/version, đọc compatibility/preview rồi confirm. Existing Post giữ link/shared attribution; New Creative cần ADS tracking/link riêng. Khởi động worker bằng `npm run worker:ads`; xem [ADS_CREATION.md](ADS_CREATION.md).

## Bulk Ads & Cloning

Quảng cáo → Tạo hàng loạt & nhân bản Ads. Chọn video/version/cấu trúc, đọc counts/ngân sách theo currency/Daily/Lifetime rồi xác nhận PAUSED. Clone Campaign/Ad Set/Ad đã verified trong app, New Creative cần SubID/URL riêng; batch pause/resume/retry và UNKNOWN recovery giữ IDs cũ. Redis cần chạy trước worker:ads. Xem [BULK_ADS.md](BULK_ADS.md).
