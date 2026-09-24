// name=src/lib/assetSources.ts
import { getOpenverseToken, clearOpenverseToken } from "./openverseAuth";
import { fetchWithTimeout } from "./fetchWithTimeout";

export type RemoteAsset = {
  id: string;
  src: string;
  thumb: string;
  w: number;
  h: number;
  name: string;
  author?: string;
  url?: string;
};

/* ========== Pexels ========== */
/* 【基线脱敏】原值为硬编码真实密钥，为避免写入 git 历史已移除。
   真实值不在本仓库任何提交中；如需取回参考 .next/cache/turbopack/。 */
const PEXELS_KEY = "REDACTED";

export async function searchPexels(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}` +
    `&per_page=${perPage}&page=${page}&orientation=all`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  return (data.photos || []).map((p: any) => ({
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

export async function trendingPexels(perPage = 24): Promise<RemoteAsset[]> {
  const url = `https://api.pexels.com/v1/curated?per_page=${perPage}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  return (data.photos || []).map((p: any) => ({
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

/* ========== Unsplash ========== */
/* 【基线脱敏】同上 */
const UNSPLASH_ACCESS_KEY = "REDACTED";

export async function searchUnsplash(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}` +
    `&per_page=${perPage}&page=${page}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((p: any) => ({
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

export async function trendingUnsplash(perPage = 24): Promise<RemoteAsset[]> {
  const url = `https://api.unsplash.com/photos?per_page=${perPage}&order_by=popular`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = await res.json();
  return (data || []).map((p: any) => ({
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

/* ========== Openverse ========== */
function mapOpenverseItem(p: any): RemoteAsset {
  return {
    id: `ov-${p.id}`,
    src: p.url,
    thumb: p.thumbnail || p.url,
    w: p.width || 800,
    h: p.height || 600,
    name: p.title || `openverse-${p.id}`,
    author: p.creator,
    url: p.foreign_landing_url,
  };
}

export async function searchOpenverse(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}` +
    `&page_size=${perPage}&page=${page}`;

  let token = await getOpenverseToken();
  let res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401) {
    clearOpenverseToken();
    token = await getOpenverseToken();
    res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(mapOpenverseItem);
}

export async function trendingOpenverse(perPage = 24): Promise<RemoteAsset[]> {
  return searchOpenverse("aesthetic", perPage, 1);
}

/* ========== Europeana ========== */
/* 【基线脱敏】同上 */
const EUROPEANA_KEY = "REDACTED";

export async function searchEuropeana(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  const url =
    `https://api.europeana.eu/record/v2/search.json` +
    `?wskey=${EUROPEANA_KEY}` +
    `&query=${encodeURIComponent(q)}` +
    `&rows=${perPage}` +
    `&start=${(page - 1) * perPage + 1}` +
    `&media=true` +
    `&thumbnail=true`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Europeana ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .filter((it: any) => it.edmPreview && it.edmPreview[0])
    .map((it: any) => {
      const thumb = it.edmPreview?.[0] || "";
      const full = it.edmIsShownBy?.[0] || thumb;
      return {
        id: `eu-${it.id}`,
        src: full,
        thumb,
        w: it.ebucoreWidth || 800,
        h: it.ebucoreHeight || 600,
        name: Array.isArray(it.title) ? it.title[0] : (it.title || `europeana`),
        author: Array.isArray(it.dcCreator) ? it.dcCreator[0] : it.dcCreator,
        url: it.guid,
      };
    });
}

export async function trendingEuropeana(perPage = 24): Promise<RemoteAsset[]> {
  return searchEuropeana("painting", perPage, 1);
}

/* ========== Wikimedia ========== */
export async function searchWikimedia(q: string, perPage = 24): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=${perPage}` +
    `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400` +
    `&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Wikimedia ${res.status}`);
  const data = await res.json();
  const pages = data.query?.pages || {};
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

export async function trendingWikimedia(perPage = 24): Promise<RemoteAsset[]> {
  return searchWikimedia("painting", perPage);
}

/* ========== iconfont ========== */
const ICONFONT_URL = "https://at.alicdn.com/t/c/font_5235255_dbb8s6tjjw4.js";
let iconfontCache: RemoteAsset[] | null = null;

export async function loadIconfont(): Promise<RemoteAsset[]> {
  if (iconfontCache) return iconfontCache;
  const res = await fetchWithTimeout(ICONFONT_URL);
  if (!res.ok) throw new Error(`Iconfont ${res.status}`);
  const js = await res.text();
  const re = /<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g;
  const list: RemoteAsset[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const id = m[1];
    const viewBox = m[2];
    const inner = m[3];
    const hasColor =
      /fill="#[0-9a-fA-F]{3,8}"/.test(inner) ||
      /fill="rgb/.test(inner) ||
      /fill="url\(/.test(inner);
    const cleaned = hasColor
      ? inner
      : inner.replace(
          /<(path|circle|rect|polygon|polyline|ellipse|line)\b/g,
          '<$1 fill="#3a352e"'
        );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${cleaned}</svg>`;
    const src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    list.push({
      id: `ic-${id}`,
      src,
      thumb: src,
      w: 200,
      h: 200,
      name: id.replace(/^icon-/, ""),
    });
  }
  iconfontCache = list;
  return list;
}
