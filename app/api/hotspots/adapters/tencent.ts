import type { AdapterResult, HotItem } from "../types";

export async function fetchTencent(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      "https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
          Referer: "https://news.qq.com/",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return { ok: false, error: `腾讯接口 HTTP ${res.status}` };
    const json = (await res.json()) as {
      idlist?: Array<{
        newslist?: Array<{ title?: string; url?: string; hotEvent?: { hotScore?: number | string } }>;
      }>;
    };
    const newslist = json?.idlist?.[0]?.newslist ?? [];
    if (!Array.isArray(newslist) || newslist.length === 0) {
      return { ok: false, error: "腾讯接口返回结构无法识别" };
    }
    const items: HotItem[] = newslist
      .filter((item) => item.title)
      .slice(0, 30)
      .map((item, idx) => {
        const hotScore = item.hotEvent?.hotScore;
        return {
          id: `tencent-${idx + 1}`,
          source: "tencent",
          sourceLabel: "腾讯",
          rank: idx + 1,
          title: String(item.title ?? "").trim(),
          url: item.url ? String(item.url).trim() : null,
          metricValue:
            hotScore != null && !isNaN(Number(hotScore))
              ? Number(hotScore)
              : null,
          metricLabel: hotScore != null ? "腾讯热度" : null,
          publishedAt: null,
          fetchedAt,
        };
      });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `腾讯请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
