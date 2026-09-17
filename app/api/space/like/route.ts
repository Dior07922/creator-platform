import { NextResponse } from "next/server";
import { mockWorks } from "../works/route";

export async function POST(req: Request) {
  const body = await req.json();
  const work = mockWorks.find(w => w.id === body.workId);
  if (!work) return NextResponse.json({ message: "作品不存在" }, { status: 404 });

  work.isLiked = !work.isLiked;
  work.likes += work.isLiked ? 1 : -1;
  return NextResponse.json({ success: true, likes: work.likes, isLiked: work.isLiked });
}
