// name=src/lib/localAssets.ts
import type { RemoteAsset } from "./assetSources";

// 这里手动列出你放进 public/assets 里的图
// 命名：文件名 + 中文名
export const LOCAL_CHINA: RemoteAsset[] = [
  // 例：
  // { id: "cn-1", src: "/assets/china/gugong-01.jpg", thumb: "/assets/china/gugong-01.jpg", w: 1200, h: 800, name: "故宫 · 太和殿" },
  // { id: "cn-2", src: "/assets/china/shu-01.jpg",    thumb: "/assets/china/shu-01.jpg",    w: 800,  h: 1200, name: "书格 · 宋刻本" },
];

export const LOCAL_POP: RemoteAsset[] = [
  // 例：
  // { id: "pop-1", src: "/assets/pop/tv-head-0.jpg", thumb: "/assets/pop/tv-head-0.jpg", w: 800, h: 800, name: "TV Head" },
];