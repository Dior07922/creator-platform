import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function POST(req: Request) {
  const body = await req.json();
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  await kv.set(`room:${roomId}`, {
    id: roomId,
    maxUsers: body.maxUsers || 4,
    users: [],
    mode: null,
    isScreenUp: false,
    isLandscape: false,
  }, { ex: 7200 });
  return NextResponse.json({ roomId });
}
