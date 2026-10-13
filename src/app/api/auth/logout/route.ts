import { NextResponse } from "next/server";
import { auth } from "@/server/services";
import { api } from "@/server/http/api";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/http/security";

export const POST = api(
  async (request) => {
    await auth.logout(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ data: { message: "Đã đăng xuất." } });
    response.cookies.set(SESSION_COOKIE, "", {
      ...sessionCookieOptions(),
      expires: new Date(0),
    });
    return response;
  },
  { mutation: true },
);
