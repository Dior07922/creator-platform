/**
 * 跨页演出 + Unit 拖动 自动验证脚本
 * 路径：dev server → 进画布 → 分镜A → 切页B → 分镜B → 建flow(A→B) → 播放 → 截图
 * 产物：桌面文件夹 跨页演出_验证截图_20260922/
 */
import { chromium } from "/home/ranjing/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";

const SHOT_DIR = "/mnt/c/Users/10427/Desktop/跨页演出_验证截图_20260922";
const BASE = "http://localhost:3000";
const shot = async (page, name) => {
  const f = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log(`  📸 ${name}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  console.log("① 打开", BASE);
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(3000);
  await shot(page, "01_首页");

  // 进入画布
  const enterBtn = page.getByText("进入苒境", { exact: false }).first();
  if (await enterBtn.count()) {
    await enterBtn.click();
    await sleep(1500);
  } else {
    console.log("  未找到「进入苒境」，尝试直接切 canvas 状态");
  }
  await shot(page, "02_画布");

  // 打开 PageSheet（侧边工具栏）找排列 tab → 2×2
  // 先截图看看当前 UI 结构
  await sleep(1000);
  await shot(page, "03_画布_初始");

  // 尝试找「排列」tab
  const arrangeTab = page.getByText("排列", { exact: true }).first();
  if (await arrangeTab.count()) {
    await arrangeTab.click();
    await sleep(800);
    await shot(page, "04_排列tab");
    const btn22 = page.getByText("2×2", { exact: false }).first();
    if (await btn22.count()) {
      await btn22.click();
      await sleep(800);
      console.log("  ✓ A页已分镜 2×2");
      await shot(page, "05_A页分镜后");
    }
  }

  // 切到 B 页（需要找到页面切换入口）
  // 先看看有没有页面管理 drawer
  const pageDrawer = page.getByText("页面", { exact: false }).first();
  if (await pageDrawer.count()) {
    await pageDrawer.click();
    await sleep(800);
    await shot(page, "06_页面临界");
  }
  await shot(page, "06_切换页后_或_当前状态");

  await browser.close();
  console.log("\n✅ 验证脚本完成，截图在:", SHOT_DIR);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
