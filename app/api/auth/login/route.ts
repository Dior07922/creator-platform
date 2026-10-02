import { NextResponse } from "next/server";
import { db, ensureAuthTables, newToken, passwordDigest, secureEqual, SESSION_COOKIE, SESSION_MAX_AGE, tokenHash, validPhone } from "@/server/auth";

/* 账号登录（第六步手稿：登录名 + 密码）——与短信登录并存，两种方式都会发同一枚会话 Cookie。 */

/* 失败限流：同一登录名 10 分钟内连错 8 次锁 10 分钟。
   内存表即可（单进程部署；重启清零不算漏洞，只是少了一层减速带）。 */
const fails = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

function lockedFor(key: string): number {
  const rec = fails.get(key);
  if (!rec) return 0;
  const now = Date.now();
  if (rec.lockedUntil > now) return rec.lockedUntil - now;
  if (now - rec.firstAt > WINDOW_MS) fails.delete(key);
  return 0;
}
function recordFail(key: string) {
  const now = Date.now();
  const rec = fails.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    fails.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_FAILS) rec.lockedUntil = now + LOCK_MS;
}
function clearFails(key: string) { fails.delete(key); }

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return NextResponse.json({ message: "请输入登录名和密码" }, { status: 400 });

    const key = username.toLowerCase();
    const wait = lockedFor(key);
    if (wait > 0) return NextResponse.json({ message: `尝试次数过多，请 ${Math.ceil(wait / 60000)} 分钟后再试` }, { status: 429 });

    await ensureAuthTables();
    const sql = db();
    /* 账号一栏也允许填手机号：先按登录名找，找不到再看是不是手机号。
       只有短信注册的用户没有密码 —— 如实引导去验证码登录，不给一句笼统的失败。 */
    let rows = await sql`SELECT id, username, nickname, avatar, password_hash FROM users WHERE lower(username) = lower(${username}) LIMIT 1`;
    if (!rows.length && validPhone(username)) {
      rows = await sql`SELECT id, username, nickname, avatar, password_hash FROM users WHERE phone = ${username} LIMIT 1`;
      if (rows.length && !(rows[0] as { password_hash: string | null }).password_hash) {
        return NextResponse.json({ message: "该手机号是验证码账号，请改用「手机号登录」" }, { status: 400 });
      }
    }
    if (!rows.length) { recordFail(key); return NextResponse.json({ message: "登录名或密码不正确" }, { status: 401 }); }
    const user = rows[0] as { id: string; username: string | null; nickname: string; avatar: string; password_hash: string | null };
    if (!user.password_hash) { recordFail(key); return NextResponse.json({ message: "登录名或密码不正确" }, { status: 401 }); }

    const ok = secureEqual(user.password_hash, passwordDigest(user.username || username, password));
    if (!ok) { recordFail(key); return NextResponse.json({ message: "登录名或密码不正确" }, { status: 401 }); }
    clearFails(key);

    const token = newToken();
    await sql`INSERT INTO user_sessions(id,user_id,token_hash,expires_at) VALUES(${crypto.randomUUID()},${user.id},${tokenHash(token)},NOW()+INTERVAL '30 days')`;
    const response = NextResponse.json({ user: { id: user.id, nickname: user.nickname || user.username || "", avatar: user.avatar || "" } });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
    return response;
  } catch {
    return NextResponse.json({ message: "登录服务暂时不可用，请稍后再试" }, { status: 503 });
  }
}
