import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function POST(req: Request) {
  const body = await req.json();
  const room = await kv.get<any>(`room:${body.roomId}`);
  if (!room) return NextResponse.json({ message: "房间不存在" }, { status: 404 });
  if (room.users.length >= room.maxUsers) return NextResponse.json({ message: "房间已满" }, { status: 400 });

  room.users.push({
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nickname: body.nickname || "朋友",
    avatarType: body.avatarType || "biped",
    avatarColor: body.avatarColor || "#A8D8C2",
    avatarUrl: body.avatarUrl || "",
    isSpeaking: false,
  });

  await kv.set(`room:${body.roomId}`, room, { ex: 7200 });
  return NextResponse.json({ success: true, room });
}
