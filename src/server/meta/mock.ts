import type { MetaProvider, MetaInventory, MetaObject } from "./types";
import { AppError } from "../http/errors";
export const MOCK_IDS = {
  campaign: "90071992547409931",
  adSet: "90071992547409932",
  ad: "90071992547409933",
  creative: "90071992547409934",
  account: "90071992547409935",
};
export class MockMetaProvider implements MetaProvider {
  async insights(_token:string,account:{metaId:string;currency:string;timezone:string},since:string,until:string) {
    const {days}=await import("../analytics/engine");
    if(account.metaId!==MOCK_IDS.account)return [];
    return days(since,until).map(day=>({day,accountId:account.metaId,currency:account.currency,timezone:account.timezone,
      campaignId:MOCK_IDS.campaign,campaignName:"Campaign thử nghiệm",adSetId:MOCK_IDS.adSet,adSetName:"Ad Set thử nghiệm",
      adId:MOCK_IDS.ad,adName:"Ad thử nghiệm",pageMetaId:"90071992547409941",postId:"90071992547409941_100",
      campaignStatus:"ACTIVE",adSetStatus:"ACTIVE",adStatus:"ACTIVE",spend:"150000",impressions:"10000",clicks:"250",linkClicks:"200",lpv:"160",reach:"8000"}));
  }
  async inventory(_token: string, expiresAt: Date): Promise<MetaInventory> {
    return {
      user: { id: "mock-user", name: "Kết nối thử nghiệm" },
      expiresAt,
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_engagement",
        "ads_read",
        "ads_management",
      ],
      pages: [
        {
          id: "90071992547409941",
          name: "Page thử nghiệm — Gia dụng",
          access_token: "mock-page-token",
          tasks: ["CREATE_CONTENT", "ADVERTISE", "ANALYZE"],
        },
        {
          id: "90071992547409942",
          name: "Page thử nghiệm — Làm đẹp",
          access_token: "mock-page-token-2",
          tasks: ["ANALYZE"],
        },
      ],
      accounts: [
        {
          id: `act_${MOCK_IDS.account}`,
          account_id: MOCK_IDS.account,
          name: "TKQC thử nghiệm VND",
          currency: "VND",
          timezone_name: "Asia/Ho_Chi_Minh",
          account_status: 1,
          user_tasks: ["ADVERTISE", "ANALYZE"],
        },
        {
          id: "act_90071992547409936",
          account_id: "90071992547409936",
          name: "TKQC thử nghiệm USD",
          currency: "USD",
          timezone_name: "America/Los_Angeles",
          account_status: 1,
          user_tasks: ["ANALYZE"],
        },
      ],
    };
  }
  async read(
    _token: string,
    id: string,
    _fields: string[],
  ): Promise<MetaObject> {
    void _fields;
    const common = { account_id: MOCK_IDS.account };
    const objects: Record<string, MetaObject> = {
      [MOCK_IDS.ad]: {
        ...common,
        id,
        name: "Ad thử nghiệm",
        adset_id: MOCK_IDS.adSet,
        campaign_id: MOCK_IDS.campaign,
        creative: { id: MOCK_IDS.creative },
        status: "ACTIVE",
        tracking_specs: [
          { action_type: ["offsite_conversion"], fb_pixel: ["old-pixel"] },
        ],
      },
      [MOCK_IDS.adSet]: {
        ...common,
        id,
        campaign_id: MOCK_IDS.campaign,
        name: "Ad Set thử nghiệm",
        optimization_goal: "LINK_CLICKS",
        billing_event: "IMPRESSIONS",
        destination_type: "WEBSITE",
        daily_budget: "150000",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: {
          geo_locations: { countries: ["VN"] },
          age_min: 22,
          age_max: 55,
          publisher_platforms: ["facebook"],
          facebook_positions: ["feed"],
          custom_audiences: [{ id: "old-audience" }],
        },
        start_time: "2026-01-01T00:00:00+0000",
        promoted_object: { pixel_id: "old-pixel" },
      },
      [MOCK_IDS.campaign]: {
        ...common,
        id,
        name: "Campaign thử nghiệm",
        objective: "OUTCOME_TRAFFIC",
        buying_type: "AUCTION",
        special_ad_categories: [],
        status: "ACTIVE",
      },
      [MOCK_IDS.creative]: {
        id,
        name: "Creative thử nghiệm",
        object_story_spec: {
          page_id: "90071992547409941",
          link_data: {
            link: "https://example.com/product",
            message: "Nội dung thử nghiệm",
            call_to_action: { type: "LEARN_MORE" },
          },
        },
        effective_object_story_id: "90071992547409941_100",
        instagram_actor_id: "old-identity",
      },
    };
    if (!objects[id])
      throw new AppError(
        404,
        "META_NOT_FOUND",
        "Không tìm thấy ID trong bộ dữ liệu thử nghiệm. Dùng các ID gợi ý trên giao diện.",
      );
    return structuredClone(objects[id]);
  }
}
