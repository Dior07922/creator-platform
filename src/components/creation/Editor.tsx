// name=src/components/creation/Editor.tsx
import React, { useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import type {
  Group, ImageNode, LinkNode, NoteNode, Page, ShapeKind, ShapeNode, TableNode, TextNode,
} from "../../types/document";

type Props = {
  page: Page;
  allPages?: Page[];
  onUpdate: (patch: Partial<Page>) => void;
  onSelectPage?: (id: string) => void;
  onCopyPage?: () => void;
  onPastePage?: (x: number, y: number) => void;
  hasClipboard?: boolean;
  onRequestConnect?: () => void;
  onUpdatePageTransform?: (pageId: string, transform: { x: number; y: number; scale: number; rotate: number }) => void;
  onDeletePage?: () => void;
  paperColor: string;
  paperAlpha: number;
  stageColor: string;
  stageAlpha: number;
  currentFont?: string;
  drawTool?: ShapeKind | null;
  onDrawToolConsumed?: () => void;
  onDrawToolChange?: (kind: ShapeKind | null) => void;
  elementConnectMode?: boolean;
  lassoMode?: boolean;
  sheetAction?: { id: number; kind: string } | null;
};

type Mode =
  | "idle"
  | "dragPaper"
  | "pinch"
  | "dragText"
  | "scaleText"
  | "boxSelect"
  | "dragBox"
  | "resizeBox"
  | "drawing"
  | "dragShape"
  | "scaleEl";

type ResizeHandle = "nw" | "ne" | "se" | "sw";

function normalizeAngleDiff(rad: number) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

type PaperState = { x: number; y: number; scale: number; rotate: number; w: number; h: number };
type BoxState = { x: number; y: number; w: number; h: number };
type DrawingDraft = {
  kind: ShapeKind;
  x1: number; y1: number; x2: number; y2: number;
  points?: { x: number; y: number }[];
  pressures?: number[];
};

function screenToPaperLocal(sx: number, sy: number, stageEl: HTMLElement | null, p: PaperState) {
  const rect = stageEl?.getBoundingClientRect();
  if (!rect) return { x: sx, y: sy, inside: false };
  const W = p.w > 0 ? p.w : rect.width;
  const H = p.h > 0 ? p.h : rect.height;
  const paperCx = rect.left + rect.width / 2 + p.x;
  const paperCy = rect.top + rect.height / 2 + p.y;
  const dx = sx - paperCx;
  const dy = sy - paperCy;
  const rad = (-p.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = (dx * cos - dy * sin) / (p.scale || 1);
  const ry = (dx * sin + dy * cos) / (p.scale || 1);
  const lx = rx + W / 2;
  const ly = ry + H / 2;
  return { x: lx, y: ly, inside: lx >= 0 && lx <= W && ly >= 0 && ly <= H };
}

const HANDLE_HIT = 28;
const SELECT_BLUE = "rgba(59,130,246,.85)";
const SELECT_BLUE_BG = "rgba(59,130,246,.10)";
const LONG_PRESS_MS = 500;
const DEFAULT_FONT = '"Noto Sans SC", sans-serif';

/** 笔迹工具条固定色板 */
const PEN_COLORS = ["#3a352e", "#d94c4c", "#f39c12", "#27ae60", "#3498db", "#8e44ad"];

/** 笔迹工具条按钮样式（直径 36 圆钮） */
const penBarBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 0,
  background: "rgba(255,255,255,.16)", color: "#fff",
  fontSize: 15, lineHeight: 1, cursor: "pointer", padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  flex: "none",
};

/**
 * 纸张局部坐标 → 屏幕坐标。
 * 与 screenToPaperLocal 互为逆变换；纸张变换为
 * translate(paper.x, paper.y) scale(paper.scale) rotate(paper.rotate)，transform-origin 居中。
 */
function paperLocalToScreen(lx: number, ly: number, stageEl: HTMLElement | null, p: PaperState) {
  const rect = stageEl?.getBoundingClientRect();
  if (!rect) return { x: lx, y: ly };
  const W = p.w > 0 ? p.w : rect.width;
  const H = p.h > 0 ? p.h : rect.height;
  const rx = (lx - W / 2) * (p.scale || 1);
  const ry = (ly - H / 2) * (p.scale || 1);
  const rad = (p.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: rect.left + rect.width / 2 + p.x + rx * cos - ry * sin,
    y: rect.top + rect.height / 2 + p.y + rx * sin + ry * cos,
  };
}

/** 判断是否为自由笔迹类形状（模块级，供 shapeLocalBox 使用） */
function freeKindOf(kind: ShapeKind): boolean {
  return kind === "free" || kind === "crayon" || kind === "sketch" ||
         kind === "marker" || kind === "pencil" || kind === "ink" ||
         kind === "handwrite" || kind === "redpen" || kind === "highlight" ||
         kind === "brush";
}

/** 形状在纸张局部坐标下的包围盒 */
function shapeLocalBox(s: ShapeNode): { x: number; y: number; w: number; h: number } {
  if (freeKindOf(s.kind) && s.points && s.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
}

function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"] as (string | number)[]
  );
  d.push("Z");
  return d.join(" ");
}

function renderShape(s: ShapeNode, selectedShapeId?: string | null) {
  const stroke = s.color;
  const sw = s.strokeWidth;
  // data-shape-id 供笔迹工具条定位用（取该形状的屏幕包围盒）
  const sid = { "data-shape-id": s.id } as Record<string, string>;
  const common = {
    stroke,
    strokeWidth: sw,
    fill: s.fill || "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    filter: selectedShapeId === s.id ? "drop-shadow(0 0 4px #3b82f6)" : undefined,
    ...sid,
  };
  switch (s.kind) {
    case "line":
      return <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} />;
    case "rect":
      return (
        <rect
          key={s.id}
          x={Math.min(s.x1, s.x2)}
          y={Math.min(s.y1, s.y2)}
          width={Math.abs(s.x2 - s.x1)}
          height={Math.abs(s.y2 - s.y1)}
          {...common}
        />
      );
    case "circle": {
      const cx = (s.x1 + s.x2) / 2;
      const cy = (s.y1 + s.y2) / 2;
      const rx = Math.abs(s.x2 - s.x1) / 2;
      const ry = Math.abs(s.y2 - s.y1) / 2;
      return <ellipse key={s.id} cx={cx} cy={cy} rx={rx} ry={ry} {...common} />;
    }
    case "arrow": {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const len = Math.max(8, sw * 4);
      const ax = s.x2 - len * Math.cos(angle - Math.PI / 6);
      const ay = s.y2 - len * Math.sin(angle - Math.PI / 6);
      const bx = s.x2 - len * Math.cos(angle + Math.PI / 6);
      const by = s.y2 - len * Math.sin(angle + Math.PI / 6);
      return (
        <g key={s.id} {...sid}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} />
          <polyline points={`${ax},${ay} ${s.x2},${s.y2} ${bx},${by}`} {...common} />
        </g>
      );
    }
    case "triangle": {
      const cx = (s.x1 + s.x2) / 2;
      const y1 = Math.min(s.y1, s.y2);
      const y2 = Math.max(s.y1, s.y2);
      const x1 = Math.min(s.x1, s.x2);
      const x2 = Math.max(s.x1, s.x2);
      return <polygon key={s.id} points={`${cx},${y1} ${x2},${y2} ${x1},${y2}`} {...common} />;
    }
    case "heart": {
      const cx = (s.x1 + s.x2) / 2;
      const cy = (s.y1 + s.y2) / 2;
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      const d = `M ${cx} ${cy + h * 0.35} ` +
        `C ${cx - w * 0.5} ${cy - h * 0.05}, ${cx - w * 0.5} ${cy - h * 0.5}, ${cx} ${cy - h * 0.2} ` +
        `C ${cx + w * 0.5} ${cy - h * 0.5}, ${cx + w * 0.5} ${cy - h * 0.05}, ${cx} ${cy + h * 0.35} Z`;
      return <path key={s.id} d={d} {...common} />;
    }
    case "star": {
      const cx = (s.x1 + s.x2) / 2;
      const cy = (s.y1 + s.y2) / 2;
      const R = Math.min(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)) / 2;
      const r = R * 0.45;
      let d = "";
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rad = i % 2 === 0 ? R : r;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        d += (i === 0 ? "M" : "L") + ` ${px} ${py} `;
      }
      d += "Z";
      return <path key={s.id} d={d} {...common} />;
    }
    case "speech": {
      const x1 = Math.min(s.x1, s.x2);
      const y1 = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1) * 0.8;
      const r = Math.min(w, h) * 0.18;
      const tailX = x1 + w * 0.3;
      const tailY = y1 + h;
      const d = `M ${x1 + r} ${y1} L ${x1 + w - r} ${y1} Q ${x1 + w} ${y1} ${x1 + w} ${y1 + r} ` +
        `L ${x1 + w} ${y1 + h - r} Q ${x1 + w} ${y1 + h} ${x1 + w - r} ${y1 + h} ` +
        `L ${tailX + r * 1.6} ${y1 + h} L ${tailX} ${tailY + r * 1.6} L ${tailX + r * 0.6} ${y1 + h} ` +
        `L ${x1 + r} ${y1 + h} Q ${x1} ${y1 + h} ${x1} ${y1 + h - r} ` +
        `L ${x1} ${y1 + r} Q ${x1} ${y1} ${x1 + r} ${y1} Z`;
      return <path key={s.id} d={d} {...common} />;
    }
    case "cloud": {
      const cx = (s.x1 + s.x2) / 2;
      const cy = (s.y1 + s.y2) / 2;
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      const d = `M ${cx - w * 0.35} ${cy + h * 0.15} ` +
        `a ${w * 0.15} ${h * 0.15} 0 0 1 ${w * 0.05} ${-h * 0.25} ` +
        `a ${w * 0.2} ${h * 0.2} 0 0 1 ${w * 0.4} ${-h * 0.05} ` +
        `a ${w * 0.18} ${h * 0.18} 0 0 1 ${w * 0.25} ${h * 0.28} Z`;
      return <path key={s.id} d={d} {...common} />;
    }
    case "free":
    case "crayon":
    case "sketch":
    case "marker":
    case "pencil":
    case "ink":
    case "handwrite":
    case "highlight":
    case "brush":
    case "redpen": {
      if (!s.points || s.points.length < 2) return null;

      const filterStyle = selectedShapeId === s.id
        ? { filter: "drop-shadow(0 0 4px #3b82f6)" }
        : undefined;

      // 组装输入点：[x, y, pressure]
      const inputPoints: number[][] = s.points.map((p, i) => [
        p.x,
        p.y,
        s.pressures?.[i] ?? 0.5,
      ]);

      // 调参区（后续微调手感全靠这 5 个）
      const outline = getStroke(inputPoints, {
        size: s.strokeWidth * 1.1,
        thinning: 0.35,
        smoothing: 0.55,
        streamline: 0.45,
        easing: (t: number) => t,
        simulatePressure: !s.pressures || s.pressures.length < 2,
        last: true,
      });

      const d = getSvgPathFromStroke(outline);

      return (
        <path
          key={s.id}
          d={d}
          fill={stroke}
          stroke="none"
          opacity={s.opacity ?? 1}
          style={filterStyle}
        />
      );
    }
  }
  return null;
}

export default function Editor({
  page,
  allPages,
  onUpdate,
  onSelectPage,
  onCopyPage,
  onPastePage,
  hasClipboard,
  onRequestConnect,
  onUpdatePageTransform,
  onDeletePage,
  paperColor,
  paperAlpha,
  stageColor,
  stageAlpha,
  currentFont,
  drawTool,
  onDrawToolConsumed,
  onDrawToolChange,
  elementConnectMode,
  lassoMode,
  sheetAction,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const editTaRef = useRef<HTMLTextAreaElement>(null);
  const editingIdRef = useRef<string | null>(null);
  const textsRef = useRef<TextNode[]>([]);
  const onUpdateRef = useRef(onUpdate);
  const pageRef = useRef(page);
  const allPagesRef = useRef<Page[]>([]);
  const onUpdatePageTransformRef = useRef(onUpdatePageTransform);
  const drawToolRef = useRef<ShapeKind | null>(null);
  const onDrawToolConsumedRef = useRef(onDrawToolConsumed);
  const onDrawToolChangeRef = useRef(onDrawToolChange);
  onDrawToolChangeRef.current = onDrawToolChange;

  const texts = page.texts || [];
  const shapes = page.shapes || [];
  textsRef.current = texts;
  onUpdateRef.current = onUpdate;
  pageRef.current = page;
  allPagesRef.current = allPages || [];
  onUpdatePageTransformRef.current = onUpdatePageTransform;
  drawToolRef.current = drawTool ?? null;
  onDrawToolConsumedRef.current = onDrawToolConsumed;

  const [paper, setPaper] = useState<PaperState>(() => {
    const t = page.transform;
    return {
      x: t?.x ?? 0,
      y: t?.y ?? 0,
      scale: t?.scale ?? 1,
      rotate: t?.rotate ?? 0,
      w: page.paperW ?? 0,
      h: page.paperH ?? 0,
    };
  });
  const paperStateRef = useRef(paper);
  useEffect(() => { paperStateRef.current = paper; }, [paper]);

  useEffect(() => {
    const t = page.transform;
    setPaper({
      x: t?.x ?? 0,
      y: t?.y ?? 0,
      scale: t?.scale ?? 1,
      rotate: t?.rotate ?? 0,
      w: page.paperW ?? 0,
      h: page.paperH ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, page.paperW, page.paperH]);

  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [selectionBar, setSelectionBar] = useState<{
    x: number; y: number; start: number; end: number; text: string;
  } | null>(null);

  const [box, setBox] = useState<BoxState | null>(null);
  const boxRef = useRef<BoxState | null>(null);
  const [boxGroupId, setBoxGroupId] = useState<string | null>(null);
  const boxGroupIdRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number; id: string | null }>({
    time: 0, x: 0, y: 0, id: null,
  });
  const cursorPosRef = useRef<Map<string, number>>(new Map());
  const boxClipboardRef = useRef<{ texts: TextNode[]; pages: Page[] } | null>(null);
  const dragSelectRef = useRef<{ startX: number; startY: number; cursorAtDown: number; moved: boolean } | null>(null);

  const [selectedEl, setSelectedEl] = useState<{
    type: "shape" | "image" | "note" | "table" | "link";
    id: string;
  } | null>(null);
  const selectedElRef = useRef(selectedEl);
  useEffect(() => { selectedElRef.current = selectedEl; }, [selectedEl]);
  const [draft, setDraft] = useState<ShapeNode | null>(null);
  const drawingRef = useRef<DrawingDraft | null>(null);
  const shapeHistoryRef = useRef<ShapeNode[][]>([]);
  const [undoTick, setUndoTick] = useState(0);

  function pushShapeHistory() {
    const stack = shapeHistoryRef.current;
    stack.push(JSON.parse(JSON.stringify(pageRef.current.shapes || [])));
    if (stack.length > 40) stack.shift();
    setUndoTick((t) => t + 1);
  }
  function undoShape() {
    const stack = shapeHistoryRef.current;
    if (!stack.length) return;
    const prev = stack.pop()!;
    onUpdateRef.current({ shapes: prev });
    setUndoTick((t) => t + 1);
  }

  useEffect(() => { boxRef.current = box; }, [box]);
  useEffect(() => { boxGroupIdRef.current = boxGroupId; }, [boxGroupId]);

  const gRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    mode: "idle" as Mode,
    startPoint: { x: 0, y: 0 },
    initial: {
      x: 0, y: 0, scale: 1, rotate: 0,
      dist: 0, angle: 0, midX: 0, midY: 0,
      textX: 0, textY: 0,
      fontSize: 16,
    },
    longPressTimer: 0 as any,
    moved: false,
    longPressed: false,
    dragTextId: null as string | null,
    pendingBox: false as boolean,
    boxSourceLayer: null as "background" | "paper" | null,
    boxIncludePaper: false as boolean,
    boxOriginalPaper: { x: 0, y: 0, scale: 1 },
    boxStartPoint: { x: 0, y: 0 },
    boxResizeHandle: "se" as ResizeHandle,
    boxOriginal: { x: 0, y: 0, w: 0, h: 0 },
    boxOriginalMembers: [] as { id: string; x: number; y: number; fontSize: number }[],
    boxOriginalOtherPages: [] as { id: string; x: number; y: number; scale: number }[],
    boxMoveStart: { x: 0, y: 0 },
    boxMoveOriginal: { x: 0, y: 0, w: 0, h: 0 },
    pendingSwitchPageId: null as string | null,
    pendingClearBoxOnUp: false as boolean,
    justCommittedEdit: false as boolean,
    suppressNextUp: false as boolean,
    dragShapeStart: { x: 0, y: 0 },
    dragShapeOrigin: null as ShapeNode | null,
    connectSource: null as { type: string; id: string } | null,
    activePen: false as boolean,
    pendingDraw: null as null | { pointerId: number; sx: number; sy: number; localX: number; localY: number },
  });

  useEffect(() => {
    function resetGesture() {
      const g = gRef.current;
      g.pointers.clear();
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.pendingSwitchPageId = null;
      g.pendingClearBoxOnUp = false;
      g.justCommittedEdit = false;
      g.suppressNextUp = false;
      drawingRef.current = null;
      setDraft(null);
      lastTapRef.current = { time: 0, x: 0, y: 0, id: null };
      clearTimeout(g.longPressTimer);
    }
    window.addEventListener("resize", resetGesture);
    window.addEventListener("orientationchange", resetGesture);
    return () => {
      window.removeEventListener("resize", resetGesture);
      window.removeEventListener("orientationchange", resetGesture);
    };
  }, []);

  // 全局屏蔽：整个文档 → 禁用系统长按菜单（拷贝/查询/翻译）/ 选择 / 触控预览
  useEffect(() => {
    const id = "ranjing-stage-lock";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      * {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      [data-stage] textarea,
      [data-stage] input,
      textarea[wrap="off"] {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      .mini-confirm-box input {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `;
    const blockSelect = (ev: Event) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      ev.preventDefault();
    };
    const blockContext = (ev: Event) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      ev.preventDefault();
    };
    document.addEventListener("selectstart", blockSelect, true);
    document.addEventListener("contextmenu", blockContext, true);
    document.addEventListener("dragstart", blockContext, true);
    document.head.appendChild(style);
    return () => {
      document.removeEventListener("selectstart", blockSelect, true);
      document.removeEventListener("contextmenu", blockContext, true);
      document.removeEventListener("dragstart", blockContext, true);
    };
  }, []);

  // 窗口失焦（系统菜单、切后台）→ 清空所有进行中状态
  useEffect(() => {
    function resetAll() {
      const g = gRef.current;
      g.pointers.clear();
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.pendingSwitchPageId = null;
      g.pendingClearBoxOnUp = false;
      g.justCommittedEdit = false;
      (g as any).pendingDraw = null;
      (g as any).dragImageOrigin = null;
      (g as any).dragExtraOrigin = null;
      (g as any).scaleElOrigin = null;
      (g as any).scaleElType = null;
      g.dragShapeOrigin = null;
      g.activePen = false;
      drawingRef.current = null;
      setDraft(null);
      clearTimeout(g.longPressTimer);
    }
    window.addEventListener("blur", resetAll);
    document.addEventListener("visibilitychange", resetAll);
    return () => {
      window.removeEventListener("blur", resetAll);
      document.removeEventListener("visibilitychange", resetAll);
    };
  }, []);

  useEffect(() => {
    const t = page.transform;
    const same = !!t && t.x === paper.x && t.y === paper.y && t.scale === paper.scale && t.rotate === paper.rotate;
    if (!same) onUpdateRef.current({
      transform: { x: paper.x, y: paper.y, scale: paper.scale, rotate: paper.rotate },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  function hideFloatingEditor() {
    const ta = editTaRef.current;
    if (!ta) return;
    try { ta.blur(); } catch { /* ignore */ }
    ta.style.left = "0px"; ta.style.top = "0px";
    ta.style.width = "0px"; ta.style.height = "0px";
    ta.style.opacity = "0"; ta.style.pointerEvents = "none";
    ta.value = "";
  }
  function showFloatingEditor(
    screenX: number, screenY: number,
    width: number, height: number,
    fontSize: number, color: string, initialValue: string
  ) {
    const ta = editTaRef.current;
    const stage = stageRef.current;
    if (!ta || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    ta.style.left = `${screenX - stageRect.left}px`;
    ta.style.top = `${screenY - stageRect.top}px`;
    ta.style.width = `${width}px`;
    ta.style.height = `${height}px`;
    ta.style.fontSize = `${fontSize}px`;
    ta.style.color = color;
    ta.style.fontFamily = currentFont || DEFAULT_FONT;
    ta.style.opacity = "1";
    ta.style.pointerEvents = "auto";
    ta.value = initialValue;
    try { ta.setSelectionRange(initialValue.length, initialValue.length); } catch { /* ignore */ }
  }
  function onTaDown(e: React.PointerEvent) {
    const ta = editTaRef.current;
    if (!ta) return;
    dragSelectRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      cursorAtDown: ta.selectionStart ?? 0,
      moved: false,
    };
    setSelectionBar(null);
  }
  function onTaMove(e: React.PointerEvent) {
    const d = dragSelectRef.current;
    const ta = editTaRef.current;
    if (!d || !ta) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < 12) return;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) return;
    d.moved = true;
    const v = ta.value || "";
    const len = v.length;
    const fontSize = parseFloat(ta.style.fontSize || "16") || 16;
    const charW = fontSize * 0.6;
    const count = Math.max(0, Math.round(Math.abs(dx) / charW));
    const c0 = Math.max(0, Math.min(len, d.cursorAtDown));
    let startPos: number, endPos: number;
    if (dx < 0) {
      startPos = Math.max(0, c0 - count);
      endPos = c0;
    } else {
      startPos = c0;
      endPos = Math.min(len, c0 + count);
    }
    try { ta.setSelectionRange(startPos, endPos); } catch {}
  }
  function onTaUp() {
    const ta = editTaRef.current;
    const d = dragSelectRef.current;
    dragSelectRef.current = null;
    if (!ta || !d || !d.moved) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (end <= start) return;
    const v = ta.value || "";
    const rect = ta.getBoundingClientRect();
    setSelectionBar({
      x: rect.left + rect.width / 2,
      y: rect.top - 50,
      start, end,
      text: v.slice(start, end),
    });
  }

  function focusFloatingEditor() {
    const ta = editTaRef.current;
    if (!ta) return;
    try { ta.focus({ preventScroll: true }); }
    catch { try { ta.focus(); } catch { /* ignore */ } }
  }
  function commitFloatingEditor() {
    const id = editingIdRef.current;
    if (!id) return;
    const ta = editTaRef.current;
    if (!ta) return;
    const v = ta.value;
    try { cursorPosRef.current.set(id, ta.selectionStart ?? v.length); } catch {}
    const list = textsRef.current;
    const t = list.find((x) => x.id === id);
    if (!t) {
      setEditingId(null); editingIdRef.current = null;
      hideFloatingEditor(); return;
    }
    const nowEmpty = !v.trim();
    if (nowEmpty) {
      const next = list.filter((x) => x.id !== id);
      textsRef.current = next;
      onUpdateRef.current({ texts: next });
    } else if (v !== (t.text || "")) {
      const next = list.map((x) => (x.id === id ? { ...x, text: v } : x));
      textsRef.current = next;
      onUpdateRef.current({ texts: next });
    }
    setEditingId(null); editingIdRef.current = null;
    hideFloatingEditor();
    setSelectionBar(null);
    if (stageRef.current) stageRef.current.style.transform = "";
  }

  useEffect(() => {
    const ta = editTaRef.current;
    if (!ta) return;
    function handleInput() {
      const el = editTaRef.current; if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    function handleBlur() { commitFloatingEditor(); }
    function handleKeyDown(ev: KeyboardEvent) {
      if (ev.isComposing || (ev as any).keyCode === 229) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        commitFloatingEditor();
        editTaRef.current?.blur();
      }
    }
    ta.addEventListener("input", handleInput);
    ta.addEventListener("blur", handleBlur);
    ta.addEventListener("keydown", handleKeyDown);
    hideFloatingEditor();
    return () => {
      ta.removeEventListener("input", handleInput);
      ta.removeEventListener("blur", handleBlur);
      ta.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enterEditing(t: TextNode) {
    const el = stageRef.current?.querySelector(`[data-text-id="${t.id}"]`) as HTMLElement | null;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const stageRect = stageRef.current?.getBoundingClientRect();
    const fontSize = t.fontSize;
    const width = Math.max(rect.width + 8, 120);
    const height = Math.max(rect.height, fontSize * 1.6);
    const wideWidth = stageRect ? Math.min(stageRect.width - 20, Math.max(width, 400)) : width;
    showFloatingEditor(rect.left, rect.top, wideWidth, height, fontSize, t.color, t.text || "");
    focusFloatingEditor();
    setEditingId(t.id); editingIdRef.current = t.id;
  }
  function createTextAndEdit(screenX: number, screenY: number, layer: "background" | "paper") {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let localX: number, localY: number;
    if (layer === "paper") {
      const local = screenToPaperLocal(screenX, screenY, stageRef.current, paperStateRef.current);
      localX = local.x; localY = local.y;
    } else {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) return;
      localX = screenX - stageRect.left;
      localY = screenY - stageRect.top;
    }
    const fontSize = 16;
    const node: TextNode = {
      id, text: "", x: localX, y: localY, fontSize, color: "#3a352e", layer,
      fontFamily: currentFont,
    };
    const next = [...textsRef.current, node];
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
    const stageRect = stageRef.current?.getBoundingClientRect();
    const width = stageRect ? Math.min(stageRect.width - 20, 400) : 400;
    const height = fontSize * 1.6;
    showFloatingEditor(screenX, screenY, width, height, fontSize, "#3a352e", "");
    focusFloatingEditor();
    setEditingId(id); editingIdRef.current = id;
  }
  function updateText(id: string, patch: Partial<TextNode>) {
    const next = textsRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t));
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
  }

  function isFreeKind(kind: ShapeKind): boolean {
    return kind === "free" || kind === "crayon" || kind === "sketch" ||
           kind === "marker" || kind === "pencil" || kind === "ink" ||
           kind === "handwrite" || kind === "redpen" || kind === "highlight" ||
           kind === "brush";
  }
  function pointToSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function hitShapeAt(px: number, py: number, list: ShapeNode[]): ShapeNode | null {
    const TH = 24;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (isFreeKind(s.kind) && s.points && s.points.length >= 2) {
        for (let j = 0; j < s.points.length - 1; j++) {
          const d = pointToSegDist(px, py, s.points[j].x, s.points[j].y, s.points[j + 1].x, s.points[j + 1].y);
          if (d < TH) return s;
        }
      } else if (s.kind === "line" || s.kind === "arrow") {
        if (pointToSegDist(px, py, s.x1, s.y1, s.x2, s.y2) < TH) return s;
      } else {
        const x1 = Math.min(s.x1, s.x2) - TH;
        const y1 = Math.min(s.y1, s.y2) - TH;
        const x2 = Math.max(s.x1, s.x2) + TH;
        const y2 = Math.max(s.y1, s.y2) + TH;
        if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return s;
      }
    }
    return null;
  }
  function eraseAt(clientX: number, clientY: number) {
    const local = screenToPaperLocal(clientX, clientY, stageRef.current, paperStateRef.current);
    if (!local.inside) return;
    const list = pageRef.current.shapes || [];
    const hit = hitShapeAt(local.x, local.y, list);
    if (hit) onUpdateRef.current({ shapes: list.filter((s) => s.id !== hit.id) });
  }
  function styleForKind(kind: ShapeKind): { color: string; strokeWidth: number; opacity: number } {
    switch (kind) {
      case "crayon":    return { color: "#3a352e", strokeWidth: 8,   opacity: 0.7 };
      case "sketch":    return { color: "#3a352e", strokeWidth: 1.5, opacity: 0.85 };
      case "marker":    return { color: "#3a352e", strokeWidth: 10,  opacity: 1 };
      case "pencil":    return { color: "#3a352e", strokeWidth: 2,   opacity: 1 };
      case "ink":       return { color: "#3a352e", strokeWidth: 4,   opacity: 1 };
      case "handwrite": return { color: "#3a352e", strokeWidth: 3,   opacity: 0.92 };
      case "highlight": return { color: "#ffe066", strokeWidth: 18,  opacity: 0.55 };
      case "brush":     return { color: "#1a1a1a", strokeWidth: 5,   opacity: 0.9 };
      case "redpen":    return { color: "#d94c4c", strokeWidth: 2,   opacity: 1 };
      case "free":
      default:          return { color: "#3a352e", strokeWidth: 3,   opacity: 1 };
    }
  }

  function getTwoFingerSnapshot() {
    const g = gRef.current;
    const pts = Array.from(g.pointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return {
      dist: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
  }
  function hitText(sx: number, sy: number): TextNode | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const els = stage.querySelectorAll<HTMLElement>("[data-text-id]");
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      if (sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) {
        const id = el.dataset.textId;
        if (id) {
          const t = textsRef.current.find((x) => x.id === id);
          if (t && (t.text || "").trim().length > 0) return t;
        }
      }
    }
    return null;
  }
  function isInPaper(sx: number, sy: number): boolean {
    return screenToPaperLocal(sx, sy, stageRef.current, paperStateRef.current).inside;
  }
  function hitNoteAt(px: number, py: number, list: NoteNode[]): NoteNode | null {
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h) return n;
    }
    return null;
  }
  function hitTableAt(px: number, py: number, list: TableNode[]): TableNode | null {
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      if (px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h) return t;
    }
    return null;
  }
  function hitLinkAt(px: number, py: number, list: LinkNode[]): LinkNode | null {
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      if (px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h) return l;
    }
    return null;
  }
  function hitImageAt(px: number, py: number, list: ImageNode[]): ImageNode | null {
    for (let i = list.length - 1; i >= 0; i--) {
      const im = list[i];
      if (px >= im.x && px <= im.x + im.w && py >= im.y && py <= im.y + im.h) return im;
    }
    return null;
  }
  function hitOtherPage(sx: number, sy: number): Page | null {
    if (!allPages || allPages.length <= 1) return null;
    const stageEl = stageRef.current;
    if (!stageEl) return null;
    for (const p of allPages) {
      if (p.id === page.id) continue;
      const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
      const r = screenToPaperLocal(sx, sy, stageEl, {
        x: tr.x, y: tr.y, scale: tr.scale, rotate: tr.rotate,
        w: p.paperW ?? 0, h: p.paperH ?? 0,
      });
      if (r.inside) return p;
    }
    return null;
  }
  function boxContainsPaper(b: BoxState): boolean {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return false;
    const p = paperStateRef.current;
    const W = p.w > 0 ? p.w : sr.width;
    const H = p.h > 0 ? p.h : sr.height;
    const cx = sr.width / 2 + p.x;
    const cy = sr.height / 2 + p.y;
    const halfW = (W * p.scale) / 2;
    const halfH = (H * p.scale) / 2;
    const paperLeft = cx - halfW;
    const paperTop = cy - halfH;
    const paperRight = cx + halfW;
    const paperBottom = cy + halfH;
    const boxLeft = b.x;
    const boxTop = b.y;
    const boxRight = b.x + b.w;
    const boxBottom = b.y + b.h;
    const noOverlap =
      paperRight < boxLeft ||
      paperLeft > boxRight ||
      paperBottom < boxTop ||
      paperTop > boxBottom;
    return !noOverlap;
  }
  function computeOtherPagesInBox(b: BoxState): string[] {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return [];
    const ids: string[] = [];
    for (const p of allPagesRef.current) {
      if (p.id === page.id) continue;
      const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
      const W = p.paperW && p.paperH ? p.paperW : sr.width;
      const H = p.paperW && p.paperH ? p.paperH : sr.height;
      const cx = sr.width / 2 + tr.x;
      const cy = sr.height / 2 + tr.y;
      const halfW = (W * tr.scale) / 2;
      const halfH = (H * tr.scale) / 2;
      const left = cx - halfW;
      const top = cy - halfH;
      const right = cx + halfW;
      const bottom = cy + halfH;
      const noOverlap =
        right < b.x ||
        left > b.x + b.w ||
        bottom < b.y ||
        top > b.y + b.h;
      if (!noOverlap) ids.push(p.id);
    }
    return ids;
  }

  function getStageLocal(sx: number, sy: number): { x: number; y: number } | null {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return null;
    return { x: sx - sr.left, y: sy - sr.top };
  }
  function hitBoxHandle(sx: number, sy: number): ResizeHandle | null {
    const b = boxRef.current;
    if (!b) return null;
    const local = getStageLocal(sx, sy);
    if (!local) return null;
    const pts: { h: ResizeHandle; x: number; y: number }[] = [
      { h: "nw", x: b.x, y: b.y },
      { h: "ne", x: b.x + b.w, y: b.y },
      { h: "se", x: b.x + b.w, y: b.y + b.h },
      { h: "sw", x: b.x, y: b.y + b.h },
    ];
    for (const p of pts) {
      if (Math.abs(local.x - p.x) <= HANDLE_HIT && Math.abs(local.y - p.y) <= HANDLE_HIT) {
        return p.h;
      }
    }
    return null;
  }
  function isInsideBox(sx: number, sy: number): boolean {
    const b = boxRef.current;
    if (!b) return false;
    const local = getStageLocal(sx, sy);
    if (!local) return false;
    return local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h;
  }
  function computeMembersInBox(b: BoxState, restrictTo?: "paper" | "background"): string[] {
    const stage = stageRef.current;
    if (!stage) return [];
    const sr = stage.getBoundingClientRect();
    const bx1 = sr.left + b.x;
    const by1 = sr.top + b.y;
    const bx2 = bx1 + b.w;
    const by2 = by1 + b.h;
    const ids: string[] = [];
    const els = stage.querySelectorAll<HTMLElement>("[data-text-id]");
    els.forEach((el) => {
      const id = el.dataset.textId;
      if (!id) return;
      const t = textsRef.current.find((x) => x.id === id);
      if (!t || !(t.text || "").trim()) return;
      if (restrictTo && t.layer !== restrictTo) return;
      const r = el.getBoundingClientRect();
      const intersects = !(r.right < bx1 || r.left > bx2 || r.bottom < by1 || r.top > by2);
      if (intersects) ids.push(id);
    });
    return ids;
  }
  function currentGroupMemberIds(): string[] {
    const gid = boxGroupIdRef.current;
    if (!gid) return [];
    const grp = (pageRef.current.groups || []).find((gg) => gg.id === gid);
    return grp ? grp.memberIds : [];
  }
  function currentGroupPageIds(): string[] {
    const gid = boxGroupIdRef.current;
    if (!gid) return [];
    const grp = (pageRef.current.groups || []).find((gg) => gg.id === gid);
    return grp?.pageIds || [];
  }

  function commitBoxAsGroup() {
    const b = boxRef.current;
    if (!b) return;
    if (b.w < 4 || b.h < 4) {
      clearBox();
      return;
    }
    const g = gRef.current;
    const restrictTo = g.boxSourceLayer === "paper" ? "paper" : "background";
    const memberIds = computeMembersInBox(b, restrictTo);
    const pageIds = computeOtherPagesInBox(b);
    const includePaper = boxContainsPaper(b);
    const pg = pageRef.current;
    const groups = pg.groups || [];
    const gid = boxGroupIdRef.current;

    if (memberIds.length === 0 && pageIds.length === 0) {
      if (includePaper) return;
      clearBox();
      if (gid) {
        const nextGroups = groups.filter((gg) => gg.id !== gid);
        onUpdateRef.current({ groups: nextGroups });
      }
      return;
    }

    const now = Date.now();
    let nextGroups: Group[];
    if (gid) {
      nextGroups = groups.map((gg) => (gg.id === gid ? { ...gg, memberIds, pageIds } : gg));
    } else {
      const newId = `g-${now}-${Math.random().toString(36).slice(2, 6)}`;
      nextGroups = [...groups, { id: newId, memberIds, pageIds, createdAt: now }];
      setBoxGroupId(newId); boxGroupIdRef.current = newId;
    }
    onUpdateRef.current({ groups: nextGroups });
  }
  function clearBox() {
    setBox(null); boxRef.current = null;
    setBoxGroupId(null); boxGroupIdRef.current = null;
  }
  function deleteSelection() {
    const ids = currentGroupMemberIds();
    if (ids.length > 0) {
      const next = textsRef.current.filter((t) => !ids.includes(t.id));
      textsRef.current = next;
      onUpdateRef.current({ texts: next });
    }
    const gid = boxGroupIdRef.current;
    if (gid) {
      const groups = (pageRef.current.groups || []).filter((gg) => gg.id !== gid);
      onUpdateRef.current({ groups });
    }
    clearBox();
  }
  function deleteOneText(id: string) {
    const next = textsRef.current.filter((t) => t.id !== id);
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
  }

  function snapshotOriginalOtherPages(): { id: string; x: number; y: number; scale: number }[] {
    const ids = currentGroupPageIds();
    const out: { id: string; x: number; y: number; scale: number }[] = [];
    for (const p of allPagesRef.current) {
      if (ids.includes(p.id)) {
        const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        out.push({ id: p.id, x: tr.x, y: tr.y, scale: tr.scale });
      }
    }
    return out;
  }

  /** 屏幕坐标点是否落在「选中元素」上（文字用 DOM 包围盒，其余用纸张局部包围盒 + 24px 容差） */
  function isCenterOnSelectedEl(mx: number, my: number): boolean {
    const sel = selectedElRef.current;
    if (!sel) return false;
    const stageEl = stageRef.current;
    if (!stageEl) return false;

    const selType: string = sel.type;
    if (selType === "text") {
      const el = stageEl.querySelector(`[data-text-id="${sel.id}"]`) as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
    }

    const lx = screenToPaperLocal(mx, my, stageEl, paperStateRef.current);
    const pg = pageRef.current;
    let b: { x: number; y: number; w: number; h: number } | null = null;
    if (sel.type === "image") { const n = (pg.images || []).find((x) => x.id === sel.id); if (n) b = { x: n.x, y: n.y, w: n.w, h: n.h }; }
    else if (sel.type === "note")  { const n = (pg.notes  || []).find((x) => x.id === sel.id); if (n) b = { x: n.x, y: n.y, w: n.w, h: n.h }; }
    else if (sel.type === "table") { const n = (pg.tables || []).find((x) => x.id === sel.id); if (n) b = { x: n.x, y: n.y, w: n.w, h: n.h }; }
    else if (sel.type === "link")  { const n = (pg.links  || []).find((x) => x.id === sel.id); if (n) b = { x: n.x, y: n.y, w: n.w, h: n.h }; }
    else if (sel.type === "shape") {
      const s = (pg.shapes || []).find((x) => x.id === sel.id);
      if (s) b = shapeLocalBox(s);
    }
    if (!b) return false;
    const pad = 24;
    return lx.x >= b.x - pad && lx.x <= b.x + b.w + pad && lx.y >= b.y - pad && lx.y <= b.y + b.h + pad;
  }

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target === editTaRef.current || target.tagName === "TEXTAREA") return;

    // 屏蔽 iOS 长按选择 / 系统菜单
    if (e.pointerType === "pen" || e.pointerType === "touch") {
      const sel = window.getSelection?.();
      if (sel && sel.rangeCount > 0 && !editingIdRef.current) {
        try { sel.removeAllRanges(); } catch { /* ignore */ }
      }
    }

    const g = gRef.current;

    // 手写笔落下 → 激活 pen 模式；掌拒：pen 活跃期间忽略手指
    if (e.pointerType === "pen") {
      g.activePen = true;
    } else if (e.pointerType === "touch" && g.activePen) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ★ 已有 1 指在屏上，第 2 指落下 → 双指缩放选中元素（需中心点在选中元素上）
    if (g.pointers.size === 1 && !drawToolRef.current) {
      const pts0 = Array.from(g.pointers.values());
      const exist = pts0[0];
      const cx0 = (exist.x + e.clientX) / 2;
      const cy0 = (exist.y + e.clientY) / 2;
      const sel = selectedElRef.current;
      if (sel && isCenterOnSelectedEl(cx0, cy0)) {
        const pg = pageRef.current;
        let node: any = null;
        if (sel.type === "image") node = (pg.images || []).find((x) => x.id === sel.id);
        if (sel.type === "note")  node = (pg.notes  || []).find((x) => x.id === sel.id);
        if (sel.type === "table") node = (pg.tables || []).find((x) => x.id === sel.id);
        if (sel.type === "link")  node = (pg.links  || []).find((x) => x.id === sel.id);
        if (sel.type === "shape") node = (pg.shapes || []).find((x) => x.id === sel.id);
        if (node) {
          e.preventDefault();
          e.stopPropagation();
          g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
          const snap = getTwoFingerSnapshot();
          g.mode = "scaleEl";
          g.moved = true;
          g.longPressed = false;
          g.initial = { ...g.initial, dist: snap.dist, angle: snap.angle };
          (g as any).scaleElOrigin = JSON.parse(JSON.stringify(node));
          (g as any).scaleElType = sel.type;
          (g as any).dragImageOrigin = null;
          (g as any).dragExtraOrigin = null;
          g.dragShapeOrigin = null;
          return;
        }
      }
    }
    // ★ 元素连线模式
    if (elementConnectMode) {
      const lx = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
      if (lx.inside) {
        const img = hitImageAt(lx.x, lx.y, pageRef.current.images || []);
        const note = !img && hitNoteAt(lx.x, lx.y, pageRef.current.notes || []);
        const table = !img && !note && hitTableAt(lx.x, lx.y, pageRef.current.tables || []);
        const link = !img && !note && !table && hitLinkAt(lx.x, lx.y, pageRef.current.links || []);
        const shape = !img && !note && !table && !link && hitShapeAt(lx.x, lx.y, pageRef.current.shapes || []);
        const txt = hitText(e.clientX, e.clientY);
        const target: any =
          img ? { type: "image", id: img.id } :
          note ? { type: "note", id: note.id } :
          table ? { type: "table", id: table.id } :
          link ? { type: "link", id: link.id } :
          shape ? { type: "shape", id: shape.id } :
          txt ? { type: "text", id: txt.id } : null;
        if (target) {
          e.preventDefault(); e.stopPropagation();
          if (!g.connectSource) {
            g.connectSource = target;
          } else {
            const links = pageRef.current.elementLinks || [];
            const dup = links.find((x) => x.targetType === target.type && x.targetId === target.id);
            if (!dup) {
              onUpdateRef.current({
                elementLinks: [...links, {
                  id: `el-${Date.now()}`,
                  targetType: target.type,
                  targetId: target.id,
                  createdAt: Date.now(),
                }],
              });
            }
            g.connectSource = null;
          }
          return;
        }
      }
    }

    // ★ 绘制模式
      // ★ 有画笔时，只在"空白处双击"才退出画笔
    // 判空白：click 位置 30px 半径内没有任何笔迹
    if (drawToolRef.current && g.pointers.size === 0 && !editingIdRef.current) {
      const lx = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
      const nearAnyShape = (pageRef.current.shapes || []).some((s) => {
        if (isFreeKind(s.kind) && s.points) {
          for (const p of s.points) {
            if (Math.hypot(p.x - lx.x, p.y - lx.y) < 30) return true;
          }
          return false;
        }
        const x1 = Math.min(s.x1, s.x2) - 30;
        const y1 = Math.min(s.y1, s.y2) - 30;
        const x2 = Math.max(s.x1, s.x2) + 30;
        const y2 = Math.max(s.y1, s.y2) + 30;
        return lx.x >= x1 && lx.x <= x2 && lx.y >= y1 && lx.y <= y2;
      });

      const hitD = hitText(e.clientX, e.clientY);
      const hitIdD = hitD ? hitD.id : "__empty__";
      const lastD = lastTapRef.current;
      const nearD = Math.hypot(e.clientX - lastD.x, e.clientY - lastD.y) < 40;
      const isDouble = lastD.id === hitIdD && Date.now() - lastD.time < 600 && nearD;

      if (isDouble && !nearAnyShape) {
        onDrawToolConsumedRef.current?.();
        drawToolRef.current = null;
        lastTapRef.current = { time: 0, x: 0, y: 0, id: null };
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      lastTapRef.current = { time: Date.now(), x: e.clientX, y: e.clientY, id: hitIdD };
    }

    // ★ 绘制模式
    
    // ★ 绘制模式
    const tool = drawToolRef.current;
    if (tool) {
      e.preventDefault();
      e.stopPropagation();
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (tool === "eraser") {
        g.mode = "drawing";
        g.moved = true;
        drawingRef.current = { kind: "eraser", x1: 0, y1: 0, x2: 0, y2: 0 };
        eraseAt(e.clientX, e.clientY);
        return;
      }

      const local = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
      (g as any).pendingDraw = {
        pointerId: e.pointerId,
        sx: e.clientX, sy: e.clientY,
        localX: local.x, localY: local.y,
      };
      return;
    }

    if (!editingIdRef.current && g.pointers.size === 0) {
      const hit0 = hitText(e.clientX, e.clientY);
      const hitId = hit0 ? hit0.id : "__empty__";
      const now0 = Date.now();
      const last0 = lastTapRef.current;
      const nearLast = Math.hypot(e.clientX - last0.x, e.clientY - last0.y) < 40;
      if (last0.id === hitId && now0 - last0.time < 600 && nearLast) {
        lastTapRef.current = { time: 0, x: 0, y: 0, id: null };
        if (hit0) {
          enterEditing(hit0);
        } else {
          if (isInPaper(e.clientX, e.clientY)) {
            createTextAndEdit(e.clientX, e.clientY, "paper");
          } else {
            createTextAndEdit(e.clientX, e.clientY, "background");
          }
        }
        g.suppressNextUp = true;
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
        return;
      }
      lastTapRef.current = { time: now0, x: e.clientX, y: e.clientY, id: hitId };
    }

    // 图片 / 便签 / 表格 / 链接 命中
    if (!hitText(e.clientX, e.clientY)) {
      const lx = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
      if (lx.inside) {
        const img = hitImageAt(lx.x, lx.y, pageRef.current.images || []);
        const note = !img && hitNoteAt(lx.x, lx.y, pageRef.current.notes || []);
        const table = !img && !note && hitTableAt(lx.x, lx.y, pageRef.current.tables || []);
        const link = !img && !note && !table && hitLinkAt(lx.x, lx.y, pageRef.current.links || []);
        const hit: any = img || note || table || link;
        const type: any = img ? "image" : note ? "note" : table ? "table" : link ? "link" : null;
        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
          setSelectedEl({ type, id: hit.id });
          g.mode = "dragShape";
          g.dragShapeStart = { x: e.clientX, y: e.clientY };
          if (type === "image") {
            (g as any).dragImageOrigin = JSON.parse(JSON.stringify(hit));
            (g as any).dragExtraOrigin = null;
          } else {
            (g as any).dragImageOrigin = null;
            (g as any).dragExtraOrigin = { type, node: JSON.parse(JSON.stringify(hit)) };
          }
          g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          return;
        }
      }
    }

    // 非绘制模式：先看是否点到已画的图形
    if (!hitText(e.clientX, e.clientY)) {
      const hitShape = hitShapeAt(
        screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current).x,
        screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current).y,
        pageRef.current.shapes || [],
      );
      if (hitShape) {
        e.preventDefault();
        e.stopPropagation();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
        setSelectedEl({ type: "shape", id: hitShape.id });
        g.mode = "dragShape";
        g.dragShapeStart = { x: e.clientX, y: e.clientY };
        g.dragShapeOrigin = JSON.parse(JSON.stringify(hitShape));
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      } else {
        setSelectedEl(null);
      }
    }

    if (editingIdRef.current) {
      commitFloatingEditor();
      g.pointers.delete(e.pointerId);
      g.justCommittedEdit = true;
      return;
    }

    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}

    if (g.pointers.size === 1 && !boxRef.current) {
      const inMain = isInPaper(e.clientX, e.clientY);
      const hitMainText = hitText(e.clientX, e.clientY);
      if (!inMain && !hitMainText) {
        const other = hitOtherPage(e.clientX, e.clientY);
        if (other) {
          g.startPoint = { x: e.clientX, y: e.clientY };
          g.moved = false;
          g.pendingSwitchPageId = other.id;
          g.pendingBox = false;
          return;
        }
      }
    }

    if (g.pointers.size === 1) {
      const cur = paperStateRef.current;
      g.startPoint = { x: e.clientX, y: e.clientY };
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.pendingClearBoxOnUp = false;
      g.boxIncludePaper = false;
      g.initial = {
        ...g.initial,
        x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
        dist: 0, angle: 0, midX: 0, midY: 0,
        textX: 0, textY: 0,
      };

      if (boxRef.current) {
        const h = hitBoxHandle(e.clientX, e.clientY);
        if (h) {
          g.mode = "resizeBox";
          g.boxResizeHandle = h;
          g.boxOriginal = { ...boxRef.current };
          g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
          g.boxIncludePaper = boxContainsPaper(boxRef.current);
          g.boxOriginalMembers = textsRef.current
            .filter((t) => currentGroupMemberIds().includes(t.id))
            .map((t) => ({ id: t.id, x: t.x, y: t.y, fontSize: t.fontSize }));
          g.boxOriginalOtherPages = snapshotOriginalOtherPages();
          return;
        }
        const hit = hitText(e.clientX, e.clientY);
        if (hit) {
          g.dragTextId = hit.id;
          g.initial.textX = hit.x;
          g.initial.textY = hit.y;
          g.initial.fontSize = hit.fontSize;
          return;
        }
        if (isInsideBox(e.clientX, e.clientY)) {
          g.mode = "dragBox";
          const local = getStageLocal(e.clientX, e.clientY);
          g.boxMoveStart = local || { x: 0, y: 0 };
          g.boxMoveOriginal = { ...boxRef.current };
          g.boxIncludePaper = boxContainsPaper(boxRef.current);
          g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
          g.boxOriginalMembers = textsRef.current
            .filter((t) => currentGroupMemberIds().includes(t.id))
            .map((t) => ({ id: t.id, x: t.x, y: t.y, fontSize: t.fontSize }));
          g.boxOriginalOtherPages = snapshotOriginalOtherPages();
          return;
        }
        g.pendingClearBoxOnUp = true;
        return;
      }

      const hit = hitText(e.clientX, e.clientY);
      if (hit) {
        g.dragTextId = hit.id;
        g.initial.textX = hit.x;
        g.initial.textY = hit.y;
        g.initial.fontSize = hit.fontSize;
        return;
      }

      const inPaper = isInPaper(e.clientX, e.clientY);
      if (inPaper) {
        g.pendingBox = false;
        g.boxSourceLayer = "paper";
        g.boxIncludePaper = false;
      } else {
        g.pendingBox = true;
        g.boxSourceLayer = "background";
        g.boxIncludePaper = false;
        g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
        const local = getStageLocal(e.clientX, e.clientY);
        if (local) g.boxStartPoint = local;
      }
    } else if (g.pointers.size === 2) {
      // 双指落下 → 取消任何进行中的绘制 / 待绘制
      (g as any).pendingDraw = null;
      if (drawingRef.current) {
        drawingRef.current = null;
        setDraft(null);
      }
      clearTimeout(g.longPressTimer);
      g.moved = true;
      g.longPressed = false;
      g.pendingBox = false;
      g.pendingSwitchPageId = null;
      const cur = paperStateRef.current;
      const snap = getTwoFingerSnapshot();

      // ★ 有选中元素 且 双指中心落在元素上 → 缩放元素；否则走纸张 pinch
      const sel = selectedElRef.current;
      const centerOnSel = isCenterOnSelectedEl(snap.midX, snap.midY);
      if (sel && centerOnSel) {
        const pg = pageRef.current;
        let node: any = null;
        if (sel.type === "image") node = (pg.images || []).find((x) => x.id === sel.id);
        if (sel.type === "note")  node = (pg.notes  || []).find((x) => x.id === sel.id);
        if (sel.type === "table") node = (pg.tables || []).find((x) => x.id === sel.id);
        if (sel.type === "link")  node = (pg.links  || []).find((x) => x.id === sel.id);
        if (sel.type === "shape") node = (pg.shapes || []).find((x) => x.id === sel.id);
        if (node) {
          g.mode = "scaleEl";
          g.initial = { ...g.initial, dist: snap.dist, angle: snap.angle };
          (g as any).scaleElOrigin = JSON.parse(JSON.stringify(node));
          (g as any).scaleElType = sel.type;
          return;
        }
      }

      if (g.dragTextId) {
        const t = textsRef.current.find((x) => x.id === g.dragTextId);
        if (t) {
          g.mode = "scaleText";
          g.initial = { ...g.initial, dist: snap.dist, fontSize: t.fontSize };
          return;
        }
      }
      g.dragTextId = null;
      g.initial = {
        ...g.initial,
        x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
        dist: snap.dist, angle: snap.angle, midX: snap.midX, midY: snap.midY,
      };
      g.mode = "pinch";
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gRef.current;
    if (g.justCommittedEdit) return;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 待绘制 → 移动超过 4px 才真正开始
    const pd = (g as any).pendingDraw;
    if (pd && !drawingRef.current) {
      if (pd.pointerId !== e.pointerId) return;
      const dx = e.clientX - pd.sx;
      const dy = e.clientY - pd.sy;
      if (Math.hypot(dx, dy) < 4) return;
      const tool = drawToolRef.current;
      if (!tool || tool === "eraser") { (g as any).pendingDraw = null; return; }
      const local = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
      const st = styleForKind(tool);
      const isFree = isFreeKind(tool);
      const d: DrawingDraft = {
        kind: tool,
        x1: pd.localX, y1: pd.localY,
        x2: local.x, y2: local.y,
        points: isFree ? [{ x: pd.localX, y: pd.localY }, { x: local.x, y: local.y }] : undefined,
        pressures: isFree ? [0.5, typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 0.5] : undefined,
      };
      drawingRef.current = d;
      g.mode = "drawing";
      g.moved = true;
      (g as any).pendingDraw = null;
      setDraft({
        id: "draft", kind: tool, layer: "paper",
        x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        points: d.points,
        pressures: d.pressures,
        color: st.color, strokeWidth: st.strokeWidth, opacity: st.opacity,
      });
      return;
    }

    if (g.mode === "drawing" && drawingRef.current && (drawingRef.current as any).kind === "eraser") {
      eraseAt(e.clientX, e.clientY);
      return;
    }

    // ★ 绘制中
    if (g.mode === "drawing" && drawingRef.current) {
      const d = drawingRef.current;
      if (d.kind === "eraser") {
        eraseAt(e.clientX, e.clientY);
        return;
      }
      const isFree = isFreeKind(d.kind);
      if (isFree) {
        const pts = d.points || [];
        const ps = d.pressures || [];
        const native = e.nativeEvent as PointerEvent;
        const coalesced = native.getCoalescedEvents ? native.getCoalescedEvents() : [];
        const events: PointerEvent[] = coalesced.length > 0 ? coalesced : [native];
        for (const ev of events) {
          const local = screenToPaperLocal(ev.clientX, ev.clientY, stageRef.current, paperStateRef.current);
          const last = pts[pts.length - 1];
          if (!last || Math.hypot(local.x - last.x, local.y - last.y) > 0.5) {
            pts.push({ x: local.x, y: local.y });
            ps.push(typeof ev.pressure === "number" && ev.pressure > 0 ? ev.pressure : 0.5);
          }
        }
        d.points = pts;
        d.pressures = ps;
      } else {
        const local = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
        d.x2 = local.x;
        d.y2 = local.y;
      }
      const st = styleForKind(d.kind);
      setDraft({
        id: "draft",
        kind: d.kind,
        layer: "paper",
        x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        points: d.points ? [...d.points] : undefined,
        color: st.color,
        strokeWidth: st.strokeWidth,
        opacity: st.opacity,
      });
      return;
    }

    // ★ 拖动图片
    if (g.mode === "dragShape" && (g as any).dragImageOrigin) {
      const o = (g as any).dragImageOrigin;
      const dx = e.clientX - g.dragShapeStart.x;
      const dy = e.clientY - g.dragShapeStart.y;
      const p = paperStateRef.current;
      const rad = (-p.rotate * Math.PI) / 180;
      const cos = Math.cos(rad); const sin = Math.sin(rad);
      const ldx = (dx * cos - dy * sin) / (p.scale || 1);
      const ldy = (dx * sin + dy * cos) / (p.scale || 1);
      const moved = { ...o, x: o.x + ldx, y: o.y + ldy };
      onUpdateRef.current({ images: (pageRef.current.images || []).map((x) => x.id === o.id ? moved : x) });
      return;
    }

    // ★ 拖动已选中的图形
    if (g.mode === "dragShape" && g.dragShapeOrigin) {
      const o = g.dragShapeOrigin;
      const dx = e.clientX - g.dragShapeStart.x;
      const dy = e.clientY - g.dragShapeStart.y;
      const p = paperStateRef.current;
      const rad = (-p.rotate * Math.PI) / 180;
      const cos = Math.cos(rad); const sin = Math.sin(rad);
      const ldx = (dx * cos - dy * sin) / (p.scale || 1);
      const ldy = (dx * sin + dy * cos) / (p.scale || 1);
      const moved: ShapeNode = {
        ...o,
        x1: o.x1 + ldx, y1: o.y1 + ldy,
        x2: o.x2 + ldx, y2: o.y2 + ldy,
        points: o.points ? o.points.map((pt) => ({ x: pt.x + ldx, y: pt.y + ldy })) : undefined,
      };
      const list = (pageRef.current.shapes || []).map((s) => s.id === o.id ? moved : s);
      onUpdateRef.current({ shapes: list });
      return;
    }

    // ★ 拖动便签 / 表格 / 链接
    if (g.mode === "dragShape" && (g as any).dragExtraOrigin) {
      const o = (g as any).dragExtraOrigin;
      const dx = e.clientX - g.dragShapeStart.x;
      const dy = e.clientY - g.dragShapeStart.y;
      const p = paperStateRef.current;
      const rad = (-p.rotate * Math.PI) / 180;
      const cos = Math.cos(rad); const sin = Math.sin(rad);
      const ldx = (dx * cos - dy * sin) / (p.scale || 1);
      const ldy = (dx * sin + dy * cos) / (p.scale || 1);
      const moved = { ...o.node, x: o.node.x + ldx, y: o.node.y + ldy };
      if (o.type === "note") {
        onUpdateRef.current({ notes: (pageRef.current.notes || []).map((n) => n.id === o.node.id ? moved : n) });
      } else if (o.type === "table") {
        onUpdateRef.current({ tables: (pageRef.current.tables || []).map((t) => t.id === o.node.id ? moved : t) });
      } else {
        onUpdateRef.current({ links: (pageRef.current.links || []).map((l) => l.id === o.node.id ? moved : l) });
      }
      return;
    }

    if (g.pendingSwitchPageId) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      if (Math.hypot(dx, dy) > 10) {
        g.pendingSwitchPageId = null;
        g.moved = true;
        g.mode = "boxSelect";
        const b0 = { x: g.boxStartPoint.x, y: g.boxStartPoint.y, w: 0, h: 0 };
        boxRef.current = b0;
        setBox(b0);
        setBoxGroupId(null); boxGroupIdRef.current = null;
        g.pendingBox = false;
      }
      return;
    }

    if (g.mode === "idle" && g.pointers.size === 1) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(g.longPressTimer);
        g.moved = true;
        g.pendingClearBoxOnUp = false;
        if (g.pendingBox) {
          g.mode = "boxSelect";
          const b0 = { x: g.boxStartPoint.x, y: g.boxStartPoint.y, w: 0, h: 0 };
          boxRef.current = b0;
          setBox(b0);
          setBoxGroupId(null); boxGroupIdRef.current = null;
          g.pendingBox = false;
        } else {
          g.mode = g.dragTextId ? "dragText" : "dragPaper";
          if (g.dragTextId) {
            const t = textsRef.current.find((x) => x.id === g.dragTextId);
            if (t) { setDraggingTextId(t.id); }
          }
        }
      }
    }

    if (g.mode === "dragPaper" && g.pointers.size === 1) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      setPaper((p) => ({ ...p, x: g.initial.x + dx, y: g.initial.y + dy }));
    }
    if (g.mode === "dragText" && g.pointers.size === 1 && g.dragTextId) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      const t = textsRef.current.find((x) => x.id === g.dragTextId);
      if (!t) return;
      if (t.layer === "background") {
        updateText(t.id, { x: g.initial.textX + dx, y: g.initial.textY + dy });
      } else {
        const p = paperStateRef.current;
        const rad = (-p.rotate * Math.PI) / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        const rx = (dx * cos - dy * sin) / (p.scale || 1);
        const ry = (dx * sin + dy * cos) / (p.scale || 1);
        updateText(t.id, { x: g.initial.textX + rx, y: g.initial.textY + ry });
      }
    }
    // ★ 双指缩放选中元素
    if (g.mode === "scaleEl" && g.pointers.size === 2) {
      const snap = getTwoFingerSnapshot();
      const ratio = snap.dist / (g.initial.dist || 1);
      const daRad = normalizeAngleDiff(snap.angle - g.initial.angle);
      const dDeg = (daRad * 180) / Math.PI;
      const o = (g as any).scaleElOrigin;
      const type = (g as any).scaleElType;
      if (!o) return;
      const baseRot = (o.rotate as number) || 0;
      const newRot = baseRot + dDeg;

      if (type === "image") {
        onUpdateRef.current({
          images: (pageRef.current.images || []).map((x) =>
            x.id === o.id ? { ...o, w: Math.max(20, o.w * ratio), h: Math.max(20, o.h * ratio), rotate: newRot } : x),
        });
      } else if (type === "note") {
        onUpdateRef.current({
          notes: (pageRef.current.notes || []).map((x) =>
            x.id === o.id ? { ...o, w: Math.max(60, o.w * ratio), h: Math.max(40, o.h * ratio), rotate: newRot } : x),
        });
      } else if (type === "table") {
        onUpdateRef.current({
          tables: (pageRef.current.tables || []).map((x) =>
            x.id === o.id ? { ...o, w: Math.max(80, o.w * ratio), h: Math.max(60, o.h * ratio), rotate: newRot } : x),
        });
      } else if (type === "link") {
        onUpdateRef.current({
          links: (pageRef.current.links || []).map((x) =>
            x.id === o.id ? { ...o, w: Math.max(100, o.w * ratio), rotate: newRot } : x),
        });
      } else if (type === "shape") {
        const cx = (o.x1 + o.x2) / 2;
        const cy = (o.y1 + o.y2) / 2;
        const rad = (dDeg * Math.PI) / 180;
        const cosR = Math.cos(rad), sinR = Math.sin(rad);
        const applyBoth = (px: number, py: number) => {
          const sx = cx + (px - cx) * ratio;
          const sy = cy + (py - cy) * ratio;
          return {
            x: cx + (sx - cx) * cosR - (sy - cy) * sinR,
            y: cy + (sx - cx) * sinR + (sy - cy) * cosR,
          };
        };
        const p1 = applyBoth(o.x1, o.y1);
        const p2 = applyBoth(o.x2, o.y2);
        const nextPoints = o.points
          ? o.points.map((p: any) => applyBoth(p.x, p.y))
          : undefined;
        onUpdateRef.current({
          shapes: (pageRef.current.shapes || []).map((x) =>
            x.id === o.id ? {
              ...o,
              x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
              points: nextPoints,
              strokeWidth: Math.max(1, o.strokeWidth * ratio),
            } : x),
        });
      }
      return;
    }

    if (g.mode === "pinch" && g.pointers.size === 2) {
      const snap = getTwoFingerSnapshot();
      const scale = Math.max(0.02, Math.min(30, g.initial.scale * (snap.dist / (g.initial.dist || 1))));
      const daRad = normalizeAngleDiff(snap.angle - g.initial.angle);
      const rotate = g.initial.rotate + (daRad * 180) / Math.PI;
      const x = g.initial.x + (snap.midX - g.initial.midX);
      const y = g.initial.y + (snap.midY - g.initial.midY);
      setPaper({ ...paperStateRef.current, x, y, scale, rotate });
    }
    if (g.mode === "scaleText" && g.pointers.size === 2 && g.dragTextId) {
      const snap = getTwoFingerSnapshot();
      const ratio = snap.dist / (g.initial.dist || 1);
      const next = Math.max(8, Math.min(200, g.initial.fontSize * ratio));
      updateText(g.dragTextId, { fontSize: next });
    }

    if (g.mode === "boxSelect") {
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local) return;
      const x1 = Math.min(g.boxStartPoint.x, local.x);
      const y1 = Math.min(g.boxStartPoint.y, local.y);
      const w = Math.abs(local.x - g.boxStartPoint.x);
      const h = Math.abs(local.y - g.boxStartPoint.y);
      const b = { x: x1, y: y1, w, h };
      boxRef.current = b;
      setBox(b);
    }

    if (g.mode === "dragBox") {
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local || !boxRef.current) return;
      const dxStage = local.x - g.boxMoveStart.x;
      const dyStage = local.y - g.boxMoveStart.y;

      if (g.boxIncludePaper) {
        const nextTexts = textsRef.current.map((t) => {
          const om = g.boxOriginalMembers.find((m) => m.id === t.id);
          if (!om) return t;
          if (t.layer === "background") {
            return { ...t, x: om.x + dxStage, y: om.y + dyStage };
          }
          return t;
        });
        textsRef.current = nextTexts;
        onUpdateRef.current({ texts: nextTexts });

        setPaper((prev) => ({
          ...prev,
          x: g.boxOriginalPaper.x + dxStage,
          y: g.boxOriginalPaper.y + dyStage,
        }));
      } else {
        const p = paperStateRef.current;
        const rad = (-p.rotate * Math.PI) / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        const nextTexts = textsRef.current.map((t) => {
          const om = g.boxOriginalMembers.find((m) => m.id === t.id);
          if (!om) return t;
          if (t.layer === "background") {
            return { ...t, x: om.x + dxStage, y: om.y + dyStage };
          }
          const rx = (dxStage * cos - dyStage * sin) / (p.scale || 1);
          const ry = (dxStage * sin + dyStage * cos) / (p.scale || 1);
          return { ...t, x: om.x + rx, y: om.y + ry };
        });
        textsRef.current = nextTexts;
        onUpdateRef.current({ texts: nextTexts });
      }

      if (g.boxOriginalOtherPages.length > 0 && onUpdatePageTransformRef.current) {
        for (const op of g.boxOriginalOtherPages) {
          onUpdatePageTransformRef.current(op.id, {
            x: op.x + dxStage,
            y: op.y + dyStage,
            scale: op.scale,
            rotate: 0,
          });
        }
      }

      const b = {
        x: g.boxMoveOriginal.x + dxStage,
        y: g.boxMoveOriginal.y + dyStage,
        w: g.boxMoveOriginal.w,
        h: g.boxMoveOriginal.h,
      };
      boxRef.current = b;
      setBox(b);
    }

    if (g.mode === "resizeBox") {
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local) return;
      const o = g.boxOriginal;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      switch (g.boxResizeHandle) {
        case "nw": x1 = local.x; y1 = local.y; break;
        case "ne": x2 = local.x; y1 = local.y; break;
        case "se": x2 = local.x; y2 = local.y; break;
        case "sw": x1 = local.x; y2 = local.y; break;
      }
      const nx = Math.min(x1, x2);
      const ny = Math.min(y1, y2);
      const nw = Math.abs(x2 - x1);
      const nh = Math.abs(y2 - y1);
      const b = { x: nx, y: ny, w: nw, h: nh };
      boxRef.current = b;
      setBox(b);

      if (o.w > 1 && o.h > 1) {
        const ratioX = nw / o.w;
        const ratioY = nh / o.h;
        const ratio = Math.max(0.05, Math.min(ratioX, ratioY));
        const ocx = o.x + o.w / 2;
        const ocy = o.y + o.h / 2;
        const ncx = nx + nw / 2;
        const ncy = ny + nh / 2;
        const sr = stageRef.current?.getBoundingClientRect();
        if (!sr) return;
        const p = paperStateRef.current;

        const nextTexts = textsRef.current.map((t) => {
          const om = g.boxOriginalMembers.find((m) => m.id === t.id);
          if (!om) return t;

          if (g.boxIncludePaper && t.layer === "paper") {
            return t;
          }

          let localX = 0, localY = 0;
          if (t.layer === "background") {
            localX = om.x; localY = om.y;
          } else {
            const px = om.x - sr.width / 2;
            const py = om.y - sr.height / 2;
            const rad = (p.rotate * Math.PI) / 180;
            const cos = Math.cos(rad); const sin = Math.sin(rad);
            localX = (px * cos - py * sin) * p.scale + sr.width / 2 + p.x;
            localY = (px * sin + py * cos) * p.scale + sr.height / 2 + p.y;
          }
          const nlx = ncx + (localX - ocx) * ratio;
          const nly = ncy + (localY - ocy) * ratio;
          const nextFontSize = Math.max(4, om.fontSize * ratio);
          if (t.layer === "background") {
            return { ...t, x: nlx, y: nly, fontSize: nextFontSize };
          } else {
            const rx0 = nlx - sr.width / 2 - p.x;
            const ry0 = nly - sr.height / 2 - p.y;
            const rad2 = (-p.rotate * Math.PI) / 180;
            const cos2 = Math.cos(rad2); const sin2 = Math.sin(rad2);
            const plx = (rx0 * cos2 - ry0 * sin2) / (p.scale || 1) + sr.width / 2;
            const ply = (rx0 * sin2 + ry0 * cos2) / (p.scale || 1) + sr.height / 2;
            return { ...t, x: plx, y: ply, fontSize: nextFontSize };
          }
        });
        textsRef.current = nextTexts;
        onUpdateRef.current({ texts: nextTexts });

        if (g.boxIncludePaper) {
          const stageW = sr.width;
          const stageH = sr.height;
          const opx = stageW / 2 + g.boxOriginalPaper.x;
          const opy = stageH / 2 + g.boxOriginalPaper.y;
          const npx = ncx + (opx - ocx) * ratio;
          const npy = ncy + (opy - ocy) * ratio;
          const newPaperX = npx - stageW / 2;
          const newPaperY = npy - stageH / 2;
          const newPaperScale = g.boxOriginalPaper.scale * ratio;
          setPaper((prev) => ({ ...prev, x: newPaperX, y: newPaperY, scale: newPaperScale }));
        }

        if (g.boxOriginalOtherPages.length > 0 && onUpdatePageTransformRef.current) {
          const stageW = sr.width;
          const stageH = sr.height;
          for (const op of g.boxOriginalOtherPages) {
            const ocxStage = stageW / 2 + op.x;
            const ocyStage = stageH / 2 + op.y;
            const npx = ncx + (ocxStage - ocx) * ratio;
            const npy = ncy + (ocyStage - ocy) * ratio;
            const newX = npx - stageW / 2;
            const newY = npy - stageH / 2;
            const newScale = op.scale * ratio;
            onUpdatePageTransformRef.current(op.id, {
              x: newX,
              y: newY,
              scale: newScale,
              rotate: 0,
            });
          }
        }
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gRef.current;
    if (e.pointerType === "pen") g.activePen = false;
    (g as any).pendingDraw = null;

    if (g.mode === "drawing" && drawingRef.current && (drawingRef.current as any).kind === "eraser") {
      drawingRef.current = null;
      g.mode = "idle"; g.moved = false;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      onDrawToolConsumedRef.current?.();
      return;
    }

    // ★ 提交绘制（不退出工具，用户可以连续画）
    if (g.mode === "drawing" && drawingRef.current) {
      const d = drawingRef.current;
      if (d.kind === "eraser") {
        drawingRef.current = null;
        g.mode = "idle"; g.moved = false;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
        g.pointers.delete(e.pointerId);
        clearTimeout(g.longPressTimer);
        return;
      }
      const st = styleForKind(d.kind);
      const id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const isFree = isFreeKind(d.kind);
      if (isFree) {
        if (d.points && d.points.length >= 2) {
          pushShapeHistory();
          const shape: ShapeNode = {
            id, kind: d.kind, layer: "paper",
            x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
            points: d.points,
            pressures: d.pressures,
            color: st.color, strokeWidth: st.strokeWidth, opacity: st.opacity,
          };
          const next = [...(pageRef.current.shapes || []), shape];
          onUpdateRef.current({ shapes: next });
        }
      } else {
        const moved = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
        if (moved > 4) {
          pushShapeHistory();
          const shape: ShapeNode = {
            id, kind: d.kind, layer: "paper",
            x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
            color: st.color, strokeWidth: st.strokeWidth, opacity: st.opacity,
          };
          const next = [...(pageRef.current.shapes || []), shape];
          onUpdateRef.current({ shapes: next });
        }
      }
      drawingRef.current = null;
      setDraft(null);
      g.mode = "idle"; g.moved = false;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      return;
    }

    if (g.mode === "scaleEl") {
      g.mode = "idle"; g.moved = false;
      (g as any).scaleElOrigin = null;
      (g as any).scaleElType = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      if (g.pointers.size === 1) {
        const rem = Array.from(g.pointers.entries())[0];
        g.startPoint = { x: rem[1].x, y: rem[1].y };
      }
      return;
    }

    // ★ 结束图形拖动
    if (g.mode === "dragShape") {
      g.mode = "idle"; g.moved = false;
      g.dragShapeOrigin = null;
      (g as any).dragExtraOrigin = null;
      (g as any).dragImageOrigin = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      return;
    }

    if (g.suppressNextUp) {
      g.suppressNextUp = false;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      return;
    }
    if (g.justCommittedEdit) {
      g.justCommittedEdit = false;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      return;
    }
    const wasMode = g.mode;
    const wasMoved = g.moved;
    const wasLongPressed = g.longPressed;
    const dragTextId = g.dragTextId;
    const boxSourceLayer = g.boxSourceLayer;
    const pendingSwitch = g.pendingSwitchPageId;
    const pendingClearBoxOnUp = g.pendingClearBoxOnUp;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    g.pointers.delete(e.pointerId);
    clearTimeout(g.longPressTimer);

    if (pendingSwitch && !wasMoved) {
      g.pendingSwitchPageId = null;
      g.mode = "idle"; g.moved = false; g.longPressed = false;
      g.pendingClearBoxOnUp = false;
      onSelectPage?.(pendingSwitch);
      return;
    }
    g.pendingSwitchPageId = null;

    if (pendingClearBoxOnUp && wasMode === "idle" && !wasMoved && !wasLongPressed) {
      clearBox();
    }
    g.pendingClearBoxOnUp = false;

    if (wasMode === "boxSelect") {
      const b = boxRef.current;
      if (!b || b.w < 4 || b.h < 4) {
        clearBox();
        const layer = boxSourceLayer === "paper" ? "paper" : "background";
        createTextAndEdit(e.clientX, e.clientY, layer);
      } else {
        commitBoxAsGroup();
      }
      g.mode = "idle"; g.moved = false; g.dragTextId = null;
      g.pendingBox = false; g.boxIncludePaper = false;
      g.boxOriginalOtherPages = [];
      return;
    }
    if (wasMode === "dragBox" || wasMode === "resizeBox") {
      commitBoxAsGroup();
      g.mode = "idle"; g.moved = false; g.dragTextId = null;
      g.pendingBox = false; g.boxIncludePaper = false;
      g.boxOriginalOtherPages = [];
      return;
    }

    g.pendingBox = false;
    g.boxIncludePaper = false;
    g.boxOriginalOtherPages = [];

    if ((wasMode === "dragText" || wasMode === "scaleText") && dragTextId && wasMoved) {
      const t = textsRef.current.find((x) => x.id === dragTextId);
      if (t) {
        if (wasMode === "dragText") {
          const inPaper = isInPaper(e.clientX, e.clientY);
          const stageRect = stageRef.current?.getBoundingClientRect();
          if (t.layer === "background" && inPaper) {
            const local = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
            updateText(t.id, { layer: "paper", x: local.x, y: local.y });
          } else if (t.layer === "paper" && !inPaper && stageRect) {
            updateText(t.id, {
              layer: "background",
              x: e.clientX - stageRect.left,
              y: e.clientY - stageRect.top,
            });
          }
        }
      }
      setDraggingTextId(null);
    }

    if (g.pointers.size === 0) {
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
    } else if (g.pointers.size === 1) {
      const rem = Array.from(g.pointers.entries())[0];
      const cur = paperStateRef.current;
      g.startPoint = { x: rem[1].x, y: rem[1].y };
      g.initial = {
        ...g.initial,
        x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
        dist: 0, angle: 0, midX: 0, midY: 0,
      };
      g.mode = "idle";
      g.moved = false;
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    const g = gRef.current;
    g.pointers.delete(e.pointerId);
    clearTimeout(g.longPressTimer);

    // 彻底清掉所有中间状态
    drawingRef.current = null;
    setDraft(null);
    (g as any).pendingDraw = null;
    (g as any).dragImageOrigin = null;
    (g as any).dragExtraOrigin = null;
    (g as any).scaleElOrigin = null;
    (g as any).scaleElType = null;
    g.dragShapeOrigin = null;
    g.connectSource = null;
    g.activePen = false;

    if (g.mode === "drawing") {
      g.mode = "idle"; g.moved = false;
    }

    if (g.pointers.size === 0) {
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.boxIncludePaper = false;
      g.pendingSwitchPageId = null;
      g.pendingClearBoxOnUp = false;
      g.justCommittedEdit = false;
      g.boxOriginalOtherPages = [];
      setDraggingTextId(null);
    }
  }
  function getSelectedRefs(): { type: any; id: string }[] {
    const out: { type: any; id: string }[] = [];
    const b = boxRef.current;
    if (b && b.w >= 4 && b.h >= 4) {
      const restrictTo = gRef.current.boxSourceLayer === "paper" ? "paper" : "background";
      computeMembersInBox(b, restrictTo).forEach((id) => out.push({ type: "text", id }));
    }
    const sel = selectedElRef.current;
    if (sel) out.push({ type: sel.type, id: sel.id });
    return out;
  }

  function boundsOf(type: string, id: string): { x: number; y: number; w: number; h: number } | null {
    const pg = pageRef.current;
    if (type === "image") { const n = (pg.images || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "note")  { const n = (pg.notes || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "table") { const n = (pg.tables || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "link")  { const n = (pg.links || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "shape") {
      const n = (pg.shapes || []).find((x) => x.id === id);
      if (!n) return null;
      return { x: Math.min(n.x1, n.x2), y: Math.min(n.y1, n.y2), w: Math.abs(n.x2 - n.x1), h: Math.abs(n.y2 - n.y1) };
    }
    return null;
  }

  function setPos(type: string, id: string, dx: number, dy: number) {
    const pg = pageRef.current;
    if (type === "image") onUpdateRef.current({ images: (pg.images || []).map((x) => x.id === id ? { ...x, x: x.x + dx, y: x.y + dy } : x) });
    if (type === "note")  onUpdateRef.current({ notes:  (pg.notes  || []).map((x) => x.id === id ? { ...x, x: x.x + dx, y: x.y + dy } : x) });
    if (type === "table") onUpdateRef.current({ tables: (pg.tables || []).map((x) => x.id === id ? { ...x, x: x.x + dx, y: x.y + dy } : x) });
    if (type === "link")  onUpdateRef.current({ links:  (pg.links  || []).map((x) => x.id === id ? { ...x, x: x.x + dx, y: x.y + dy } : x) });
    if (type === "shape") {
      onUpdateRef.current({
        shapes: (pg.shapes || []).map((s) =>
          s.id === id
            ? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy,
                points: s.points ? s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : undefined }
            : s,
        ),
      });
    }
  }

  function handleSheetAction(kind: string) {
    const sel = getSelectedRefs();

    if (kind.startsWith("align-")) {
      const bs = sel.map((s) => ({ s, b: boundsOf(s.type, s.id) })).filter((x) => x.b) as { s: any; b: any }[];
      if (bs.length < 2) return;
      const minX = Math.min(...bs.map((x) => x.b.x));
      const maxX = Math.max(...bs.map((x) => x.b.x + x.b.w));
      const minY = Math.min(...bs.map((x) => x.b.y));
      const maxY = Math.max(...bs.map((x) => x.b.y + x.b.h));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      bs.forEach(({ s, b }) => {
        let dx = 0, dy = 0;
        if (kind === "align-left")    dx = minX - b.x;
        if (kind === "align-hcenter") dx = cx - (b.x + b.w / 2);
        if (kind === "align-right")   dx = maxX - (b.x + b.w);
        if (kind === "align-top")     dy = minY - b.y;
        if (kind === "align-vcenter") dy = cy - (b.y + b.h / 2);
        if (kind === "align-bottom")  dy = maxY - (b.y + b.h);
        if (dx || dy) setPos(s.type, s.id, dx, dy);
      });
      return;
    }

    if (kind === "bring-front" || kind === "bring-forward" || kind === "send-backward" || kind === "send-back") {
      const ids = sel.filter((s) => s.type === "shape").map((s) => s.id);
      if (!ids.length) return;
      const shapes = [...(pageRef.current.shapes || [])];
      ids.forEach((id) => {
        const i = shapes.findIndex((s) => s.id === id);
        if (i < 0) return;
        const [item] = shapes.splice(i, 1);
        const j = kind === "bring-front" ? shapes.length
          : kind === "send-back" ? 0
          : kind === "bring-forward" ? Math.min(shapes.length, i + 1)
          : Math.max(0, i - 1);
        shapes.splice(j, 0, item);
      });
      onUpdateRef.current({ shapes });
      return;
    }

    if (kind === "group") {
      const ids = sel.map((s) => s.id);
      if (!ids.length) return;
      const gid = `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      onUpdateRef.current({
        groups: [...(pageRef.current.groups || []), { id: gid, memberIds: ids, createdAt: Date.now() }],
      });
      return;
    }
    if (kind === "ungroup") {
      const gid = boxGroupIdRef.current;
      if (gid) {
        onUpdateRef.current({ groups: (pageRef.current.groups || []).filter((g) => g.id !== gid) });
        clearBox();
      }
      return;
    }
  }

  useEffect(() => {
    if (!sheetAction) return;
    handleSheetAction(sheetAction.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetAction?.id]);
  const otherPages = (allPages || []).filter((p) => p.id !== page.id);

  const selectedTextIds = new Set<string>();
  const selectedPageIds = new Set<string>();
  {
    const b = boxRef.current;
    if (b && b.w >= 4 && b.h >= 4) {
      const restrictTo = gRef.current.boxSourceLayer === "paper" ? "paper" : "background";
      computeMembersInBox(b, restrictTo).forEach((id) => selectedTextIds.add(id));
      computeOtherPagesInBox(b).forEach((id) => selectedPageIds.add(id));
    }
    currentGroupMemberIds().forEach((id) => selectedTextIds.add(id));
    currentGroupPageIds().forEach((id) => selectedPageIds.add(id));
  }
  const mainPaperSelected = boxContainsPaper(boxRef.current || { x: 0, y: 0, w: 0, h: 0 });

  const hasSelection = !!boxGroupId || (box != null && box.w >= 4 && box.h >= 4);
  const isDrawing = !!drawTool;

  /* ---- 框选版工具条：框内所有 shape（不分类型） ---- */
  // 注意：box 是 stage 局部坐标，shape 包围盒经 paperLocalToScreen 出来是屏幕坐标，
  // 因此统一把 box 抬到屏幕坐标再比对（与 computeMembersInBox 的做法一致）。
  const shapesInBox = (b: BoxState): ShapeNode[] => {
    const stageEl = stageRef.current;
    if (!stageEl) return [];
    const sr = stageEl.getBoundingClientRect();
    const bx1 = sr.left + b.x;
    const by1 = sr.top + b.y;
    const bx2 = bx1 + b.w;
    const by2 = by1 + b.h;
    return (pageRef.current.shapes || []).filter((s) => {
      const lb = shapeLocalBox(s);
      const c1 = paperLocalToScreen(lb.x, lb.y, stageEl, paperStateRef.current);
      const c2 = paperLocalToScreen(lb.x + lb.w, lb.y + lb.h, stageEl, paperStateRef.current);
      const x1 = Math.min(c1.x, c2.x);
      const y1 = Math.min(c1.y, c2.y);
      const x2 = Math.max(c1.x, c2.x);
      const y2 = Math.max(c1.y, c2.y);
      return !(x2 < bx1 || x1 > bx2 || y2 < by1 || y1 > by2);
    });
  };

  /* ---- 笔迹工具条：只对选中的 shape 生效 ---- */
  const selectedShape = (!isDrawing && selectedEl?.type === "shape")
    ? (page.shapes || []).find((s) => s.id === selectedEl.id) || null
    : null;

  const penBarPos = (() => {
    if (!selectedShape) return null;

    const BAR_W = 4 * 2 + 36 * 6 + 4 * 5;   // padding*2 + 6 个圆钮 + 5 个间距
    const BAR_H = 44;

    // 优先用渲染出来的 <g data-shape-id> / <path data-shape-id> 实测量取屏幕包围盒
    let minX = 0, maxX = 0, minY = 0, maxY = 0, measured = false;
    const host = stageRef.current;
    if (host) {
      const el = host.querySelector(`[data-shape-id="${selectedShape.id}"]`) as SVGGraphicsElement | null;
      if (el) {
        try {
          const r = el.getBoundingClientRect();
          if (r.width > 0 || r.height > 0) {
            minX = r.left; maxX = r.right;
            minY = r.top; maxY = r.bottom;
            measured = true;
          }
        } catch { /* ignore */ }
      }
    }
    if (!measured) {
      // 兜底：局部包围盒四角 → 屏幕，取屏幕轴对齐包围盒
      const lb = shapeLocalBox(selectedShape);
      const corners = [
        paperLocalToScreen(lb.x, lb.y, stageRef.current, paper),
        paperLocalToScreen(lb.x + lb.w, lb.y, stageRef.current, paper),
        paperLocalToScreen(lb.x, lb.y + lb.h, stageRef.current, paper),
        paperLocalToScreen(lb.x + lb.w, lb.y + lb.h, stageRef.current, paper),
      ];
      minX = Math.min(...corners.map((c) => c.x));
      maxX = Math.max(...corners.map((c) => c.x));
      minY = Math.min(...corners.map((c) => c.y));
      maxY = Math.max(...corners.map((c) => c.y));
    }

    let left = (minX + maxX) / 2 - BAR_W / 2;
    let top = minY - 60;                    // 包围盒上方 60px
    if (top < 8) top = maxY + 20;           // 超出屏幕顶部 → 改到包围盒下方 20px
    left = Math.max(8, Math.min(left, window.innerWidth - BAR_W - 8));
    if (top + BAR_H > window.innerHeight - 8) top = Math.max(8, window.innerHeight - BAR_H - 8);
    return { left, top };
  })();

  const paperInner = (
    <>
      {texts.filter((t) => t.layer === "paper").map((t) => (
        <TextElement
          key={t.id}
          t={t}
          isEditing={editingId === t.id}
          isDragging={draggingTextId === t.id}
          isSelected={selectedTextIds.has(t.id)}
        />
      ))}
      {(page.images || []).filter((im) => im.layer === "paper").map((im) => (
        <img
          key={im.id}
          src={im.src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: im.x, top: im.y, width: im.w, height: im.h,
            objectFit: "contain",
            transform: `rotate(${im.rotate || 0}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
            boxShadow: selectedEl?.type === "image" && selectedEl.id === im.id ? "0 0 0 2px #3b82f6" : "none",
          }}
        />
      ))}
      {(page.notes || []).filter((n) => n.layer === "paper").map((n) => (
        <div
          key={n.id}
          style={{
            position: "absolute",
            left: n.x, top: n.y, width: n.w, height: n.h,
            background: n.bgColor, color: n.textColor,
            borderRadius: 6,
            transform: `rotate(${n.rotate || 0}deg)`,
            transformOrigin: "center center",
            padding: 10, boxSizing: "border-box",
            fontSize: n.fontSize, lineHeight: 1.4,
            overflow: "hidden", whiteSpace: "pre-wrap",
            pointerEvents: "none",
            boxShadow: selectedEl?.type === "note" && selectedEl.id === n.id
              ? "0 0 0 2px #3b82f6, 0 2px 8px rgba(0,0,0,.08)"
              : "0 2px 8px rgba(0,0,0,.08)",
          }}
        >{n.text}</div>
      ))}
      {(page.tables || []).filter((t) => t.layer === "paper").map((t) => (
        <div
          key={t.id}
          style={{
            position: "absolute",
            left: t.x, top: t.y, width: t.w, height: t.h,
            display: "grid",
            gridTemplateRows: `repeat(${t.rows}, 1fr)`,
            gridTemplateColumns: `repeat(${t.cols}, 1fr)`,
            pointerEvents: "none",
            transform: `rotate(${t.rotate || 0}deg)`,
            transformOrigin: "center center",
            border: selectedEl?.type === "table" && selectedEl.id === t.id
              ? "2px solid #3b82f6"
              : "1.5px solid #3a352e",
            boxSizing: "border-box",
            background: "#ffffff",
          }}
        >
          {Array.from({ length: t.rows }).map((_, r) =>
            Array.from({ length: t.cols }).map((__, c) => (
              <div key={`${r}-${c}`} style={{
                borderRight: c < t.cols - 1 ? "1px solid #3a352e" : "none",
                borderBottom: r < t.rows - 1 ? "1px solid #3a352e" : "none",
                fontSize: 12, padding: 4, boxSizing: "border-box",
                overflow: "hidden",
              }}>{t.cells[r]?.[c] || ""}</div>
            ))
          )}
        </div>
      ))}
      {(page.links || []).filter((l) => l.layer === "paper").map((l) => (
        <div
          key={l.id}
          style={{
            position: "absolute",
            left: l.x, top: l.y, width: l.w, height: l.h,
            background: "#eaf3fb", color: "#2a4a6b",
            transform: `rotate(${l.rotate || 0}deg)`,
            transformOrigin: "center center",
            border: selectedEl?.type === "link" && selectedEl.id === l.id
              ? "2px solid #3b82f6"
              : "1px solid rgba(42,74,107,.3)",
            borderRadius: 8, padding: "8px 12px", boxSizing: "border-box",
            fontSize: 13, overflow: "hidden",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{l.title || l.url}</div>
          <div style={{ fontSize: 11, color: "#5a7fa0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</div>
        </div>
      ))}
      <svg
        width="100%"
        height="100%"
        viewBox={paper.w > 0 && paper.h > 0 ? `0 0 ${paper.w} ${paper.h}` : undefined}
        preserveAspectRatio={paper.w > 0 && paper.h > 0 ? "none" : "xMidYMid meet"}
        style={{
          position: "absolute",
          left: 0, top: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
          overflow: "hidden",
          shapeRendering: "geometricPrecision",
          willChange: "transform",
        }}
      >
        {shapes.filter((s) => s.layer === "paper").map((s) => renderShape(s, selectedEl?.type === "shape" ? selectedEl.id : null))}
        {draft && renderShape(draft)}
      </svg>
    </>
  );

  return (
    <div
      ref={stageRef}
      data-stage
      style={{
        flex: 1, minHeight: 0, position: "relative", overflow: "hidden",
        background: toRgba(stageColor, stageAlpha),
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        cursor: isDrawing ? "crosshair" : undefined,
      } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {otherPages.map((p) => {
        const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        const pTexts = (p.texts || []).filter((t) => t.layer === "paper");
        const pShapes = (p.shapes || []).filter((s) => s.layer === "paper");
        const isSelected = selectedPageIds.has(p.id);
        const hasSize = !!(p.paperW && p.paperH && p.paperW > 0 && p.paperH > 0);
        const innerChildren = (
          <>
            {pTexts.map((t) => (
              <div
                key={t.id}
                style={{
                  position: "absolute",
                  left: t.x, top: t.y,
                  fontSize: t.fontSize,
                  fontFamily: t.fontFamily || DEFAULT_FONT,
                  color: t.color,
                  lineHeight: 1.4,
                  whiteSpace: "pre",
                  width: "max-content",
                  pointerEvents: "none",
                }}
              >{t.text}</div>
            ))}
            <svg
              width="100%"
              height="100%"
              viewBox={hasSize ? `0 0 ${p.paperW} ${p.paperH}` : undefined}
              preserveAspectRatio={hasSize ? "none" : "xMidYMid meet"}
              style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}
            >
              {pShapes.map((s) => renderShape(s))}
            </svg>
          </>
        );
        const boxShadow = isSelected
          ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
          : "0 4px 24px rgba(0,0,0,.1)";
        const transform = `translate(${tr.x}px, ${tr.y}px) scale(${tr.scale}) rotate(${tr.rotate}deg)`;
        const base: React.CSSProperties = {
          position: "absolute",
          transform,
          transformOrigin: "center center",
          background: toRgba(p.paperColor ?? paperColor, p.paperAlpha ?? paperAlpha),
          boxShadow,
          opacity: isSelected ? 0.95 : 0.85,
          overflow: "hidden",
          pointerEvents: "none",
        };
        const style: React.CSSProperties = hasSize
          ? { ...base, left: "50%", top: "50%", width: p.paperW!, height: p.paperH!, marginLeft: -p.paperW! / 2, marginTop: -p.paperH! / 2 }
          : { ...base, inset: 0 };
        return (
          <div key={p.id} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div style={style}>{innerChildren}</div>
          </div>
        );
      })}

      {texts.filter((t) => t.layer === "background").map((t) => (
        <TextElement
          key={t.id}
          t={t}
          isEditing={editingId === t.id}
          isDragging={draggingTextId === t.id}
          isSelected={selectedTextIds.has(t.id)}
        />
      ))}

      {paper.w > 0 && paper.h > 0 ? (
        <div
          data-paper
          style={{
            position: "absolute",
            left: "50%", top: "50%",
            width: paper.w, height: paper.h,
            marginLeft: -paper.w / 2, marginTop: -paper.h / 2,
            transform: `translate(${paper.x}px, ${paper.y}px) scale(${paper.scale}) rotate(${paper.rotate}deg)`,
            transformOrigin: "center center",
            background: toRgba(paperColor, paperAlpha),
            boxShadow: mainPaperSelected
              ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
              : "0 4px 24px rgba(0,0,0,.1)",
            overflow: "hidden",
            touchAction: "none",
            WebkitTouchCallout: "none" as any,
          }}
        >
          {paperInner}
        </div>
      ) : (
        <div
          data-paper
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${paper.x}px, ${paper.y}px) scale(${paper.scale}) rotate(${paper.rotate}deg)`,
            transformOrigin: "center center",
            background: toRgba(paperColor, paperAlpha),
            boxShadow: mainPaperSelected
              ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
              : "0 4px 24px rgba(0,0,0,.1)",
            overflow: "hidden",
            touchAction: "none",
            WebkitTouchCallout: "none" as any,
          }}
        >
          {paperInner}
        </div>
      )}

      {box && box.w > 0 && box.h > 0 && (
        <>
          <div
            style={{
              position: "absolute",
              left: box.x, top: box.y, width: box.w, height: box.h,
              border: `1px dashed ${SELECT_BLUE}`,
              background: SELECT_BLUE_BG,
              pointerEvents: "none",
              zIndex: 150,
            }}
          />
          {(["nw", "ne", "se", "sw"] as ResizeHandle[]).map((h) => {
            const cx = h === "nw" || h === "sw" ? box.x : box.x + box.w;
            const cy = h === "nw" || h === "ne" ? box.y : box.y + box.h;
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  left: cx - 10, top: cy - 10, width: 20, height: 20,
                  borderRadius: 4,
                  background: "#5f554d",
                  border: "2px solid #fff",
                  pointerEvents: "none",
                  zIndex: 151,
                }}
              />
            );
          })}
        </>
      )}

      <textarea
        ref={editTaRef}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        wrap="off"
        onPointerDown={onTaDown}
        onPointerMove={onTaMove}
        onPointerUp={onTaUp}
        onPointerCancel={onTaUp}
        style={{
          position: "absolute",
          left: 0, top: 0, width: 0, height: 0,
          opacity: 0, pointerEvents: "none",
          padding: 0, margin: 0,
          border: 0, outline: "none", boxShadow: "none",
          resize: "none", background: "transparent",
          fontFamily: "inherit", lineHeight: 1.4,
          whiteSpace: "pre",
          overflowX: "auto", overflowY: "hidden",
          boxSizing: "border-box",
          zIndex: 200,
          color: "#3a352e",
          touchAction: "auto",
          userSelect: "text", WebkitUserSelect: "text",
        }}
      />

      {/* 常驻橡皮悬浮按钮 —— 右侧中部 */}
      {(() => {
        const isEraser = drawTool === "eraser";
        const hasTool = !!drawTool;
        // 无绘制工具 → 完全隐形
        if (!hasTool) return null;

        return (
          <button
            type="button"
            onClick={() => {
              if (isEraser) {
                onDrawToolConsumedRef.current?.();
              } else {
                onDrawToolChangeRef.current?.("eraser");
              }
            }}
            title={isEraser ? "退出橡皮" : "橡皮"}
            style={{
              position: "fixed",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              width: 52, height: 52,
              borderRadius: 26,
              border: isEraser ? "2px solid #fff" : "none",
              background: isEraser
                ? "rgba(217,76,76,.95)"
                : "rgba(95,85,77,.75)",
              color: "#fff",
              fontSize: 24,
              lineHeight: 1,
              cursor: "pointer",
              zIndex: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              boxShadow: "0 6px 18px rgba(0,0,0,.18)",
              transition: "background .15s, border-color .15s",
            }}
          >⌫</button>
        );
      })()}

      {/* 撤销按钮（常驻，无可撤销时半透明） */}
      <button
        type="button"
        onClick={undoShape}
        disabled={shapeHistoryRef.current.length === 0}
        style={{
          position: "fixed", right: 16, top: isDrawing ? 104 : 60,
          height: 36, padding: "0 14px", borderRadius: 18, border: 0,
          background: "rgba(95,85,77,.82)", color: "#fff",
          fontSize: 13, cursor: "pointer", zIndex: 700,
          boxShadow: "0 6px 18px rgba(0,0,0,.14)",
          opacity: shapeHistoryRef.current.length === 0 ? 0.4 : 1,
        }}
        title="撤销上一笔"
      >↶ 撤销</button>

      {/* 绘制模式：右上角"完成"按钮 */}
      {isDrawing && (
        <button
          type="button"
          onClick={() => { onDrawToolConsumedRef.current?.(); }}
          style={{
            position: "fixed", right: 16, top: 60,
            height: 36, padding: "0 16px", borderRadius: 18, border: 0,
            background: "rgba(95,85,77,.92)", color: "#fff",
            fontSize: 13, cursor: "pointer", zIndex: 700,
            boxShadow: "0 6px 18px rgba(0,0,0,.18)",
          }}
        >完成绘制</button>
      )}

      {/* 框选版工具条：有框选时优先 */}
      {box && box.w >= 4 && box.h >= 4 && (() => {
        const BAR_W = 4 * 2 + 36 * 3 + 4 * 2;
        const sr = stageRef.current?.getBoundingClientRect();
        const originLeft = sr ? sr.left : 0;
        const originTop = sr ? sr.top : 0;
        let left = originLeft + box.x + box.w / 2 - BAR_W / 2;
        let top = originTop + box.y - 60;
        if (top < 8) top = originTop + box.y + box.h + 20;
        left = Math.max(8, Math.min(left, window.innerWidth - BAR_W - 8));
        return (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left, top,
              height: 44, display: "flex", alignItems: "center",
              gap: 4, padding: 4, borderRadius: 22,
              background: "rgba(58,53,46,.92)",
              boxShadow: "0 8px 24px rgba(0,0,0,.22)",
              zIndex: 800,
            }}
          >
            <button
              type="button"
              title="全删除"
              onClick={() => {
                const list = shapesInBox(box);
                if (list.length === 0) return;
                const ids = new Set(list.map((s) => s.id));
                onUpdateRef.current({
                  shapes: (pageRef.current.shapes || []).filter((s) => !ids.has(s.id)),
                });
                clearBox();
              }}
              style={{ ...penBarBtn, background: "rgba(217,76,76,.9)" }}
            >🗑 {shapesInBox(box).length}</button>

            <button
              type="button"
              title="全复制"
              onClick={() => {
                const list = shapesInBox(box);
                if (list.length === 0) return;
                const copies: ShapeNode[] = list.map((s) => {
                  const c: ShapeNode = JSON.parse(JSON.stringify(s));
                  c.id = `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                  if (c.points && c.points.length > 0) {
                    c.points = c.points.map((p) => ({ x: p.x + 30, y: p.y + 30 }));
                  } else {
                    c.x1 += 30; c.y1 += 30; c.x2 += 30; c.y2 += 30;
                  }
                  return c;
                });
                onUpdateRef.current({
                  shapes: [...(pageRef.current.shapes || []), ...copies],
                });
              }}
              style={penBarBtn}
            >⧉ 复制</button>

            <button
              type="button"
              title="取消框选"
              onClick={() => clearBox()}
              style={penBarBtn}
            >×</button>
          </div>
        );
      })()}

      {/* 笔迹工具条：仅选中 shape 时出现 */}
      {!(box && box.w >= 4 && box.h >= 4) && selectedShape && penBarPos && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: penBarPos.left,
            top: penBarPos.top,
            height: 44,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: 22,
            background: "rgba(58,53,46,.92)",
            boxShadow: "0 8px 24px rgba(0,0,0,.22)",
            zIndex: 800,
            boxSizing: "border-box",
          }}
        >
          <button type="button" title="加粗" onClick={() => {
            onUpdateRef.current({ shapes: (pageRef.current.shapes || []).map((x) =>
              x.id === selectedShape.id ? { ...x, strokeWidth: Math.min(40, (x.strokeWidth || 2) + 2) } : x) });
          }} style={penBarBtn}>＋</button>

          <button type="button" title="变细" onClick={() => {
            onUpdateRef.current({ shapes: (pageRef.current.shapes || []).map((x) =>
              x.id === selectedShape.id ? { ...x, strokeWidth: Math.max(1, (x.strokeWidth || 2) - 2) } : x) });
          }} style={penBarBtn}>－</button>

          <button type="button" title="换色" onClick={() => {
            onUpdateRef.current({ shapes: (pageRef.current.shapes || []).map((x) => {
              if (x.id !== selectedShape.id) return x;
              const i = PEN_COLORS.indexOf(x.color);
              return { ...x, color: PEN_COLORS[(i + 1) % PEN_COLORS.length] };
            }) });
          }} style={penBarBtn}>
            <span style={{
              display: "block", width: 16, height: 16, borderRadius: 8,
              background: selectedShape.color, boxShadow: "0 0 0 1.5px rgba(255,255,255,.85)",
            }} />
          </button>

          <button type="button" title="复制" onClick={() => {
            // 深拷贝，保留 points / pressures
            const copy: ShapeNode = JSON.parse(JSON.stringify(selectedShape));
            copy.id = `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            if (copy.points && copy.points.length > 0) {
              copy.points = copy.points.map((p) => ({ x: p.x + 30, y: p.y + 30 }));
            } else {
              copy.x1 += 30; copy.y1 += 30; copy.x2 += 30; copy.y2 += 30;
            }
            onUpdateRef.current({ shapes: [...(pageRef.current.shapes || []), copy] });
            setSelectedEl({ type: "shape", id: copy.id });
          }} style={penBarBtn}>⧉</button>

          <button type="button" title="删除" onClick={() => {
            onUpdateRef.current({ shapes: (pageRef.current.shapes || []).filter((x) => x.id !== selectedShape.id) });
            setSelectedEl(null);
          }} style={{ ...penBarBtn, background: "rgba(217,76,76,.9)" }}>删</button>

          <button type="button" title="取消选中" onClick={() => setSelectedEl(null)} style={penBarBtn}>×</button>
        </div>
      )}

    </div>
  );
}

function TextElement({
  t,
  isEditing,
  isDragging,
  isSelected,
}: {
  t: TextNode;
  isEditing: boolean;
  isDragging: boolean;
  isSelected: boolean;
}) {
  return (
    <div
      data-text-id={t.id}
      style={{
        position: "absolute",
        left: t.x, top: t.y,
        minWidth: 24,
        minHeight: t.fontSize * 1.6,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily || DEFAULT_FONT,
        color: t.color,
        lineHeight: 1.4,
        whiteSpace: "pre",
        width: "max-content",
        background: isSelected ? SELECT_BLUE_BG : "transparent",
        outline: isSelected
          ? `1px solid ${SELECT_BLUE}`
          : isDragging
            ? "1px dashed rgba(95,85,77,.7)"
            : "none",
        outlineOffset: 4,
        padding: 0,
        cursor: "move",
        visibility: isEditing ? "hidden" : "visible",
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {t.text}
    </div>
  );
}
