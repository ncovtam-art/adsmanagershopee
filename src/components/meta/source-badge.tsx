import { Badge } from "../ui";
export function SourceBadge({ source }: { source: "MOCK" | "LIVE" }) {
  return (
    <Badge tone={source === "MOCK" ? "warning" : "success"}>
      {source === "MOCK" ? "Dữ liệu thử nghiệm" : "Meta API"}
    </Badge>
  );
}
