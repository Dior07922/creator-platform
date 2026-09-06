import { cookies } from "next/headers";
import { db, ensureAuthTables, SESSION_COOKIE, tokenHash } from "./auth";

export async function currentUserId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureAuthTables();
  const rows = await db()`SELECT user_id FROM user_sessions WHERE token_hash=${tokenHash(token)} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1`;
  return rows.length ? String(rows[0].user_id) : null;
}

export async function settingsDb() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    template_type TEXT NOT NULL DEFAULT '', template_style TEXT NOT NULL DEFAULT '',
    identity_encrypted TEXT, identity_masked TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}
