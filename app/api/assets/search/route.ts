import { NextResponse } from "next/server";

/*
 * 图源代理。
 *
 * 原先 Pexels / Unsplash / Openverse / Europeana 的密钥直接写在 src/lib/assetSources.ts 里，
 * 而那个文件被 "use client" 的 AssetBrowser 引用 —— 密钥会随客户端 bundle 公开分发。
 * 现在密钥只存在于服务端环境变量，浏览器只与本路由通信。
 *
 * 顺带解决的问题：
 *   - Capacitor 原生壳里第三方域名的 CORS / cleartext 白名单问题（同源相对路径）
 *   - 边缘缓存一份结果，多个用户共享，减少第三方配额消耗
 */

export const runtime = "nodejs";

type RemoteAsset = {
  id: string;
  src: string;
  thumb: string;
  w: number;
  h: number;
  name: string;
  author?: string;
  url?: string;
};

const SOURCES = ["pexels", "unsplash", "openverse", "europeana", "wikimedia", "iconfont"] as const;
type Source = (typeof SOURCES)[number];

/* 结果缓存头：CDN 缓存 5 分钟，浏览器缓存 1 分钟。
   图源搜索是公开数据，多人共享同一份结果可以显著降低配额消耗。 */
const CACHE_HEADER = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

class NotConfiguredError extends Error {
  constructor(public readonly envName: string) {
    super(`Missing ${envName}`);
  }
}

function optional(name: string) {
  return process.env[name]?.trim() || "";
}

/* ── 第三方调用统一超时，避免图源卡住时把我们的函数也拖死 ── */
async function fetchJson(url: string, init: RequestInit = {}, ms = 12000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`上游返回 ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ── Openverse：client_credentials 换 token，进程内缓存 ──
   token 是有有效期的（默认 12 小时），缓存在模块作用域里，
   同一个 warm lambda 内的后续请求直接复用。 */
let openverseToken: { value: string; exp: number } | null = null;

async function getOpenverseToken(): Promise<string> {
  if (openverseToken && openverseToken.exp > Date.now() + 60_000) return openverseToken.value;

  const id = optional("OPENVERSE_CLIENT_ID");
  const secret = optional("OPENVERSE_CLIENT_SECRET");
  if (!id || !secret) throw new NotConfiguredError("OPENVERSE_CLIENT_ID");

  const data = await fetchJson(
    "https://api.openverse.org/v1/auth_tokens/token/",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
    },
    10000,
  );

  if (!data?.access_token) throw new Error("Openverse 未返回 token");
  openverseToken = {
    value: String(data.access_token),
    exp: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return openverseToken.value;
}

/* ── Pexels ── */
function pexelsKey() {
  const key = optional("PEXELS_API_KEY");
  if (!key) throw new NotConfiguredError("PEXELS_API_KEY");
  return key;
}

function mapPexels(data: any): RemoteAsset[] {
  return (data?.photos || []).map((p: any) => ({
    id: `px-${p.id}`,
    src: p.src?.large2x || p.src?.large || p.src?.original,
    thumb: p.src?.medium || p.src?.small,
    w: p.width,
    h: p.height,
    name: p.alt || `pexels-${p.id}`,
    author: p.photographer,
    url: p.url,
  }));
}

/* ── Unsplash ── */
function unsplashHeaders() {
  const key = optional("UNSPLASH_ACCESS_KEY");
  if (!key) throw new NotConfiguredError("UNSPLASH_ACCESS_KEY");
  return { Authorization: `Client-ID ${key}` };
}

function mapUnsplash(list: any[]): RemoteAsset[] {
  return (list || []).map((p: any) => ({
    id: `un-${p.id}`,
    src: p.urls?.full || p.urls?.regular,
    thumb: p.urls?.small || p.urls?.thumb,
    w: p.width,
    h: p.height,
    name: p.alt_description || p.description || `unsplash-${p.id}`,
    author: p.user?.name,
    url: p.links?.html,
  }));
}

/* ── Europeana ── */
function mapEuropeana(data: any): RemoteAsset[] {
  return (data?.items || [])
    .filter((it: any) => it.edmPreview && it.edmPreview[0])
    .map((it: any) => {
      const thumb = it.edmPreview?.[0] || "";
      return {
        id: `eu-${it.id}`,
        src: it.edmIsShownBy?.[0] || thumb,
        thumb,
        w: it.ebucoreWidth || 800,
        h: it.ebucoreHeight || 600,
        name: Array.isArray(it.title) ? it.title[0] : (it.title || "europeana"),
        author: Array.isArray(it.dcCreator) ? it.dcCreator[0] : it.dcCreator,
        url: it.guid,
      };
    });
}

/* ── Wikimedia（无需密钥） ── */
async function wikimedia(q: string, perPage: number): Promise<RemoteAsset[]> {
  const data = await fetchJson(
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
      `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=${perPage}` +
      "&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400&format=json",
  );
  const pages = data?.query?.pages || {};
  return Object.values(pages)
    .map((p: any) => {
      const info = p.imageinfo?.[0] || {};
      return {
        id: `wm-${p.pageid}`,
        src: info.url,
        thumb: info.thumburl || info.url,
        w: info.width || 800,
        h: info.height || 600,
        name: (p.title || "").replace(/^File:/, ""),
        author: (info.extmetadata?.Artist?.value || "").replace(/<[^>]+>/g, "").trim() || undefined,
        url: info.descriptionurl,
      };
    })
    .filter((x: any) => !!x.src) as RemoteAsset[];
}

/* ── iconfont：CDN 上的 JS 里内嵌 SVG symbol，抓下来解析成可用的图 ── */
const ICONFONT_URL = "https://at.alicdn.com/t/c/font_5235255_dbb8s6tjjw4.js";
let iconfontCache: RemoteAsset[] | null = null;

async function loadIconfont(): Promise<RemoteAsset[]> {
  if (iconfontCache) return iconfontCache;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let js: string;
  try {
    const res = await fetch(ICONFONT_URL, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`上游返回 ${res.status}`);
    js = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const re = /<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g;
  const list: RemoteAsset[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const [, id, viewBox, inner] = m;
    const hasColor = /fill="#[0-9a-fA-F]{3,8}"/.test(inner) || /fill="rgb/.test(inner) || /fill="url\(/.test(inner);
    const cleaned = hasColor
      ? inner
      : inner.replace(/<(path|circle|rect|polygon|polyline|ellipse|line)\b/g, '<$1 fill="#3a352e"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${cleaned}</svg>`;
    const src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    list.push({ id: `ic-${id}`, src, thumb: src, w: 200, h: 200, name: id.replace(/^icon-/, "") });
  }

  iconfontCache = list;
  return list;
}

/* ── 各图源统一入口 ── */
async function run(source: Source, q: string, perPage: number, page: number, trending: boolean): Promise<RemoteAsset[]> {
  switch (source) {
    case "pexels": {
      const key = pexelsKey();
      const url = trending
        ? `https://api.pexels.com/v1/curated?per_page=${perPage}&page=${page}`
        : `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&orientation=all`;
      return mapPexels(await fetchJson(url, { headers: { Authorization: key } }));
    }

    case "unsplash": {
      const headers = unsplashHeaders();
      const url = trending
        ? `https://api.unsplash.com/photos?per_page=${perPage}&page=${page}&order_by=popular`
        : `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;
      const data = await fetchJson(url, { headers });
      return mapUnsplash(trending ? data : data?.results);
    }

    case "openverse": {
      const token = await getOpenverseToken();
      const query = trending ? "aesthetic" : q;
      const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${perPage}&page=${page}`;
      const data = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
      return (data?.results || []).map((p: any) => ({
        id: `ov-${p.id}`,
        src: p.url,
        thumb: p.thumbnail || p.url,
        w: p.width || 800,
        h: p.height || 600,
        name: p.title || `openverse-${p.id}`,
        author: p.creator,
        url: p.foreign_landing_url,
      }));
    }

    case "europeana": {
      const key = optional("EUROPEANA_API_KEY");
      if (!key) throw new NotConfiguredError("EUROPEANA_API_KEY");
      const query = trending ? "painting" : q;
      const data = await fetchJson(
        "https://api.europeana.eu/record/v2/search.json" +
          `?wskey=${encodeURIComponent(key)}` +
          `&query=${encodeURIComponent(query)}` +
          `&rows=${perPage}&start=${(page - 1) * perPage + 1}` +
          "&media=true&thumbnail=true",
      );
      return mapEuropeana(data);
    }

    case "wikimedia":
      return wikimedia(trending ? "painting" : q, perPage);

    case "iconfont":
      return loadIconfont();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const source = String(searchParams.get("source") || "") as Source;
  if (!SOURCES.includes(source)) {
    return NextResponse.json({ message: "不支持的图源" }, { status: 400 });
  }

  /* 入参收敛：这是个公开代理，不能让它变成任人调用的放大器 */
  const q = String(searchParams.get("q") || "").trim().slice(0, 120);
  const trending = searchParams.get("trending") === "1";
  const perPage = Math.min(50, Math.max(1, Number(searchParams.get("perPage")) || 24));
  const page = Math.min(100, Math.max(1, Number(searchParams.get("page")) || 1));

  /* 搜索模式必须有词；trending 与 iconfont 不需要 */
  if (!trending && source !== "iconfont" && !q) {
    return NextResponse.json({ assets: [] }, { headers: { "Cache-Control": CACHE_HEADER } });
  }

  try {
    const assets = await run(source, q, perPage, page, trending);
    return NextResponse.json({ assets }, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    if (error instanceof NotConfiguredError) {
      /* 只告诉前端「这个图源没配」，不回显环境变量名以外的任何内部信息 */
      console.error(`图源未配置: ${source}`, error.envName);
      return NextResponse.json(
        { message: "该图源暂未开放", code: "SOURCE_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const aborted = error instanceof Error && error.name === "AbortError";
    console.error(`图源请求失败: ${source}`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { message: aborted ? "图源响应超时，请重试" : "图源暂时不可用，请稍后再试" },
      { status: 502 },
    );
  }
}
