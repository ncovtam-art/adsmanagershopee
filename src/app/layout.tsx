import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Affiliate Ads Command Center",
    template: "%s · Affiliate Command",
  },
  description:
    "Không gian điều hành Page, quảng cáo và doanh thu Shopee Affiliate.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <a className="skip-link" href="#main-content">
          Chuyển đến nội dung chính
        </a>
        {children}
      </body>
    </html>
  );
}
