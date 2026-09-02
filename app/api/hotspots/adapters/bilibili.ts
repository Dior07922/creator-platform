import type { AdapterResult, HotItem } from "../types";

export async function fetchBilibili(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.bilibili.com/",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return { ok: false, error: `哔哩哔哩接口 HTTP ${res.status}` };
    const json = (await res.json()) as {
      code?: number;
      data?: {
        list?: Array<{
          title?: string;
          short_link_v2?: string;
          bvid?: string;
          stat?: { view?: number; like?: number };
          pubdate?: number;
        }>;
      };
    };
    if (json.code !== 0) {
      return { ok: false, error: `哔哩哔哩 code=${json.code}` };
    }
    const list = json?.data?.list ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, error: "哔哩哔哩接口返回结构无法识别" };
    }
    const items: HotItem[] = list
      .filter((item) => item.title)
      .slice(0, 20)
      .map((item, idx) => {
        const view = item.stat?.view;
        const url = item.short_link_v2
          ? String(item.short_link_v2)
          : item.bvid
          ? `https://www.bilibili.com/video/${item.bvid}`
          : null;
        return {
          id: `bilibili-${idx + 1}`,
          source: "bilibili",
          sourceLabel: "哔哩哔哩",
          rank: idx + 1,
          title: String(item.title ?? "").trim(),
          url,
          metricValue: view != null ? Number(view) : null,
          metricLabel: view != null ? "播放" : null,
          publishedAt:
            item.pubdate ? new Date(item.pubdate * 1000).toISOString() : null,
          fetchedAt,
        };
      });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `哔哩哔哩请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
