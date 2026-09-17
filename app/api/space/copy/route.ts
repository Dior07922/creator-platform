import { NextResponse } from "next/server";
import { mockWorks } from "../works/route";

export async function POST(req: Request) {
  const body = await req.json();
  const work = mockWorks.find(w => w.id === body.workId);
  if (!work) return NextResponse.json({ message: "作品不存在" }, { status: 404 });

  const docData = {
    pages: [{
      id: "copy-page-1",
      title: "临摹副本",
      content: "",
      shapes: [],
      texts: [],
      transform: { x: 0, y: 0, scale: 1, rotate: 0 }
    }]
  };

  return NextResponse.json({ success: true, docData });
}
