export type SpecItem = { name: string; w: number; h: number };
export type SpecCategory = {
  id: string;
  title: string;
  items: SpecItem[];
  allowCustom?: boolean;
};

export const SPEC_CATEGORIES: SpecCategory[] = [
  {
    id: "phone",
    title: "手机",
    items: [
      { name: "iPhone 12", w: 390, h: 844 },
      { name: "iPhone 13", w: 390, h: 844 },
      { name: "iPhone 14", w: 390, h: 844 },
      { name: "iPhone 15", w: 393, h: 852 },
      { name: "iPhone 16", w: 393, h: 852 },
      { name: "iPhone 17", w: 402, h: 874 },
      { name: "安卓 20:9", w: 360, h: 800 },
      { name: "安卓 19.5:9", w: 360, h: 780 },
      { name: "折叠屏", w: 374, h: 892 },
    ],
    allowCustom: true,
  },
  {
    id: "tablet",
    title: "平板",
    items: [
      { name: "iPad", w: 820, h: 1180 },
      { name: "安卓平板", w: 800, h: 1280 },
      { name: "华为平板", w: 800, h: 1280 },
    ],
    allowCustom: true,
  },
  {
    id: "web",
    title: "网站",
    items: [
      { name: "桌面网页", w: 1440, h: 900 },
      { name: "移动网页", w: 390, h: 844 },
      { name: "1920 × 1080", w: 1920, h: 1080 },
      { name: "1440 × 900", w: 1440, h: 900 },
    ],
    allowCustom: true,
  },
  {
    id: "paper",
    title: "纸张 / 办公",
    items: [
      { name: "A3", w: 1123, h: 1587 },
      { name: "A4", w: 794, h: 1123 },
      { name: "A5", w: 559, h: 794 },
      { name: "A6", w: 397, h: 559 },
      { name: "B5", w: 665, h: 945 },
      { name: "Letter", w: 816, h: 1056 },
    ],
    allowCustom: true,
  },
  {
    id: "social",
    title: "社交媒体",
    items: [
      { name: "朋友圈背景", w: 1080, h: 1920 },
      { name: "小红书封面", w: 1242, h: 1660 },
      { name: "小红书长图", w: 1242, h: 2484 },
      { name: "公众号首图", w: 900, h: 383 },
      { name: "公众号正文配图", w: 1080, h: 1080 },
      { name: "短视频封面", w: 1080, h: 1920 },
    ],
  },
  {
    id: "comic",
    title: "漫画宫格",
    items: [
      { name: "空白宫格", w: 800, h: 1200 },
      { name: "条漫", w: 800, h: 2400 },
      { name: "三格横排", w: 1080, h: 360 },
      { name: "四格竖版", w: 1080, h: 1440 },
      { name: "六格竖版", w: 1080, h: 2160 },
      { name: "九格方", w: 1080, h: 1080 },
    ],
    allowCustom: true,
  },
  {
    id: "novel",
    title: "小说封面",
    items: [
      { name: "起点", w: 600, h: 800 },
      { name: "晋江", w: 200, h: 280 },
      { name: "番茄", w: 800, h: 1067 },
      { name: "通用封面", w: 1000, h: 1400 },
      { name: "精装封面", w: 1400, h: 2100 },
    ],
    allowCustom: true,
  },
  {
    id: "fan",
    title: "应援模板",
    items: [
      { name: "自由画布", w: 0, h: 0 },
    ],
  },
];

/*
 * 画布缩放：按真实尺寸 1:1 显示，放不下才等比缩小。
 *
 * 原实现用统一基准 1400×2400 缩放所有规格（为了让规格之间保持真实比例），
 * 但那个基准是针对「规格对比」的，用在真正要作画的画布上会出事：
 *   iPhone 12 是 390×844，和手机屏幕一样大，
 *   经统一基准换算后 scale=0.2786，纸张只渲染成 109×235 —— 巴掌大。
 *
 * 现在：能 1:1 放下就 1:1（手机选手机规格即铺满屏幕），
 * 太大（如 A3）才等比缩到屏幕 90%。规格之间的真实比例依然成立，
 * 因为比较大小时用的都是真实像素值。
 */
export function specScale(w: number, h: number, stageW: number, stageH: number): number {
  if (w <= 0 || h <= 0) return 1;
  const maxW = stageW * 0.9;
  const maxH = stageH * 0.9;
  /* 上限为 1：不做放大，保证「画布尺寸 = 规格标注尺寸」 */
  return Math.min(1, maxW / w, maxH / h);
}