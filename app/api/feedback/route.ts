import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/server/auth";
import { currentUserId } from "@/server/account-settings";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > 2000) return NextResponse.json({ message: "请输入1至2000字反馈" }, { status: 400 });
    await ensureAuthTables();
    const userId = await currentUserId();
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS feedback (id UUID PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), user_id UUID REFERENCES users(id) ON DELETE SET NULL)`;
    const rows = await sql`INSERT INTO feedback(id,content,user_id) VALUES(${crypto.randomUUID()},${content},${userId}) RETURNING id,created_at AS "createdAt"`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch { return NextResponse.json({ message: "反馈未发送成功，请稍后重试" }, { status: 503 }); }
}
