import { NextResponse } from "next/server";

export const rooms = new Map<string, any>();

export async function POST(req: Request) {
  const body = await req.json();
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

  rooms.set(roomId, {
    id: roomId,
    maxUsers: body.maxUsers || 4,
    users: [],
    mode: null,
    isScreenUp: false,
    isLandscape: false
  });

  return NextResponse.json({ roomId });
}
