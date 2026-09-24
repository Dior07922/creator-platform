// name=src/lib/assetSources.ts
import { API_BASE } from "./apiBase";
import { fetchWithTimeout } from "./fetchWithTimeout";

/*
 * 图源统一走服务端代理 /api/assets/search。
 *
 * 这里以前直接带着密钥请求 Pexels / Unsplash / Europeana / Openverse，
 * 而本文件会被打进客户端 bundle —— 密钥等于公开。现在密钥只在服务端。
 * 对外导出的函数签名保持不变，调用方（AssetBrowser）无需改动。
 */

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

type SourceId = "pexels" | "unsplash" | "openverse" | "europeana" | "wikimedia" | "iconfont";

async function request(
  source: SourceId,
  params: { q?: string; perPage?: number; page?: number; trending?: boolean },
): Promise<RemoteAsset[]> {
  const search = new URLSearchParams({ source });
  if (params.q) search.set("q", params.q);
  if (params.perPage) search.set("perPage", String(params.perPage));
  if (params.page) search.set("page", String(params.page));
  if (params.trending) search.set("trending", "1");

  const res = await fetchWithTimeout(
    `${API_BASE}/api/assets/search?${search.toString()}`,
    { cache: "no-store" },
    20000,
  );

  if (!res.ok) {
    /* 服务端已经把人话文案放在 message 里了；拿不到才退回状态码 */
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `图源请求失败 ${res.status}`);
  }

  const data = await res.json();
  return (data?.assets || []) as RemoteAsset[];
}

/* ========== Pexels ========== */
export async function searchPexels(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  return request("pexels", { q, perPage, page });
}

export async function trendingPexels(perPage = 24): Promise<RemoteAsset[]> {
  return request("pexels", { perPage, trending: true });
}

/* ========== Unsplash ========== */
export async function searchUnsplash(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  return request("unsplash", { q, perPage, page });
}

export async function trendingUnsplash(perPage = 24): Promise<RemoteAsset[]> {
  return request("unsplash", { perPage, trending: true });
}

/* ========== Openverse ========== */
export async function searchOpenverse(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  return request("openverse", { q, perPage, page });
}

export async function trendingOpenverse(perPage = 24): Promise<RemoteAsset[]> {
  return request("openverse", { perPage, trending: true });
}

/* ========== Europeana ========== */
export async function searchEuropeana(q: string, perPage = 24, page = 1): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  return request("europeana", { q, perPage, page });
}

export async function trendingEuropeana(perPage = 24): Promise<RemoteAsset[]> {
  return request("europeana", { perPage, trending: true });
}

/* ========== Wikimedia（本来就不需要密钥）========== */
export async function searchWikimedia(q: string, perPage = 24): Promise<RemoteAsset[]> {
  if (!q.trim()) return [];
  return request("wikimedia", { q, perPage });
}

export async function trendingWikimedia(perPage = 24): Promise<RemoteAsset[]> {
  return request("wikimedia", { perPage, trending: true });
}

/* ========== iconfont ========== */
export async function loadIconfont(): Promise<RemoteAsset[]> {
  return request("iconfont", {});
}
