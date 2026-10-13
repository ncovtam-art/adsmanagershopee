export default function Loading() {
  return (
    <div aria-label="Đang tải nội dung" role="status">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-banner" />
      <div className="kpi-grid">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="skeleton skeleton-card" />
        ))}
      </div>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
