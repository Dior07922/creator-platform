import { NextResponse } from "next/server";
import { rooms } from "../match/route";

export async function POST(req: Request) {
  const body = await req.json();
  const room = rooms.get(body.roomId);
  if (!room) return NextResponse.json({ message: "房间不存在" }, { status: 404 });

  room.users.push({
    id: `u-${Date.now()}`,
    nickname: "我",
    avatarType: body.avatarType,
    avatarColor: body.avatarColor,
    avatarUrl: "",
    isSpeaking: false
  });

  return NextResponse.json({ success: true, room });
}
