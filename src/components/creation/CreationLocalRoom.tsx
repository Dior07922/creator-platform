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

/** 演示态「左边缘往右滑」的方向提示播过没有（只播一次） */
const DEMO_HINT_KEY = "ranjing.demoRailHintPlayed";


const SIDE_ITEMS: { id: string; def: string; kind: SideKind }[] = [
  { id: "spec",   def: "规格", kind: "spec" },
  { id: "shape",  def: "笔",   kind: "shape" },
  { id: "color",  def: "色",   kind: "color" },
  { id: "font",   def: "字",   kind: "font" },
  { id: "page",   def: "页",   kind: "page" },
  { id: "lock",   def: "锁",   kind: "lock" },
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
            background: "#fff", color: "#1E1C19", fontSize: 14, outline: "none",
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
  label, onClick, onRename, cls, glyph, style,
}: { label: string; onClick: () => void; onRename: () => void; cls: string; glyph?: React.ReactNode; style?: React.CSSProperties }) {
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
    <button type="button" className={cls} style={style} onPointerDown={down} onClick={click}>
      {glyph ? <span className="cd-branch-item-glyph">{glyph}</span> : null}
      <span>{label}</span>
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
  const [connMode, setConnMode] = useState<"phone" | "site" | null>(null);
  const [connStage, setConnStage] = useState<"idle" | "pickSource" | "pickTargetPage" | "pickTargetObj" | "returnHome" | "done">("idle");
  const [connDraft, setConnDraft] = useState<{
    fromPageId?: string; fromElementId?: string; fromElementType?: string;
    toPageId?: string; toElementId?: string; toElementType?: string;
  }>({});

  /** 选模式：进入连接动作序列 */
  function changeConnMode(m: "phone" | "site" | null) {
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

  /* ★ 原来这里有个 flashConnTip（临时弹一句字）。
     删掉：动作的反馈就是动作的结果本身 ——
     点错了不会发生任何事（线不长、框不亮），这就是手稿写的
     「框没完整包住任何对象 → 框不成型（无效）」。不靠字幕提示对错。 */



  /* ★ 闭环之后【不退出】—— 这里原来是 1.4 秒后把连接模式清掉，等于刚闭环就把线收了。
     手稿第三张：「单线不实现跳转，闭环产生才开始跳转。」
     闭环的那一刻就是「设置完成」，同一个画布立刻进入运行态：
     点对象直接跳过去（见 Editor 的 connectRun 分支）。
     要退出运行态走抽屉里的「取消连接」。 */

  /* 运行态的来路：跳过去之后，返回键按原路一步步退回来。
     手稿第五张：「点击返回按键直接回到我的页面」。 */
  /* ══ ★ 演示模式（固定视口）════════════════════════════════════════
     用户 2026-09-26 定的三个模式边界：
       · 普通创作 = 只管编辑和选择，点对象**不跳转**
       · 连接模式 = 只建立关系，不动纸张位置
       · 演示     = 固定视口、一次一页，**只有这时**点已连接的对象才整屏跳
     所以跳转不再是"连接一建好就常驻"，而是**进入演示后才有**。
     演示不写回任何纸张坐标；退出演示回到进演示时那一页，画布原样。 */
  const [demoOn, setDemoOn] = useState(false);
  const demoRootRef = useRef<string>("");

  /* ★ 演示态：左侧工具栏默认【收进屏幕左边外面】。
     用户 2026-09-26：「规格里面的纸都要按照真实的尺寸去做，对标」+「演示的时候该收的收」——
     屏幕就那么宽，纸按真实尺寸铺满屏，屏上任何浮着的东西都会压住它；
     所以让位的是工具栏，不是纸：平时收起来（纸零遮挡），
     手指从左边缘往右扫一下滑出来（Editor 的 edgeSwipe），用完关掉抽屉自己收回去。 */
  const [demoRailOut, setDemoRailOut] = useState(false);

  /* ★ 首次进演示才播一次的方向提示（小箭头往右轻推一下）。
     存一个本地标记，播过就不再播 —— 「首次动画只播放一次，不重复打扰用户」。
     读不到 localStorage（隐私模式）就当已经播过，宁可不播也不重复弹。 */
  const [demoHint, setDemoHint] = useState(false);
  useEffect(() => {
    if (!demoOn) { setDemoHint(false); return; }
    let played = true;
    try { played = localStorage.getItem(DEMO_HINT_KEY) === "1"; } catch { played = true; }
    if (played) return;
    try { localStorage.setItem(DEMO_HINT_KEY, "1"); } catch { /* 存不了也照播这一回 */ }
    setDemoHint(true);
    const t = window.setTimeout(() => setDemoHint(false), 2600);
    return () => window.clearTimeout(t);
  }, [demoOn]);


  function enterDemo() {
    if (!(doc.interactions || []).length) return;   /* 没有连接就没什么可演示的，不弹字 */
    demoRootRef.current = currentPageId;
    setDemoOn(true);
    setDemoRailOut(false);   /* 进演示：工具栏就是收着的 */
    closeDrawer();
  }
  function exitDemo() {
    setDemoOn(false);
    setDemoRailOut(false);
    if (demoRootRef.current) setCurrentPageId(demoRootRef.current);
    demoRootRef.current = "";
  }

  /** ★ 演示里：点中有连接的对象 → 整个页面切过去（不显示连线过程、不弹字）。
      手稿第五张：「点击对象，不显示连接线的过程，而是直接跳转到页面。」
      「它整个页面是切过去，而不是跳转到莫名其妙页面」。 */
  function connJump(ix: Interaction) {
    setCurrentPageId(ix.toPageId);
  }

  /** ★ 演示里点了【创作者指定的返程对象】→ 按那条记录回到它的起页。
      这是第十张第③步选的那个对象，**不是**系统的默认返回按钮。 */
  function connJumpBack(ix: Interaction) {
    setCurrentPageId(ix.fromPageId);
  }

  /* ★ 连接入口（长按弹窗里的「连接」）：
     长按的那个对象直接作为起点，进入连接模式后不必再点一次，
     这样整套动作刚好是【四个点击】完成闭环。
     不开抽屉 —— 连接是在画布上的几张纸之间直接点出来的。 */
  function startConnectFromObject(el: { type: string; id: string }) {
    if (!el?.id) return;
    /* 页数不够就【不开启】—— 无效的动作就是不发生，不弹一个字。
       （手稿：「框没完整包住任何对象 → 框不成型（无效）」是同一个规矩。） */
    if (doc.pages.length < 2) return;
    setConnMode("phone");
    setConnDraft({ fromPageId: currentPageId, fromElementId: el.id, fromElementType: el.type });
    setConnStage("pickTargetPage");
    closeDrawer();
  }

  function cancelConnect() {
    setConnMode(null);
    setConnStage("idle");
    setConnDraft({});
    /* (connArrival 已删除 —— 返回不再走系统记录，演示里只靠创作者指定的返程对象) */
  }

  /* ══ 连接记录的删/撤 ═══════════════════════════════════════════════
     以前这里只有"加一条"（走完四步那时）。删不掉 → 上次测试留下的连接一直堆着，
     新的测试根本没法做（用户原话：删不掉又点不了）。下面三个是唯一的删入口：
       · deleteInteraction —— 删掉一条（点那条线、或长按对象列出来的那一条）
       · undoLastInteraction —— 撤销刚建的那一条
       · clearInteractions —— 一口清光（旧数据一键扫干净） */
  function deleteInteraction(id: string) {
    applyDoc((prev) => ({ ...prev, interactions: (prev.interactions || []).filter((x) => x.id !== id) }));
    /* 反馈就是"那条线没了"本身，不再弹字。 */
  }
  function undoLastInteraction() {
    applyDoc((prev) => {
      const list = prev.interactions || [];
      if (!list.length) return prev;
      const last = list.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
      return { ...prev, interactions: list.filter((x) => x.id !== last.id) };
    });
  }
  function clearInteractions() {
    applyDoc((prev) => ({ ...prev, interactions: [] }));
  }

  /** 画布上点了对象（Editor 回调） */
  /* ★ pageId：这一下点在【哪张纸】上（不传就是当前纸）。
     用户 2026-09-26：「进入连接页面，没有任何阻碍去妨碍用户随意挑选点击；
     用户点击谁就是谁，点击谁就是连接的开头」「不允许出现左边点不了右边点，
     而是都可以点，只要用户点，你就记住路线」——
     所以起点/返程对象都按"点中的那个对象所在的那张纸"记，不再强制当前纸。 */
  function onConnectPickObject(el: { type: string; id: string }, pageId?: string) {
    const pid = pageId || currentPageId;
    if (connStage === "pickSource") {
      setConnDraft((d) => ({ ...d, fromPageId: pid, fromElementId: el.id, fromElementType: el.type }));
      setConnStage("pickTargetPage");
      return;
    }
    if (connStage === "pickTargetObj") {
      setConnDraft((d) => ({ ...d, toPageId: pid, toElementId: el.id, toElementType: el.type }));
      setConnStage("returnHome");
      return;
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
  const [stageColor, setStageColor] = useState("#F4F2EE");
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
  /* ★ 分支菜单：收起时侧边栏只有一个「点」，点开长出枝条。
     选中任意一项、或抽屉一打开，就自动收回。 */
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => { if (openDrawer !== null) setRailOpen(false); }, [openDrawer]);

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
            color: "#1E1C19",
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
            color: "#1E1C19",
            strokeWidth: 2,
          };
          return { ...p, shapes: [...(p.shapes || []), shape], updatedAt: Date.now() };
        }),
      };
    });
  }



  /* ★ 这里原来有一条"按键加页/复制/粘贴时，把镜头拉远到看得见所有纸"。
     已删除：用户 2026-09-26「不跟随其他纸！！！」——
     那一下会把屏幕上【所有】纸一起缩小挪位，正是"跟随"最刺眼的表现。
     现在加页不改变画面上的任何一张纸；新纸直接落在你正看的地方。 */
  /** ★ 复制 / 粘贴出来的新纸落在哪 —— **你手指点在哪，纸就在哪**。
      用户 2026-09-26：「我复制纸，我去到哪粘贴，纸就在哪」。
      以前拿"被复制那张纸"的坐标算，那张纸一挪一缩放，贴出来的位置就跟着变
      ——「新页非要跟随？？」。现在只看你按下的那个点，不认任何一张已有的纸。
      （画布坐标 = 屏幕坐标 − 屏幕中心：纸心就是落点） */
  function newPaperHome(sx?: number, sy?: number): { x: number; y: number } {
    const sw = typeof window !== "undefined" ? window.innerWidth : 390;
    const sh = typeof window !== "undefined" ? window.innerHeight : 844;
    return {
      x: (typeof sx === "number" ? sx : sw / 2) - sw / 2,
      y: (typeof sy === "number" ? sy : sh / 2) - sh / 2,
    };
  }

  function addNewPage(): boolean {
    if (doc.pages.length >= 30) { alert("最多 30 页"); return false; }
    const now = Date.now();
    const page: Page = {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
      title: `白纸 ${doc.pages.length + 1}`,
      content: "",
      texts: [],
      /* ★ 新增页：就叠在【第一张纸】上，跟它同一个位置。
         用户 2026-09-26：「除非我点击新增页面，就在第一张纸同样的叠着，我从它那挪出来就行」。
         落点只认第一张纸 —— 不认当前纸、不认画布最右边、不认你人在哪。 */
      transform: { x: doc.pages[0]?.transform?.x ?? 0, y: doc.pages[0]?.transform?.y ?? 0, scale: 1, rotate: 0 },
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
      /* ★ 落点 = 你按下"粘贴"的那个点（手指在哪，纸就在哪）；尺寸/旋转不继承任何纸 */
      transform: { ...newPaperHome(localX, localY), scale: 1, rotate: 0 },
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
      /* ★ 独立个体：落点、尺寸、旋转都不从源页继承（照抄坐标会精确重叠、"黏一块"） */
      transform: { ...newPaperHome(), scale: 1, rotate: 0 },
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
      onConfirm: () => {
        setConfirmState(null);
        deletePage(pageId);
      },
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
  /* 关抽屉时，演示态那条滑出来的工具栏也一起收回去 ——
     「用完关掉抽屉，它自己收回去」。非演示态不受影响。 */
  const closeDrawer = () => { setOpenDrawer(null); setDemoRailOut(false); };

  const editorKey = currentPage
    ? `${currentPage.id}_${currentPage.paperW ?? 0}x${currentPage.paperH ?? 0}`
    : "none";

  return (
    <div className="creation-room" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#F4F2EE" }}>
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
            /* ★ 演示里【不拾取】。演示是独立模式，不是"接着搭"。
               实测过的坑：▶ 演示 按钮只有选了「① 手机模式」才出现，而选模式会把
               connStage 置成 pickSource —— 于是进演示后拾取还开着，
               Editor 里拾取分支排在跳转分支前面，把用户点对象的【第一下】吃掉了
               （实测：第一下没反应、第二下才跳）。这里一句掐掉。 */
            connectPicking={!demoOn && (connStage === "pickSource" || connStage === "pickTargetObj")}
            onConnectPickObject={onConnectPickObject}
            onStartConnect={startConnectFromObject}
            /* 连接模式 = 纸排开 + 其他纸可点，全程在画布上完成，不经过抽屉。
               ★ 闭环之后（done）要【收起排开】：运行态的体验是「整个页面切过去」，
               不是几张纸并排摆着。 */
            /* ★★ 连接模式下【别的纸全程可点】—— 不再只在"选承接页/闭环"那两个阶段开。
               原来只在 pickTargetPage / returnHome 传下去，于是 pickSource（刚进连接模式）
               和 pickTargetObj 这两步里，别的纸是【关着的】：那一下直接落到画布上、
               在当前纸里找不到人 → 什么都不发生。实测：
                 · 点当前纸上的对象 → 高亮框 1（有反应）
                 · 点别的纸上的对象 → 高亮框 0（完全失灵）
               用户 2026-09-26 定死：「不允许出现左边点不了右边点，而是都可以点，
               只要用户点，你就记住路线」。所以整个连接模式都开着。
               点下去之后：先在那张纸的坐标系里命中对象 → 命中就按"点对象"，
               没命中才按"点这张纸"（这层判断在 Editor 里）。 */
            onPaperPick={
              connMode === "phone" || connMode === "site"
                /* 点错纸 → 线不长出来、闭环不成立。这就是反馈，不弹字。 */
                ? (pid) => { onConnectPickPage(pid); }
                : undefined
            }
            interactions={doc.interactions || []}
            onDeleteInteraction={deleteInteraction}
            connectDraft={connDraft}
            connectDone={connStage === "done"}
            /* ★ 三个模式互相独立（用户 2026-09-26 定的边界）：
               · 普通创作：点对象**只负责选中/编辑**，绝不跳转
               · 连接模式：只建立关系，不动任何纸张位置
               · 演示：固定视口、一次一页，**只有这时点已连接的对象才跳**
               所以 connectRun 现在只有一个来源：演示模式。 */
            connectRun={demoOn}
            demoOn={demoOn}
            /* ★ 抽屉面板开着 = 正在做功能性工作 → 画布禁止弹窗/框选（第十一条，定死） */
            drawerBusy={openDrawer !== null}
            /* ★ 连接线 / 连接高亮框只在【连接编辑状态】出现（页 → 连接 → 手机/网站模式）。
               普通创作状态不显示；演示态由 Editor 另外掐掉。 */
            connectViewOn={connMode === "phone" || connMode === "site"}
            onRevealRail={() => setDemoRailOut(true)}
            onConnectJump={connJump}
            onConnectJumpBack={connJumpBack}
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

      {openDrawer === null && (() => {
        /* ★ 分支菜单（用户 2026-09-27）：侧边栏只留一个「点」，
           点开长出枝条，选完自动收回。参考 reactbits.dev/micro/branched-menu。
           参数：trunk 14 / indent 40 / radius 10 / lineWidth 1.5 / width 240 / rowHeight 36 */
        const ROW = 44, HEAD = 36, GAP = 14, PAD = 18, TRUNK = 14, INDENT = 52, RADIUS = 12, RAIL_W = 256;
        /* 每项一个线性小图标（跟文字同色，1.3 号线）—— 参考里每行都有图标撑节奏 */
        const 图标: Record<string, React.ReactNode> = {
          // 规格：一个带分隔的框，像画布规格
          spec: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2.2" y="3" width="11.6" height="10" rx="1.6" /><path d="M2.2 6.4h11.6M6.2 6.4V13" /></svg>),
          // 笔：一支斜着的笔
          shape: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11.4 2.6l2 2L6 12l-3.2 1.2L4 10z" /><path d="M10.2 3.8l2 2" /></svg>),
          // 色：一滴色
          color: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.4c2.4 2.8 3.8 4.7 3.8 6.4a3.8 3.8 0 0 1-7.6 0C4.2 7.1 5.6 5.2 8 2.4z" /></svg>),
          // 字：一个 Aa 的字形骨架
          font: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 13l3.6-9 3.6 9" /><path d="M3.2 10h4.8" /><path d="M10.4 13V7.6h2.1a2.2 2.2 0 0 1 0 4.4h-2.1" /></svg>),
          // 页：一张带折角的纸
          page: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9.2 2.2H4.4A1.2 1.2 0 0 0 3.2 3.4v9.2a1.2 1.2 0 0 0 1.2 1.2h7.2a1.2 1.2 0 0 0 1.2-1.2V5.8z" /><path d="M9.2 2.2v3.6h3.6" /></svg>),
          // 锁：一把闭着的锁（替掉那个彩色 emoji）
          lock: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3.4" y="7" width="9.2" height="6.4" rx="1.4" /><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" /></svg>),
          // 存：一个归档盒，往下的箭头
          save: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.6v7.2" /><path d="M5.2 7.2L8 10l2.8-2.8" /><path d="M2.8 11.4v1.2a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2v-1.2" /></svg>),
          // 门：原来那个拱门（已换成跟着文字走的墨色）
          door: (<svg width="15" height="15" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 20V8C2 3.58172 5.58172 0 10 0C14.4183 0 18 3.58172 18 8V20Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /><line x1="10" y1="0" x2="10" y2="20" stroke="currentColor" strokeWidth="1" /></svg>),
        };
        /* 分组：标题压在主干上，子项从主干弯出去 */
        const GROUPS: { 组名: string; 项: string[] }[] = [
          { 组名: "画面", 项: ["spec", "shape", "color", "font"] },
          { 组名: "页面", 项: ["page", "lock"] },
          { 组名: "存档", 项: ["save"] },
        ];
        const defOf = (id: string) => SIDE_ITEMS.find((x) => x.id === id);
        type 行 = { type: "head" | "item"; id: string; label: string; kind?: SideKind; glyph?: React.ReactNode; cy: number };
        const rows: 行[] = [];
        let y = PAD;
        for (const g of GROUPS) {
          rows.push({ type: "head", id: "head-" + g.组名, label: g.组名, cy: y + HEAD / 2 });
          y += HEAD;
          for (const id of g.项) {
            const it = defOf(id); if (!it) continue;
            rows.push({ type: "item", id, label: labelOf(it.id, it.def), kind: it.kind, glyph: 图标[id], cy: y + ROW / 2 });
            y += ROW;
          }
          y += GAP;
        }
        y -= GAP;
        rows.push({ type: "item", id: "door", label: "", kind: "door", glyph: 图标.door, cy: y + GAP + ROW / 2 });
        y += GAP + ROW;
        const H = y + PAD;
        const items = rows.filter((r) => r.type === "item");
        const lastCy = items[items.length - 1].cy;
        return (
          <div
            className="cd-branch"
            data-open={railOpen ? "1" : "0"}
            /* ★ 演示态：没收着就滑出屏幕左边外面（纸零遮挡）。CSS 里已经有
               translateY(-50%)，这里不能覆盖掉，只能往后接一个 translateX。 */
            style={demoOn ? {
              transform: demoRailOut
                ? "translateY(-50%) translateX(0)"
                : "translateY(-50%) translateX(-110%)",
              transition: "transform .22s ease-out",
              pointerEvents: demoRailOut ? undefined : "none",
            } : undefined}
          >
            {/* ── 收起态：那一个「点」—— 就是中文字「点」 ── */}
            <button
              type="button"
              className="cd-branch-dot"
              onClick={() => setRailOpen((v) => !v)}
              aria-label={railOpen ? "收起菜单" : "展开菜单"}
            >
              <span className="cd-branch-dot-char">点</span>
            </button>

            {/* ── 展开态：纯白卡片 + 一根主干 + 每个子项一条圆角弯枝 ── */}
            <div className="cd-branch-panel">
              <div className="cd-branch-card" style={{ height: H }}>
                <svg className="cd-branch-svg" width={RAIL_W} height={H} viewBox={`0 0 ${RAIL_W} ${H}`} aria-hidden>
                  <line className="cd-branch-trunk" x1={TRUNK} y1={PAD} x2={TRUNK} y2={lastCy} />
                  {items.map((r, i) => (
                    <path
                      key={r.id}
                      className="cd-branch-path"
                      style={{ "--len": 70, transitionDelay: `${i * 26}ms` } as React.CSSProperties}
                      d={`M${TRUNK} ${r.cy - RADIUS} Q ${TRUNK} ${r.cy} ${TRUNK + RADIUS} ${r.cy} L ${INDENT} ${r.cy}`}
                    />
                  ))}
                </svg>
                {rows.map((r) => r.type === "head" ? (
                  <div key={r.id} className="cd-branch-head" style={{ top: r.cy - HEAD / 2, height: HEAD }}>
                    {r.label}
                  </div>
                ) : (
                  <SideEntryButton
                    key={r.id}
                    cls="cd-branch-item"
                    glyph={r.glyph}
                    label={r.label}
                    style={{ top: r.cy - ROW / 2, height: ROW }}
                    onClick={() => { onSideAction(r.kind as SideKind); setRailOpen(false); }}
                    onRename={() => setRenaming({ id: r.id, label: r.label })}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ ★ 演示态：左边缘的「隐形工具栏」提示 ══════════════════════════
         用户 2026-09-26 要的「可发现性」：工具栏收起来之后，屏上得看得出这儿藏着东西。
         · 一条【很短、半透明】的细把手 —— 平时就它一个，表示"这里能滑出来"
         · 第一次进演示时，把小箭头往右轻推一下示意方向；【只播一次】，之后不再打扰
         · 整块 pointerEvents:none —— 不拦点击；绝对定位 —— 不动画布、不动作品位置
         · 不弹字幕、不弹窗、不做教程 */}
      {demoOn && !demoRailOut && (
        <>
          <style>{`
            @keyframes ranjingRailHint {
              0%   { transform: translateX(0);    opacity: 0; }
              16%  { transform: translateX(0);    opacity: 1; }
              58%  { transform: translateX(15px); opacity: 1; }
              100% { transform: translateX(26px); opacity: 0; }
            }
          `}</style>
          <div data-demo-rail-hint aria-hidden style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            height: 72, zIndex: 99, pointerEvents: "none",
            display: "flex", alignItems: "center",
          }}>
            {/* 细把手：很短、半透明，只说"这里藏着东西" */}
            <div style={{
              width: 3, height: 46, borderRadius: 2, marginLeft: 1,
              background: "rgba(201,168,124,.5)",
              boxShadow: "0 0 7px rgba(201,168,124,.35)",
            }} />
            {demoHint && (
              <div style={{ marginLeft: 7, animation: "ranjingRailHint 2.4s ease-out 1 forwards" }}>
                <svg width="13" height="20" viewBox="0 0 13 20" fill="none">
                  <path d="M3 2 L10 10 L3 18" stroke="rgba(201,168,124,.95)" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        </>
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
          connectCount={(doc.interactions || []).length}
          onConnectCancel={cancelConnect}
          onConnUndo={undoLastInteraction}
          onConnClear={clearInteractions}
          demoOn={demoOn}
          onDemoEnter={enterDemo}
          onDemoExit={exitDemo}
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

      {/* ★ 这里原来挂着一条"提示条"，把每一步该做什么写成字贴在画布顶上
          （「点延伸物那张纸」「在延伸物里点一个连接对象」…）。
          整条删掉 —— 手稿上那些字是【动作规则】，是给开发看的，
          不是要显示给用户读的字幕。动作应该靠动作本身表达：
            ① 点对象 → 那圈框亮起来（本身就是"选了它"）
            ② 定延伸页 → 线当场长出来
            ③ 闭环 → 线变实（route 成立了）
          退出的路在抽屉里（「结束这次设置」），画布上不需要任何文字。 */}


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
          <div style={{ background: "#F6EDEB", color: "#B4544A", padding: 8, borderRadius: 8 }}>{saveError}</div>
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
