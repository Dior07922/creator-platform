// name=src/lib/openverseAuth.ts
import { fetchWithTimeout } from "./fetchWithTimeout";

/* 【基线脱敏】原值为硬编码真实 client_id / client_secret（128 字符），
   为避免写入 git 历史已移除。真实值不在本仓库任何提交中。 */
const CLIENT_ID = "REDACTED";
const CLIENT_SECRET = "REDACTED";

const CACHE_KEY = "ranjing.openverseToken";
const REFRESH_BEFORE_MS = 60_000;

type Cached = { token: string; exp: number };

let inflight: Promise<string> | null = null;

export async function getOpenverseToken(): Promise<string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c: Cached = JSON.parse(raw);
      if (c.exp > Date.now() + REFRESH_BEFORE_MS) return c.token;
    }
  } catch { /* ignore */ }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetchWithTimeout(
        "https://api.openverse.org/v1/auth_tokens/token/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
        },
        10000,
      );
      if (!res.ok) throw new Error(`Openverse auth ${res.status}`);
      const data = await res.json();
      const token: string = data.access_token;
      const ttl: number = (data.expires_in || 3600) * 1000;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ token, exp: Date.now() + ttl }));
      } catch { /* ignore */ }
      return token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearOpenverseToken() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
