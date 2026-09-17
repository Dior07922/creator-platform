import { NextResponse } from "next/server";
import { mockWorks } from "../works/route";

// 交作业：接收前端用原生相册/相机拿到的 Base64 图片，写入对应作品
export async function POST(req: Request) {
  const body = await req.json();
  const work = mockWorks.find(w => w.id === body.workId);
  if (!work) return NextResponse.json({ message: "作品不存在" }, { status: 404 });
  if (!body.image) return NextResponse.json({ message: "缺少作业图片" }, { status: 400 });

  work.homeworkList.push({
    id: `hw-${Date.now()}`,
    userName: body.userName || "我",
    userAvatar: body.userAvatar || "",
    image: body.image,
    content: body.content || "这是我的作业",
    authorReply: "",
    createdAt: new Date().toISOString(),
  });
  work.homeworkCount = work.homeworkList.length;

  return NextResponse.json({ success: true, homeworkCount: work.homeworkCount });
}
