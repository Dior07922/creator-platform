// name=src/components/creation/CreationLocalRoom.tsx
import React, { useEffect, useRef, useState } from "react";
import { makeEmptyDoc } from "../../lib/documents";
import { loadLocalDoc, saveLocalDoc } from "../../lib/localDocuments";
import type { DocModel, Page, PageLink, ShapeKind, ShapeNode, TextNode, NoteNode, TableNode, LinkNode, Interaction } from "../../types/document";
import Editor from "./Editor";
import type { BrushParams } from "./Editor";
import {
  ObjectDrawer, ShapeDrawer,
  ColorDrawer, SpecDrawer, LockDrawer, FontDrawer,
  SaveDrawer,
  BRUSH_DEFAULTS,
} from "./CreationDrawer";
import PageSheet from "./PageSheet";
import { specScale } from "../../lib/paperSpecs";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import AssetBrowser from "./AssetBrowser";

type Props = { onBack?: () => void; initialText?: string; docKey?: string; onEnterSpace?: (spaceId: string) => void; isVip?: boolean; onUpgradeVip?: () => void; onSave?: () => void };

type SideKind = "lock" | "page" | "object" | "color" | "shape" | "font" | "spec" | "door" | "save";

const SIDE_ITEMS: { id: string; def: string; kind: SideKind }[] = [
  { id: "spec",   def: "规格", kind: "spec" },
  { id: "shape",  def: "笔",   kind: "shape" },
  { id: "color",  def: "色",   kind: "color" },
  { id: "font",   def: "字",   kind: "font" },
  { id: "page",   def: "页",   kind: "page" },
  { id: "lock",   def: "🔒",   kind: "lock" },
  { id: "save",   def: "存",   kind: "save" },
];

const LABELS_KEY = "ranjing.sideLabels";

function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mini-confirm-overlay">
      <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg">{message}</div>
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok" onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}

function RenameDialog({ initial, onConfirm, onCancel }: { initial: string; onConfirm: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="mini-confirm-overlay" onClick={onCancel}>
      <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg" style={{ marginBottom: 10 }}>改名</div>
        <input
          ref={ref}
          value={v}
          maxLength={6}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(v.trim() || initial);
            if (e.key === "Escape") onCancel();
          }}
          style={{
            width: "100%", height: 36, padding: "0 10px", boxSizing: "border-box",
            border: "1px solid rgba(74,70,63,.2)", borderRadius: 8,
            background: "#fff", color: "#3a352e", fontSize: 14, outline: "none",
            textAlign: "center", marginBottom: 14,
          }}
        />
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok" onClick={() => onConfirm(v.trim() || initial)}>确定</button>
        </div>
      </div>
    </div>
  );
}

function SideEntryButton({
  label, onClick, onRename,
}: { label: string; onClick: () => void; onRename: () => void }) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const movedRef = useRef(false);

  function down(e: React.PointerEvent) {
    firedRef.current = false;
    movedRef.current = false;
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) movedRef.current = true;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!movedRef.current) {
        firedRef.current = true;
        onRename();
      }
    }, 600);
  }
  function click(e: React.MouseEvent) {
    if (firedRef.current) { e.preventDefault(); e.stopPropagation(); firedRef.current = false; return; }
    onClick();
  }

  return (
    <button type="button" className="cd-side-entry" onPointerDown={down} onClick={click}>
      {label}
    </button>
  );
}

export default function CreationLocalRoom({ onBack, initialText, docKey, onEnterSpace, isVip, onUpgradeVip, onSave }: Props) {
  useEffect(() => {
    ScreenOrientation.unlock().catch(() => {});
    return () => { ScreenOrientation.unlock().catch(() => {}); };
  }, []);

  // 侧栏 Drawer 通用手势：跟手左滑收起 / 右滑展开（状态直接驱动 openDrawer，
  // 不靠 220ms 延迟合成点击 .cd-collapse-handle —— 那是 desync 的根源）。
  // 收起 = 面板完全滑出（translateX -110% + opacity 0），只露左侧收起把手。
  /* P0-10：侧抽屉拖动中的视觉反馈（面板跟随手指位移），拖动结束清空 */
  const [panelDrag, setPanelDrag] = useState<{ dx: number; closing: boolean } | null>(null);
  void panelDrag; /* 视觉位移由 DOM 直接驱动，state 仅作占位避免未用变量 */
  useEffect(() => {
    let dragging = false;
    let startX = 0;
    let panel: HTMLElement | null = null;
    let pid = -1;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // 展开态面板才允许拖；收起态（把手）是点击入口，不走拖动
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const p = target.closest(".cd-panel") as HTMLElement | null;
      if (!p) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      pid = e.pointerId;
      panel = p;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || !panel || e.pointerId !== pid) return;
      const dx = e.clientX - startX;
      if (!moved) {
        if (Math.abs(dx) < 8) return;
        moved = true;
        panel.style.transition = "none";
        try { panel.setPointerCapture(e.pointerId); } catch {}
      }
      e.preventDefault();
      // 左右都跟手：向左滑(dx<0)→收起；向右滑(dx>0)→展开
      const clamped = Math.min(0, Math.max(-400, dx)); // 只允许向左（收起方向）跟手
      panel.style.transform = `translateX(${clamped}px)`;
      panel.style.opacity = String(Math.max(0.25, 1 - Math.abs(clamped) / 400));
      setPanelDrag({ dx: clamped, closing: true });
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging || !panel || e.pointerId !== pid) return;
      const p = panel;
      const dx = e.clientX - startX;
      const closed = dx < -60; // 简单阈值：向左超过 60px → 收起
      p.style.transition = "transform 0.24s cubic-bezier(0.32,0.72,0,1), opacity 0.24s";
      if (closed) {
        p.style.transform = "translateX(-110%)";
        p.style.opacity = "0";
        setTimeout(() => {
          // 直接驱动 React 状态收起，不靠合成点击（避免 openDrawer 与 DOM desync）
          setOpenDrawer(null);
          p.style.transform = "";
          p.style.opacity = "";
          setPanelDrag(null);
        }, 220);
      } else {
        p.style.transform = "";
        p.style.opacity = "";
        setPanelDrag(null);
      }
      dragging = false;
      panel = null;
      pid = -1;
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);
  const DOC_ID = docKey || "default-doc";

  const [doc, setDoc] = useState<DocModel>(() => {
    const loaded = loadLocalDoc(DOC_ID);
    if (loaded) return loaded;
    const fresh = makeEmptyDoc(DOC_ID);
    if (initialText) {
      fresh.pages.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`,
        title: "白纸 1",
        content: initialText,
        texts: [],
        transform: { x: 0, y: 0, scale: 1, rotate: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return fresh;
  });

  const [currentPageId, setCurrentPageId] = useState<string>(() => doc.pages[0]?.id || "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  /* ── 连接（动作驱动）──────────────────────────────────────
     按手稿第十张的动作序列，做成四步状态机。
     状态放在这里而不是 PageSheet 里：连接动作要跨页进行
     （连接页面 → 承接页面 → 回连接页面），抽屉一开一合就会丢。
     「只高亮框选还不成线」—— 第 1 步选完不算完成，必须走完第 4 步。 */
  const [connMode, setConnMode] = useState<"phone" | "site" | "rig" | null>(null);
  const [connStage, setConnStage] = useState<"idle" | "pickSource" | "pickTargetPage" | "pickTargetObj" | "returnHome" | "done">("idle");
  const [connDraft, setConnDraft] = useState<{
    fromPageId?: string; fromElementId?: string; fromElementType?: string;
    toPageId?: string; toElementId?: string; toElementType?: string;
  }>({});

  /** 选模式：进入连接动作序列 */
  function changeConnMode(m: "phone" | "site" | "rig" | null) {
    setConnMode(m);
    if (m === "phone" || m === "site") {
      setConnDraft({});
      setConnStage("pickSource");
      /* ★ 选完模式必须关抽屉。不关的话抽屉盖在画布上，
         用户点不到起点对象 —— 连接就又变成「隔着抽屉点」了，
         而这正是这次要拆掉的东西。模式是入口，选完就走人。 */
      closeDrawer();
    } else {
      setConnStage("idle");
    }
  }

  /* 连接过程中的轻提示（1.8s 自隐） */
  const [connTip, setConnTip] = useState("");
  const connTipTimer = useRef<number | null>(null);
  function flashConnTip(msg: string) {
    setConnTip(msg);
    if (connTipTimer.current != null) window.clearTimeout(connTipTimer.current);
    connTipTimer.current = window.setTimeout(() => { connTipTimer.current = null; setConnTip(""); }, 1800);
  }
  useEffect(() => () => { if (connTipTimer.current != null) window.clearTimeout(connTipTimer.current); }, []);

  /* 闭环完成：亮一下「✓ 闭环完成」，然后自动退出连接模式 */
  useEffect(() => {
    if (connStage !== "done") return;
    const t = window.setTimeout(() => {
      setConnMode(null);
      setConnStage("idle");
      setConnDraft({});
    }, 1400);
    return () => window.clearTimeout(t);
  }, [connStage]);

  /* ★ 连接入口（长按弹窗里的「连接」）：
     长按的那个对象直接作为起点，进入连接模式后不必再点一次，
     这样整套动作刚好是【四个点击】完成闭环。
     不开抽屉 —— 连接是在画布上的几张纸之间直接点出来的。 */
  function startConnectFromObject(el: { type: string; id: string }) {
    if (!el?.id) return;
    if (doc.pages.length < 2) {
      flashConnTip("当前页数不足，需要 2 组才能开启连接");
      return;
    }
    setConnMode("phone");
    setConnDraft({ fromPageId: currentPageId, fromElementId: el.id, fromElementType: el.type });
    setConnStage("pickTargetPage");
    closeDrawer();
  }

  function cancelConnect() {
    setConnMode(null);
    setConnStage("idle");
    setConnDraft({});
  }

  /** 画布上点了对象（Editor 回调） */
  function onConnectPickObject(el: { type: string; id: string }) {
    if (connStage === "pickSource") {
      setConnDraft((d) => ({ ...d, fromPageId: currentPageId, fromElementId: el.id, fromElementType: el.type }));
      setConnStage("pickTargetPage");
      return;
    }
    if (connStage === "pickTargetObj") {
      setConnDraft((d) => ({ ...d, toElementId: el.id, toElementType: el.type }));
      setConnStage("returnHome");
    }
  }

  /** 页面列表被点了（返回 true = 这次点击被连接消费） */
  function onConnectPickPage(pageId: string): boolean {
    if (connStage === "pickTargetPage") {
      setConnDraft((d) => ({ ...d, toPageId: pageId }));
      setConnStage("pickTargetObj");
      setCurrentPageId(pageId);          // 切到承接页面
      return true;
    }
    if (connStage === "returnHome") {
      const from = connDraft.fromPageId;
      if (!from || pageId !== from) return false;   // 必须点回起始页
      /* 闭环：两边都接上了，写入连接 */
      const item: Interaction = {
        id: `ix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mode: connMode === "site" ? "site" : "phone",
        fromPageId: from,
        fromElementId: connDraft.fromElementId || "",
        fromElementType: connDraft.fromElementType || "note",
        toPageId: connDraft.toPageId || "",
        toElementId: connDraft.toElementId || "",
        toElementType: connDraft.toElementType || "note",
        createdAt: Date.now(),
      };
      applyDoc((prev) => ({ ...prev, interactions: [...(prev.interactions || []), item] }));
      setCurrentPageId(from);
      setConnStage("done");
      return true;
    }
    return false;
  }

  /** 当前该做的动作，人话提示（画布上的说法，不提抽屉/列表） */
  const connStepText =
    connStage === "pickSource"      ? "点你要作为起点的对象"
    : connStage === "pickTargetPage" ? "点延伸物那张纸"
    : connStage === "pickTargetObj"  ? "在延伸物里点一个连接对象"
    : connStage === "returnHome"     ? "点回连接页面"
    : connStage === "done"           ? "✓ 闭环完成"
    : "选一个模式开始";

  const _curPage = doc.pages.find((p) => p.id === currentPageId) || null;
  const paperColor = _curPage?.paperColor ?? "#ffffff";
  const paperAlpha = _curPage?.paperAlpha ?? 1;
  const [stageColor, setStageColor] = useState("#f8f5ef");
  const [stageAlpha, setStageAlpha] = useState(1);
  const [currentFont, setCurrentFont] = useState<string>('"Noto Sans SC", sans-serif');
  const [showAssets, setShowAssets] = useState(false);
  const [drawTool, setDrawTool] = useState<ShapeKind | null>(null);
  const [brush, setBrush] = useState<BrushParams>(() => ({ ...BRUSH_DEFAULTS }));

  const [elementConnectMode, setElementConnectMode] = useState(false);
  const [lassoMode, setLassoMode] = useState(false);
  const [sheetAction, setSheetAction] = useState<{ id: number; kind: string } | null>(null);
  const [editorHasSelection, setEditorHasSelection] = useState(false);

  function dispatchSheet(kind: string) {
    if (kind === "connect-toggle") {
      setElementConnectMode((v) => {
        const next = !v;
        return next;
      });
      return;
    }
    if (kind === "lasso-toggle") {
      setLassoMode((v) => !v);
      return;
    }
    setSheetAction({ id: Date.now() + Math.random(), kind });
  }

  const [openDrawer, setOpenDrawer] = useState<
    "page" | "object" | "shape" | "color" | "spec" | "lock" | "font" | "save" | null
  >(null);

  const [sideLabels, setSideLabels] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(LABELS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  });
  function labelOf(id: string, def: string) { return sideLabels[id] ?? def; }
  function setLabel(id: string, v: string) {
    setSideLabels((prev) => {
      const next = { ...prev, [id]: v };
      try { localStorage.setItem(LABELS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  function onSideAction(kind: SideKind) {
    switch (kind) {
      case "lock":   setOpenDrawer("lock"); break;
      case "page":   setOpenDrawer("page"); break;
      case "object":
        if (!isVip && onUpgradeVip) {
          onUpgradeVip();
          return;
        }
        setShowAssets(true);
        break;
      case "color":  setOpenDrawer("color"); break;
      case "shape":  setOpenDrawer("shape"); break;
      case "font":   setOpenDrawer("font"); break;
      case "spec":   setOpenDrawer("spec"); break;
      /* 「存」不再直接保存，改为打开存抽屉：保存 + 导出 SVG/PNG/透明 PNG */
      case "save":   setOpenDrawer("save"); break;
      case "door":
        // 不再弹 WindowDrawer，直接触发进入空间
        if (onEnterSpace) onEnterSpace("home");
        break;
    }
  }

  const [pageClipboard, setPageClipboard] = useState<Page | null>(null);
  const saveTimer = useRef<number | null>(null);

  function applyDoc(updater: (prev: DocModel) => DocModel) {
    setDoc((prev) => {
      const next = updater(prev);
      next.updatedAt = Date.now();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const ok = saveLocalDoc(next);
        if (ok) { setSaveStatus("saved"); setSaveError(null); }
        else { setSaveStatus("error"); setSaveError("本地保存失败（localStorage）"); }
      }, 600);
      return next;
    });
  }

  function findPage(id: string) { return doc.pages.find((p) => p.id === id) || null; }

  function setPaperColor(c: string) {
    applyDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === currentPageId ? { ...p, paperColor: c, updatedAt: Date.now() } : p
      ),
    }));
  }
  function setPaperAlpha(a: number) {
    applyDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === currentPageId ? { ...p, paperAlpha: a, updatedAt: Date.now() } : p
      ),
    }));
  }

  function setCurrentPageSpec(w: number, h: number) {
    applyDoc((prev) => {
      const stageW = typeof window !== "undefined" ? window.innerWidth : 800;
      const stageH = typeof window !== "undefined" ? window.innerHeight : 600;
      const s = specScale(w, h, stageW, stageH);
      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== targetId) return p;
          return {
            ...p,
            transform: { x: 0, y: 0, scale: s, rotate: 0 },
            paperW: w > 0 ? w : undefined,
            paperH: h > 0 ? h : undefined,
            updatedAt: Date.now(),
          };
        }),
      };
    });
  }

  function insertTextAtCenter(text: string) {
    applyDoc((prev) => {
      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== targetId) return p;
          const W = p.paperW ?? 400;
          const H = p.paperH ?? 400;
          const node: TextNode = {
            id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text,
            x: W / 2 - 40,
            y: H / 2 - 20,
            fontSize: 22,
            color: "#3a352e",
            layer: "paper",
            fontFamily: currentFont,
          };
          return { ...p, texts: [...(p.texts || []), node], updatedAt: Date.now() };
        }),
      };
    });
  }

  function insertShapeAtCenter(kind: ShapeKind) {
    if (kind === "eraser") return;
    applyDoc((prev) => {
      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== targetId) return p;
          const W = p.paperW ?? 400;
          const H = p.paperH ?? 400;
          const size = Math.min(W, H) * 0.4;
          const shape: ShapeNode = {
            id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind,
            layer: "paper",
            x1: W / 2 - size / 2,
            y1: H / 2 - size / 2,
            x2: W / 2 + size / 2,
            y2: H / 2 + size / 2,
            color: "#3a352e",
            strokeWidth: 2,
          };
          return { ...p, shapes: [...(p.shapes || []), shape], updatedAt: Date.now() };
        }),
      };
    });
  }

  function addNewPage(): boolean {
    if (doc.pages.length >= 30) { alert("最多 30 页"); return false; }
    const now = Date.now();
    const active = findPage(currentPageId) || doc.pages[doc.pages.length - 1];
    const stageRect = (typeof window !== "undefined") ? { w: window.innerWidth } : { w: 800 };
    const offsetX = active ? stageRect.w + 60 : 0;
    const baseX = active?.transform?.x ?? 0;
    const baseY = active?.transform?.y ?? 0;
    const page: Page = {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
      title: `白纸 ${doc.pages.length + 1}`,
      content: "",
      texts: [],
      transform: active ? { x: baseX + offsetX, y: baseY, scale: 1, rotate: 0 } : { x: 0, y: 0, scale: 1, rotate: 0 },
      createdAt: now, updatedAt: now,
      paperColor: "#ffffff", paperAlpha: 1,
    };
    applyDoc((prev) => ({ ...prev, pages: [...prev.pages, page] }));
    setCurrentPageId(page.id);
    return true;
  }

  function copyCurrentPage() {
    const cur = findPage(currentPageId);
    if (!cur) return;
    setPageClipboard(JSON.parse(JSON.stringify(cur)));
  }

  function pastePageAt(localX: number, localY: number) {
    if (!pageClipboard) return;
    if (doc.pages.length >= 30) { alert("最多 30 页"); return; }
    const sr = { w: window.innerWidth, h: window.innerHeight };
    const now = Date.now();
    const newId = crypto.randomUUID ? crypto.randomUUID() : `p-${now}`;
    const clonedTexts = (pageClipboard.texts || [])
      .map((t) => ({ ...t, id: `t-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const clonedShapes = (pageClipboard.shapes || [])
      .map((s) => ({ ...s, id: `s-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const newPage: Page = {
      id: newId,
      title: `${pageClipboard.title || "白纸"} 副本`,
      content: pageClipboard.content || "",
      texts: clonedTexts,
      shapes: clonedShapes,
      transform: {
        x: localX - sr.w / 2, y: localY - sr.h / 2,
        scale: pageClipboard.transform?.scale ?? 1,
        rotate: pageClipboard.transform?.rotate ?? 0,
      },
      createdAt: now, updatedAt: now,
      groups: undefined,
      paperColor: pageClipboard.paperColor ?? "#ffffff",
      paperAlpha: pageClipboard.paperAlpha ?? 1,
    };
    if (pageClipboard.paperW && pageClipboard.paperH) {
      newPage.paperW = pageClipboard.paperW;
      newPage.paperH = pageClipboard.paperH;
    }
    applyDoc((prev) => ({ ...prev, pages: [...prev.pages, newPage] }));
    setCurrentPageId(newId);
  }

  function duplicatePage(pageId: string) {
    const src = findPage(pageId);
    if (!src) return;
    if (doc.pages.length >= 30) { alert("最多 30 页"); return; }
    const now = Date.now();
    const newId = crypto.randomUUID ? crypto.randomUUID() : `p-${now}`;
    const clonedTexts = (src.texts || [])
      .map((t) => ({ ...t, id: `t-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const clonedShapes = (src.shapes || [])
      .map((s) => ({ ...s, id: `s-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const newPage: Page = {
      id: newId,
      title: `${src.title || "白纸"} 副本`,
      content: src.content || "",
      texts: clonedTexts,
      shapes: clonedShapes,
      transform: { ...(src.transform || { x: 0, y: 0, scale: 1, rotate: 0 }) },
      createdAt: now, updatedAt: now,
      groups: undefined,
      paperColor: src.paperColor ?? "#ffffff",
      paperAlpha: src.paperAlpha ?? 1,
    };
    if (src.paperW && src.paperH) {
      newPage.paperW = src.paperW;
      newPage.paperH = src.paperH;
    }
    applyDoc((prev) => {
      const idx = prev.pages.findIndex((p) => p.id === pageId);
      const pages = prev.pages.slice();
      pages.splice(idx < 0 ? pages.length : idx + 1, 0, newPage);
      return { ...prev, pages };
    });
    setCurrentPageId(newId);
  }

  function requestDeletePage(pageId: string) {
    const page = findPage(pageId);
    if (!page) return;
    setConfirmState({
      message: `确认删除页面 "${page.title}" 吗？（删除后不可恢复）`,
      onConfirm: () => { setConfirmState(null); deletePage(pageId); },
    });
  }

  function renamePage(id: string, title: string) {
    applyDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => p.id === id ? { ...p, title, updatedAt: Date.now() } : p),
    }));
  }

  function deletePage(pageId: string) {
    applyDoc((prev) => {
      const pages = prev.pages.filter((p) => p.id !== pageId);
      const links = prev.links.filter((l) => l.from !== pageId && l.to !== pageId);
      return { ...prev, pages, links };
    });
    if (currentPageId === pageId) {
      const rest = doc.pages.filter((p) => p.id !== pageId);
      setCurrentPageId(rest[0]?.id || "");
    }
  }

  /* 跳转锚点（第 3 层）：本页 → 目标页 的 flow 关系 */
  function onJumpAnchor(toPageId: string, relType?: string) {
    if (toPageId === currentPageId) return;
    applyDoc((prev) => {
      const exists = prev.links.find((l) => l.from === currentPageId && l.to === toPageId);
      if (exists) return prev;
      const link: PageLink = { from: currentPageId, to: toPageId, createdAt: Date.now(), relType: relType as any };
      return { ...prev, links: [...prev.links, link] };
    });
  }

  useEffect(() => {
    if (!loadLocalDoc(doc.id)) saveLocalDoc(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    if (doc.pages.length === 0) {
      const now = Date.now();
      const newPage: Page = {
        id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
        title: "白纸 1",
        content: "",
        texts: [],
        transform: { x: 0, y: 0, scale: 1, rotate: 0 },
        createdAt: now, updatedAt: now,
        paperColor: "#ffffff", paperAlpha: 1,
      };
      applyDoc((prev) => ({ ...prev, pages: [newPage] }));
      setCurrentPageId(newPage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.pages.length]);

  useEffect(() => {
    if (!currentPageId && doc.pages.length) setCurrentPageId(doc.pages[0].id);
    if (!doc.pages.find((p) => p.id === currentPageId)) setCurrentPageId(doc.pages[0]?.id || "");
  }, [doc.pages, currentPageId]);

  const currentPage = doc.pages.find((p) => p.id === currentPageId) || null;
  const closeDrawer = () => setOpenDrawer(null);

  const editorKey = currentPage
    ? `${currentPage.id}_${currentPage.paperW ?? 0}x${currentPage.paperH ?? 0}`
    : "none";

  return (
    <div className="creation-room" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#f8f5ef" }}>
      <main style={{ position: "absolute", inset: 0, display: "flex" }}>
        {currentPage && (
          <Editor
            key={editorKey}
            page={currentPage}
            allPages={doc.pages}
            pageLinks={doc.links}
            onUpdate={(patch) => {
              applyDoc((prev) => ({
                ...prev,
                pages: prev.pages.map((p) =>
                  p.id === currentPageId ? { ...p, ...patch, updatedAt: Date.now() } : p
                ),
              }));
            }}
            onSelectPage={(id) => setCurrentPageId(id)}
            onCopyPage={copyCurrentPage}
            onPastePage={pastePageAt}
            onUpdatePageTransform={(pid, tr) => {
              applyDoc((prev) => ({
                ...prev,
                pages: prev.pages.map((p) =>
                  p.id === pid ? { ...p, transform: tr, updatedAt: Date.now() } : p
                ),
              }));
            }}
            hasClipboard={!!pageClipboard}
            /* 连接动作进行到"该选对象"的两步时，画布上的点击变成拾取对象 */
            connectPicking={connStage === "pickSource" || connStage === "pickTargetObj"}
            onConnectPickObject={onConnectPickObject}
            onStartConnect={startConnectFromObject}
            /* 连接模式 = 纸排开 + 其他纸可点，全程在画布上完成，不经过抽屉 */
            connectArrange={connMode !== null && connStage !== "idle"}
            onPaperPick={
              connStage === "pickTargetPage" || connStage === "returnHome"
                ? (pid) => {
                    if (!onConnectPickPage(pid)) flashConnTip("要闭环，得点回刚才那张纸");
                  }
                : undefined
            }
            interactions={doc.interactions || []}
            connectDraft={connDraft}
            connectDone={connStage === "done"}
            onDeletePage={() => { if (doc.pages.length > 1) deletePage(currentPageId); }}
            paperColor={paperColor}
            paperAlpha={paperAlpha}
            stageColor={stageColor}
            stageAlpha={stageAlpha}
            currentFont={currentFont}
            drawTool={drawTool}
            onDrawToolConsumed={() => setDrawTool(null)}
            onDrawToolChange={(k) => setDrawTool(k)}
            elementConnectMode={elementConnectMode}
            lassoMode={lassoMode}
            onToggleConnect={() => setElementConnectMode((v) => !v)}
            onToggleLasso={() => setLassoMode((v) => !v)}
            onSelectionChange={setEditorHasSelection}
            sheetAction={sheetAction}
            brush={brush}
            onJumpAnchor={onJumpAnchor}
          />
        )}
      </main>

      {openDrawer === null && (
        <div className="cd-side-entries">
          {SIDE_ITEMS.map((it) => {
            if (it.id === "door") {
              return (
                <button
                  key={it.id}
                  type="button"
                  className="cd-side-entry" onClick={() => onSideAction(it.kind)} aria-label="门"
                >
                  {/* 替换掉原来那两个 span 拼接的简陋方块，换成这个 SVG */}
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ writingMode: "horizontal-tb" }}>
                {/* 胖拱门主体 */}
                <path d="M2 20V8C2 3.58172 5.58172 0 10 0C14.4183 0 18 3.58172 18 8V20Z" stroke="#C9A87C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                {/* 门缝（比中线略偏，显得门更厚） */}
                <line x1="10" y1="0" x2="10" y2="20" stroke="#C9A87C" strokeWidth="0.8"/>
                {/* 门环 */}
                <circle cx="7" cy="11" r="1" fill="#C9A87C"/>
                <circle cx="13" cy="11" r="1" fill="#C9A87C"/>
              </svg>
                </button>
              );
            }
            return (
              <SideEntryButton
                key={it.id}
                label={labelOf(it.id, it.def)}
                onClick={() => onSideAction(it.kind)}
                onRename={() => setRenaming({ id: it.id, label: labelOf(it.id, it.def) })}
              />
            );
          })}
              {/* 裸门：无卡片、无边框、透明，只保留金色拱门 */}
      <button
        type="button"
        onClick={() => onSideAction("door")}
        aria-label="门"
        style={{
          width: 44, height: 56,
          marginLeft: 0,
          marginTop: 20,
          background: "transparent",
          border: 0, outline: 0,
          boxShadow: "none",
          padding: 0, margin: 0,
          display: "flex", alignItems: "center", justifyContent: "flex-start", paddingLeft: 6, cursor: "pointer", flex: "none",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 20V8C2 3.58172 5.58172 0 10 0C14.4183 0 18 3.58172 18 8V20Z" stroke="#C9A87C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <line x1="10" y1="0" x2="10" y2="20" stroke="#C9A87C" strokeWidth="0.8"/>
          <circle cx="7" cy="11" r="1" fill="#C9A87C"/>
          <circle cx="13" cy="11" r="1" fill="#C9A87C"/>
        </svg>
      </button></div>
      )}

      {openDrawer === "page" && (
        <PageSheet
          pages={doc.pages}
          currentPageId={currentPageId}
          links={doc.links}
          onSelectPage={(id) => { setCurrentPageId(id); closeDrawer(); }}
          onAddPage={() => { addNewPage(); }}
          onDeletePage={(id) => requestDeletePage(id)}
          onRenamePage={(id, title) => renamePage(id, title)}
          onDuplicatePage={(id) => duplicatePage(id)}
          onExit={() => onBack && onBack()}
          onClose={closeDrawer}
          dispatchAction={dispatchSheet}
          connectMode={connMode}
          onConnectModeChange={changeConnMode}
          connectStage={connStage}
          connectStepText={connStepText}
          connectDone={connStage === "done"}
          onConnectCancel={cancelConnect}
          onConnectPickPage={onConnectPickPage}
          hasSelection={editorHasSelection}
          framesCount={(currentPage as any)?.frames?.length || 0}
          speedActive={(window as any).__ranjingPerfSpeed === 1400 ? "slow"
            : (window as any).__ranjingPerfSpeed === 450 ? "fast"
            : (window as any).__ranjingPerfSpeed === 800 ? "mid" : null}
        />
      )}
      {openDrawer === "object" && <ObjectDrawer onClose={closeDrawer} />}
      {openDrawer === "save" && (
        <SaveDrawer
          onClose={closeDrawer}
          onSave={onSave}
          getDoc={() => doc}
          onRestore={(restored) => {
            /* 整体替换文档；快照里已带全部页面，所以顺带把当前页指到第一页，
               避免停留在已被覆盖掉的页 id 上导致画布空掉 */
            applyDoc(() => restored);
            setCurrentPageId(restored.pages?.[0]?.id || "");
          }}
        />
      )}
      {openDrawer === "shape" && (
        <ShapeDrawer
          onClose={closeDrawer}
          onPickTool={(kind) => { setDrawTool(kind); }}
          onInsertText={(text) => { insertTextAtCenter(text); closeDrawer(); }}
          onInsertShape={(kind) => { insertShapeAtCenter(kind); closeDrawer(); }}
          brush={brush}
          onBrushChange={(patch) => setBrush((b) => ({ ...b, ...patch }))}
        />
      )}
      {openDrawer === "color" && (
        <ColorDrawer
          paperColor={paperColor}
          paperAlpha={paperAlpha}
          stageColor={stageColor}
          stageAlpha={stageAlpha}
          onPaperColorChange={setPaperColor}
          onPaperAlphaChange={setPaperAlpha}
          onStageColorChange={setStageColor}
          onStageAlphaChange={setStageAlpha}
          onPicked={closeDrawer}
          onClose={closeDrawer}
        />
      )}
      {openDrawer === "font" && (
        <FontDrawer
          currentFont={currentFont}
          onFontChange={setCurrentFont}
          onPicked={closeDrawer}
          onClose={closeDrawer}
        />
      )}
      {openDrawer === "spec" && (
        <SpecDrawer
          onClose={closeDrawer}
          onPicked={(w, h) => { setCurrentPageSpec(w, h); closeDrawer(); }}
        />
      )}
      {openDrawer === "lock" && (
        <LockDrawer onClose={closeDrawer} onPicked={closeDrawer} />
      )}

      {/* ★ 连接模式提示条：画在画布上，不依赖抽屉 ——
          连接是在面前的几张纸之间点出来的，指引必须一直看得见。 */}
      {connMode && (connMode === "phone" || connMode === "site") && connStage !== "idle" && (
        <div style={{
          position: "absolute", left: "50%", top: 16, transform: "translateX(-50%)",
          zIndex: 3001, display: "flex", alignItems: "center", gap: 10,
          padding: "9px 10px 9px 16px", borderRadius: 999,
          background: connStage === "done" ? "rgba(63,92,51,.95)" : "rgba(58,53,46,.94)",
          color: "#fffdfa", fontSize: 12.5, letterSpacing: ".03em",
          boxShadow: "0 6px 22px rgba(0,0,0,.24)", whiteSpace: "nowrap",
        }}>
          <span>{connStepText}</span>
          <button
            type="button"
            onClick={cancelConnect}
            style={{
              border: 0, borderRadius: 999, padding: "4px 10px",
              background: "rgba(255,255,255,.16)", color: "#fffdfa",
              fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}
          >{connStage === "done" ? "知道了" : "取消"}</button>
        </div>
      )}

      {connTip && (
        <div style={{
          position: "absolute", left: "50%", top: 72, transform: "translateX(-50%)",
          zIndex: 3000, padding: "10px 18px", borderRadius: 10,
          background: "rgba(58,53,46,.94)", color: "#fffdfa",
          fontSize: 13, letterSpacing: ".04em", whiteSpace: "nowrap",
          boxShadow: "0 6px 20px rgba(0,0,0,.22)",
          pointerEvents: "none",
        }}>{connTip}</div>
      )}

      {confirmState && (
        <Confirm message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />
      )}

      {renaming && (
        <RenameDialog
          initial={renaming.label}
          onConfirm={(v) => { setLabel(renaming.id, v); setRenaming(null); }}
          onCancel={() => setRenaming(null)}
        />
      )}

      <div style={{ position: "absolute", right: 18, bottom: 18, zIndex: 1600 }}>
        {saveStatus === "error" && (
          <div style={{ background: "#ffecee", color: "#a06f64", padding: 8, borderRadius: 8 }}>{saveError}</div>
        )}
      </div>

      {showAssets && (
        <AssetBrowser
          onClose={() => setShowAssets(false)}
          onPick={(a) => {
            // 插入图片
            applyDoc((prev) => {
              const targetId = currentPageId || (prev.pages[0]?.id ?? "");
              return {
                ...prev,
                pages: prev.pages.map((p) => {
                  if (p.id !== targetId) return p;
                  const W = p.paperW ?? 400;
                  const H = p.paperH ?? 400;
                  const sc = Math.min((W * 0.6) / a.w, (H * 0.6) / a.h, 1);
                  const w = a.w * sc, h = a.h * sc;
                  return {
                    ...p,
                    images: [...(p.images || []), {
                      id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      src: a.src,
                      x: (W - w) / 2, y: (H - h) / 2,
                      w, h, layer: "paper",
                    }],
                    updatedAt: Date.now(),
                  };
                }),
              };
            });
            setShowAssets(false);
          }}
          onAction={(action) => {
            if (action === "photo" || action === "camera" || action === "file") {
              const input = document.createElement("input");
              input.type = "file";
              if (action !== "file") input.accept = "image/*";
              if (action === "camera") input.setAttribute("capture", "environment");
              input.onchange = () => {
                const f = input.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const src = reader.result as string;
                  const img = new Image();
                  img.onload = () => {
                    const natW = img.naturalWidth || 600;
                    const natH = img.naturalHeight || 400;
                    applyDoc((prev) => {
                      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                      return {
                        ...prev,
                        pages: prev.pages.map((p) => {
                          if (p.id !== targetId) return p;
                          const W = p.paperW ?? 400;
                          const H = p.paperH ?? 400;
                          const sc = Math.min((W * 0.6) / natW, (H * 0.6) / natH, 1);
                          const w = natW * sc, h = natH * sc;
                          return {
                            ...p,
                            images: [...(p.images || []), {
                              id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                              src, x: (W - w) / 2, y: (H - h) / 2, w, h, layer: "paper",
                            }],
                            updatedAt: Date.now(),
                          };
                        }),
                      };
                    });
                  };
                  img.src = src;
                };
                reader.readAsDataURL(f);
              };
              input.click();
              setShowAssets(false);
              return;
            }
            if (action === "note") {
              applyDoc((prev) => {
                const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                return {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== targetId) return p;
                    const W = p.paperW ?? 400;
                    const H = p.paperH ?? 400;
                    const w = Math.min(220, W * 0.5);
                    const h = Math.min(160, H * 0.4);
                    return {
                      ...p,
                      notes: [...(p.notes || []), {
                        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        text: "便签",
                        x: (W - w) / 2, y: (H - h) / 2, w, h,
                        bgColor: "#fde8a8", textColor: "#5a4520", fontSize: 14,
                        layer: "paper",
                      }],
                      updatedAt: Date.now(),
                    };
                  }),
                };
              });
              setShowAssets(false);
              return;
            }
            if (action === "table") {
              applyDoc((prev) => {
                const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                return {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== targetId) return p;
                    const W = p.paperW ?? 400;
                    const H = p.paperH ?? 400;
                    const rows = 3, cols = 3;
                    const w = Math.min(360, W * 0.7);
                    const h = Math.min(240, H * 0.5);
                    return {
                      ...p,
                      tables: [...(p.tables || []), {
                        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        rows, cols,
                        x: (W - w) / 2, y: (H - h) / 2, w, h,
                        cells: Array.from({ length: rows }).map(() => Array.from({ length: cols }).map(() => "")),
                        layer: "paper",
                      }],
                      updatedAt: Date.now(),
                    };
                  }),
                };
              });
              setShowAssets(false);
              return;
            }
            if (action === "link") {
              const url = window.prompt("输入链接地址", "https://");
              if (!url || url === "https://") { setShowAssets(false); return; }
              applyDoc((prev) => {
                const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                return {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== targetId) return p;
                    const W = p.paperW ?? 400;
                    const H = p.paperH ?? 400;
                    const w = Math.min(280, W * 0.7);
                    const h = 60;
                    return {
                      ...p,
                      links: [...(p.links || []), {
                        id: `lk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        url, title: url.replace(/^https?:\/\//, "").split("/")[0],
                        x: (W - w) / 2, y: (H - h) / 2, w, h,
                        layer: "paper",
                      }],
                      updatedAt: Date.now(),
                    };
                  }),
                };
              });
              setShowAssets(false);
              return;
            }
          }}
        />
      )}
    </div>
  );
}
