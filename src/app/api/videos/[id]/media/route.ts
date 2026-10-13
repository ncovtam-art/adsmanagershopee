import { z } from "zod";
import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { api } from "@/server/http/api";
import { publisher } from "@/server/services";
import { AppError } from "@/server/http/errors";
export const GET = api(
  async (req, actor) => {
    const id = z.string().uuid().parse(req.nextUrl.pathname.split("/").at(-2));
    const asset = await publisher.asset(actor, id);
    if (asset.state !== "READY")
      throw new AppError(409, "VIDEO_NOT_READY", "Video chưa sẵn sàng.");
    const path = publisher.storage.path(asset.storageKey),
      file = await stat(path).catch(() => null);
    if (!file?.isFile() || file.size !== asset.size)
      throw new AppError(
        404,
        "VIDEO_MISSING",
        "Media cần khôi phục từ storage gốc.",
      );
    let start = 0,
      end = asset.size - 1;
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${asset.size}` },
        });
      if (!match[1]) start = Math.max(0, asset.size - Number(match[2]));
      else start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(Number(match[2]), end);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= asset.size
      )
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${asset.size}` },
        });
    }
    return new NextResponse(
      Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream,
      {
        status: range ? 206 : 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
          "X-Content-Type-Options": "nosniff",
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${asset.size}` }
            : {}),
        },
      },
    );
  },
  { permission: "workspace:read" },
);
