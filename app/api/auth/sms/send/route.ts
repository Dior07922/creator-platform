import { NextResponse } from "next/server";
import { clientIp, db, ensureAuthTables, hashValue, newCode, sendAliyunSms, validPhone } from "@/server/auth";

export async function POST(request: Request) {
  let stage = "request";
  try {
    const phone = String((await request.json()).phone || "").trim();
    if (!validPhone(phone)) return NextResponse.json({ message: "请输入正确的手机号" }, { status: 400 });

    stage = "database";
    await ensureAuthTables();
    const sql = db();

    stage = "security";
    const ipHash = hashValue(clientIp(request));

    stage = "rate-limit";
    const recent = await sql`SELECT
      COUNT(*) FILTER (WHERE phone=${phone} AND created_at > NOW()-INTERVAL '60 seconds')::int AS minute,
      COUNT(*) FILTER (WHERE phone=${phone} AND created_at > NOW()-INTERVAL '1 hour')::int AS hour,
      COUNT(*) FILTER (WHERE phone=${phone} AND created_at > NOW()-INTERVAL '1 day')::int AS day,
      COUNT(*) FILTER (WHERE ip_hash=${ipHash} AND created_at > NOW()-INTERVAL '1 hour')::int AS ip_hour
      FROM sms_verifications WHERE created_at > NOW()-INTERVAL '1 day'`;
    const limits = recent[0] as { minute:number; hour:number; day:number; ip_hour:number };
    if (limits.minute > 0 || limits.hour >= 5 || limits.day >= 10 || limits.ip_hour >= 20) {
      return NextResponse.json({ message: "操作太频繁，请稍后再试" }, { status: 429 });
    }

    stage = "record";
    const id = crypto.randomUUID();
    const code = newCode();
    const codeHash = hashValue(`${id}:${phone}:${code}`);
    await sql`INSERT INTO sms_verifications(id,phone,code_hash,ip_hash,expires_at) VALUES(${id},${phone},${codeHash},${ipHash},NOW()+INTERVAL '5 minutes')`;

    stage = "sms";
    try {
      await sendAliyunSms(phone, code);
      await sql`UPDATE sms_verifications SET send_status='sent' WHERE id=${id}`;
      return NextResponse.json({ message: "验证码已发送", expiresIn: 300, retryAfter: 60 });
    } catch (error) {
      await sql`UPDATE sms_verifications SET send_status='failed' WHERE id=${id}`;
      console.error("短信发送失败", error instanceof Error ? error.message.replace(/AccessKey[^:]*/gi,"AccessKey") : "未知错误");
      return NextResponse.json({ message: "验证码暂时无法发送，请稍后再试", errorCode: "SMS_SEND_FAILED" }, { status: 502 });
    }
  } catch (error) {
    const errorName = error instanceof Error ? error.message : "UNKNOWN";
    console.error("验证码接口失败", { stage, error: errorName });
    const notConfigured = ["DATABASE_NOT_CONFIGURED", "AUTH_NOT_CONFIGURED"].includes(errorName);
    return NextResponse.json({
      message: notConfigured ? "登录服务尚未配置" : "验证码暂时无法发送，请稍后再试",
      errorCode: notConfigured ? errorName : `SMS_${stage.toUpperCase().replace(/-/g, "_")}_FAILED`,
    }, { status: 503 });
  }
}
