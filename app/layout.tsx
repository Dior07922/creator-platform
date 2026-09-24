import "../src/index.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-serif-4/400.css";
import "lxgw-wenkai-webfont/style.css";
import type { Viewport } from "next";

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
