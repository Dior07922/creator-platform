"use client";

/* 记忆空间（第六步·本地记录页 / 第七步·会员漫游）
   场景本体是独立页面 /scenes/memory.html：本地记忆大厅 + 会员 3D 漫游。
   主程序负责三件事：
     1. 进场前把「本机作品」和「会员状态」放进 window，场景脚本读取后合并展示
        （本机作品卡 = 真实作品，点「继续创作」回到编辑器打开它）；
     2. 接场景消息：切换模式 → 显示对应入口；非会员推门 → 引导开通；
     3. 叠主程序自己的返回与入口按钮。 */
import { useEffect, useRef, useState } from "react";
import SceneHost from "../components/SceneHost";
import { listWorks } from "../lib/works";

/* 上线开关（用户 2026-10-02 定的规矩）：
   false = 验收期：点「体验会员漫游」谁都能进 3D（只显示演示卡片，材料里的原行为）；
   true  = 上线后：会员漫游为会员限定，非会员点「体验会员漫游」引导去登录/开通。
   打开时同时收紧：漫游里的「碎碎念之神（会员记录）」入口也只给会员看。 */
const MEMBER_ONLY_ROAM = false;

export default function MemorySpace({ isMember, initialMode, onClose, onOpenWork, onNeedMembership, onOpenScene }: {
  isMember: boolean;
  /** "A" = 进场直接落会员漫游（优化版漫游页），非会员会停在会员门槛；默认 "B" 本地大厅 */
  initialMode?: "A" | "B";
  onClose: () => void;
  onOpenWork: (workId: string) => void;
  onNeedMembership: () => void;
  onOpenScene: (kind: "murmur" | "unsent") => void;
}) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"A" | "B">("B");
  const handlers = useRef({ onOpenWork, onNeedMembership });
  handlers.current = { onOpenWork, onNeedMembership };

  /* 先把数据放到位，再挂 iframe —— 场景脚本在载入那一刻就会读这两个全局 */
  useEffect(() => {
    let alive = true;
    (async () => {
      let entries: Record<string, unknown>[] = [];
      try {
        const works = await listWorks();
        entries = works.map((w) => ({
          title: w.title,
          category: w.category,
          tags: w.tags,
          date: w.dateLabel,
          description: w.description,
          thumb: w.thumb,
          workId: w.id,
        }));
      } catch { entries = []; }
      if (!alive) return;
      (window as unknown as Record<string, unknown>).__RANJING_WORKS__ = entries;
      (window as unknown as Record<string, unknown>).__RANJING_IS_MEMBER__ = isMember;
      (window as unknown as Record<string, unknown>).__RANJING_MEMBER_ONLY__ = MEMBER_ONLY_ROAM;
      setReady(true);
    })();
    return () => { alive = false; };
  }, [isMember]);

  const pillStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,.28)",
    background: "rgba(24,34,39,.78)",
    color: "#e6eef1",
    borderRadius: 999,
    padding: "9px 14px",
    fontSize: 12,
    letterSpacing: ".06em",
    fontFamily: "inherit",
    cursor: "pointer",
    backdropFilter: "blur(6px)",
    boxShadow: "0 4px 14px rgba(0,0,0,.25)",
  };

  return (
    <SceneHost
      src={initialMode === "A" ? "/scenes/memory.html#A" : "/scenes/memory.html"}
      title="记忆空间"
      onEvent={(msg) => {
        if (msg.type === "ranjing-mode") {
          const m = (msg as { mode?: string }).mode || (msg.detail as { mode?: string } | undefined)?.mode;
          if (m === "A" || m === "B") setMode(m);
        } else if (msg.type === "ranjing-open-work") {
          const workId = (msg as { workId?: string }).workId || (msg.detail as { workId?: string } | undefined)?.workId;
          if (workId) handlers.current.onOpenWork(workId);
        } else if (msg.type === "ranjing-need-membership") {
          handlers.current.onNeedMembership();
        }
      }}
    >
      {ready && (
        <>
          <button
            type="button"
            onClick={onClose}
            style={{ ...pillStyle, position: "fixed", left: 14, top: "calc(env(safe-area-inset-top) + 12px)", zIndex: 2 }}
          >‹ 返回苒境</button>

          <div style={{ position: "fixed", right: 14, bottom: "calc(env(safe-area-inset-bottom) + 16px)", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {mode === "B" && (
              <button type="button" onClick={() => onOpenScene("unsent")} style={pillStyle}>
                发不出去的信息 <span style={{ opacity: .6, marginLeft: 6 }}>免费公用功能</span>
              </button>
            )}
            {mode === "A" && (!MEMBER_ONLY_ROAM || isMember) && (
              <button type="button" onClick={() => onOpenScene("murmur")} style={pillStyle}>
                碎碎念之神 <span style={{ opacity: .6, marginLeft: 6 }}>会员记录</span>
              </button>
            )}
          </div>
        </>
      )}
    </SceneHost>
  );
}
