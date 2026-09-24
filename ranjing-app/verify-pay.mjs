import { writeFileSync } from "node:fs";

const base = "http://localhost:3000";
const out = [];
const j = async (r) => {
  const t = await r.text();
  return t.slice(0, 170);
};

/* 1. 会员状态（未登录应 401 且 loggedIn:false） */
const r1 = await fetch(base + "/api/membership/status", { cache: "no-store" });
out.push(`[GET  /api/membership/status]  ${r1.status}  ${await j(r1)}`);

/* 2. 创建会员订单（未登录应 401「请先登录后再开通会员」） */
const r2 = await fetch(base + "/api/membership/orders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ plan: "monthly" }),
});
out.push(`[POST /api/membership/orders monthly]  ${r2.status}  ${await j(r2)}`);

/* 3. 支付宝收银台（订单不存在应 404） */
const r3 = await fetch(base + "/api/payments/alipay/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ orderId: "NO-SUCH-ORDER" }),
});
out.push(`[POST /api/payments/alipay/create 不存在订单]  ${r3.status}  ${await j(r3)}`);

/* 4. 支付宝状态查询（订单不存在应 404） */
const r4 = await fetch(base + "/api/payments/alipay/status?orderId=NO-SUCH-ORDER", { cache: "no-store" });
out.push(`[GET  /api/payments/alipay/status 不存在订单]  ${r4.status}  ${await j(r4)}`);

/* 5. 首页仍正常 */
const r5 = await fetch(base + "/");
const h5 = await r5.text();
out.push(`[GET  /]  ${r5.status}  首页容器=${h5.includes("ran-welcome-page")}`);

writeFileSync("verify-pay.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
