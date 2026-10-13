import { NextResponse } from "next/server";
import { auth } from "@/server/services";
import { api } from "@/server/http/api";
import {
  readJson,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/http/security";

export const POST = api(
  async (request) => {
    const options = sessionCookieOptions();
    const result = await auth.login(await readJson(request));
    const response = NextResponse.json({ data: result.user });
    response.cookies.set(SESSION_COOKIE, result.token, {
      ...options,
      expires: result.expiresAt,
    });
    return response;
  },
  { mutation: true },
);
