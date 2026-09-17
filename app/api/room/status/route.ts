import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId") || "";
  const room = await kv.get<any>(`room:${roomId}`);
  if (!room) return NextResponse.json({ message: "房间不存在" }, { status: 404 });

  room.users = room.users.map((u: any) => ({ ...u, isSpeaking: Math.random() > 0.6 }));
  await kv.set(`room:${roomId}`, room, { ex: 7200 });
  return NextResponse.json({ room });
}
