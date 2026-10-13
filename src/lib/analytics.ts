export const qualityLabels: Record<string, string> = {
  PARTIAL_DAY: "Ngày hôm nay chưa kết thúc theo timezone TKQC",
  UNALLOCATED_OTHER_COSTS: "Chưa tách chi phí khác của TKQC theo Page",
  MISSING_SPEND: "Thiếu snapshot chi phí trong kỳ",
  STALE_DATA: "Chi phí quá 24 giờ chưa được cập nhật",
  NO_COMMISSION: "Chưa có hoa hồng phù hợp",
  MAPPING_NOT_ACKNOWLEDGED: "Chưa xác nhận quy tắc mapping khai báo",
  UNATTRIBUTED_COMMISSION: "Có hoa hồng chưa đủ điều kiện phân bổ",
  MISSING_ORDER_DATE: "Thiếu ngày đặt đơn",
  CURRENCY_MISMATCH: "Hoa hồng và chi phí khác tiền tệ",
  SHARED_LINK: "Link dùng chung chỉ phân bổ SubID",
  UNVERIFIED_MAPPING: "Mapping Page/Campaign/Ad chưa khớp",
  LIFETIME_INCOMPLETE: "Chưa xác nhận ngày bắt đầu lifetime của tài khoản",
  OPEN_REVIEW: "Còn dòng import đang chờ review",
  PARTIAL_PAGE_SCOPE: "Chỉ xem Ads thuộc Page được cấp quyền",
  REACH_NON_ADDITIVE: "Reach không được cộng qua Ads/ngày",
  CSV_DECLARED: "Snapshot CSV do người dùng xác nhận đầy đủ",
  MANUAL_MAPPING: "Mapping hoa hồng được người dùng chỉnh thủ công",
};

export const adsCsvHeaders = [
  "date",
  "account_id",
  "currency",
  "timezone",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "page_id",
  "post_id",
  "campaign_status",
  "adset_status",
  "ad_status",
  "spend",
  "impressions",
  "clicks",
  "link_clicks",
  "landing_page_views",
  "reach",
];

export function moneyText(value: string | null | undefined, currency = "") {
  if (value == null) return "—";
  const [w, f = ""] = value.split(".");
  return `${value.startsWith("-") && BigInt(w) === 0n ? "-" : ""}${BigInt(w).toLocaleString("vi-VN")}${f.replace(/0+$/, "") ? "," + f.replace(/0+$/, "") : ""}${currency ? " " + currency : ""}`;
}
