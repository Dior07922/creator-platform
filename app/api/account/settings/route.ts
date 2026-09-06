import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUserId, settingsDb } from "@/server/account-settings";

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    const sql = await settingsDb();
    const rows = await sql`SELECT template_type AS "templateType",template_style AS "templateStyle",identity_masked AS "identityMasked" FROM user_settings WHERE user_id=${userId}`;
    return NextResponse.json(rows[0] || { templateType: "", templateStyle: "", identityMasked: "" });
  } catch { return NextResponse.json({ message: "设置读取失败，请重试" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    const body = await request.json();
    const sql = await settingsDb();
    if (body.action === "preferences") {
      if (!["日常记录", "小说", "工作", "设计"].includes(body.templateType) || !["简约", "可爱", "搞怪", "清新"].includes(body.templateStyle)) return NextResponse.json({ message: "请选择模板类型和风格" }, { status: 400 });
      await sql`INSERT INTO user_settings(user_id,template_type,template_style) VALUES(${userId},${body.templateType},${body.templateStyle}) ON CONFLICT(user_id) DO UPDATE SET template_type=EXCLUDED.template_type,template_style=EXCLUDED.template_style,updated_at=NOW()`;
      return NextResponse.json({ saved: true });
    }
    if (body.action === "identity") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const id = typeof body.identity === "string" ? body.identity.trim().toUpperCase() : "";
      const weights = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];
      const checksum = "10X98765432"[[...id.slice(0,17)].reduce((sum,n,i) => sum + Number(n)*weights[i],0)%11];
      const date = `${id.slice(6,10)}-${id.slice(10,12)}-${id.slice(12,14)}`;
      const birthday = new Date(date);
      if (name.length < 2 || name.length > 50 || !/^[1-9]\d{16}[\dX]$/.test(id) || checksum !== id[17] || !Number.isFinite(birthday.getTime()) || birthday.toISOString().slice(0,10) !== date || birthday > new Date()) return NextResponse.json({ message: "请填写有效姓名和身份证号" }, { status: 400 });
      const secret = process.env.AUTH_SECRET;
      if (!secret || secret.length < 32) throw new Error("Missing secret");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm",createHash("sha256").update(`identity:${secret}`).digest(),iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify({name,id}),"utf8"),cipher.final()]);
      const value = [iv,cipher.getAuthTag(),encrypted].map(v=>v.toString("base64")).join(".");
      const masked = id.slice(0,3) + "***********" + id.slice(-4);
      await sql`INSERT INTO user_settings(user_id,identity_encrypted,identity_masked) VALUES(${userId},${value},${masked}) ON CONFLICT(user_id) DO UPDATE SET identity_encrypted=EXCLUDED.identity_encrypted,identity_masked=EXCLUDED.identity_masked,updated_at=NOW()`;
      return NextResponse.json({ identityMasked: masked, message: "已登记，尚未进行身份核验" });
    }
    return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
  } catch { return NextResponse.json({ message: "保存失败，请稍后重试" }, { status: 503 }); }
}
