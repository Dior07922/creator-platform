import { readFileSync } from "node:fs";

/* 记录请求前的日志行数 */
const beforeLines = readFileSync("dev.log", "utf8").split("\n").length;

const res = await fetch("http://localhost:3000");
const html = await res.text();

/* 等 Next 把本次 SSR 的日志写出来 */
await new Promise((r) => setTimeout(r, 4000));

const afterLines = readFileSync("dev.log", "utf8").split("\n");
const added = afterLines.slice(beforeLines);

const out = [
  `status=${res.status}`,
  `HTML字节=${html.length}`,
  `本次请求新增日志行数=${added.length}`,
  `新增日志里含 loadLocalDoc error = ${added.join("\n").includes("loadLocalDoc error")}`,
  "---- 新增日志 ----",
  added.join("\n").slice(0, 1200) || "(无)",
];

const { writeFileSync } = await import("node:fs");
writeFileSync("verify-ssr.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
