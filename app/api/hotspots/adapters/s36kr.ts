import type { AdapterResult, HotItem } from "../types";

export async function fetch36Kr(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
          Referer: "https://36kr.com/",
        },
        body: JSON.stringify({
          partner_id: "wap",
          param: { siteId: 1, platformId: 2 },
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return { ok: false, error: `36氪接口 HTTP ${res.status}` };
    const json = (await res.json()) as {
      code?: number;
      data?: {
        hotRankList?: Array<{
          templateMaterial?: {
            widgetTitle?: string;
            itemId?: string | number;
            statRead?: number | string;
            statCollect?: number | string;
            publishTime?: number | string;
          };
        }>;
      };
    };
    if (json.code !== 0) {
      return { ok: false, error: `36氪 code=${json.code}` };
    }
    const list = json?.data?.hotRankList ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, error: "36氪接口返回结构无法识别" };
    }
    const items: HotItem[] = list
      .filter((item) => item.templateMaterial?.widgetTitle)
      .slice(0, 30)
      .map((item, idx) => {
        const m = item.templateMaterial!;
        const statRead = m.statRead != null ? Number(m.statRead) : null;
        const statCollect = m.statCollect != null ? Number(m.statCollect) : null;
        const itemId = m.itemId;
        const url = itemId
          ? `https://36kr.com/p/${itemId}`
          : null;
        const publishTime = m.publishTime;
        const publishedAt =
          publishTime
            ? new Date(Number(publishTime)).toISOString()
            : null;
        // 优先展示阅读数
        const metricValue = statRead != null && !isNaN(statRead) ? statRead : null;
        const metricLabel = metricValue != null ? "阅读" : null;
        return {
          id: `36kr-${idx + 1}`,
          source: "36kr",
          sourceLabel: "36氪",
          rank: idx + 1,
          title: String(m.widgetTitle ?? "").trim(),
          url,
          metricValue,
          metricLabel,
          publishedAt,
          fetchedAt,
        };
      });
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: `36氪请求失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}
