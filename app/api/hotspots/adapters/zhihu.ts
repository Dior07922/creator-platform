import type { AdapterResult, HotItem } from "../types";

export async function fetchZhihu(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const accessSecret = process.env.ZHIHU_ACCESS_SECRET;
    if (!accessSecret) {
      return { ok: false, error: "ZHIHU_ACCESS_SECRET 未配置" };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const res = await fetch(
      "https://developer.zhihu.com/api/v1/content/hot_list?Limit=30",
      {
        headers: {
          Authorization: `Bearer ${accessSecret}`,
          "X-Request-Timestamp": timestamp,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      return { ok: false, error: `知乎接口 HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      Code?: number;
      Message?: string;
      Data?: {
        Total?: number;
        Items?: Array<{
          Title?: string;
          Url?: string;
          Summary?: string;
        }>;
      };
    };
    const data = json?.Data?.Items ?? [];
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, error: "知乎接口返回结构无法识别" };
    }
    const items: HotItem[] = data
      .filter((item) => item.Title)
      .slice(0, 30)
      .map((item, idx) => {
        const rawUrl = item.Url ?? "";
        const url = rawUrl
          ? rawUrl.startsWith("http")
            ? rawUrl
            : `https://www.zhihu.com${rawUrl}`
          : null;
        return {
          id: `zhihu-${idx + 1}`,
          source: "zhihu",
          sourceLabel: "知乎",
          rank: idx + 1,
          title: String(item.Title ?? "").trim(),
          url,
          metricValue: null,
          metricLabel: null,
          publishedAt: null,
          fetchedAt,
        };
      });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `知乎请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
