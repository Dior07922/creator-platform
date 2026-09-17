import { NextResponse } from "next/server";
import { rooms } from "../match/route";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  const room = rooms.get(roomId || "");
  if (!room) return NextResponse.json({ message: "房间不存在" }, { status: 404 });

  room.users = room.users.map((u: any) => ({ ...u, isSpeaking: Math.random() > 0.6 }));

  return NextResponse.json({ room });
}
