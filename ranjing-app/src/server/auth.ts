import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const SESSION_COOKIE = "ranjing_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(url);
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  return value;
}

export function hashValue(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function validPhone(phone: string) { return /^1[3-9]\d{9}$/.test(phone); }
export function newCode() { return String(randomInt(100000, 1000000)); }
export function newToken() { return randomBytes(32).toString("base64url"); }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function ensureAuthTables() {
  const sql = sqlClient();
  await sql`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, phone TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '',
    default_delivery_email TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sms_verifications (
    id UUID PRIMARY KEY, phone TEXT NOT NULL, code_hash TEXT NOT NULL, ip_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, attempt_count INTEGER NOT NULL DEFAULT 0,
    send_status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS sms_phone_created_idx ON sms_verifications(phone, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS sms_ip_created_idx ON sms_verifications(ip_hash, created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON user_sessions(user_id)`;
  await sql`DELETE FROM sms_verifications WHERE created_at < NOW() - INTERVAL '2 days'`;
  await sql`DELETE FROM user_sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL`;
}

export function db() { return sqlClient(); }

function percent(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function sendAliyunSms(phone: string, code: string) {
  const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  const signName = process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE || "SMS_512275103";
  if (!accessKeyId || !accessKeySecret || !signName) throw new Error("SMS_NOT_CONFIGURED");
  const params: Record<string, string> = {
    AccessKeyId: accessKeyId, Action: "SendSms", Format: "JSON", PhoneNumbers: phone,
    SignatureMethod: "HMAC-SHA1", SignatureNonce: crypto.randomUUID(), SignatureVersion: "1.0",
    SignName: signName, TemplateCode: templateCode, TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), Version: "2017-05-25",
  };
  const canonical = Object.keys(params).sort().map((key) => `${percent(key)}=${percent(params[key])}`).join("&");
  const stringToSign = `POST&%2F&${percent(canonical)}`;
  params.Signature = createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
  const body = Object.keys(params).sort().map((key) => `${percent(key)}=${percent(params[key])}`).join("&");
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://dysmsapi.aliyuncs.com/", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body, cache: "no-store",
      });
      const result = await response.json() as { Code?: string; Message?: string; RequestId?: string };
      if (!response.ok || result.Code !== "OK") throw new Error(`ALIYUN_SMS_FAILED:${result.Code || response.status}:${result.Message || "发送失败"}`);
      return { requestId: result.RequestId || "" };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError!;
}

export function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}
