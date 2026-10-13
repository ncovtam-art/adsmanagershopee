import { NextRequest, NextResponse } from "next/server";
import { auth } from "../services";
import { requirePermission, type Actor, type Permission } from "../auth/policy";
import { assertOrigin, SESSION_COOKIE } from "./security";
import { errorPayload, AppError } from "./errors";

import { db } from "../db";
import { apiRateLimit } from "./rate-limit";
type Handler = (request: NextRequest, actor: Actor | null) => Promise<unknown>;
export function api(
  handler: Handler,
  options: {
    permission?: Permission;
    mutation?: boolean;
    status?: number;
  } = {},
) {
  return async (request: NextRequest) => {
    try {
      if (options.mutation) assertOrigin(request);
      const actor = await auth.readSession(
        request.cookies.get(SESSION_COOKIE)?.value,
      );
      if (options.permission) requirePermission(actor, options.permission);
      if (actor) await apiRateLimit(db, actor.id, !!options.mutation);
      const result = await handler(request, actor);
      const response =
        result instanceof NextResponse
          ? result
          : NextResponse.json(
              { data: result },
              { status: options.status ?? 200 },
            );
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      const { body, status } = errorPayload(error);
      const response = NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
      if (status === 429)
        response.headers.set(
          "Retry-After",
          String(error instanceof AppError ? (error.retryAfter ?? 900) : 900),
        );
      return response;
    }
  };
}
