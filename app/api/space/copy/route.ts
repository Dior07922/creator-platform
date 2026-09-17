import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const docData = {
    pages: [{
      id: "copy-page-1",
      title: "临摹副本",
      content: "",
      shapes: [],
      texts: [],
      transform: { x: 0, y: 0, scale: 1, rotate: 0 },
    }],
  };
  return NextResponse.json({ success: true, docData });
}
