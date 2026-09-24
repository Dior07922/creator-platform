import { writeFile } from "node:fs/promises";

const base = "http://localhost:3000";
const out = [];

/* 1. 首页 */
const r1 = await fetch(base + "/");
const h1 = await r1.text();
out.push(`[首页] status=${r1.status} 首页容器=${h1.includes("ran-welcome-page")} 进入按钮=${h1.includes("ran-welcome-enter")} 文案=${h1.includes("山外，还有山。")}`);
out.push(`[首页] 初始HTML含「保存」按钮(期望false)=${h1.includes(">保存</button>")}`);

/* 2. 登录态接口（保存闸门用它判断是否已登录） */
const r2 = await fetch(base + "/api/auth/me", { cache: "no-store" });
const b2 = await r2.text();
out.push(`[/api/auth/me] status=${r2.status} body=${b2.slice(0, 140)}`);

/* 3. 短信接口连通性（用非法手机号，不触发真实发送） */
const r3 = await fetch(base + "/api/auth/sms/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "123" }),
});
const b3 = await r3.text();
out.push(`[/api/auth/sms/send 非法手机号] status=${r3.status} body=${b3.slice(0, 160)}`);

await writeFile(new URL("./verify-auth.txt", import.meta.url), out.join("\n"), "utf8");
console.log(out.join("\n"));
