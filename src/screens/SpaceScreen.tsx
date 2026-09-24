"use client";

/* 极简空间页：点左下角「门」→ 开门动画 → 到这里。
   会员专属 · 专属 3D 记忆空间：月 ¥39.9 / 年 ¥198，支付宝购买。 */
import { useEffect, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE } from "../lib/apiBase";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

type PlanKey = "monthly" | "yearly";

type MembershipStatus = {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  loggedIn: boolean;
};

/* 加载态必须与「读取失败」分开：
   之前失败时把 status 置成 null，而 null 被渲染成「正在读取…」，
   于是网络一抖页面就永远停在加载中，没有任何错误提示和重试入口。 */
type LoadState = "loading" | "ready" | "error";

const PLANS: { key: PlanKey; label: string; price: string; sub: string }[] = [
  { key: "monthly", label: "月度会员", price: "¥39.9", sub: "按月使用，随时续订" },
  { key: "yearly",  label: "年度会员", price: "¥198",  sub: "全年使用，更适合长期创作" },
];

export default function SpaceScreen({ onBack, onNeedLogin }: { onBack: () => void; onNeedLogin: () => void }) {
  const [plan, setPlan] = useState<PlanKey | null>(null);
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    setLoadState("loading");
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/membership/status`, { cache: "no-store" }, 15000);

      /* 401 是「未登录」这个正常业务态，不是错误 */
      if (res.status === 401) {
        setStatus({ active: false, plan: null, expiresAt: null, loggedIn: false });
        setLoadState("ready");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setStatus({
        active: !!data.active,
        plan: data.plan ?? null,
        expiresAt: data.expiresAt ?? null,
        loggedIn: !!data.loggedIn,
      });
      setLoadState("ready");
    } catch {
      setStatus(null);
      setLoadState("error");
    }
  }

  async function buy() {
    if (!plan) return;
    /* 状态没读出来时不能贸然跳登录页 —— 那会把网络故障误报成未登录 */
    if (loadState === "error") { setMessage("会员状态未能读取，请先重试"); return; }
    if (!status?.loggedIn) { onNeedLogin(); return; }
    setLoading(true); setMessage("");
    try {
      const orderRes = await CapacitorHttp.post({
        url: `${API_BASE}/api/membership/orders`,
        headers: { "Content-Type": "application/json" },
        data: { plan },
      });
      const orderData = orderRes.data;
      if (orderRes.status < 200 || orderRes.status >= 300) { setMessage(orderData?.message || "创建订单失败"); return; }

      const payRes = await CapacitorHttp.post({
        url: `${API_BASE}/api/payments/alipay/create`,
        headers: { "Content-Type": "application/json" },
        data: { orderId: orderData.order.id },
      });
      const payData = payRes.data;
      if (payRes.status < 200 || payRes.status >= 300) { setMessage(payData?.message || "支付通道暂时不可用"); return; }

      if (payData.paymentUrl) {
        try { localStorage.setItem("ranjing.currentOrderId", orderData.order.id); } catch { /* ignore */ }
        window.open(payData.paymentUrl, "_blank");
        setMessage("支付订单已创建");
      }
    } catch { setMessage("支付请求失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }

  const planLabel = status?.plan === "yearly" ? "年度会员" : status?.plan === "monthly" ? "月度会员" : "";
  const expires = status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString("zh-CN") : "";

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20, background: "#fbfaf7",
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "'LXGW WenKai', 'Noto Serif SC', serif",
    }}>
      <header style={{
        flex: "none", display: "flex", alignItems: "center", gap: 12,
        padding: "calc(env(safe-area-inset-top) + 14px) 16px 10px",
        borderBottom: "1px solid rgba(74,70,63,.06)",
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="返回画布"
          style={{
            width: 36, height: 36, border: 0, borderRadius: 10, background: "rgba(74,70,63,.05)",
            color: "#57524c", fontSize: 20, lineHeight: 1, cursor: "pointer",
          }}
        >‹</button>
        <strong style={{ fontSize: 15, letterSpacing: ".14em", color: "#3a352e", fontWeight: 500 }}>
          专属 3D 记忆空间
        </strong>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "18px 18px calc(env(safe-area-inset-bottom) + 28px)" }}>
        <div style={{
          padding: "16px 16px", borderRadius: 14, background: "#fffdfa",
          border: "1px solid rgba(74,70,63,.08)", marginBottom: 18,
        }}>
          <div style={{ fontSize: 12, letterSpacing: ".14em", color: "#8a8178", marginBottom: 8 }}>会员专属</div>
          <div style={{ fontSize: 13, color: "#3a352e", lineHeight: 1.8 }}>
            {loadState === "loading" && "正在读取会员状态…"}
            {loadState === "error" && (
              <>
                会员状态读取失败，
                <button
                  type="button"
                  onClick={() => { void refresh(); }}
                  style={{
                    border: 0, background: "transparent", padding: "0 2px",
                    color: "#75655a", fontSize: 13, fontFamily: "inherit",
                    textDecoration: "underline", cursor: "pointer",
                  }}
                >重试</button>
              </>
            )}
            {loadState === "ready" && status?.active && `已开通 · ${planLabel}${expires ? ` · 到期 ${expires}` : ""}`}
            {loadState === "ready" && status && !status.active && (status.loggedIn ? "尚未开通，开通后可用专属 3D 记忆空间" : "登录后可开通专属 3D 记忆空间")}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PLANS.map((p) => {
            const active = plan === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { setPlan(p.key); setMessage(""); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "18px 16px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                  border: active ? "1.5px solid #75655a" : "1px solid rgba(128,107,92,.15)",
                  background: active ? "#f3eee8" : "#fffdfa",
                  fontFamily: "inherit",
                }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 16, fontWeight: 500, color: "#3a352e" }}>{p.label}</strong>
                  <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "#918981" }}>{p.sub}</span>
                </span>
                <span style={{ fontSize: 18, color: "#3a352e", whiteSpace: "nowrap" }}>{p.price}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!plan || loading || loadState !== "ready"}
          onClick={buy}
          style={{
            width: "100%", height: 48, marginTop: 16, border: 0, borderRadius: 12,
            background: "#5f554d", color: "#fff", fontSize: 14, letterSpacing: ".06em",
            fontFamily: "inherit",
            cursor: plan && !loading && loadState === "ready" ? "pointer" : "default",
            opacity: plan && !loading && loadState === "ready" ? 1 : 0.5,
          }}
        >{loading ? "处理中…" : loadState === "error" ? "会员状态未就绪" : status?.loggedIn ? "立即开通" : "登录后开通"}</button>

        {message && (
          <div style={{
            marginTop: 12, padding: "10px 13px", borderRadius: 8,
            background: "#f1ece5", color: "#716a63", fontSize: 11, lineHeight: 1.7,
          }}>{message}</div>
        )}
      </main>
    </div>
  );
}

