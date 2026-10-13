export const navigation = [
  { href: "/", label: "Tổng quan", icon: "overview" },
  { href: "/pages", label: "Quản lý Page", icon: "pages" },
  { href: "/videos", label: "Đăng video", icon: "videos" },
  { href: "/ads", label: "Quảng cáo", icon: "ads" },
  { href: "/revenue", label: "Doanh thu & ROAS", icon: "revenue" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
] as const;
export const roleLabels = {
  OWNER: "Chủ sở hữu",
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý",
  MEDIA_BUYER: "Media Buyer",
  UPLOADER: "Đăng nội dung",
  VIEWER: "Chỉ xem",
};
export const modules: Record<
  string,
  {
    title: string;
    eyebrow: string;
    description: string;
    tabs: string[];
    stage: string;
    icon: string;
  }
> = {
  pages: {
    title: "Quản lý Page",
    eyebrow: "PAGE WORKSPACE",
    description:
      "Một không gian cho mỗi Page. Một nơi để quản lý toàn bộ hoạt động.",
    tabs: [
      "Tất cả Page",
      "Page Workspace",
      "Tài khoản quảng cáo",
      "Nội dung theo Page",
    ],
    stage: "Giai đoạn 2",
    icon: "pages",
  },
  videos: {
    title: "Đăng video",
    eyebrow: "VIDEO STUDIO",
    description:
      "Tổ chức nội dung, chuẩn bị link và đăng video theo từng Page.",
    tabs: [
      "Video Library",
      "Đăng hàng loạt",
      "Lịch đăng",
      "Bài viết đã đăng",
      "Caption Templates",
    ],
    stage: "Giai đoạn 6",
    icon: "videos",
  },
  ads: {
    title: "Quảng cáo",
    eyebrow: "ADS COMMAND",
    description:
      "Từ Donor đến Campaign. Kiểm soát cấu hình và ngân sách trong một quy trình.",
    tabs: [
      "Campaign Manager",
      "Tạo quảng cáo",
      "Ads Donor",
      "Nhân bản Ads",
      "Ads Care",
      "Ads Presets",
    ],
    stage: "Giai đoạn 3, 5, 7–9",
    icon: "ads",
  },
  revenue: {
    title: "Doanh thu & ROAS",
    eyebrow: "FINANCIAL INTELLIGENCE",
    description:
      "Đối soát SubID trước. Chỉ tính lợi nhuận khi dữ liệu đủ tin cậy.",
    tabs: [
      "Dashboard lợi nhuận",
      "Shopee Commission",
      "Đối soát SubID",
      "Phân tích Campaign",
      "Phân tích Page",
      "Báo cáo",
    ],
    stage: "Giai đoạn 4–5",
    icon: "revenue",
  },
};
