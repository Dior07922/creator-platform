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
/* 登录名：3-20 位，中文/字母/数字/下划线（第六步手稿：注册用登录名+密码） */
export function validUsername(name: string) { return /^[A-Za-z0-9_一-龥]{3,20}$/.test(name); }
export function validPassword(pwd: string) { return typeof pwd === "string" && pwd.length >= 6 && pwd.length <= 64; }
/* 密码不明文入库：HMAC(secret, 用户名小写:密码)。用户名入盐，同名不同密码不撞哈希。 */
export function passwordDigest(username: string, password: string) {
  return hashValue(`pwd:${username.trim().toLowerCase()}:${password}`);
}
export function newCode() { return String(randomInt(100000, 1000000)); }
export function newToken() { return randomBytes(32).toString("base64url"); }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

/*
 * 建表：每个进程只跑一次。
 *
 * 原先这段 DDL 挂在每个请求的必经路径上，而 /api/membership/* 还会
 * 通过 ensureMembershipTables 再嵌套调用一次 —— 一次请求累计二十多条
 * 建表/改表语句打向 Neon，既拖慢响应又白烧数据库计算时长。
 *
 * 用模块级 Promise 缓存：首个请求触发建表，其余请求直接复用同一个 Promise。
 * 失败时清空缓存，让下一个请求可以重试（否则一次网络抖动会让整个进程
 * 永久认为表不存在）。
 */
let schemaReady: Promise<void> | null = null;

async function createAuthTables() {
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
  /* 第六步：账号+密码注册。老表 phone 原本 NOT NULL（只有短信登录），
     注册手稿里只填登录名/密码/验证码，所以补 username/password_hash 两列，
     并放开 phone 的 NOT NULL —— 短信注册与账号注册两条路并存。 */
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username)) WHERE username IS NOT NULL`;
}

/* 过期数据清理：不需要每请求都做，每个进程每小时最多一次。
   放在建表流程之外，避免把清理的失败也算成「建表失败」。 */
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  try {
    const sql = sqlClient();
    await sql`DELETE FROM sms_verifications WHERE created_at < NOW() - INTERVAL '2 days'`;
    await sql`DELETE FROM user_sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL`;
  } catch (error) {
    /* 清理失败不影响请求本身，下个周期再试 */
    lastCleanupAt = 0;
    console.error("清理过期数据失败:", error instanceof Error ? error.message : error);
  }
}

export function ensureAuthTables(): Promise<void> {
  if (!schemaReady) {
    schemaReady = createAuthTables().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  void cleanupExpired();
  return schemaReady;
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

/*
 * 取真实客户端 IP，用于短信限流。
 *
 * 之前取的是 x-forwarded-for 的【第一个】值 —— 那是客户端可以自己伪造的位置：
 * 攻击者只要带一个 `X-Forwarded-For: 1.2.3.4`，代理会把真实 IP 追加在后面，
 * 取第一个正好取到伪造值，IP 维度限流就完全失效了（可被用来刷短信）。
 *
 * 现在的取值优先级：
 *   1. TRUSTED_IP_HEADER 指定的头（换代理时用环境变量覆盖，无需改代码）
 *   2. x-real-ip —— Vercel / Nginx 由边缘写入，客户端无法伪造
 *   3. x-forwarded-for 的【最后一个】值 —— 由最近一跳可信代理追加，
 *      客户端伪造的值只会排在左边，取最后一个才能拿到可信值
 */
export function clientIp(request: Request) {
  const trustedHeader = process.env.TRUSTED_IP_HEADER?.trim();
  if (trustedHeader) {
    const value = request.headers.get(trustedHeader)?.split(",")[0]?.trim();
    if (value) return value;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const chain = request.headers.get("x-forwarded-for");
  if (chain) {
    const parts = chain.split(",").map((part) => part.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return "unknown";
}
