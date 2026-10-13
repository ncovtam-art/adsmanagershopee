"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="error-page">
      <h1>Không thể tải nội dung</h1>
      <p>
        Vui lòng thử lại. Nếu lỗi vẫn còn, liên hệ quản trị viên để kiểm tra kết
        nối Database.
      </p>
      <button className="button primary" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
