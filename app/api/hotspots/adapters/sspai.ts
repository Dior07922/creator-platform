import type { AdapterResult, HotItem } from "../types";

export async function fetchSspai(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      "https://sspai.com/api/v1/article/tag/page/get?limit=40&tag=%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://sspai.com/",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return { ok: false, error: `少数派接口 HTTP ${res.status}` };
    const json = (await res.json()) as {
      error?: number;
      data?: {
        list?: Array<{
          title?: string;
          id?: number | string;
          view_count?: number | string;
          like_count?: number | string;
          released_at?: number | string;
        }>;
      };
    };
    if (json.error !== 0 && json.error != null) {
      return { ok: false, error: `少数派 error=${json.error}` };
    }
    const list = json?.data?.list ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, error: "少数派接口返回结构无法识别" };
    }
    const items: HotItem[] = list
      .filter((item) => item.title)
      .slice(0, 30)
      .map((item, idx) => {
        // 少数派真实指标用点赞数（like_count），没有则置 null，禁止用阅读量冒充点赞
        const likeCount =
          item.like_count != null && !isNaN(Number(item.like_count))
            ? Number(item.like_count)
            : null;
        const url = item.id
          ? `https://sspai.com/post/${item.id}`
          : null;
        const releasedAt = item.released_at;
        const publishedAt =
          releasedAt
            ? new Date(Number(releasedAt) * 1000).toISOString()
            : null;
        return {
          id: `sspai-${idx + 1}`,
          source: "sspai",
          sourceLabel: "少数派",
          rank: idx + 1,
          title: String(item.title ?? "").trim(),
          url,
          metricValue: likeCount,
          metricLabel: likeCount != null ? "点赞" : null,
          publishedAt,
          fetchedAt,
        };
      });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `少数派请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
