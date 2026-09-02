export type HotItem = {
  id: string;
  source: string;        // 内部源 key，如 "baidu"
  sourceLabel: string;   // 显示名，如 "百度"
  rank: number;
  title: string;
  url: string | null;    // 没有真实 URL 时为 null，禁止生成假链接
  metricValue: number | null;
  metricLabel: string | null;  // 必须用真实字段含义，禁止统一叫"热度"
  publishedAt: string | null;  // ISO 字符串或 null
  fetchedAt: string;           // ISO 字符串
};

export type AdapterResult =
  | { ok: true; items: HotItem[] }
  | { ok: false; error: string };
