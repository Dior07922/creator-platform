// name=src/components/creation/SidePanelBodies.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Page, ShapeKind } from "../../types/document";
import type { BrushParams } from "./Editor";
import { PenBody, SpecBody, FontBody } from "./CreationDrawer";

const PAGE_LIMIT = 30;
/** 文具盒记住上次开的是哪一格（规格/笔/页/字） */
const BOX_SUB_KEY = "ranjing.boxSub";

/* ═══════════════════════════════════════════════════════════════
   第五步：外沿最终结构 = 文具盒｜调色盘｜制作｜保存 ＋ 手绘小门。
   本文件只做「搬迁」，不改已定的功能与流程：
     · PageListBody    —— 原底部弹层「页面」的内容块（页 → 文具盒·页）
     · ConnectWorkbench—— 原底部弹层「连接」的工作台（连接 → 制作）
     · BoxDrawer       —— 文具盒：规格｜笔｜页｜字（规格两字竖排）
     · MakeDrawer      —— 制作：手机模拟｜网站模拟｜记事本包装｜运动路径制作
   连接四件套（设计连接/路径/记录/情绪）不再单独做菜单：
   连接动作归制作；路径/记录/触发词是作品内部信息，归保存（后续步骤落）。
   ═══════════════════════════════════════════════════════════════ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--rj-text-muted)", letterSpacing: ".08em", marginTop: 14, marginBottom: 8, paddingLeft: 2 }}>{children}</div>
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
        color: danger ? "var(--rj-danger)" : "var(--rj-text)",
        fontSize: 13, cursor: "pointer",
        textAlign: "left", padding: "0 14px",
        fontFamily: "inherit",
      }}
    >{label}</button>
  );
}

/* ============================================================
   页（原底部弹层「页面」内容块 → 文具盒 · 页）
============================================================ */
export type PageListBodyProps = {
  pages: Page[];
  currentPageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string, title: string) => void;
  onExit: () => void;
  /** 选页 / 新建之后收起抽屉（回白纸执行） */
  onPicked: () => void;
  /** 连接动作正在等用户点某个页面时，页面列表把点击交给它。
      返回 true = 这次点击被连接消费掉了，不再执行普通切页 */
  onConnectPickPage?: (pageId: string) => boolean;
};

export function PageListBody({
  pages,
  currentPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  onExit,
  onPicked,
  onConnectPickPage,
}: PageListBodyProps) {
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
      onPicked();
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
  const cardW: React.CSSProperties = { width: "100%", maxWidth: 160 };

  return (
    <div className="cd-body">
      {flash && (
        <div style={{
          margin: "0 0 8px", padding: "8px 12px",
          borderRadius: 10, background: "var(--rj-action-soft)",
          color: "var(--rj-text-subtle)", fontSize: 12, textAlign: "center",
        }}>{flash}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--rj-text-muted)" }}>{pages.length} / {PAGE_LIMIT}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["left", "center", "right"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAlignPersist(v)}
              style={{
                width: 34, height: 28, borderRadius: 7, border: 0,
                background: align === v ? "var(--rj-text)" : "var(--rj-line-soft)",
                color: align === v ? "var(--rj-surface-raised)" : "var(--rj-text-subtle)",
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
                ...cardW,
                display: "flex", alignItems: "center", gap: 8,
                padding: 6,
                border: active ? "1.5px solid var(--rj-text)" : "1px solid var(--rj-line-soft)",
                borderRadius: 10,
                background: active ? "var(--rj-surface-hover)" : "var(--rj-surface-raised)",
                cursor: "pointer", textAlign: "left",
                transform: pressed ? "scale(0.96)" : "scale(1)",
                boxShadow: pressed ? "0 0 0 2px var(--rj-selection-bg)" : "none",
                transition: "transform .08s, box-shadow .08s, background .15s, border-color .15s",
                touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none",
              }}
            >
              <div style={{
                flex: "none", width: 44, height: thumbH, maxHeight: 76,
                borderRadius: 6, background: p.paperColor || "#ffffff",
                border: pressed ? "1.5px solid var(--rj-text)" : "1px solid var(--rj-line-soft)",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", left: 4, top: 3, fontSize: 8, color: "var(--rj-placeholder)" }}>{idx + 1}</div>
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
                    style={{ width: "100%", height: 22, padding: "0 5px", border: "1px solid var(--rj-text-muted)", borderRadius: 5, background: "var(--rj-surface-raised)", color: "var(--rj-text)", fontSize: 11, outline: "none", boxSizing: "border-box" }}
                  />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? "var(--rj-text)" : "var(--rj-text-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                )}
                {active && <span style={{ fontSize: 9, color: "var(--rj-placeholder)", letterSpacing: ".06em" }}>当前</span>}
              </div>
            </button>
          );
        })}

        {!atLimit && (
          <button
            type="button"
            onClick={() => { onAddPage(); onPicked(); }}
            style={{ ...cardW, height: 36, borderRadius: 10, border: "1.5px dashed var(--rj-line)", background: "transparent", color: "var(--rj-text-muted)", fontSize: 12, cursor: "pointer", letterSpacing: ".04em" }}
          >＋ 新增页面</button>
        )}

        <button
          type="button"
          onClick={onExit}
          style={{ ...cardW, height: 36, borderRadius: 10, border: 0, background: "var(--rj-text-subtle)", color: "var(--rj-surface-raised)", fontSize: 12, cursor: "pointer", letterSpacing: ".06em", marginTop: 4 }}
        >← 退出创作</button>
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
            zIndex: 1101, background: "var(--rj-surface-raised)", borderRadius: 14, padding: 8,
            boxShadow: "0 16px 40px var(--rj-panel-shadow)",
            border: "1px solid var(--rj-line-soft)",
            display: "flex", flexDirection: "column", minWidth: 180,
          }}>
            <div style={{
              fontSize: 11, color: "var(--rj-placeholder)", padding: "6px 12px 10px",
              maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              borderBottom: "1px solid var(--rj-line-soft)", marginBottom: 4,
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
    </div>
  );
}

/* ============================================================
   连接工作台（原底部弹层「连接」页 → 制作）
   只负责"你现在该做哪一步 + 演示 + 删/撤"，
   真正建立连接靠用户在画布和页面之间的点击动作。
============================================================ */
export function ConnectWorkbench({
  stepText, done, count, linksCount,
  demoOn, onDemoEnter, onDemoExit,
  onCancel, onUndo, onClear,
}: {
  stepText: string;
  done: boolean;
  /** 已存进文档的连接条数 */
  count: number;
  /** 本页已有几条连接（提示用） */
  linksCount: number;
  demoOn: boolean;
  onDemoEnter: () => void;
  onDemoExit: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <SectionLabel>连接中</SectionLabel>
      <div style={{
        padding: "10px 12px", borderRadius: 10,
        background: done ? "var(--rj-surface-hover)" : "var(--rj-app-bg-elevated)",
        border: done ? "1px solid var(--rj-success)" : "1px solid var(--rj-action-soft)",
        fontSize: 12, lineHeight: 1.7,
        color: done ? "var(--rj-success)" : "var(--rj-text-subtle)",
      }}>
        {stepText}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: "var(--rj-placeholder)", lineHeight: 1.6 }}>
        走完四步，两个页面之间才会长出线。<br />
        只选一个还不成线。
      </div>
      <button
        type="button"
        onClick={onCancel}
        style={{
          marginTop: 10, width: "100%", height: 34, borderRadius: 9,
          border: "1px solid var(--rj-line)", background: "var(--rj-surface-raised)",
          color: "var(--rj-text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
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
          border: demoOn ? "1px solid var(--rj-danger)" : "1px solid var(--rj-success)",
          background: demoOn ? "var(--rj-danger-bg)" : "var(--rj-success)",
          color: demoOn ? "var(--rj-danger)" : "var(--rj-text-on-action)",
          fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
        }}
      >{demoOn ? "退出演示" : "▶ 演示"}</button>

      {/* ★ 连接的删/撤。以前连接只能加不能删。 */}
      <SectionLabel>已有的连接（{count} 条）</SectionLabel>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={count === 0}
          onClick={onUndo}
          style={{
            flex: 1, height: 34, borderRadius: 9,
            border: "1px solid var(--rj-line)",
            background: count ? "var(--rj-surface-raised)" : "var(--rj-app-bg-elevated)",
            color: count ? "var(--rj-text)" : "var(--rj-placeholder)",
            fontSize: 12, cursor: count ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >撤销上一条</button>
        <button
          type="button"
          disabled={count === 0}
          onClick={onClear}
          style={{
            flex: 1, height: 34, borderRadius: 9,
            border: "1px solid var(--rj-danger)",
            background: count ? "var(--rj-danger-bg)" : "var(--rj-app-bg-elevated)",
            color: count ? "var(--rj-danger)" : "var(--rj-placeholder)",
            fontSize: 12, cursor: count ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >清空全部</button>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: "var(--rj-placeholder)", lineHeight: 1.6 }}>
        也可以：在画布上点那条线删，或长按一个对象删它身上的那几条。
      </div>

      {linksCount > 0 && (
        <>
          <SectionLabel>已连成</SectionLabel>
          <div style={{ fontSize: 11, color: "var(--rj-text-subtle)", lineHeight: 1.8 }}>
            本页已有 {linksCount} 条连接
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   文具盒（外沿第 1 类目）：规格｜笔｜页｜字
   四个小页签就在盒内；选完直接回白纸执行，不再跳第二层页面。
============================================================ */
export type BoxSub = "spec" | "pen" | "page" | "font";

export function BoxDrawer({
  onSpecPicked,
  onPickTool, onInsertText, onInsertShape, brush, onBrushChange,
  pages, currentPageId, onSelectPage, onAddPage, onDeletePage, onRenamePage, onExit, onConnectPickPage,
  currentFont, onFontChange,
  onPicked,
  connectStage,
}: {
  onSpecPicked: (w: number, h: number) => void;
  onPickTool: (kind: ShapeKind) => void;
  onInsertText: (text: string) => void;
  onInsertShape: (kind: ShapeKind) => void;
  brush: BrushParams;
  onBrushChange: (patch: Partial<BrushParams>) => void;
  pages: Page[];
  currentPageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string, title: string) => void;
  onExit: () => void;
  onConnectPickPage?: (pageId: string) => boolean;
  currentFont: string;
  onFontChange: (family: string) => void;
  /** 选完（规格/字/页）收起抽屉，回白纸执行 */
  onPicked: () => void;
  /** 连接走到"该选页 / 该点回起始页"时，盒内自动翻到「页」 */
  connectStage?: string;
}) {
  const [sub, setSub] = useState<BoxSub>(() => {
    try {
      const v = localStorage.getItem(BOX_SUB_KEY);
      if (v === "spec" || v === "pen" || v === "page" || v === "font") return v;
    } catch {}
    return "spec";
  });
  function pickSub(k: BoxSub) {
    setSub(k);
    try { localStorage.setItem(BOX_SUB_KEY, k); } catch {}
  }
  /* 连接动作走到"该选页面"或"该点回起始页"时，自动翻到「页」，
     免得用户自己去找。衔接不脱节。 */
  useEffect(() => {
    if (connectStage === "pickTargetPage" || connectStage === "returnHome") pickSub("page");
  }, [connectStage]);

  const TABS: { k: BoxSub; label: string }[] = [
    { k: "spec", label: "规格" },
    { k: "pen", label: "笔" },
    { k: "page", label: "页" },
    { k: "font", label: "字" },
  ];

  return (
    <aside className="cd-panel">
      <div className="cd-box-tabs" role="tablist" aria-label="文具盒">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={sub === t.k}
            className={sub === t.k ? "is-active" : ""}
            onClick={() => pickSub(t.k)}
          >{t.label}</button>
        ))}
      </div>

      {sub === "spec" && <SpecBody onPicked={onSpecPicked} />}
      {sub === "pen" && (
        <PenBody
          onPickTool={onPickTool}
          onInsertText={onInsertText}
          onInsertShape={onInsertShape}
          brush={brush}
          onBrushChange={onBrushChange}
        />
      )}
      {sub === "page" && (
        <PageListBody
          pages={pages}
          currentPageId={currentPageId}
          onSelectPage={onSelectPage}
          onAddPage={onAddPage}
          onDeletePage={onDeletePage}
          onRenamePage={onRenamePage}
          onExit={onExit}
          onPicked={onPicked}
          onConnectPickPage={onConnectPickPage}
        />
      )}
      {sub === "font" && (
        <FontBody currentFont={currentFont} onFontChange={onFontChange} onPicked={onPicked} />
      )}
    </aside>
  );
}

/* ============================================================
   制作（外沿第 3 类目）：点击后展开选择，不跳转 ——
   手机模拟 / 网站模拟 / 记事本包装 / 运动路径制作
   （连接就住在这里：选模式 → 画布走四步 → 回来演示/删撤）
============================================================ */
type MakeId = "phone" | "site" | "notebook" | "path";

export function MakeDrawer({
  connectMode, onConnectModeChange,
  connectStepText, connectDone, connectCount, linksCount,
  demoOn, onDemoEnter, onDemoExit,
  onConnectCancel, onConnUndo, onConnClear,
  onOpenRoam,
}: {
  connectMode: "phone" | "site" | null;
  onConnectModeChange: (m: "phone" | "site" | null) => void;
  connectStepText: string;
  connectDone: boolean;
  connectCount: number;
  linksCount: number;
  demoOn: boolean;
  onDemoEnter: () => void;
  onDemoExit: () => void;
  onConnectCancel: () => void;
  onConnUndo: () => void;
  onConnClear: () => void;
  /** 进入想象连接（漫游页）= 开优化版漫游页（记忆空间·会员漫游） */
  onOpenRoam?: () => void;
}) {
  const [open, setOpen] = useState<MakeId | null>(connectMode ?? null);
  /* 画布那边改了连接模式（选/取消）→ 工作台跟着开/合 */
  useEffect(() => {
    if (connectMode) setOpen(connectMode);
    else setOpen((prev) => (prev === "phone" || prev === "site" ? null : prev));
  }, [connectMode]);

  const ENTRIES: { id: MakeId; label: string; desc: string }[] = [
    { id: "phone", label: "手机模拟", desc: "手机 UI 的交互连接" },
    { id: "site", label: "网站模拟", desc: "网站设计的交互连接" },
    { id: "notebook", label: "记事本包装", desc: "纸样 · 装饰 · 穿孔 · 图片 · 呈现方式" },
    { id: "path", label: "运动路径制作", desc: "会员漫游页面用的运动路径" },
  ];

  function pick(id: MakeId) {
    if (id === "phone" || id === "site") {
      /* 和原来的模式卡一致：点已选的 = 取消 */
      onConnectModeChange(connectMode === id ? null : id);
      return;
    }
    setOpen((prev) => (prev === id ? null : id));
  }

  return (
    <aside className="cd-panel">
      <div className="cd-body">
        <div style={{ fontSize: 11, color: "var(--rj-text-muted)", padding: "0 4px 10px", letterSpacing: ".08em" }}>制作</div>

        {ENTRIES.map((e) => {
          const isOpen = open === e.id;
          const active = (e.id === "phone" || e.id === "site") && connectMode === e.id;
          return (
            <div key={e.id} style={{ marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => pick(e.id)}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                  border: active ? "1.5px solid var(--rj-action)" : "1px solid var(--rj-line-soft)",
                  background: active || isOpen ? "var(--rj-action-soft)" : "var(--rj-surface-raised)",
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, color: "var(--rj-text)", fontWeight: active ? 600 : 400 }}>{e.label}</span>
                  <span style={{ display: "block", fontSize: 10, color: "var(--rj-placeholder)", marginTop: 2, lineHeight: 1.5 }}>{e.desc}</span>
                </span>
                <span style={{ flex: "none", fontSize: 11, color: "var(--rj-text-muted)" }}>{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (e.id === "phone" || e.id === "site") && (
                <div style={{ marginTop: 8 }}>
                  <ConnectWorkbench
                    stepText={connectStepText}
                    done={connectDone}
                    count={connectCount}
                    linksCount={linksCount}
                    demoOn={demoOn}
                    onDemoEnter={onDemoEnter}
                    onDemoExit={onDemoExit}
                    onCancel={onConnectCancel}
                    onUndo={onConnUndo}
                    onClear={onConnClear}
                  />
                </div>
              )}

              {isOpen && e.id === "notebook" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 10,
                  background: "var(--rj-app-bg-elevated)", border: "1px solid var(--rj-line-soft)",
                  fontSize: 11, color: "var(--rj-text-subtle)", lineHeight: 1.7,
                }}>
                  手稿已定：纸样 · 装饰（纽扣/绳结/丝带/麻绳/缝线）· 穿孔 · 插入图片 · 呈现方式。
                  <br />按顺序做到这一步时实现。
                </div>
              )}

              {isOpen && e.id === "path" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 10,
                  background: "var(--rj-app-bg-elevated)", border: "1px solid var(--rj-line-soft)",
                  fontSize: 11, color: "var(--rj-text-subtle)", lineHeight: 1.7,
                }}>
                  会员漫游页（优化版）已接入：3D 五条真实路径 —— 山谷 / 回旋 / 斜穿 / 大拱 / 波浪，
                  进入后可「✎ 画路径」编辑、自动漫游；左上角「‹ 返回苒境」随时回来。
                  非会员会先停在会员门槛，可顺着引导去开通。
                  <button
                    type="button"
                    onClick={() => onOpenRoam?.()}
                    style={{
                      marginTop: 8, width: "100%", height: 34, borderRadius: 9,
                      border: "1px solid var(--rj-line)", background: "var(--rj-surface-raised)",
                      color: "var(--rj-text)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >进入想象连接（漫游页）</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
