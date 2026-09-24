import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, ensureAuthTables, SESSION_COOKIE, tokenHash } from "@/server/auth";

export async function GET() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ user: null, message: "未登录" }, { status: 401 });

    await ensureAuthTables();
    const rows = await db()`
      SELECT u.id, u.phone, u.nickname, u.avatar, u.default_delivery_email AS "defaultDeliveryEmail"
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash(token)}
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
    `;

    if (!rows.length) return NextResponse.json({ user: null, message: "登录已失效" }, { status: 401 });
    return NextResponse.json({ user: rows[0] });
  } catch (error: any) {
    // 这里会把具体错误显示在网页上
    return NextResponse.json(
      { user: null, message: error?.message || String(error) || "登录服务暂时不可用" },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureAuthTables();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ message: "请先登录" }, { status: 401 });

    const body = await request.json();
    const nickname = String(body.nickname || "").trim().slice(0, 20);
    const avatar = String(body.avatar || "").slice(0, 500000);

    const rows = await db()`
      UPDATE users
      SET nickname = ${nickname}, avatar = ${avatar}, updated_at = NOW()
      WHERE id = (
        SELECT user_id FROM user_sessions
        WHERE token_hash = ${tokenHash(token)}
          AND revoked_at IS NULL
          AND expires_at > NOW()
      )
      RETURNING id, phone, nickname, avatar
    `;

    if (!rows.length) return NextResponse.json({ message: "登录已失效" }, { status: 401 });
    return NextResponse.json({ user: rows[0] });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || String(error) || "资料暂时无法保存" },
      { status: 503 }
    );
  }
}