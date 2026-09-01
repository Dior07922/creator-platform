import { NextRequest, NextResponse } from "next/server";

type TianHotItem = {
  title?: string;
  keyword?: string;
  word?: string;
  hotword?: string;
  digest?: string;
  brief?: string;
  hotnum?: number | string;
  index?: number | string;
  hot?: number | string;
  hotindex?: number | string;
  hotwordnum?: number | string;
  source?: string;
  platform?: string;
  url?: string;
  link?: string;
};

const HOT_SOURCES = {
  "全部": { endpoint: "networkhot", label: "全网" },
  "微博": { endpoint: "weibohot", label: "微博" },
  "头条": { endpoint: "toutiaohot", label: "头条" },
  "百度": { endpoint: "nethot", label: "百度" },
  "抖音": { endpoint: "douyinhot", label: "抖音" },
} as const;

export const revalidate = 600;

function firstArray(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || value == null) return [];
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  if (typeof value !== "object") return [];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = firstArray(child, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function nestedText(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const path = key.split(".");
    let value: unknown = item;
    for (const part of path) {
      if (!value || typeof value !== "object") { value = undefined; break; }
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value === "string" || typeof value === "number") {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return "";
}

function platformSearchUrl(source: string, title: string) {
  const query = encodeURIComponent(title);
  switch (source) {
    case "微博":
      return `https://s.weibo.com/weibo?q=${query}`;
    case "头条":
      return `https://so.toutiao.com/search?keyword=${query}`;
    case "抖音":
      return `https://www.douyin.com/search/${query}`;
    case "百度":
      return `https://www.baidu.com/s?tn=news&word=${query}`;
    default:
      return `https://www.baidu.com/s?tn=news&word=${query}`;
  }
}

export async function GET(request: NextRequest) {
  const requestedSource = request.nextUrl.searchParams.get("source") || "全部";

  if (requestedSource === "GitHub") {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await fetch(
        `https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&order=desc&per_page=20`,
        {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "skill-market-app" },
          next: { revalidate: 600 },
        },
      );
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.items)) {
        return NextResponse.json({ message: "GitHub 热门项目暂时无法获取" }, { status: 502 });
      }
      const items = payload.items.map((repo: Record<string, unknown>, index: number) => ({
        id: `GitHub-${index + 1}`,
        title: String(repo.full_name ?? repo.name ?? "GitHub 项目"),
        source: "GitHub",
        summary: String(repo.description ?? "近期受到开发者关注的开源项目。"),
        hotnum: Number(repo.stargazers_count ?? 0),
        url: String(repo.html_url ?? "https://github.com/trending"),
        directions: ["开源学习", "工具发现", "项目实践"],
      }));
      return NextResponse.json({ items, source: "GitHub", updatedAt: new Date().toISOString() });
    } catch {
      return NextResponse.json({ message: "GitHub 热门项目暂时无法获取" }, { status: 502 });
    }
  }

  if (requestedSource === "知乎") {
    const secret = process.env.ZHIHU_ACCESS_SECRET;
    if (!secret) return NextResponse.json({ message: "知乎接口尚未配置" }, { status: 503 });
    try {
      const response = await fetch("https://developer.zhihu.com/api/v1/content/hot_list", {
        headers: {
          Authorization: `Bearer ${secret}`,
          "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
          "Content-Type": "application/json",
        },
        next: { revalidate: 600 },
      });
      const payload = await response.json();
      if (!response.ok) {
        return NextResponse.json({ message: payload?.message || payload?.msg || "知乎热榜请求失败" }, { status: 502 });
      }
      const responseData = payload?.Data ?? payload?.data ?? payload;
      const rawItems = responseData?.Items ?? responseData?.items ?? responseData;
      let parsedItems: unknown = rawItems;
      if (typeof rawItems === "string") {
        try { parsedItems = JSON.parse(rawItems); } catch { parsedItems = []; }
      }
      const candidates = (
        Array.isArray(parsedItems)
          ? parsedItems.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          : firstArray(parsedItems).length
            ? firstArray(parsedItems)
            : parsedItems && typeof parsedItems === "object"
              ? Object.values(parsedItems).filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
              : []
      ).slice(0, 20);
      const items = candidates.map((item, index) => {
        const title = nestedText(item, ["title", "Title", "question.title", "target.title", "name", "Name"]);
        return {
          id: `知乎-${index + 1}`,
          title,
          source: "知乎",
          summary: nestedText(item, ["excerpt", "Excerpt", "description", "Description", "question.excerpt", "target.excerpt"]) || "知乎当前热门讨论，点击进入知乎查看完整内容。",
          hotnum: Number(nestedText(item, ["hot_value", "HotValue", "hot", "Hot", "metrics.hot", "answer_count"]) || 0),
          url: nestedText(item, ["url", "Url", "link", "Link", "question.url", "target.url"]) || `https://www.zhihu.com/search?q=${encodeURIComponent(title)}`,
          directions: ["专业讨论", "经验分享", "知识创作"],
        };
      }).filter((item) => item.title);
      if (!items.length) {
        const topKeys = payload && typeof payload === "object" ? Object.keys(payload) : [];
        const dataKeys = responseData && typeof responseData === "object" ? Object.keys(responseData) : [];
        return NextResponse.json({
          message: payload?.Message || payload?.message || "知乎接口已连接，但暂未识别到热榜数据",
          structure: { topKeys, dataKeys, dataType: Array.isArray(responseData) ? "array" : typeof responseData, code: payload?.Code },
        }, { status: 502 });
      }
      return NextResponse.json({ items, source: "知乎", updatedAt: new Date().toISOString() });
    } catch {
      return NextResponse.json({ message: "知乎热榜暂时无法获取" }, { status: 502 });
    }
  }

  const key = process.env.TIANAPI_KEY;
  if (!key) {
    return NextResponse.json({ message: "热点接口尚未配置" }, { status: 503 });
  }

  const sourceConfig = HOT_SOURCES[requestedSource as keyof typeof HOT_SOURCES];
  if (!sourceConfig) {
    return NextResponse.json({ message: `${requestedSource}暂未接入合规的独立热榜接口` }, { status: 422 });
  }

  try {
    const response = await fetch(`https://apis.tianapi.com/${sourceConfig.endpoint}/index?key=${encodeURIComponent(key)}&client=skill-market-v2`, {
      next: { revalidate: 600 },
    });
    const payload = await response.json();

    if (!response.ok || payload?.code !== 200) {
      return NextResponse.json({ message: payload?.msg || "热点接口请求失败" }, { status: 502 });
    }

    const candidates = payload?.result?.list ?? payload?.result?.newslist ?? payload?.newslist ?? [];
    const items = (Array.isArray(candidates) ? candidates : [])
      .slice(0, 20)
      .map((item: TianHotItem, index: number) => {
        const title = String(item.title ?? item.keyword ?? item.word ?? item.hotword ?? "").trim();
        const rawSummary = String(item.digest ?? item.brief ?? "").trim();
        const summary = rawSummary && rawSummary !== "..." && rawSummary !== "…"
          ? rawSummary
          : `“${title}”正在成为当前网络关注话题。你可以围绕事件背景、信息来源和不同观点继续了解；在事实尚未核实完整前，请不要把热搜标题直接当作最终结论。`;
        return {
          id: `${requestedSource}-${index + 1}`,
          title,
          source: sourceConfig.label,
          summary,
          hotnum: Number(item.hotnum ?? item.index ?? item.hot ?? item.hotindex ?? item.hotwordnum ?? 0),
          url: String(item.url ?? item.link ?? platformSearchUrl(requestedSource, title)).trim(),
          directions: ["背景梳理", "观点分析", "内容创作"],
        };
      })
      .filter((item: { title: string }) => item.title);

    return NextResponse.json({ items, source: requestedSource, updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ message: "暂时无法获取实时热点" }, { status: 502 });
  }
}
