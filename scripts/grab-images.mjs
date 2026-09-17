import fs from "node:fs/promises";
import path from "node:path";

const OUT = "public/assets/pop";
const URLS_FILE = "urls.txt";

const raw = await fs.readFile(URLS_FILE, "utf8").catch(() => "");
const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

if (!lines.length) {
  console.log("没有 urls.txt 或为空");
  process.exit(0);
}

await fs.mkdir(OUT, { recursive: true });
console.log("共 " + lines.length + " 个页面待抓取\n");

let saved = 0;
for (const pageUrl of lines) {
  console.log("→ " + pageUrl);
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) { console.log("  失败 " + res.status); continue; }
    const html = await res.text();
    const re = /(?:src|data-src|data-original|content)=["'](https?:\/\/[^"']+?\.(?:jpe?g|png|webp))["']/gi;
    const set = new Set();
    let m;
    while ((m = re.exec(html))) set.add(m[1]);
    const slug = new URL(pageUrl).pathname.split("/").filter(Boolean).pop() || "img";
    let i = 0;
    for (const imgUrl of set) {
      try {
        const r = await fetch(imgUrl, { headers: { "User-Agent": "Mozilla/5.0", Referer: pageUrl } });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 5000) continue;
        const ext = (path.extname(new URL(imgUrl).pathname) || ".jpg").toLowerCase();
        const name = slug + "-" + (i++) + ext;
        await fs.writeFile(path.join(OUT, name), buf);
        console.log("  ✓ " + name + " (" + Math.round(buf.length / 1024) + " KB)");
        saved++;
      } catch {}
    }
  } catch (e) { console.log("  异常 " + e.message); }
}
console.log("\n完成，共下载 " + saved + " 张，在 " + OUT);
