import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="error-page">
      <span className="eyebrow">404</span>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại trong không gian làm việc.</p>
      <Link href="/" className="button primary">
        Về Tổng quan
      </Link>
    </main>
  );
}
