import { rename, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "app", "api");
const API_HOLD = path.join(ROOT, "_api_hold");
const OUT_DIR = path.join(ROOT, "out");
const NEXT_DIR = path.join(ROOT, ".next");

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function cleanupBuild() {
  if (existsSync(NEXT_DIR)) await rm(NEXT_DIR, { recursive: true, force: true });
  if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true, force: true });
}

async function moveApiOut() {
  if (await exists(API_DIR)) {
    if (existsSync(API_HOLD)) await rm(API_HOLD, { recursive: true, force: true });
    await rename(API_DIR, API_HOLD);
    console.log("📦 API 目录已临时移出:", API_HOLD);
  }
}

async function moveApiBack() {
  if (existsSync(API_HOLD)) {
    if (existsSync(API_DIR)) await rm(API_DIR, { recursive: true, force: true });
    await rename(API_HOLD, API_DIR);
    console.log("✅ API 目录已恢复:", API_DIR);
  }
}

(async () => {
  try {
    console.log("=== 1. 清理旧构建 ===");
    await cleanupBuild();

    console.log("=== 2. 移出 API 目录（静态导出不支持 route.ts） ===");
    await moveApiOut();

    console.log("=== 3. Next.js 静态导出构建 ===");
    execSync("npx next build", {
      stdio: "inherit",
      env: { ...process.env, CAPACITOR_BUILD: "1" },
    });

    if (!existsSync(OUT_DIR)) {
      throw new Error("❌ out 目录未生成");
    }
    console.log("✅ out 目录生成成功");
  } finally {
    console.log("=== 4. 恢复 API 目录 ===");
    await moveApiBack();
  }
})();
