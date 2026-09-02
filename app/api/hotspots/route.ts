import { NextRequest, NextResponse } from "next/server";
import type { HotItem, AdapterResult } from "./types";
import { fetchBaidu } from "./adapters/baidu";
import { fetchTencent } from "./adapters/tencent";
import { fetchBilibili } from "./adapters/bilibili";
import { fetchZhihu } from "./adapters/zhihu";
import { fetchToutiao } from "./adapters/toutiao";
import { fetch36Kr } from "./adapters/s36kr";
import { fetchSspai } from "./adapters/sspai";

// ─── 来源配置 ─────────────────────────────────────────────────────────────────

const ADAPTERS: Record<string, { label: string; fetch: () => Promise<AdapterResult> }> = {
  baidu:    { label: "百度",     fetch: fetchBaidu },
  tencent:  { label: "腾讯",     fetch: fetchTencent },
  toutiao:  { label: "今日头条", fetch: fetchToutiao },
  zhihu:    { label: "知乎",     fetch: fetchZhihu },
  bilibili: { label: "哔哩哔哩", fetch: fetchBilibili },
  "36kr":   { label: "36氪",    fetch: fetch36Kr },
  sspai:    { label: "少数派",   fetch: fetchSspai },
};

const SOURCE_KEYS = Object.keys(ADAPTERS);

// ─── 内存缓存（TTL 2 分钟）────────────────────────────────────────────────────

type CacheEntry = { data: AdapterResult; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000;

async function getCachedAdapter(key: string): Promise<AdapterResult> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expires > now) return entry.data;
  const result = await ADAPTERS[key].fetch();
  cache.set(key, { data: result, expires: now + CACHE_TTL_MS });
  return result;
}

// ─── 轮换聚合（"全部"）────────────────────────────────────────────────────────

function roundRobinMerge(allItems: HotItem[][]): HotItem[] {
  const merged: HotItem[] = [];
  const maxLen = Math.max(...allItems.map((list) => list.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of allItems) {
      if (list[i]) merged.push(list[i]);
    }
  }
  return merged;
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const requestedSource = request.nextUrl.searchParams.get("source") || "全部";
  const updatedAt = new Date().toISOString();

  // 单平台请求
  if (requestedSource !== "全部") {
    // 找到匹配的 source key（按 label 或 key 匹配）
    const key =
      SOURCE_KEYS.find((k) => ADAPTERS[k].label === requestedSource) ??
      SOURCE_KEYS.find((k) => k === requestedSource);
    if (!key) {
      return NextResponse.json(
        { message: `"${requestedSource}"暂未接入，请从来源栏选择已支持的来源` },
        { status: 422 }
      );
    }
    const result = await getCachedAdapter(key);
    if (!result.ok) {
      return NextResponse.json({ message: result.error }, { status: 502 });
    }
    return NextResponse.json({ items: result.items, source: requestedSource, updatedAt });
  }

  // "全部"：并发拉取所有来源，失败不阻断其余
  const settled = await Promise.allSettled(
    SOURCE_KEYS.map((key) => getCachedAdapter(key))
  );

  const successLists: HotItem[][] = [];
  const failures: string[] = [];

  settled.forEach((outcome, idx) => {
    const key = SOURCE_KEYS[idx];
    if (outcome.status === "fulfilled") {
      const result = outcome.value;
      if (result.ok) {
        successLists.push(result.items);
      } else {
        failures.push(`${ADAPTERS[key].label}: ${result.error}`);
      }
    } else {
      failures.push(`${ADAPTERS[key].label}: ${String(outcome.reason)}`);
    }
  });

  const items = roundRobinMerge(successLists);

  if (items.length === 0) {
    return NextResponse.json(
      {
        message: "当前所有热点来源暂时无法访问，请稍后刷新重试",
        failures,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ items, source: "全部", updatedAt, failures });
}
