import { NextResponse } from "next/server";
import { mockWorks } from "../works/route";

export async function POST(req: Request) {
  const body = await req.json();
  const work = mockWorks.find(w => w.authorId === body.targetUserId);
  if (!work) return NextResponse.json({ message: "作者不存在" }, { status: 404 });

  work.isFollowing = true;
  work.followers += 1;
  return NextResponse.json({ success: true, followers: work.followers, isFollowing: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const work = mockWorks.find(w => w.authorId === body.targetUserId);
  if (!work) return NextResponse.json({ message: "作者不存在" }, { status: 404 });

  work.isFollowing = false;
  work.followers -= 1;
  return NextResponse.json({ success: true, followers: work.followers, isFollowing: false });
}
