// name=src/lib/apiBase.ts

/**
 * API 基址自动切换。
 *
 * - 本地调试（localhost / 127.0.0.1 / 局域网 IP）→ 空串，走相对路径 `/api/xxx`
 *   （同源，不跨域，不需要 CORS 放行，也不需要 Android cleartext 白名单）
 * - 其它环境（helloranjing.com 及其它任何域名）→ 完整生产域名
 *
 * 这样同一份代码本地和线上都能跑，不用改代码。
 */
export const API_BASE =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    /^192\.168\.\d+\.\d+$/.test(window.location.hostname))
    ? ""
    : "https://helloranjing.com";
