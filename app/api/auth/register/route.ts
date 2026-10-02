import { NextResponse } from "next/server";
import { db, ensureAuthTables, passwordDigest, validPassword, validUsername } from "@/server/auth";
import { checkCaptcha } from "@/server/captcha";

/* 注册（第六步手稿：登录名 + 密码 + 确认密码 + 验证码 + 同意协议）
   注册成功不直接登录 —— 手稿第 ④ 步是「注册完成至登录」，回到登录页用新账号登录。 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const confirm = String(body.confirm ?? body.confirmPassword ?? "");
    const captchaId = String(body.captchaId || "");
    const captchaText = String(body.captchaText || "");
    const agreed = body.agreed === true;

    if (!validUsername(username)) return NextResponse.json({ message: "登录名需 3-20 位（中文、字母、数字或下划线）" }, { status: 400 });
    if (!validPassword(password)) return NextResponse.json({ message: "密码至少 6 位" }, { status: 400 });
    if (confirm !== password) return NextResponse.json({ message: "两次输入的密码不一致" }, { status: 400 });
    if (!agreed) return NextResponse.json({ message: "请先阅读并同意用户协议和隐私政策" }, { status: 400 });
    if (!captchaId || !captchaText) return NextResponse.json({ message: "请输入图形验证码" }, { status: 400 });
    if (!checkCaptcha(captchaId, captchaText)) return NextResponse.json({ message: "验证码不正确或已失效，请重新输入" }, { status: 400 });

    await ensureAuthTables();
    const sql = db();
    const exists = await sql`SELECT id FROM users WHERE lower(username) = lower(${username}) LIMIT 1`;
    if (exists.length) return NextResponse.json({ message: "这个登录名已被使用，换一个试试" }, { status: 409 });

    const userId = crypto.randomUUID();
    try {
      await sql`INSERT INTO users(id, username, password_hash, nickname) VALUES(${userId}, ${username}, ${passwordDigest(username, password)}, ${username})`;
    } catch (error) {
      /* 并发下唯一索引兜底（两个请求同时过了上面的查询） */
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("duplicate key") || message.includes("23505")) {
        return NextResponse.json({ message: "这个登录名已被使用，换一个试试" }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, username });
  } catch {
    return NextResponse.json({ message: "注册服务暂时不可用，请稍后再试" }, { status: 503 });
  }
}
