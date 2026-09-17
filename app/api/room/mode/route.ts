import { NextResponse } from "next/server";
import { rooms } from "../match/route";

export async function POST(req: Request) {
  const body = await req.json();
  const room = rooms.get(body.roomId);
  if (!room) return NextResponse.json({ message: "房间不存在" }, { status: 404 });

  room.mode = body.mode;
  room.isScreenUp = true;

  return NextResponse.json({ success: true, room });
}
