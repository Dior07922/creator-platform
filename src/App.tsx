"use client";

/* 主程序外壳（第六步 + 第七步接线后）
   屏幕：welcome → canvas（创作室常驻不卸载）→ login / space（会员开通）
   场景：guardian（手绘小门 →「我只是互联网」复古电脑）
        memory（保存页 → 记忆空间：本地记录 + 会员漫游）
        murmur / unsent（记忆空间里的两个入口场景）
   规则：
     · 登录闸门只在点「导出分享」时出现（保存已改为纯本地）；
     · 门=会员通道：门进电脑场景（source=door）；记忆空间的会员闸门直达价格清单（source=upgrade）；
     · 场景都是同源 iframe 叠层，创作室在底下始终挂着，画不会丢。 */
import { useState, useEffect, useRef, useCallback } from "react";
import WelcomeScreen from "./screens/WelcomeScreen";
import LoginScreen from "./screens/LoginScreen";
import SpaceScreen from "./screens/SpaceScreen";
import SaveGateDialog from "./components/SaveGateDialog";
import SceneHost from "./components/SceneHost";
import MemorySpace from "./screens/MemorySpace";
import CreationLocalRoom from "./components/creation/CreationLocalRoom";
import { API_BASE } from "./lib/apiBase";

type Screen = "welcome" | "canvas" | "login" | "space";
type Scene =
  | { kind: "guardian"; entry: "door" | "upgrade" }
  | { kind: "memory"; open?: "member" }
  | { kind: "murmur" }
  | { kind: "unsent" };

/* 退出消息两种拼写都认：复古电脑用 CustomEvent 名 ranjing:scene-exit（冒号），
   碎碎念之神 / 发不出去的信息用 ranjing-scene-exit（连字符）。各自是原型的契约，不改它们。 */
function isSceneExit(type: string) {
  return type === "ranjing:scene-exit" || type === "ranjing-scene-exit";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  /* 场景叠层（栈式）：后进的在上面，退出只关自己及更上面的 */
  const [scenes, setScenes] = useState<Scene[]>([]);
  /* 导出分享的登录闸门 */
  const [saveGate, setSaveGate] = useState(false);
  /* 登录后回哪里：export=回创作室弹导出分享，space=回会员开通页 */
  const [returnTo, setReturnTo] = useState<"export" | "space" | null>(null);
  /* +1 → 创作室把导出分享面板弹出来（登录完成后走这条） */
  const [exportKey, setExportKey] = useState(0);
  const [saveTip, setSaveTip] = useState("");
  /* 会员状态：记忆空间会员漫游读它。未登录/未开通 = false。 */
  const [isVip, setIsVip] = useState(false);

  /* 画布只在客户端挂载：避免服务端渲染时访问 localStorage（localDocuments）
     造成 ReferenceError 与 hydrate 不一致。挂载后常驻，画布状态不丢。 */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const tipTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (tipTimerRef.current != null) window.clearTimeout(tipTimerRef.current);
  }, []);

  const pushScene = useCallback((scene: Scene) => setScenes((prev) => [...prev, scene]), []);
  const popScenesFrom = useCallback((index: number) => setScenes((prev) => prev.slice(0, index)), []);

  /* 读会员状态。任何失败都按「未开通」处理，不阻塞创作。 */
  const refreshMembership = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/membership/status`, { cache: "no-store" });
      /* 401 = 未登录，属正常态，不当异常 */
      if (res.status === 401) { setIsVip(false); return; }
      if (!res.ok) return;              // 其它错误：保留上一次已知状态，避免误锁
      const data = await res.json();
      setIsVip(!!data.active);
    } catch { /* 网络异常：保留上一次已知状态 */ }
  }, []);

  useEffect(() => { void refreshMembership(); }, [refreshMembership]);

  /* 支付宝回跳：/?payment=alipay&orderId=xxx → 查询支付结果
     已支付：会员状态刷新 → 回创作室并直接打开记忆空间（手稿：开通后跳转 = 记忆空间 / 碎碎念之神）
     未支付：回会员开通页，可重试 */
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
        await refreshMembership();
        if (res.ok && data.status === "Paid") {
          setScreen("canvas");
          setScenes([{ kind: "memory" }]);
          flashTip("会员已开通，已为你打开记忆空间");
        } else {
          setScreen("space");
          flashTip(res.ok ? "支付未完成" : "支付状态待确认");
        }
      } catch {
        setScreen("space");
        flashTip("支付状态待确认");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashTip(msg: string) {
    setSaveTip(msg);
    if (tipTimerRef.current != null) window.clearTimeout(tipTimerRef.current);
    tipTimerRef.current = window.setTimeout(() => { tipTimerRef.current = null; setSaveTip(""); }, 1800);
  }

  /* 点「导出分享」：已登录直接弹面板；未登录先走登录流程（手稿第 ⑤ 步） */
  async function handleExportShare() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.user) { setExportKey((k) => k + 1); return; }
    } catch { /* 网络异常按未登录处理 */ }
    setReturnTo("export");
    setSaveGate(true);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", background: "var(--bg)", fontFamily: "'Nunito', sans-serif" }}>
      <div className="handbook-app relative flex flex-col bg-[var(--bg)] overflow-hidden" style={{ width: "100%", height: "100%", borderRadius: 0, border: 0, boxSizing: "border-box", boxShadow: "none" }}>

        {screen === "welcome" && <WelcomeScreen onEnter={() => setScreen("canvas")} />}

        {screen === "login" && (
          <LoginScreen
            onVerified={() => {
              /* 登录成功后重读会员状态：老会员回到画布应立刻拿到门禁权限 */
              void refreshMembership();
              if (returnTo === "space") { setReturnTo(null); setScreen("space"); return; }
              setScreen("canvas");
              if (returnTo === "export") { setReturnTo(null); setExportKey((k) => k + 1); }
            }}
            onBack={() => { setReturnTo(null); setScreen("canvas"); }}
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
              onEnterSpace={() => pushScene({ kind: "guardian", entry: "door" })}
              onSave={() => flashTip("已保存到记忆空间")}
              onExportShare={handleExportShare}
              onOpenMemory={() => pushScene({ kind: "memory" })}
              /* 制作 → 运动路径制作 → 进入想象连接（漫游页）：
                 直接开优化版漫游页（记忆空间·会员漫游那一层），不再跳去旧的 /roam 静态页 */
              onOpenRoam={() => pushScene({ kind: "memory", open: "member" })}
              exportKey={exportKey}
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
            background: "rgba(32,49,57,.92)",
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

        {/* ── 场景叠层 ── */}
        {scenes.map((scene, idx) => {
          if (scene.kind === "guardian") {
            return (
              <SceneHost
                key={`guardian-${idx}`}
                src={`/scenes/guardian.html${scene.entry === "upgrade" ? "?source=upgrade" : ""}`}
                title="我只是互联网"
                onEvent={(msg) => {
                  if (isSceneExit(msg.type)) popScenesFrom(idx);
                  else if (msg.type === "ranjing-buy") { popScenesFrom(idx); setScreen("space"); }
                }}
              />
            );
          }
          if (scene.kind === "memory") {
            return (
              <MemorySpace
                key={`memory-${idx}`}
                isMember={isVip}
                initialMode={scene.open === "member" ? "A" : undefined}
                onClose={() => popScenesFrom(idx)}
                onOpenWork={(workId) => {
                  popScenesFrom(idx);
                  (window as unknown as { __ranjingOpenWork?: (id: string) => void }).__ranjingOpenWork?.(workId);
                }}
                onNeedMembership={() => {
                  /* 非会员点「体验会员漫游」：大厅收起，直接开复古电脑（source=upgrade
                     会跳过寒暄、落在 B 价格清单），形成 记忆空间 → 电脑 → 开通 → 购买页 一条链 */
                  popScenesFrom(idx);
                  pushScene({ kind: "guardian", entry: "upgrade" });
                }}
                onOpenScene={(kind) => pushScene({ kind })}
              />
            );
          }
          if (scene.kind === "murmur") {
            return (
              <SceneHost
                key={`murmur-${idx}`}
                src="/scenes/murmur.html"
                title="碎碎念之神"
                onEvent={(msg) => { if (isSceneExit(msg.type)) popScenesFrom(idx); }}
              />
            );
          }
          return (
            <SceneHost
              key={`unsent-${idx}`}
              src="/scenes/unsent.html"
              title="发不出去的信息"
              onEvent={(msg) => { if (isSceneExit(msg.type)) popScenesFrom(idx); }}
            />
          );
        })}
      </div>
    </div>
  );
}
