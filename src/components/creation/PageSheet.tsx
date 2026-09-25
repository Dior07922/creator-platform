"use client";
import { isLooseLeaf as __looseLeaf } from "../../lib/rigPages";
import React, { useEffect, useRef, useState } from "react";
import type { Page, PageLink, SheetAction } from "../../types/document";

const PAGE_LIMIT = 30;

type Props = {
  pages: Page[];
  currentPageId: string;
  links: PageLink[];
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  /** ★ 骨钉叠放的 10 张 id（按顺序）。有它才能把 10 张收成 1 张卡片 + 3 张活页，
      不然三十多张全列出来，用户删都要删累死。 */
  rigStackIds?: string[];
  onRenamePage: (id: string, title: string) => void;
  onDuplicatePage: (id: string) => void;
  onExit: () => void;
  onClose: () => void;
  dispatchAction: (kind: SheetAction["kind"]) => void;
  hasSelection?: boolean;
  /** 当前页已有分镜数（节奏 tab 提示用） */
  framesCount?: number;
  /** 当前节奏档位（慢/中/快），节奏 tab 显示选中态 */
  speedActive?: "slow" | "mid" | "fast" | null;

  /* ── 连接（动作驱动）───────────────────────────────
     状态由父层持有：连接动作要跨页进行（连接页面 → 承接页面 → 回连接页面），
     放在 PageSheet 内部会因为抽屉开合而丢失。 */
  connectMode: "phone" | "site" | "rig" | null;
  onConnectModeChange: (m: "phone" | "site" | "rig" | null) => void;
  /** 动作进行到哪一步（用于自动切到「页面」tab —— 该选页了就别让用户自己找） */
  connectStage: "idle" | "pickSource" | "pickTargetPage" | "pickTargetObj" | "returnHome" | "done";
  /** 当前该做的动作，人话提示 */
  connectStepText: string;
  /** 是否已完成闭环（用于提示条变绿） */
  connectDone: boolean;
  /** 已存进文档的连接条数（删/撤那两个按钮要显示"现在有几条"） */
  connectCount: number;
  onConnectCancel: () => void;
  /** 撤销刚建的那一条连接 */
  onConnUndo: () => void;
  /** 清空全部连接 */
  onConnClear: () => void;
  /** 是否在演示模式（固定视口、一次一页；只有这时点对象才跳） */
  demoOn: boolean;
  /** 进入 / 退出演示 */
  onDemoEnter: () => void;
  onDemoExit: () => void;
  /** 骨钉模式里点了「① 线条骨钉」：把当前页复制成 10 张叠放 */
  onStartRig: () => void;
  /** 连接动作正在等用户点某个页面时，页面列表把点击交给它。
      返回 true = 这次点击被连接消费掉了，不再执行普通切页 */
  onConnectPickPage?: (pageId: string) => boolean;
};

type Tab = "page" | "connect";

export default function PageSheet({
  pages,
  links,
  currentPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  rigStackIds,
  onRenamePage,
  onDuplicatePage,
  onExit,
  onClose,
  dispatchAction,
  hasSelection,
  framesCount,
  speedActive,
  connectMode,
  onConnectModeChange,
  connectStage,
  connectStepText,
  connectDone,
  connectCount,
  onConnectCancel,
  onConnUndo,
  onConnClear,
  demoOn,
  onDemoEnter,
  onDemoExit,
  onStartRig,
  onConnectPickPage,
}: Props) {
  const [tab, setTab] = useState<Tab>("page");

  /* 连接动作走到"该选页面"或"该点回起始页"时，自动切到「页面」tab，
     免得用户自己去找。衔接不脱节。 */
  useEffect(() => {
    if (connectStage === "pickTargetPage" || connectStage === "returnHome") setTab("page");
  }, [connectStage]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">(() => {
    try {
      const v = localStorage.getItem("ranjing.pageAlign");
      if (v === "left" || v === "center" || v === "right") return v;
    } catch {}
    return "center";
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const longPressRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drawerH, setDrawerH] = useState<"half" | "full" | "closed">("half");
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, h: 0 });

  // 内部剪贴板（复制的内容）
  const [clipboard, setClipboard] = useState<Page | null>(null);
  // 最近一次删除的页（撤回用）
  const [lastDeleted, setLastDeleted] = useState<Page | null>(null);
  /* ★ 禁用 alert 约定：轻提示（1.6s 自隐，不影响手势） */
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  function showFlash(msg: string) {
    setFlash(msg);
    if (flashTimerRef.current != null) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 1600);
  }

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  /* ★ P0-11：组件卸载时强制清掉所有按压/长按菜单状态，
     避免 z-index-1100 透明层残留锁死画布。 */
  useEffect(() => {
    return () => {
      clearPress();
      // 卸载时 menuFor/pressedId 会随组件一起销毁，这里只清 timer
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setAlignPersist(v: "left" | "center" | "right") {
    setAlign(v);
    try { localStorage.setItem("ranjing.pageAlign", v); } catch {}
  }

  function startEdit(p: Page) {
    setMenuFor(null);
    setEditingId(p.id);
    setDraftTitle(p.title || "");
  }
  function commitEdit() {
    if (!editingId) return;
    const t = draftTitle.trim() || "新增页面";
    onRenamePage(editingId, t);
    setEditingId(null);
    setDraftTitle("");
  }
  function cancelEdit() { setEditingId(null); setDraftTitle(""); }

  function clearPress() {
    if (clickTimerRef.current != null) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    if (longPressRef.current != null) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }

  function handlePointerDown(p: Page) {
    if (editingId === p.id) return;
    longPressedRef.current = false;
    setPressedId(p.id);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch {} }
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null;
      longPressedRef.current = true;
      setMenuFor(p.id);
      setPressedId(null);
      if (navigator.vibrate) { try { navigator.vibrate([12, 30, 12]); } catch {} }
    }, 480);
  }
  function handlePointerUp(p: Page) {
    if (editingId === p.id) return;
    setPressedId(null);
    if (longPressedRef.current) { longPressedRef.current = false; clearPress(); return; }
    clearPress();
    if (clickTimerRef.current != null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      startEdit(p);
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      /* 连接动作正在等用户点某一个页面时，这次点击先交给连接状态机。
         返回 true = 被消费，不执行普通切页，也不关抽屉
         （用户可能紧接着还要在目标页里选对象）。 */
      if (onConnectPickPage?.(p.id)) return;
      onSelectPage(p.id);
      onClose();
    }, 180);
  }
  /* ★ P0-11：pointercancel（手势被打断）也必须清掉长按菜单与按压态，
     否则 z-index-1100 透明层残留锁死整个画布。 */
  function handlePointerCancel(p: Page) {
    setPressedId(null);
    clearPress();
    if (longPressedRef.current) setMenuFor(null);
    longPressedRef.current = false;
  }

  // 长按菜单里的动作
  function actionCopy(p: Page) {
    setClipboard(JSON.parse(JSON.stringify(p)));
    setMenuFor(null);
  }
  function actionDelete(p: Page) {
    setLastDeleted(JSON.parse(JSON.stringify(p)));
    onDeletePage(p.id);
    setMenuFor(null);
  }
  function actionPaste() {
    if (!clipboard) { showFlash("剪贴板为空"); setMenuFor(null); return; }
    // 用剪贴板内容复制一份（父组件负责添加带内容的页面）
    // 由于 PageSheet 只能触发 onAddPage，我们用 localStorage 中转
    try {
      localStorage.setItem("ranjing.pendingPastePage", JSON.stringify(clipboard));
    } catch {}
    onAddPage();
    setMenuFor(null);
  }
  function actionRestore() {
    if (!lastDeleted) { showFlash("没有可撤回的操作"); setMenuFor(null); return; }
    try {
      localStorage.setItem("ranjing.pendingPastePage", JSON.stringify(lastDeleted));
    } catch {}
    onAddPage();
    setLastDeleted(null);
    setMenuFor(null);
  }

  const atLimit = pages.length >= PAGE_LIMIT;
  const menuPage = menuFor ? pages.find((x) => x.id === menuFor) : null;

  const tabBtnStyle = (t: Tab): React.CSSProperties => ({
    flex: 1, height: 40, border: 0, background: "transparent",
    color: tab === t ? "#3a352e" : "#8a8178",
    fontWeight: tab === t ? 600 : 400,
    fontSize: 13, fontFamily: "inherit", cursor: "pointer",
    position: "relative", padding: 0,
  });

  function onHandleDown(e: React.PointerEvent) {
    dragStartRef.current = { y: e.clientY, h: window.innerHeight };
    setDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dy = e.clientY - dragStartRef.current.y;
    setDragY(dy);
  }
  function onHandleUp() {
    if (!dragging) return;
    setDragging(false);
    const dy = dragY;
    setDragY(0);
    if (dy > 120) { onClose(); return; }
    if (dy < -80) { setDrawerH("full"); return; }
    setDrawerH("half");
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.001)" }}
      />
      <div
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          zIndex: 1001,
          height: drawerH === "full" ? "82vh" : "48vh",
          maxHeight: drawerH === "full" ? 720 : 420,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          background: "#fbfaf7",
          boxShadow: "0 -8px 32px rgba(58,53,46,.16)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          transform: dragging ? `translateY(${dragY}px)` : "translateY(0)",
          transition: dragging ? "none" : "height 0.3s cubic-bezier(0.32, 0.72, 0, 1), max-height 0.3s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          style={{
            flex: "none", paddingTop: 10, paddingBottom: 10,
            display: "flex", justifyContent: "center",
            cursor: "grab", touchAction: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: dragging ? "rgba(74,70,63,.45)" : "rgba(74,70,63,.22)", transition: "background 0.15s" }} />
        </div>

        {flash && (
          <div style={{
            flex: "none", margin: "6px 12px 0", padding: "8px 12px",
            borderRadius: 10, background: "rgba(122,90,52,0.12)",
            color: "#7a5a34", fontSize: 12, textAlign: "center",
            transition: "opacity 0.2s",
          }}>{flash}</div>
        )}

        <div style={{ flex: "none", display: "flex", padding: "6px 8px 0", borderBottom: "1px solid rgba(74,70,63,.06)" }}>
          <button type="button" style={tabBtnStyle("page")} onClick={() => setTab("page")}>页面</button>
          <button type="button" style={tabBtnStyle("connect")} onClick={() => setTab("connect")}>连接</button>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 36, height: 40, border: 0, background: "transparent", color: "#8a8178", fontSize: 18, cursor: "pointer", padding: 0 }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px calc(env(safe-area-inset-bottom) + 12px)" }}>
          {tab === "page" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#8a8178" }}>{pages.length} / {PAGE_LIMIT}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["left", "center", "right"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAlignPersist(v)}
                      style={{
                        width: 34, height: 28, borderRadius: 7, border: 0,
                        background: align === v ? "#3a352e" : "rgba(74,70,63,.06)",
                        color: align === v ? "#fff" : "#57524c",
                        fontSize: 14, cursor: "pointer", padding: 0,
                      }}
                    >{v === "left" ? "⇤" : v === "center" ? "⇹" : "⇥"}</button>
                  ))}
                </div>
              </div>

              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
              }}>
                {pages.map((p, idx) => {
                  /* ★ 骨钉叠放：只画第 1 张 + 3 张活页（3/6/9），中间那些「保持」的收进卡片里 */
                  const __stackIdx = (rigStackIds || []).indexOf(p.id);
                  if (__stackIdx >= 0 && __stackIdx !== 0 && !__looseLeaf(__stackIdx)) return null;
                  const active = p.id === currentPageId;
                  const label = p.title || "未命名";
                  const wRatio = p.paperW && p.paperH ? p.paperW / p.paperH : 0.75;
                  const thumbH = Math.max(52, Math.min(88, 64 / Math.max(0.45, Math.min(1.6, wRatio))));
                  const pressed = pressedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-page-row={p.id}
                      onPointerDown={() => handlePointerDown(p)}
                      onPointerUp={() => handlePointerUp(p)}
                      onPointerLeave={() => { setPressedId(null); clearPress(); }}
                      onPointerCancel={() => { handlePointerCancel(p); }}
                      style={{
                        width: 160,
                        display: "flex", alignItems: "center", gap: 8,
                        padding: 6,
                        border: active ? "1.5px solid #3a352e" : "1px solid rgba(74,70,63,.10)",
                        borderRadius: 10,
                        background: active ? "#f1ece4" : "#fffdfa",
                        cursor: "pointer", textAlign: "left",
                        transform: pressed ? "scale(0.96)" : "scale(1)",
                        boxShadow: pressed ? "0 0 0 2px rgba(58,53,46,.18)" : "none",
                        transition: "transform .08s, box-shadow .08s, background .15s, border-color .15s",
                        touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none",
                      }}
                    >
                      <div style={{
                        flex: "none", width: 44, height: thumbH, maxHeight: 76,
                        borderRadius: 6, background: p.paperColor || "#ffffff",
                        border: pressed ? "1.5px solid #3a352e" : "1px solid rgba(74,70,63,.10)",
                        position: "relative", overflow: "hidden",
                      }}>
                        <div style={{ position: "absolute", left: 4, top: 3, fontSize: 8, color: "rgba(74,70,63,.4)" }}>{idx + 1}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        {editingId === p.id ? (
                          <input
                            ref={inputRef}
                            value={draftTitle}
                            maxLength={20}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: "100%", height: 22, padding: "0 5px", border: "1px solid #75655a", borderRadius: 5, background: "#fff", color: "#3a352e", fontSize: 11, outline: "none", boxSizing: "border-box" }}
                          />
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? "#2b241c" : "#57524c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                        )}
                        {active && <span style={{ fontSize: 9, color: "#a49a8f", letterSpacing: ".06em" }}>当前</span>}
                      </div>
                    </button>
                  );
                })}

                {!atLimit && (
                  <button
                    type="button"
                    onClick={() => { onAddPage(); onClose(); }}
                    style={{ width: 160, height: 36, borderRadius: 10, border: "1.5px dashed rgba(74,70,63,.24)", background: "transparent", color: "#756f68", fontSize: 12, cursor: "pointer", letterSpacing: ".04em" }}
                  >＋ 新增页面</button>
                )}

                <button
                  type="button"
                  onClick={onExit}
                  style={{ width: 160, height: 36, borderRadius: 10, border: 0, background: "#5f554d", color: "#fff", fontSize: 12, cursor: "pointer", letterSpacing: ".06em", marginTop: 4 }}
                >← 退出创作</button>
              </div>
            </>
          )}

          {tab === "connect" && (
            <>
              {/* ── 连接模式（手稿顶层结构）─────────────────────────
                  连接靠【动作】建立，不靠文字按键。
                  这里只负责"选模式 + 告诉你现在该做哪一步"，
                  真正建立连接靠用户在画布和页面之间的点击动作。 */}
              <SectionLabel>连接模式</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {([
                  { id: "phone",  label: "① 手机模式", desc: "手机 UI 的交互连接" },
                  { id: "site",   label: "② 网站模式", desc: "网站设计的交互连接" },
                  { id: "rig",    label: "③ 骨钉模式", desc: "让画作动起来" },
                ] as const).map((m) => {
                  const active = connectMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      /* ★ 骨钉不设二级入口 —— 用户 2026-09-26：
                         「把线条骨钉入口也可以删掉 直接点击骨钉模式不就进来了」「不要留 2 套」。
                         点「③ 骨钉模式」这一步本身就是入口，直接进骨钉空间。 */
                      onClick={() => (m.id === "rig" ? onStartRig() : onConnectModeChange(active ? null : m.id))}
                      style={{
                        textAlign: "left", padding: "10px 12px", borderRadius: 10,
                        border: active ? "1.5px solid #3a352e" : "1px solid rgba(74,70,63,.10)",
                        background: active ? "#f1ece4" : "#fffdfa",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      <div style={{ fontSize: 13, color: "#3a352e", fontWeight: active ? 600 : 400 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: "#a49a8f", marginTop: 2 }}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* ①② 的动作引导：每一步只说"现在做什么"，不摆按键 */}
              {(connectMode === "phone" || connectMode === "site") && (
                <>
                  <SectionLabel>连接中</SectionLabel>
                  <div style={{
                    padding: "10px 12px", borderRadius: 10,
                    background: connectDone ? "#eef4ea" : "#f6f1e9",
                    border: connectDone ? "1px solid rgba(96,140,80,.28)" : "1px solid rgba(122,90,52,.18)",
                    fontSize: 12, lineHeight: 1.7,
                    color: connectDone ? "#3f5c33" : "#6b5942",
                  }}>
                    {connectStepText}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: "#a49a8f", lineHeight: 1.6 }}>
                    走完四步，两个页面之间才会长出线。<br />
                    只选一个还不成线。
                  </div>
                  <button
                    type="button"
                    onClick={onConnectCancel}
                    style={{
                      marginTop: 10, width: "100%", height: 34, borderRadius: 9,
                      border: "1px solid rgba(74,70,63,.14)", background: "#fffdfa",
                      color: "#756f68", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >结束这次设置</button>
                  {/* 这个按钮只是退出"正在搭"的这几步，不会让已建好的连接失效 ——
                      要拿掉连接用下面的删/撤/清空。 */}

                  {/* ★ 演示：固定视口、一次一页，只有这时候点已连接的对象才跳。
                      普通创作画布里点对象永远只是选中/编辑（三个模式互相独立）。 */}
                  <button
                    type="button"
                    onClick={demoOn ? onDemoExit : onDemoEnter}
                    style={{
                      marginTop: 10, width: "100%", height: 38, borderRadius: 9,
                      border: demoOn ? "1px solid rgba(192,57,43,.25)" : "1px solid rgba(63,92,51,.3)",
                      background: demoOn ? "rgba(192,57,43,.08)" : "#3f5c33",
                      color: demoOn ? "#c0392b" : "#fffdfa",
                      fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    }}
                  >{demoOn ? "退出演示" : "▶ 演示"}</button>

                  {/* ★ 连接的删/撤。以前连接只能加不能删，上次测试留下的
                      一直堆在文档里、点不了也删不掉，新的测试没法做。 */}
                  <SectionLabel>已有的连接（{connectCount} 条）</SectionLabel>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={connectCount === 0}
                      onClick={onConnUndo}
                      style={{
                        flex: 1, height: 34, borderRadius: 9,
                        border: "1px solid rgba(74,70,63,.14)",
                        background: connectCount ? "#fffdfa" : "#f4f1ec",
                        color: connectCount ? "#3a352e" : "#b3aaa0",
                        fontSize: 12, cursor: connectCount ? "pointer" : "default",
                        fontFamily: "inherit",
                      }}
                    >撤销上一条</button>
                    <button
                      type="button"
                      disabled={connectCount === 0}
                      onClick={onConnClear}
                      style={{
                        flex: 1, height: 34, borderRadius: 9,
                        border: "1px solid rgba(192,57,43,.18)",
                        background: connectCount ? "rgba(192,57,43,.08)" : "#f4f1ec",
                        color: connectCount ? "#c0392b" : "#b3aaa0",
                        fontSize: 12, cursor: connectCount ? "pointer" : "default",
                        fontFamily: "inherit",
                      }}
                    >清空全部</button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: "#a49a8f", lineHeight: 1.6 }}>
                    也可以：在画布上点那条线删，或长按一个对象删它身上的那几条。
                  </div>
                </>
              )}

              {/* ★ 骨钉的二级面板【整块删除】—— 用户 2026-09-26：
                 「把线条骨钉入口也可以删掉 直接点击骨钉模式不就进来了」「不要留 2 套」。
                 它里面只剩「线条骨钉」这一个按钮 + 一段说明，功能全部并进上一格：
                 点「③ 骨钉模式」即直接进骨钉空间（见上面 onClick）。
                 所以 connectMode 永远不会再等于 "rig"，这里不留死代码。 */}

              {/* 已建立的连接（线） */}
              {links.length > 0 && (
                <>
                  <SectionLabel>已连成</SectionLabel>
                  <div style={{ fontSize: 11, color: "#6b5942", lineHeight: 1.8 }}>
                    本页已有 {links.length} 条连接
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 长按菜单 */}
      {menuPage && (
        <>
          <div
            onClick={() => setMenuFor(null)}
            style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.001)" }}
          />
          <div style={{
            position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            zIndex: 1101, background: "#fffdfa", borderRadius: 14, padding: 8,
            boxShadow: "0 16px 40px rgba(58,53,46,.28)",
            border: "1px solid rgba(74,70,63,.08)",
            display: "flex", flexDirection: "column", minWidth: 180,
          }}>
            <div style={{
              fontSize: 11, color: "#a49a8f", padding: "6px 12px 10px",
              maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              borderBottom: "1px solid rgba(74,70,63,.06)", marginBottom: 4,
            }}>{menuPage.title || "未命名"}</div>

            <MenuItem label="改名" onClick={() => startEdit(menuPage)} />
            <MenuItem label="复制" onClick={() => actionCopy(menuPage)} />
            <MenuItem label="删除" danger onClick={() => actionDelete(menuPage)} />
            <MenuItem label="粘贴" onClick={() => actionPaste()} />
            <MenuItem label="撤回" onClick={() => actionRestore()} />
            <MenuItem label="取消" onClick={() => setMenuFor(null)} />
          </div>
        </>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "#8a8178", letterSpacing: ".08em", marginTop: 14, marginBottom: 8, paddingLeft: 2 }}>{children}</div>
  );
}

function BtnGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{children}</div>
  );
}

function ActBtn({ label, onClick, active, disabled }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 44,
        border: active ? "1.5px solid #3a352e" : "1px solid rgba(74,70,63,.10)",
        borderRadius: 10,
        background: disabled ? "rgba(74,70,63,.03)" : active ? "#f1ece4" : "#fffdfa",
        color: disabled ? "#cbc6c0" : "#3a352e",
        fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", padding: 0,
      }}
    >{label}</button>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", height: 40, border: 0, borderRadius: 9,
        background: "transparent",
        color: danger ? "#c0392b" : "#3a352e",
        fontSize: 13, cursor: "pointer",
        textAlign: "left", padding: "0 14px",
        fontFamily: "inherit",
      }}
    >{label}</button>
  );
}