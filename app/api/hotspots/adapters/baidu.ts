import type { AdapterResult, HotItem } from "../types";

export async function fetchBaidu(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      "https://top.baidu.com/api/board?platform=wise&tab=realtime",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://top.baidu.com/",
          Accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return { ok: false, error: `百度接口 HTTP ${res.status}` };
    const json = (await res.json()) as {
      data?: {
        cards?: Array<{
          content?: Array<{
            content?: Array<{
              word?: string;
              url?: string;
              rawUrl?: string;
              hotScore?: number | string;
              hotTag?: string;
              index?: number;
            }>;
          }>;
        }>;
      };
    };
    const outerContent = json?.data?.cards?.[0]?.content ?? [];
    const innerContent =
      outerContent[0]?.content ??
      outerContent.flatMap((c) => (Array.isArray(c?.content) ? c.content : []));
    if (!Array.isArray(innerContent) || innerContent.length === 0) {
      return {
        ok: false,
        error: "百度接口返回结构无法识别：缺失 data.cards[0].content[0].content",
      };
    }
    const items: HotItem[] = innerContent
      .filter((item) => item && item.word)
      .slice(0, 30)
      .map((item, idx) => {
        const hotScoreNum =
          item.hotScore != null && !isNaN(Number(item.hotScore))
            ? Number(item.hotScore)
            : null;
        return {
          id: `baidu-${idx + 1}`,
          source: "baidu",
          sourceLabel: "百度",
          rank: idx + 1,
          title: String(item.word ?? "").trim(),
          url: item.rawUrl
            ? String(item.rawUrl).trim()
            : item.url
            ? String(item.url).trim()
            : null,
          metricValue: hotScoreNum,
          metricLabel: hotScoreNum != null ? "热搜指数" : null,
          publishedAt: null,
          fetchedAt,
        };
      });
    if (items.length === 0) {
      return { ok: false, error: "百度接口返回数据缺少 word 字段，无法提取热点标题" };
    }
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `百度请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
