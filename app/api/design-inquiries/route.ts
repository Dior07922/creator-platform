import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(url);
}

async function ensureTable() {
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS design_inquiries (
    id TEXT PRIMARY KEY, service_id INTEGER NOT NULL, service_type TEXT NOT NULL,
    idea TEXT NOT NULL, target_user TEXT NOT NULL DEFAULT '', existing_assets TEXT NOT NULL DEFAULT '',
    expected_timeline TEXT NOT NULL DEFAULT '', budget TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting_confirmation', submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "缺少需求编号" }, { status: 400 });
  try {
    await ensureTable();
    const sql = database();
    const rows = await sql`SELECT id, service_id AS "serviceId", service_type AS "serviceType", idea,
      target_user AS "targetUser", existing_assets AS "existingAssets", expected_timeline AS "expectedTimeline",
      budget, status, submitted_at AS "submittedAt", updated_at AS "updatedAt"
      FROM design_inquiries WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ message: "没有找到这条需求" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ message: "持久数据库尚未连接" }, { status: 503 });
    return NextResponse.json({ message: "暂时无法读取需求" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const idea = String(body.idea ?? "").trim();
  if (!body.serviceId || idea.length < 6) return NextResponse.json({ message: "请先说说你想做什么" }, { status: 400 });
  const id = `DESIGN-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  try {
    await ensureTable();
    const sql = database();
    const rows = await sql`INSERT INTO design_inquiries (
      id, service_id, service_type, idea, target_user, existing_assets, expected_timeline, budget, status
    ) VALUES (
      ${id}, ${Number(body.serviceId)}, ${String(body.service ?? "定制设计")}, ${idea},
      ${String(body.use ?? "")}, ${String(body.code ?? "")}, ${String(body.timeline ?? "")},
      ${String(body.budget ?? "")}, 'waiting_confirmation'
    ) RETURNING id, service_id AS "serviceId", service_type AS "serviceType", idea,
      target_user AS "targetUser", existing_assets AS "existingAssets", expected_timeline AS "expectedTimeline",
      budget, status, submitted_at AS "submittedAt", updated_at AS "updatedAt"`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ message: "持久数据库尚未连接，需求没有提交" }, { status: 503 });
    return NextResponse.json({ message: "需求提交失败，请稍后重试" }, { status: 500 });
  }
}
