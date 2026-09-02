import type { AdapterResult, HotItem } from "../types";

export async function fetchToutiao(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.toutiao.com/",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return { ok: false, error: `今日头条接口 HTTP ${res.status}` };
    const json = (await res.json()) as {
      data?: Array<{
        Title?: string;
        Url?: string;
        HotValue?: number | string;
        LabelUrl?: string;
      }>;
    };
    const data = json?.data ?? [];
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, error: "今日头条接口返回结构无法识别" };
    }
    const items: HotItem[] = data
      .filter((item) => item.Title)
      .slice(0, 30)
      .map((item, idx) => {
        const hotValue = item.HotValue;
        return {
          id: `toutiao-${idx + 1}`,
          source: "toutiao",
          sourceLabel: "今日头条",
          rank: idx + 1,
          title: String(item.Title ?? "").trim(),
          url: item.Url ? String(item.Url).trim() : null,
          metricValue:
            hotValue != null && !isNaN(Number(hotValue))
              ? Number(hotValue)
              : null,
          metricLabel: hotValue != null ? "头条热度" : null,
          publishedAt: null,
          fetchedAt,
        };
      });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `今日头条请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
