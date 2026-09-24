import { readFileSync, writeFileSync, existsSync } from "node:fs";

const logFile = process.argv[2] || "build3.log";
const outFile = logFile + ".check.txt";

if (!existsSync(logFile)) {
  writeFileSync(outFile, `${logFile} 尚未生成`, "utf8");
  process.exit(0);
}

const raw = readFileSync(logFile);
const isUtf16 =
  (raw[0] === 0xff && raw[1] === 0xfe) ||
  (raw[0] === 0xfe && raw[1] === 0xff) ||
  raw[1] === 0;
const txt = isUtf16 ? raw.toString("utf16le") : raw.toString("utf8");

const lines = txt
  .split(/\r?\n/)
  .filter((l) => /loadLocalDoc|Compiled|TypeScript|Failed|Error|error|Route|static|First Load|hydrat/i.test(l));

const head = [`file=${logFile}`, `isUtf16=${isUtf16}`, `bytes=${raw.length}`, "----"];
writeFileSync(outFile, head.concat(lines.slice(-40)).join("\n"), "utf8");
console.log(head.concat(lines.slice(-40)).join("\n"));

