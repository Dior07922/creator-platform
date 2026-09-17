import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function POST(req: Request) {
  const body = await req.json();
  const room = await kv.get<any>(`room:${body.roomId}`);
  if (!room) return NextResponse.json({ message: "房间不存在" }, { status: 404 });

  room.mode = body.mode;
  room.isScreenUp = true;
  await kv.set(`room:${body.roomId}`, room, { ex: 7200 });
  return NextResponse.json({ success: true, room });
}
