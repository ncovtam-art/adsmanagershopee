import { NextRequest, NextResponse } from "next/server";
import { auth, meta } from "@/server/services";
import { SESSION_COOKIE } from "@/server/http/security";
import { AppError } from "@/server/http/errors";
export async function GET(request: NextRequest) {
  const destination = new URL("/settings?tab=meta", process.env.APP_ORIGIN);
  try {
    const actor = await auth.readSession(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    const state = request.nextUrl.searchParams.get("state") ?? "";
    if (request.nextUrl.searchParams.has("error")) {
      await meta.consumeState(actor, state);
      destination.searchParams.set("metaResult", "cancelled");
    } else {
      await meta.callback(
        actor,
        state,
        request.nextUrl.searchParams.get("code") ?? "",
      );
      destination.searchParams.set("metaResult", "connected");
    }
  } catch (error) {
    destination.searchParams.set(
      "metaResult",
      error instanceof AppError ? error.code : "META_UNAVAILABLE",
    );
  }
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
