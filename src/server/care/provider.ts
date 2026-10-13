import { MetaGateway } from "../meta/gateway";
import { gateway, mockEnabled } from "../meta/service";
import { AppError } from "../http/errors";
export type PauseContext = {
  token: string;
  accountMetaId: string;
  id: string;
  level: "campaign" | "adset" | "ad";
  campaignId: string;
  adSetId: string | null;
};
export interface PauseProvider {
  inspect(c: PauseContext): Promise<string>;
  pause(c: PauseContext): Promise<void>;
}
export class LivePauseProvider implements PauseProvider {
  constructor(private client: MetaGateway = gateway) {}
  async inspect(c: PauseContext) {
    const r = await this.client.adsRead(c.token, c.id, [
      "id",
      "account_id",
      "status",
      ...(c.level === "campaign" ? [] : ["campaign_id"]),
      ...(c.level === "ad" ? ["adset_id"] : []),
    ]);
    if (
      r.id !== c.id ||
      r.account_id !== c.accountMetaId ||
      (c.level !== "campaign" && r.campaign_id !== c.campaignId) ||
      (c.level === "ad" && r.adset_id !== c.adSetId)
    )
      throw new AppError(
        422,
        "CARE_IDENTITY",
        "Đối tượng/quan hệ/TKQC không khớp; chưa dừng.",
      );
    if (r.status !== "ACTIVE" && r.status !== "PAUSED")
      throw new AppError(
        422,
        "CARE_STATUS",
        "Chỉ hỗ trợ trạng thái ACTIVE hoặc PAUSED đã xác minh.",
      );
    return r.status;
  }
  async pause(c: PauseContext) {
    await this.client.adsPause(c.token, c.id);
  }
}
export class MockPauseProvider implements PauseProvider {
  private states = new Map<string, string>();
  async inspect(c: PauseContext) {
    return this.states.get(c.id) ?? "ACTIVE";
  }
  async pause(c: PauseContext) {
    this.states.set(c.id, "PAUSED");
  }
}
const mock = new MockPauseProvider();
export function pauseProvider(source: "LIVE" | "MOCK"): PauseProvider {
  if (source === "MOCK") {
    if (!mockEnabled())
      throw new AppError(403, "MOCK_DISABLED", "Bật rõ MOCK trước khi thử.");
    return mock;
  }
  return new LivePauseProvider();
}
