import "../src/index.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-serif-4/400.css";
/*
 * 只引需要的两个字重。
 *
 * 包的 style.css 一次性 @import 了 6 个字重：
 *   WenKai  regular / light / bold
 *   WenKaiMono regular / light / bold
 * 而本项目只用到 'LXGW WenKai'（FONT_LIBRARY 里唯一一条），
 * Mono 整个字族没有任何引用。全引会往产物里塞约 28MB 字体文件，
 * 其中约 18.6MB 是死重。这里按需引入，去掉 light 与全部 Mono。
 */
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "lxgw-wenkai-webfont/lxgwwenkai-bold.css";
import type { Metadata, Viewport } from "next";

/*
 * 全站默认 metadata。
 * 之前整个 app/ 下没有任何 metadata 导出 —— 页面没有 <title>，
 * 浏览器标签页显示裸 URL，分享到微信/微博时是一张空白卡片。
 */
export const metadata: Metadata = {
  title: {
    default: "苒境 · 山外，还有山",
    template: "%s · 苒境",
  },
  description:
    "苒境是一款把想法画成镜头的创作工具：分格、组合、连接、演出，一页页把故事排出来。",
  applicationName: "苒境",
  metadataBase: new URL(process.env.APP_BASE_URL?.trim() || "https://helloranjing.com"),
  openGraph: {
    type: "website",
    siteName: "苒境",
    title: "苒境 · 山外，还有山",
    description:
      "把想法画成镜头的创作工具：分格、组合、连接、演出，一页页把故事排出来。",
    locale: "zh_CN",
  },
  robots: {
    /* 创作工具不需要被搜索引擎索引内容页，但站点本身可被发现 */
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
