"use client";

import { useState, useEffect } from "react";
import WelcomeScreen from "./screens/WelcomeScreen";
import LoginScreen from "./screens/LoginScreen";
import SpaceScreen from "./screens/SpaceScreen";
import SaveGateDialog from "./components/SaveGateDialog";
import CreationLocalRoom from "./components/creation/CreationLocalRoom";
import { API_BASE } from "./lib/apiBase";

type Screen = "welcome" | "canvas" | "login" | "space";

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  /* 全屏「开门」过渡动画状态 */
  const [isOpeningDoor, setIsOpeningDoor] = useState(false);
  /* 保存闸门 */
  const [saveGate, setSaveGate] = useState(false);
  /* 登录后回哪里：save=画布继续保存，space=回会员空间继续购买 */
  const [returnTo, setReturnTo] = useState<"save" | "space" | null>(null);
  const [saveTip, setSaveTip] = useState("");

  /* 画布只在客户端挂载：避免服务端渲染时访问 localStorage（localDocuments）
     造成 ReferenceError 与 hydrate 不一致。挂载后常驻，画布状态不丢。 */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* 支付宝回跳：/?payment=alipay&orderId=xxx → 查询支付结果 → 进会员空间 */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "alipay") return;
    const orderId = params.get("orderId");

    const clean = new URL(window.location.href);
    clean.searchParams.delete("payment");
    clean.searchParams.delete("orderId");
    window.history.replaceState({}, "", clean.pathname + clean.search + clean.hash);

    if (!orderId) return;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/payments/alipay/status?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        setScreen("space");
        flashTip(res.ok && data.status === "Paid" ? "会员已开通" : "支付未完成");
      } catch {
        setScreen("space");
        flashTip("支付状态待确认");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashTip(msg: string) {
    setSaveTip(msg);
    window.setTimeout(() => setSaveTip(""), 1800);
  }

  /* 点「保存」：已登录直接保存；未登录走闸门 */
  async function handleSave() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.user) { flashTip("已保存"); return; }
    } catch { /* 网络异常按未登录处理 */ }
    setReturnTo("save");
    setSaveGate(true);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", background: "#F7F3EC", fontFamily: "'Nunito', sans-serif" }}>
      <div className="handbook-app relative flex flex-col bg-[var(--bg)] overflow-hidden" style={{ width: "100%", height: "100%", borderRadius: 0, border: 0, boxSizing: "border-box", boxShadow: "none" }}>

        {screen === "welcome" && <WelcomeScreen onEnter={() => setScreen("canvas")} />}

        {screen === "login" && (
          <LoginScreen
            onVerified={() => {
              if (returnTo === "space") { setReturnTo(null); setScreen("space"); return; }
              setScreen("canvas");
              if (returnTo === "save") { setReturnTo(null); flashTip("已保存"); }
            }}
          />
        )}

        {/* 1. 画布创作区：客户端挂载后常驻 */}
        {mounted && (
          <div
            style={{
              display: screen === "canvas" ? "flex" : "none",
              position: "absolute",
              inset: 0,
              zIndex: 10,
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <CreationLocalRoom
              onBack={() => setScreen("welcome")}
              onEnterSpace={() => setIsOpeningDoor(true)}
              isVip={false}
              onSave={handleSave}
            />
          </div>
        )}

        {saveGate && (
          <SaveGateDialog
            onLogin={() => { setSaveGate(false); setScreen("login"); }}
            onCancel={() => { setSaveGate(false); setReturnTo(null); }}
          />
        )}

        {saveTip && (
          <div style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 4000,
            padding: "12px 24px",
            borderRadius: 12,
            background: "rgba(58,53,46,.92)",
            color: "#fff",
            fontSize: 13,
            letterSpacing: ".08em",
          }}>{saveTip}</div>
        )}

        {screen === "space" && (
          <SpaceScreen
            onBack={() => setScreen("canvas")}
            onNeedLogin={() => { setReturnTo("space"); setScreen("login"); }}
          />
        )}

        {/* 全屏「开门」过渡动画：推开门 -> 光透进来 -> 进入空间 */}
        {isOpeningDoor && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#121214",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", perspective: "1200px"
          }}>
            {/* 左门 */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: "50%",
              background: "linear-gradient(to right, #2a2a2a, #1a1a1a)",
              borderRight: "1px solid rgba(201,168,124,.3)",
              transformOrigin: "left center",
              animation: "doorOpenLeft 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
              zIndex: 1
            }} />
            {/* 右门 */}
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: "50%",
              background: "linear-gradient(to left, #2a2a2a, #1a1a1a)",
              borderLeft: "1px solid rgba(201,168,124,.3)",
              transformOrigin: "right center",
              animation: "doorOpenRight 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
              zIndex: 1
            }} />

            {/* 门缝透出的光 */}
            <div style={{
              position: "absolute", left: "50%", top: "20%", bottom: "20%", width: "2px",
              background: "#C9A87C",
              boxShadow: "0 0 60px 30px rgba(201,168,124,.6)",
              animation: "doorLight 1.2s ease-out forwards",
              zIndex: 2,
              pointerEvents: "none"
            }} />

            {/* 动画结束后的文字提示 */}
            <div style={{
              color: "#C9A87C", fontSize: 14, letterSpacing: "0.3em",
              position: "absolute", bottom: "15%", zIndex: 3,
              animation: "fadeIn 1.5s ease-out forwards"
            }}>正在进入空间...</div>

            {/* 动画关键帧 */}
            <style>{`
              @keyframes doorOpenLeft {
                0% { transform: translateX(0) rotateY(0deg); }
                100% { transform: translateX(-100%) rotateY(-30deg); opacity: 0; }
              }
              @keyframes doorOpenRight {
                0% { transform: translateX(0) rotateY(0deg); }
                100% { transform: translateX(100%) rotateY(30deg); opacity: 0; }
              }
              @keyframes doorLight {
                0% { opacity: 0; width: 2px; box-shadow: none; }
                40% { opacity: 1; width: 4px; box-shadow: 0 0 120px 60px rgba(201,168,124,.8); }
                100% { opacity: 0; width: 200px; box-shadow: 0 0 200px 100px rgba(201,168,124,0); }
              }
              @keyframes fadeIn {
                0% { opacity: 0; }
                70% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>

            {/* 动画结束，进入空间 */}
            <div
              style={{ position: "absolute", inset: 0, zIndex: 0, animation: "doorOpenLeft 1.2s linear forwards" }}
              onAnimationEnd={() => {
                setIsOpeningDoor(false);
                setScreen("space");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
