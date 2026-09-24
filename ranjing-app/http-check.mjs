import { writeFile } from "node:fs/promises";

const res = await fetch("http://localhost:3000");
const html = await res.text();

const keys = [
  "规格",
  "笔",
  "色",
  "字",
  "页",
  "🔒",
  'aria-label="门"',
  "#C9A87C",
];

const lines = [
  `status=${res.status}`,
  `htmlLength=${html.length}`,
  `文字按键(cd-side-entry)=${(html.match(/cd-side-entry/g) || []).length}`,
  `门按钮(aria-label="门")=${(html.match(/aria-label="门"/g) || []).length}`,
  `工具栏容器cd-side-entries=${(html.match(/cd-side-entries/g) || []).length}`,
];
for (const k of keys) lines.push((html.includes(k) ? "HIT  " : "MISS ") + k);
await writeFile(new URL("./http-check.txt", import.meta.url), lines.join("\n"), "utf8");
console.log(lines.join("\n"));
