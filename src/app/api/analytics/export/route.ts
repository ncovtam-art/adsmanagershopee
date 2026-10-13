import { api } from "@/server/http/api";
import { analytics } from "@/server/services";
import { csvCell } from "@/server/shopee/validation";
export const GET = api(
  async (req, actor) => {
    const report = await analytics.report(
      actor,
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const header = [
      "name",
      "source",
      "currency",
      "timezone",
      "since",
      "until",
      "mode",
      "spend",
      "pending",
      "approved",
      "paid",
      "rejected",
      "estimated_roas",
      "realized_roas",
      "estimated_profit",
      "realized_profit",
      "quality",
    ];
    return {
      csv:
        "\uFEFF" +
        [
          header.join(","),
          ...report.rows.map((r) =>
            [
              r.name,
              report.account?.source,
              report.account?.currency,
              report.account?.timezone,
              report.query.since,
              report.query.until,
              report.query.mode,
              r.spend,
              r.commissions.PENDING,
              r.commissions.APPROVED,
              r.commissions.PAID,
              r.commissions.REJECTED,
              r.estimatedRoas,
              r.realizedRoas,
              r.estimatedProfit,
              r.realizedProfit,
              r.quality.join("|"),
            ]
              .map((v) => csvCell(String(v ?? "")))
              .join(","),
          ),
        ].join("\r\n"),
    };
  },
  { permission: "finance:read" },
);
