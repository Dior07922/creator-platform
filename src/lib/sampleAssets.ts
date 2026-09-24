// name=src/lib/sampleAssets.ts

function svgDataURI(inner: string, w = 400, h = 400): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function linearGrad(c1: string, c2: string, w = 400, h = 400) {
  return svgDataURI(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>`, w, h);
}
function radialGrad(c1: string, c2: string, w = 400, h = 400) {
  return svgDataURI(
    `<defs><radialGradient id="g" cx="0.4" cy="0.35" r="0.8">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>`, w, h);
}
function polkaDot(bg: string, dot: string, w = 400, h = 400) {
  let dots = "";
  for (let y = 40; y < h; y += 80) for (let x = 40; x < w; x += 80)
    dots += `<circle cx="${x}" cy="${y}" r="18" fill="${dot}"/>`;
  return svgDataURI(`<rect width="${w}" height="${h}" fill="${bg}"/>${dots}`, w, h);
}
function stripes(c1: string, c2: string, w = 400, h = 400) {
  let s = "";
  for (let i = -h; i < w; i += 50) s += `<rect x="${i}" y="0" width="25" height="${h}" fill="${c2}"/>`;
  return svgDataURI(`<rect width="${w}" height="${h}" fill="${c1}"/>${s}`, w, h);
}
function grid(c1: string, c2: string, w = 400, h = 400) {
  let s = "";
  for (let x = 0; x <= w; x += 40) s += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${c2}" stroke-width="2"/>`;
  for (let y = 0; y <= h; y += 40) s += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${c2}" stroke-width="2"/>`;
  return svgDataURI(`<rect width="${w}" height="${h}" fill="${c1}"/>${s}`, w, h);
}
function circleShape(color: string, w = 400, h = 400) {
  return svgDataURI(`<rect width="${w}" height="${h}" fill="#ffffff"/><circle cx="${w/2}" cy="${h/2}" r="${w*0.35}" fill="${color}"/>`, w, h);
}
function triangleShape(color: string, w = 400, h = 400) {
  return svgDataURI(
    `<rect width="${w}" height="${h}" fill="#ffffff"/>` +
    `<polygon points="${w/2},${h*0.2} ${w*0.85},${h*0.8} ${w*0.15},${h*0.8}" fill="${color}"/>`, w, h);
}
function squareShape(color: string, w = 400, h = 400) {
  return svgDataURI(`<rect width="${w}" height="${h}" fill="#ffffff"/><rect x="${w*0.2}" y="${h*0.2}" width="${w*0.6}" height="${h*0.6}" fill="${color}"/>`, w, h);
}
function solidRect(color: string, w = 400, h = 400) {
  return svgDataURI(`<rect width="${w}" height="${h}" fill="${color}"/>`, w, h);
}

export type Asset = { id: string; src: string; w: number; h: number; name: string };
export type AssetGroup = { id: string; title: string; items: Asset[] };
export type AssetCategory = { id: string; title: string; icon: string; groups: AssetGroup[] };
export type AssetAction = "photo" | "camera" | "note" | "table" | "file" | "link";

const SOLIDS = ["#3a352e", "#d94c4c", "#f39c12", "#f1c40f", "#27ae60", "#16a085", "#3498db", "#2980b9", "#8e44ad", "#9b59b6", "#e91e63", "#ff7043"];

export const ASSET_CATEGORIES: AssetCategory[] = [
  {
    id: "icons", title: "图标", icon: "✦",
    groups: [],
  },
  {
    id: "explore", title: "探索", icon: "🧭",
    groups: [
      {
        id: "explore-illust", title: "插画",
        items: [
          { id: "e1", name: "橙", w: 400, h: 400, src: circleShape("#ff7043") },
          { id: "e2", name: "蓝圆", w: 400, h: 400, src: circleShape("#3498db") },
          { id: "e3", name: "绿三角", w: 400, h: 400, src: triangleShape("#27ae60") },
          { id: "e4", name: "紫方", w: 400, h: 400, src: squareShape("#8e44ad") },
          { id: "e5", name: "红三角", w: 400, h: 400, src: triangleShape("#e74c3c") },
          { id: "e6", name: "黄圆", w: 400, h: 400, src: circleShape("#f1c40f") },
        ],
      },
      {
        id: "explore-bg", title: "热门背景",
        items: [
          { id: "eb1", name: "波纹", w: 600, h: 400, src: radialGrad("#ffffff", "#d6d6d6", 600, 400) },
          { id: "eb2", name: "粉野", w: 600, h: 400, src: polkaDot("#fdeff2", "#f7b8b8", 600, 400) },
          { id: "eb3", name: "海岸", w: 600, h: 400, src: linearGrad("#ffb37b", "#5b7bb5", 600, 400) },
          { id: "eb4", name: "暖棕", w: 600, h: 400, src: radialGrad("#e0c3a7", "#8a5e42", 600, 400) },
        ],
      },
    ],
  },
  {
    id: "photo", title: "图片", icon: "🖼",
    groups: [
      {
        id: "photo-sky", title: "天空",
        items: [
          { id: "p1", name: "晨", w: 600, h: 400, src: linearGrad("#f7b8b8", "#f9d2a5", 600, 400) },
          { id: "p2", name: "暮", w: 600, h: 400, src: linearGrad("#3b6ea5", "#a56d8c", 600, 400) },
          { id: "p3", name: "夜", w: 600, h: 400, src: radialGrad("#33425c", "#0a1424", 600, 400) },
        ],
      },
      {
        id: "photo-scene", title: "场景",
        items: [
          { id: "ps1", name: "野", w: 600, h: 400, src: linearGrad("#a8d5a2", "#6fae7f", 600, 400) },
          { id: "ps2", name: "楼", w: 500, h: 400, src: linearGrad("#e6e9ef", "#9aa5b5", 500, 400) },
          { id: "ps3", name: "巷", w: 500, h: 400, src: linearGrad("#cfd6dd", "#5d6a77", 500, 400) },
        ],
      },
    ],
  },
  {
    id: "material", title: "素材", icon: "◐",
    groups: [
      {
        id: "mat-basic", title: "基础形状",
        items: [
          { id: "mb1", name: "圆", w: 300, h: 300, src: circleShape("#3498db", 300, 300) },
          { id: "mb2", name: "方", w: 300, h: 300, src: squareShape("#27ae60", 300, 300) },
          { id: "mb3", name: "三角", w: 300, h: 300, src: triangleShape("#e74c3c", 300, 300) },
          { id: "mb4", name: "深圆", w: 300, h: 300, src: circleShape("#3a352e", 300, 300) },
        ],
      },
      {
        id: "mat-pattern", title: "图案",
        items: [
          { id: "mp1", name: "点阵", w: 600, h: 400, src: polkaDot("#fdf6e3", "#e0c3a7", 600, 400) },
          { id: "mp2", name: "斜纹", w: 600, h: 400, src: stripes("#fdf6e3", "#e0c3a7", 600, 400) },
          { id: "mp3", name: "网格", w: 600, h: 400, src: grid("#fdf6e3", "#d6c3a5", 600, 400) },
          { id: "mp4", name: "蓝点", w: 600, h: 400, src: polkaDot("#eaf3fb", "#6fa9c7", 600, 400) },
        ],
      },
      {
        id: "mat-solid", title: "纯色",
        items: SOLIDS.slice(0, 8).map((c, i) => ({
          id: `ms${i}`, name: c, w: 300, h: 300, src: solidRect(c, 300, 300),
        })),
      },
    ],
  },
  {
    id: "ref", title: "引用", icon: "🔗",
    groups: [
      {
        id: "ref-bg", title: "渐变",
        items: SOLIDS.slice(0, 4).map((c, i) => ({
          id: `rb${i}`, name: `渐变 ${i+1}`, w: 600, h: 400,
          src: linearGrad(c, SOLIDS[(i + 4) % SOLIDS.length], 600, 400),
        })),
      },
    ],
  },
];

// 每个分类顶部显示的特殊操作卡
export const CATEGORY_ACTIONS: Record<string, { action: AssetAction; label: string; icon: string }[]> = {
  photo: [
    { action: "photo", label: "照片", icon: "🖼" },
    { action: "camera", label: "拍照", icon: "📷" },
  ],
  material: [
    { action: "note", label: "便签", icon: "📝" },
    { action: "table", label: "表格", icon: "▦" },
  ],
  ref: [
    { action: "file", label: "文件", icon: "📄" },
    { action: "link", label: "链接", icon: "🔗" },
  ],
};