import { NextResponse } from "next/server";
import { databaseHealth } from "@/server/database/read-models";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await databaseHealth();
    return NextResponse.json(
      { status: "ok", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        message: "Database chưa sẵn sàng. Vui lòng liên hệ quản trị viên.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
