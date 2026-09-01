import { NextResponse } from "next/server";
import {
  db,
  ensureAuthTables,
  newToken,
  tokenHash,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/server/auth";

// ─── Development-only login ───────────────────────────────────────────────────
// POST /api/auth/dev-login
//
// Security guards (checked before any DB access):
//   1. NODE_ENV must be "development" — enforced at Next.js build time in production
//   2. Host must be localhost / 127.0.0.1 (with optional port)
//
// Creates a real session in user_sessions using the same helpers as sms/verify,
// so GET /api/auth/me returns a genuine { user } response.

const DEV_PHONE = "13800000001";
// Read env before the NODE_ENV guard narrows the type, so the cookie's
// `secure` flag can still reference the runtime value correctly.
const nodeEnv: string = process.env.NODE_ENV ?? "";

export async function POST(request: Request) {
  // ── Guard 1: environment ────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // ── Guard 2: localhost only ─────────────────────────────────────────────────
  const host = request.headers.get("host") ?? "";
  const isLocal =
    /^localhost(:\d+)?$/.test(host) ||
    /^127\.0\.0\.1(:\d+)?$/.test(host);
  if (!isLocal) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    await ensureAuthTables();
    const sql = db();

    // ── Upsert dev user (same structure as sms/verify INSERT) ──────────────────
    const existing = await sql`
      SELECT id, nickname, avatar
      FROM users
      WHERE phone = ${DEV_PHONE}
      LIMIT 1
    `;

    const isNew = existing.length === 0;
    const userId = isNew ? crypto.randomUUID() : String(existing[0].id);

    if (isNew) {
      await sql`
        INSERT INTO users (id, phone)
        VALUES (${userId}, ${DEV_PHONE})
      `;
    }

    // ── Create real session (same structure as sms/verify INSERT) ──────────────
    const token = newToken();
    await sql`
      INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
      VALUES (
        ${crypto.randomUUID()},
        ${userId},
        ${tokenHash(token)},
        NOW() + INTERVAL '30 days'
      )
    `;

    // ── Set cookie identical to sms/verify ─────────────────────────────────────
    const response = NextResponse.json({
      user: {
        id: userId,
        phone: DEV_PHONE,
        nickname: isNew ? "" : String(existing[0]?.nickname ?? ""),
        avatar: isNew ? "" : String(existing[0]?.avatar ?? ""),
      },
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch {
    return NextResponse.json(
      { message: "开发登录服务暂时不可用" },
      { status: 503 }
    );
  }
}
