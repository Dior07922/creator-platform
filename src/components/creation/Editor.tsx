// name=src/components/creation/Editor.tsx
import React, { useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import type {
  ElementLink, ElementLinkTargetType, Group, ImageNode, Interaction, LinkNode, NoteNode, Page, PageLink, ShapeKind, ShapeNode, TableNode, TextNode,
} from "../../types/document";

/** perfect-freehand easing 预设（StrokeOptions.easing 需要函数，UI 用名字选） */
export type EasingName =
  | "linear" | "easeIn" | "easeOut" | "easeInOut"
  | "easeInQuad" | "easeOutQuad" | "easeInOutQuad";

export const EASING_FNS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

/** 笔刷手感参数（对应 perfect-freehand 的 StrokeOptions） */
export type BrushParams = {
  /** 尺寸覆盖：undefined = 跟随笔种类自身的 strokeWidth */
  size?: number;
  /** 稀疏：perfect-freehand 无此选项，保留字段仅作前向兼容，不参与渲染 */
  spacing?: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  easingName?: EasingName;
  startTaper: number;
  startCap?: boolean;
  endTaper: number;
  endCap?: boolean;
  /** 充满：自由笔迹是否用实心填充而非描边 */
  fill?: boolean;
  simulatePressure: boolean;
};

/** 把当前笔刷参数摊平成 ShapeNode 的可选字段（供落笔/草稿写入） */
function brushToShapePatch(b?: BrushParams): Partial<ShapeNode> {
  if (!b) return {};
  return {
    size: b.size,
    thinning: b.thinning,
    smoothing: b.smoothing,
    streamline: b.streamline,
    easing: b.easingName ? EASING_FNS[b.easingName] : undefined,
    startTaper: b.startTaper,
    startCap: b.startCap,
    endTaper: b.endTaper,
    endCap: b.endCap,
    solid: b.fill ? true : undefined,
    simulatePressure: b.simulatePressure,
  };
}

type Props = {
  page: Page;
  allPages?: Page[];
  /** 文档级 PageLink 数组（doc.links），供跨页演出按 flow 关系定位下一页 */
  pageLinks?: PageLink[];
  onUpdate: (patch: Partial<Page>) => void;
  onSelectPage?: (id: string) => void;
  onCopyPage?: () => void;
  onPastePage?: (x: number, y: number) => void;
  hasClipboard?: boolean;
  /** 连接动作进行中：此时"点一下"的语义是【选对象】，不是框选/绘制 */
  connectPicking?: boolean;
  /** 连接动作里点中了对象，报给上层状态机 */
  onConnectPickObject?: (el: { type: string; id: string }) => void;
  /** 长按弹窗里点了「连接」：以这个对象为起点开启连接模式 */
  onStartConnect?: (el: { type: string; id: string }) => void;
  /** 连接模式：把纸排开、其他纸变成可点（连接是在眼前的几张纸之间点出来的） */
  connectArrange?: boolean;
  /** 连接模式下点了某一张纸（不是纸里的对象，是纸本身） */
  onPaperPick?: (pageId: string) => void;
  /** 文档里已成立的连接（用来画线） */
  interactions?: Interaction[];
  /** 正在形成的这条连接（起点已定，承接物逐个补齐） */
  connectDraft?: {
    fromPageId?: string; fromElementId?: string; fromElementType?: string;
    toPageId?: string; toElementId?: string; toElementType?: string;
  };
  /** 这条连接已经闭环（画回程那一段） */
  connectDone?: boolean;
  /** 跳转锚点：建立 本页→目标页 的 flow 关系（PageLink） */
  onJumpAnchor?: (toPageId: string, relType?: string) => void;
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
  /* ★ BUG-02/03：模式切换回调 —— 由父组件持有 state，Editor 只发指令 */
  onToggleConnect?: () => void;
  onToggleLasso?: () => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  sheetAction?: { id: number; kind: string } | null;
  /** 当前笔刷手感参数，绘制时写入新笔迹 */
  brush?: BrushParams;
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
  | "scaleEl"
  | "dragUnit";

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

/* 各类型元素的默认图层顺序。
   数值与旧的渲染顺序一致（文字最底、笔迹最上），
   所以没设过 z 的老文档观感不变。用户「置顶/移上」后写入具体 z 值。 */
const Z_TEXT = 10;
const Z_IMAGE = 20;
const Z_NOTE = 30;
const Z_TABLE = 40;
const Z_LINK = 50;
const Z_SHAPES = 60;   // 笔迹整体一层（同一 <svg> 内无法与其他类型交叉）

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

      // 调参区：优先读每个 shape 自己存的笔刷参数，缺省时用内置默认值
      // （默认值与旧版硬编码一致，保证已有笔迹渲染不变）
      const baseSize = s.strokeWidth * 1.1;
      const outline = getStroke(inputPoints, {
        size: (s.size != null && s.size > 0) ? s.size : baseSize,
        thinning: s.thinning ?? 0.35,
        smoothing: s.smoothing ?? 0.55,
        streamline: s.streamline ?? 0.45,
        easing: s.easing ?? ((t: number) => t),
        start: { taper: s.startTaper ?? 0, cap: s.startCap ?? true },
        end: { taper: s.endTaper ?? 0, cap: s.endCap ?? false },
        simulatePressure: s.simulatePressure ?? (!s.pressures || s.pressures.length < 2),
        last: true,
      });

      const d = getSvgPathFromStroke(outline);

      return (
        <path
          key={s.id}
          d={d}
          fill={s.solid === false ? "none" : stroke}
          stroke={s.solid === false ? stroke : "none"}
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
  pageLinks,
  onUpdate,
  onSelectPage,
  onCopyPage,
  onPastePage,
  hasClipboard,
  connectPicking,
  onConnectPickObject,
  onStartConnect,
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
  onToggleConnect,
  onToggleLasso,
  onSelectionChange,
  sheetAction,
  brush,
  onJumpAnchor,
  connectArrange,
  onPaperPick,
  interactions,
  connectDraft,
  connectDone,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const editTaRef = useRef<HTMLTextAreaElement>(null);
  const editingIdRef = useRef<string | null>(null);
  const textsRef = useRef<TextNode[]>([]);
  const onUpdateRef = useRef(onUpdate);
  const pageRef = useRef(page);
  const allPagesRef = useRef<Page[]>([]);
  const pageLinksRef = useRef<PageLink[]>([]);
  const onUpdatePageTransformRef = useRef(onUpdatePageTransform);
  const drawToolRef = useRef<ShapeKind | null>(null);
  const brushRef = useRef<BrushParams | undefined>(undefined);
  const onDrawToolConsumedRef = useRef(onDrawToolConsumed);
  const onDrawToolChangeRef = useRef(onDrawToolChange);
  const onSelectPageRef = useRef(onSelectPage);
  onSelectPageRef.current = onSelectPage;
  const onConnectPickObjectRef = useRef(onConnectPickObject);
  onConnectPickObjectRef.current = onConnectPickObject;
  /* onPointerDown 里要读，用 ref 避免把它的闭包钉死在旧值上 */
  const papersPickableRef = useRef(false);
  onDrawToolChangeRef.current = onDrawToolChange;

  const texts = page.texts || [];
  const shapes = page.shapes || [];
  textsRef.current = texts;
  onUpdateRef.current = onUpdate;
  pageRef.current = page;
  allPagesRef.current = allPages || [];
  pageLinksRef.current = pageLinks || [];
  onUpdatePageTransformRef.current = onUpdatePageTransform;
  drawToolRef.current = drawTool ?? null;
  brushRef.current = brush;
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

  /* ★ 跨页演出续播：window.__ranjingCrossPage 标记本页在多页演出链中时，
     本页 Editor remount 后自动起播（直接调 handleSheetAction("play")，
     完整复用节奏/关系/Unit 逻辑）。用户中途 play-stop 已清标记，不会误续。 */
  useEffect(() => {
    const cross = (window as any).__ranjingCrossPage;
    if (!cross || !cross.active || !cross.pageIds?.includes(page.id)) return;
    /* 续播页：等 comicFrames 初始化完成后起播。若续播页没有镜 → 直接查它的 flow 下一页（链式续跳） */
    const timer = window.setTimeout(() => {
      const c2 = (window as any).__ranjingCrossPage;
      if (!c2 || !c2.active) return;
      const f = (pageRef.current as any).frames;
      if (f && f.length) {
        handleSheetAction("play");
      } else {
        /* 本页无镜：跳过播放，直接按 flow 关系继续查下一页（链式续跳） */
        const flowLink = pageLinksRef.current.find((l: any) => l.from === page.id && l.relType === "flow");
        const nextId: string | undefined = flowLink?.to;
        const nextPage = nextId ? (allPagesRef.current || []).find((p: any) => p.id === nextId) : null;
        if (nextPage && nextId && !c2.pageIds.includes(nextId)) {
          c2.pageIds = [...c2.pageIds, nextId];
          onSelectPageRef.current?.(nextId);
        } else {
          /* 无下一页 / 循环 / 目标不存在 → 整条跨页演出正常结束 */
          (window as any).__ranjingCrossPage = null;
        }
      }
    }, 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

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

  const [comicFrames, setComicFrames] = useState<{ id: string; x: number; y: number; w: number; h: number; order?: number; elementIds?: string[] }[]>(() => {
    /* 老数据兼容：page.frames 存在则用之，否则初始为空（由排列 tab 生成） */
    const f = (page as any).frames;
    return f && f.length ? f : [];
  });
  const [playingIdx, setPlayingIdx] = useState(-1);
  /* ★ 禁用 alert 约定：画布轻提示（1.6s 自隐，absolute 在 stage 顶部，pointerEvents none 不吞手势） */
  const [canvasFlash, setCanvasFlash] = useState<string | null>(null);
  const canvasFlashTimerRef = useRef<number | null>(null);
  function showCanvasFlash(msg: string) {
    setCanvasFlash(msg);
    if (canvasFlashTimerRef.current != null) clearTimeout(canvasFlashTimerRef.current);
    canvasFlashTimerRef.current = window.setTimeout(() => setCanvasFlash(null), 1600);
  }
  /* ★ 连接活化：最近建立的关系线（克制反馈：两端微牵引 + 线生长，约 1s 后收敛，不改变元素最终位置） */
  const [freshLink, setFreshLink] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const freshLinkTimerRef = useRef<number | null>(null);
  function showFreshLink(fromId: string, toId: string) {
    const f = centerOf("image", fromId) || centerOf("note", fromId) || centerOf("table", fromId) || centerOf("link", fromId) || centerOf("shape", fromId) || centerOf("text", fromId);
    const t = centerOf("image", toId) || centerOf("note", toId) || centerOf("table", toId) || centerOf("link", toId) || centerOf("shape", toId) || centerOf("text", toId);
    if (!f || !t) return;
    setFreshLink({ from: f, to: t });
    if (freshLinkTimerRef.current != null) clearTimeout(freshLinkTimerRef.current);
    freshLinkTimerRef.current = window.setTimeout(() => setFreshLink(null), 1000);
  }
  /* ★ 演出关系展开：播放到某镜时依次点亮该镜涉及的关系线（activeLinks 按播放顺序累积） */
  const [activeLinks, setActiveLinks] = useState<string[]>([]);
  /* ★ 节奏活化：本次播放的逐镜时长（基础 + 镜内 Unit 数 + 该镜关系数；用户 perfo-speed-* 锁定时全帧同值） */
  const playTimingsRef = useRef<number[]>([]);
  /* ★ 框选轻弹窗：长按/框选完成后在画布上出现的操作入口（组合/连接/排列），
     替代原来被全透明层锁死画布的 ctxMenu 结构。 */
  const [boxPopup, setBoxPopup] = useState<{ x: number; y: number; count: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ kind: "blank" | "element"; x: number; y: number; sub?: "align" | "edit"; hitEl?: { type: string; id: string } } | null>(null);

  /* ── 临摹素材（视线固定）─────────────────────────────────────
     从手机相册选一张图作为临摹参照：
       · 定位用 position:fixed，挂在纸张变换之外 —— 所以画布怎么拖、怎么缩放，
         它始终停在用户视线处，不会跟着画布跑丢
       · 图片本身 pointer-events:none，画布手势直接穿过去，不影响作画
       · 只有它上方那条小控制条可交互（拖动 / 透明度 / 关闭）
     属于会话内的辅助工具，不写进文档、不参与导出。 */
  const [traceImg, setTraceImg] = useState<{
    src: string; x: number; y: number; w: number; h: number; opacity: number;
  } | null>(null);
  const traceInputRef = useRef<HTMLInputElement>(null);
  const traceDragRef = useRef<{ dx: number; dy: number } | null>(null);

  function pickTraceImage() {
    setCtxMenu(null);
    traceInputRef.current?.click();
  }

  function onTraceFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";               // 允许连续选同一张
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src) return;
      const probe = new Image();
      probe.onload = () => {
        /* 初始大小取屏幕宽度的 60%（不放大超过原图），顶部留出控制条位置 */
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = Math.min(vw * 0.6, probe.width || vw * 0.6);
        const h = w * ((probe.height || 1) / (probe.width || 1));
        setTraceImg({
          src, w, h,
          x: Math.max(8, (vw - w) / 2),
          y: Math.max(48, (vh - h) / 2),
          opacity: 0.45,
        });
      };
      probe.onerror = () => { /* 不是图片，忽略 */ };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }

  function onTraceHandleDown(e: React.PointerEvent) {
    if (!traceImg) return;
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    traceDragRef.current = { dx: e.clientX - traceImg.x, dy: e.clientY - traceImg.y };
  }
  function onTraceHandleMove(e: React.PointerEvent) {
    const d = traceDragRef.current;
    if (!d) return;
    e.preventDefault();
    const vw = window.innerWidth, vh = window.innerHeight;
    setTraceImg((t) => t ? {
      ...t,
      /* 限制在屏幕内，避免拖出视野「跑丢」 */
      x: Math.min(Math.max(-t.w * 0.5, e.clientX - d.dx), vw - t.w * 0.5),
      y: Math.min(Math.max(0, e.clientY - d.dy), vh - 40),
    } : t);
  }
  function onTraceHandleUp() { traceDragRef.current = null; }
  const [textPanel, setTextPanel] = useState<{ x: number; y: number } | null>(null);
  /* ★ 套索轨迹：stage 局部坐标点序列。null = 未在画套索 */
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[] | null>(null);
  const [selectedEl, setSelectedEl] = useState<{
    type: "shape" | "image" | "note" | "table" | "link";
    id: string;
  } | null>(null);
  const selectedElRef = useRef(selectedEl);
  useEffect(() => { selectedElRef.current = selectedEl; }, [selectedEl]);
  const [draft, setDraft] = useState<ShapeNode | null>(null);
  const drawingRef = useRef<DrawingDraft | null>(null);
  const shapeHistoryRef = useRef<ShapeNode[][]>([]);
  const redoStackRef = useRef<ShapeNode[][]>([]);
  const [undoTick, setUndoTick] = useState(0);
  /* ★ P0-9：内部元素剪贴板（复制整个选择集合，保留各元素真实类型 + 相对位置） */
  const elClipboardRef = useRef<{
    images?: ImageNode[]; notes?: NoteNode[]; tables?: TableNode[];
    links?: LinkNode[]; shapes?: ShapeNode[]; texts?: TextNode[];
  } | null>(null);

  function pushShapeHistory() {
    const stack = shapeHistoryRef.current;
    stack.push(JSON.parse(JSON.stringify(pageRef.current.shapes || [])));
    if (stack.length > 40) stack.shift();
    redoStackRef.current = [];
    setUndoTick((t) => t + 1);
  }
  function redoShape() {
    const stack = redoStackRef.current;
    if (!stack.length) return;
    const cur = JSON.parse(JSON.stringify(pageRef.current.shapes || []));
    shapeHistoryRef.current.push(cur);
    const next = stack.pop()!;
    onUpdateRef.current({ shapes: next });
    setUndoTick((t) => t + 1);
  }

  /* ★ P0-9：复制/粘贴命令（画布级）—— 走内部元素剪贴板，不 alert，粘贴错位。
     保留旧 shape 复制兜底：没有框选/点选时退化成复制 shape。 */
  function copySelection() {
    const sel = getSelectedRefs();
    if (!sel.length) {
      /* 兜底：无选择 → 复制本页所有 shape（旧行为） */
      const pg = pageRef.current;
      const newShapes = (pg.shapes || []).map((s) => ({
        ...s,
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x1: s.x1 + 20, y1: s.y1 + 20, x2: s.x2 + 20, y2: s.y2 + 20,
        points: s.points ? s.points.map((p: any) => ({ x: p.x + 20, y: p.y + 20 })) : undefined,
      }));
      if (newShapes.length) onUpdateRef.current({ shapes: [...(pg.shapes || []), ...newShapes] });
      return;
    }
    /* 有选择 → 进内部元素剪贴板（保留各元素真实类型 + 相对位置） */
    const ids = new Set(sel.map((s) => s.id));
    const pg = pageRef.current;
    const byType = (arr: any[] | undefined) => (arr || []).filter((x) => x.id && ids.has(x.id));
    elClipboardRef.current = {
      images: byType(pg.images || []),
      notes: byType(pg.notes || []),
      tables: byType(pg.tables || []),
      links: byType(pg.links || []),
      shapes: byType(pg.shapes || []),
      texts: textsRef.current.filter((t) => ids.has(t.id)),
    };
    const total = Object.values(elClipboardRef.current).reduce((n, a) => n + ((a as any[])?.length || 0), 0);
    showCanvasFlash(`已复制 ${total} 个对象`);
  }

  /** 粘贴：从内部剪贴板生成新元素，整体 +32 错位，保留各元素真实类型与相对位置 */
  function pasteSelection() {
    const clip = elClipboardRef.current;
    if (!clip) { showCanvasFlash("剪贴板为空"); return; }
    const now = Date.now();
    const rid = () => `${now}-${Math.random().toString(36).slice(2, 6)}`;
    const off = 32;
    const pg = pageRef.current;
    const patch: any = {};
    if (clip.images?.length) patch.images = [...(pg.images || []), ...clip.images.map((x: any) => ({ ...x, id: `i-${rid()}`, x: x.x + off, y: x.y + off }))];
    if (clip.notes?.length)  patch.notes  = [...(pg.notes  || []), ...clip.notes.map((x: any) => ({ ...x, id: `n-${rid()}`, x: x.x + off, y: x.y + off }))];
    if (clip.tables?.length) patch.tables = [...(pg.tables || []), ...clip.tables.map((x: any) => ({ ...x, id: `tb-${rid()}`, x: x.x + off, y: x.y + off }))];
    if (clip.links?.length)  patch.links  = [...(pg.links  || []), ...clip.links.map((x: any) => ({ ...x, id: `lk-${rid()}`, x: x.x + off, y: x.y + off }))];
    if (clip.shapes?.length) {
      patch.shapes = [...(pg.shapes || []), ...clip.shapes.map((s: any) => ({
        ...s, id: `s-${rid()}`,
        x1: s.x1 + off, y1: s.y1 + off, x2: s.x2 + off, y2: s.y2 + off,
        points: s.points ? s.points.map((p: any) => ({ x: p.x + off, y: p.y + off })) : undefined,
        pressures: s.pressures ? [...s.pressures] : undefined,
      }))];
    }
    if (clip.texts?.length) {
      const nextTexts = [...textsRef.current, ...clip.texts.map((t: any) => ({ ...t, id: `t-${rid()}`, x: t.x + off, y: t.y + off }))];
      textsRef.current = nextTexts;
      patch.texts = nextTexts;
    }
    onUpdateRef.current(patch);
    const total = Object.values(clip).reduce((n, a) => n + ((a as any[])?.length || 0), 0);
    showCanvasFlash(`已粘贴 ${total} 个对象`);
  }

  function undoShape() {
    const stack = shapeHistoryRef.current;
    if (!stack.length) return;
    const cur = JSON.parse(JSON.stringify(pageRef.current.shapes || []));
    redoStackRef.current.push(cur);
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
    /* ★ 创作单元整体拖动：命中 Unit 外框命中带时记录初始成员坐标快照，
       pointermove 只平移 memberIds 对应成员（复用现有坐标体系，不新增第二套坐标）。
       一次拖动只在 up/cancel 形成一次提交，不在 move 中堆历史。 */
    unitDrag: null as null | {
      unitId: string;
      /* 完整成员初始快照：shape 含全量字段（x1/y1/x2/y2/points/pressures…），
         text 含 TextNode、其余含原始节点。pointermove 一律
         新位置 = 快照 + 总 delta，绝不从当前帧坐标累加。 */
      members: { type: "text" | "image" | "note" | "table" | "link" | "shape"; id: string; node: any }[];
      bboxSnapshot: { x: number; y: number } | null;
      start: { x: number; y: number };
      moved: boolean;
    },
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
      /* ★ BUG-01：窗口失焦 / 切后台是 pen 状态最易残留的场景，必须彻底复位 */
      (g as any).activePenId = null;
      (g as any).activePenAt = 0;
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
    {
      const __r = el?.getBoundingClientRect();
      if (__r) setTextPanel({ x: __r.left + __r.width, y: __r.top });
    }
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
    const TH = 8;
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
    const pg = pageRef.current;
    const idSet = new Set<string>();

    /* 1. 框选内的 group 成员 */
    currentGroupMemberIds().forEach((id) => idSet.add(id));

    /* 2. 单选元素（选中框 / 长按命中） —— 原逻辑完全没处理，这是「删除没反应」的根因 */
    const sel = selectedElRef.current;
    if (sel) idSet.add(sel.id);

    /* 3. 框选落点上的文本 —— 原逻辑只看 group，未编组时文字删不掉 */
    const b = boxRef.current;
    if (b && b.w >= 4 && b.h >= 4) {
      const stage = stageRef.current;
      if (stage) {
        const sr = stage.getBoundingClientRect();
        const els = stage.querySelectorAll<HTMLElement>("[data-text-id]");
        els.forEach((el) => {
          const r = el.getBoundingClientRect();
          const lx = r.left - sr.left, ly = r.top - sr.top;
          if (lx + r.width >= b.x && lx <= b.x + b.w && ly + r.height >= b.y && ly <= b.y + b.h) {
            const id = el.dataset.textId;
            if (id) idSet.add(id);
          }
        });
      }
    }

    /* 4. 没有任何框选也没有单选 → 兜底删掉框选内所有层元素 */
    let boxIds: string[] = [];
    if (idSet.size === 0 && b && b.w >= 4 && b.h >= 4) {
      const restrictTo = gRef.current.boxSourceLayer === "paper" ? "paper" : "background";
      boxIds = computeMembersInBox(b, restrictTo);
      boxIds.forEach((id) => idSet.add(id));
    }

    if (idSet.size === 0) return;

    const gid = boxGroupIdRef.current;
    const keep = <T extends { id: string }>(arr: T[] | undefined) => (arr || []).filter((x) => !idSet.has(x.id));

    onUpdateRef.current({
      shapes: keep(pg.shapes),
      images: keep(pg.images),
      notes:  keep(pg.notes),
      tables: keep(pg.tables),
      links:  keep(pg.links),
      texts:  keep(textsRef.current),
      /* 连线两端任一端被删 → 一并清掉，避免留下悬空线 */
      elementLinks: (pg.elementLinks || []).filter(
        (l: any) => !idSet.has(l.fromId) && !idSet.has(l.targetId)
      ),
      groups: gid
        ? (pg.groups || []).filter((gg) => gg.id !== gid)
        : (pg.groups || []),
      /* 创作单元：成员被删 → 单元一并清掉，避免悬空 Unit */
      units: (pg.units || []).filter(
        (u: any) => !u.memberIds.some((mid: string) => idSet.has(mid))
      ),
    });

    textsRef.current = textsRef.current.filter((t) => !idSet.has(t.id));
    if (sel) setSelectedEl(null);
    clearBox();
  }
  function deleteOneText(id: string) {
    const next = textsRef.current.filter((t) => t.id !== id);
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
  }

  /** 导出当前页为文件。format: svg | png | png-transparent */
  /* ── 导出内容构建 ─────────────────────────────────────────────
     旧实现只取页面上的 <svg> 克隆，而那个 svg 里只有笔迹：
     文字/图片/便签/表格/链接全是 DOM 元素，不在其中 —— 导出的是残缺作品。
     现在按纸张坐标重建完整 SVG：
       · 六类元素从页面数据逐个生成 SVG 元素
       · 笔迹直接复用页面上已渲染好的路径（不重写笔刷逻辑）
     坐标全部是纸张局部坐标，与 <svg viewBox="0 0 W H"> 一致。 */
  const escXml = (s: string) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** 按容器宽度手动折行：SVG 的 <text> 不会自动换行。中日韩按 1 字宽、其余按 0.55 字宽估算。 */
  const wrapForSvg = (text: string, maxW: number, fontSize: number): string[] => {
    const out: string[] = [];
    for (const para of String(text ?? "").split("\n")) {
      let cur = ""; let w = 0;
      for (const ch of para) {
        const cw = /[⺀-鿿　-〿＀-￯]/.test(ch) ? fontSize : fontSize * 0.55;
        if (w + cw > maxW && cur) { out.push(cur); cur = ""; w = 0; }
        cur += ch; w += cw;
      }
      out.push(cur);
    }
    return out;
  };

  const rotAttr = (deg: number | undefined, cx: number, cy: number) =>
    deg ? ` transform="rotate(${deg} ${cx} ${cy})"` : "";

  function buildPageSvg(W: number, H: number, withPaperBg: boolean): string {
    const pg = pageRef.current as any;
    const P: string[] = [];

    if (withPaperBg) {
      const bg = pg.paperColor || "#ffffff";
      const alpha = typeof pg.paperAlpha === "number" ? pg.paperAlpha : 1;
      P.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${escXml(bg)}"${alpha < 1 ? ` fill-opacity="${alpha}"` : ""}/>`);
    }

    // 文字
    for (const t of (pg.texts || [])) {
      const F = t.fontSize || 16;
      const lines = String(t.text ?? "").split("\n");
      const spans = lines
        .map((ln: string, i: number) => `<tspan x="${t.x}" dy="${i === 0 ? 0 : F * 1.4}">${escXml(ln)}</tspan>`)
        .join("");
      P.push(
        `<text x="${t.x}" y="${(t.y ?? 0) + F}" font-size="${F}" fill="${escXml(t.color || "#3a352e")}" ` +
        `font-family="${escXml(t.fontFamily || DEFAULT_FONT)}" xml:space="preserve">${spans}</text>`
      );
    }

    // 图片
    for (const im of (pg.images || [])) {
      P.push(
        `<image x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" href="${escXml(im.src)}" ` +
        `preserveAspectRatio="xMidYMid meet"${rotAttr(im.rotate, im.x + im.w / 2, im.y + im.h / 2)}/>`
      );
    }

    // 便签
    for (const n of (pg.notes || [])) {
      const F = n.fontSize || 14;
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      P.push(
        `<g${rotAttr(n.rotate, cx, cy)}>` +
        `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${escXml(n.bgColor || "#fff9c4")}"/>` +
        wrapForSvg(n.text, Math.max(8, n.w - 20), F)
          .map((ln: string, i: number) =>
            `<text x="${n.x + 10}" y="${n.y + 10 + F * (1 + i * 1.4)}" font-size="${F}" fill="${escXml(n.textColor || "#3a352e")}" xml:space="preserve">${escXml(ln)}</text>`)
          .join("") +
        `</g>`
      );
    }

    // 表格
    for (const t of (pg.tables || [])) {
      const cw = t.w / Math.max(1, t.cols);
      const chh = t.h / Math.max(1, t.rows);
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      const lines: string[] = [];
      for (let c = 1; c < t.cols; c++) lines.push(`<line x1="${t.x + cw * c}" y1="${t.y}" x2="${t.x + cw * c}" y2="${t.y + t.h}" stroke="#3a352e" stroke-width="1"/>`);
      for (let r = 1; r < t.rows; r++) lines.push(`<line x1="${t.x}" y1="${t.y + chh * r}" x2="${t.x + t.w}" y2="${t.y + chh * r}" stroke="#3a352e" stroke-width="1"/>`);
      const cells: string[] = [];
      for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
        const v = t.cells?.[r]?.[c]; if (!v) continue;
        cells.push(`<text x="${t.x + cw * c + 4}" y="${t.y + chh * r + 12}" font-size="12" fill="#3a352e" xml:space="preserve">${escXml(v)}</text>`);
      }
      P.push(
        `<g${rotAttr(t.rotate, cx, cy)}>` +
        `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="#ffffff" stroke="#3a352e" stroke-width="1.5"/>` +
        lines.join("") + cells.join("") + `</g>`
      );
    }

    // 链接
    for (const l of (pg.links || [])) {
      const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
      P.push(
        `<g${rotAttr(l.rotate, cx, cy)}>` +
        `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="8" fill="#eaf3fb" stroke="rgba(42,74,107,.3)" stroke-width="1"/>` +
        `<text x="${l.x + 12}" y="${l.y + l.h / 2 - 2}" font-size="13" font-weight="600" fill="#2a4a6b" xml:space="preserve">${escXml(l.title || l.url)}</text>` +
        `<text x="${l.x + 12}" y="${l.y + l.h / 2 + 14}" font-size="11" fill="#5a7fa0" xml:space="preserve">${escXml(l.url)}</text>` +
        `</g>`
      );
    }

    // 笔迹：直接复用页面上已渲染好的内容，坐标同为纸张局部坐标
    const liveSvg = stageRef.current?.querySelector("svg");
    if (liveSvg) P.push(liveSvg.innerHTML);

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="hidden">` +
      `<clipPath id="rjPageClip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>` +
      `<g clip-path="url(#rjPageClip)">${P.join("")}</g>` +
      `</svg>`
    );
  }

  function exportCanvas(format: "svg" | "png" | "png-transparent") {
    const stage = stageRef.current;
    if (!stage) return;

    const pg = pageRef.current as any;
    /* 纸张尺寸缺失（自由画布）时退回页面可视尺寸，保证导出不会退化成 800×1000 的错误比例 */
    const W = Math.max(1, Math.round(pg.paperW || stage.clientWidth || 800));
    const H = Math.max(1, Math.round(pg.paperH || stage.clientHeight || 1000));
    const stamp = Date.now();
    const filename = `ranjing-${stamp}`;
    const transparent = format === "png-transparent";
    const svgText = buildPageSvg(W, H, !transparent);

    if (format === "svg") {
      downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svgText}`], {
        type: "image/svg+xml;charset=utf-8",
      }), `${filename}.svg`);
      return;
    }

    // PNG / 透明 PNG：把重建的 SVG 按 1:1 光栅化（不再按 stage 尺寸反算比例，避免非整比例规格被拉歪）
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); return; }
      ctx.drawImage(img, 0, 0, W, H);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) downloadBlob(blob, `${filename}.png`);
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** 粘贴：优先用内部剪贴板，其次读系统剪贴板文本 */
  const pasteClipboard = () => {
    const internal = boxClipboardRef.current;
    if (internal && (internal.texts.length > 0 || internal.pages.length > 0)) {
      const off = 24;
      const newTexts = internal.texts.map((t) => ({
        ...t,
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: t.x + off,
        y: t.y + off,
      }));
      if (newTexts.length) {
        onUpdateRef.current({ texts: [...textsRef.current, ...newTexts] });
        textsRef.current = [...textsRef.current, ...newTexts];
      }
      return;
    }
    // 读系统剪贴板文本（中文安全：readText 返回 UTF-16 字符串）
    if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        const stage = stageRef.current;
        const rect = stage?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 : 200;
        const cy = rect ? rect.height / 2 : 200;
        const node: TextNode = {
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text,
          x: cx, y: cy,
          fontSize: 18,
          color: "#3a352e",
          layer: "background",
        };
        onUpdateRef.current({ texts: [...textsRef.current, node] });
        textsRef.current = [...textsRef.current, node];
      }).catch(() => { /* 用户未授权读取剪贴板 */ });
    }
  };

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

  /* 长按点下的位置命中哪个元素（不限 text）：返回 {type,id} 或 null。
     用于单对象长按 → 弹出针对该对象的菜单（P0-4 单对象长按）。 */
  function hitAnyElement(sx: number, sy: number): { type: string; id: string } | null {
    const t = hitText(sx, sy);
    if (t) return { type: "text", id: t.id };
    const lx = screenToPaperLocal(sx, sy, stageRef.current, paperStateRef.current);
    if (!lx.inside) return null;
    const pg = pageRef.current;
    const img = hitImageAt(lx.x, lx.y, pg.images || []);
    if (img) return { type: "image", id: img.id };
    const note = hitNoteAt(lx.x, lx.y, pg.notes || []);
    if (note) return { type: "note", id: note.id };
    const table = hitTableAt(lx.x, lx.y, pg.tables || []);
    if (table) return { type: "table", id: table.id };
    const link = hitLinkAt(lx.x, lx.y, pg.links || []);
    if (link) return { type: "link", id: link.id };
    const shape = hitShapeAt(lx.x, lx.y, pg.shapes || []);
    if (shape) return { type: "shape", id: shape.id };
    /* Unit 外框命中带也算对象命中（P0-4 单对象长按里的 Unit） */
    const unit = hitUnitBorder(lx.x, lx.y);
    if (unit) return { type: "unit", id: unit.unit.id };
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    const __tgt = e.target as HTMLElement;
    if (__tgt.closest("[data-ctx-menu]")) return;
    /* ★ 连接模式：按在「别的纸」上，是「点这张纸」这个动作，不是画布手势。
       这里必须直接放行 —— 下面会给 stage 做 setPointerCapture，
       一旦捕获，后续 pointerup / click 全部改派到 stage，
       纸盒上的 onClick 永远收不到，点纸就点不动。
       实测事件序列：BOX:pointerdown,BOX:mousedown → STAGE:pointerup,STAGE:click。 */
    if (__tgt.closest("[data-other-page]") && papersPickableRef.current) return;
    {
      const sx = e.clientX, sy = e.clientY;
      const lp = window.setTimeout(() => {
        if (drawToolRef.current) return;
        /* ★ 长按判定只看「有没有命中明确目标」，不看「在不在纸张内」。
           原实现是：命中元素 → 元素菜单；否则若在纸张外 → 空白菜单。
           问题有两个：
             ① 未选规格时纸张铺满全屏（paperW=0 时 W 取 rect.width），
                inside 恒为 true，"纸张外"根本不存在 → 空白菜单永远不可达；
             ② 按在白纸上（无元素处）什么都不弹，用户点了没反应。
           现在按产品定义：明确命中什么 → 什么就是对象；
           没有明确目标 → 空白菜单，它的作用对象就是白纸本身
           （删除/复制/粘贴白纸）。 */
        const hitEl = hitAnyElement(sx, sy);
        if (hitEl) {
          /* ★ 自动框选高亮：把框设成该元素的包围盒。
             框既是选中状态的来源（getSelectedRefs / selectedTextIds 都读它），
             也是画面上那圈高亮。外扩 2px 并保证最小 4px，
             这样细长的笔迹（h≈0）也能通过 getSelectedRefs 的 w/h>=4 判定。 */
          const b = boundsOf(hitEl.type, hitEl.id);
          if (b) {
            const pad = 2;
            const bb = {
              x: b.x - pad, y: b.y - pad,
              w: Math.max(b.w, 4) + pad * 2,
              h: Math.max(b.h, 4) + pad * 2,
            };
            boxRef.current = bb;
            setBox(bb);
            setBoxGroupId(null); boxGroupIdRef.current = null;
          }
          setCtxMenu({ kind: "element", x: sx, y: sy, hitEl: hitEl as { type: string; id: string } });
        } else {
          setCtxMenu({ kind: "blank", x: sx, y: sy });
        }
        try { navigator.vibrate && navigator.vibrate(12); } catch {}
      }, 500);
      (window as any).__ranjingLongPress = lp;
      const cancel = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) {
          window.clearTimeout((window as any).__ranjingLongPress);
        }
      };
      const stop = () => {
        window.clearTimeout((window as any).__ranjingLongPress);
        window.removeEventListener("pointermove", cancel);
        window.removeEventListener("pointerup", stop);
        /* ★ pointercancel 必须一起摘掉：手势被系统打断（来电、系统手势、
           浏览器接管）时不会触发 pointerup，否则每按一次画布就永久多挂
           两个 window 监听，累积到后面整页都在漏；长按定时器也不会取消，
           会对着已经结束的手势弹出右键菜单。 */
        window.removeEventListener("pointercancel", stop);
      };
      window.addEventListener("pointermove", cancel);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    }
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

    // 手写笔落下 → 记录 pen 的 pointerId + 时间戳；掌拒只在 pen 在屏上时生效
    // ★ BUG-01 修复：原逻辑单布尔 activePen，pen 异常未抬起（系统吞 up / 切后台 / 掌拒冲突）
    //   会导致 activePen 永久为 true，此后所有 touch 被吞 → 用户体感「屏幕失灵」。
    //   现改为「带时间戳的活跃窗」：超过 3 秒未见到 pen 事件即判定失效，自动放行 touch。
    if (e.pointerType === "pen") {
      (g as any).activePenId = e.pointerId;
      (g as any).activePenAt = Date.now();
      g.activePen = true;
    } else if (e.pointerType === "touch" && g.activePen) {
      const penAt = (g as any).activePenAt || 0;
      const stale = Date.now() - penAt > 3000;
      if (stale) {
        (g as any).activePenId = null;
        (g as any).activePenAt = 0;
        g.activePen = false;
      } else {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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
    // ★ 套索模式：落笔即启动轨迹（用 stage 局部坐标）
    if (lassoMode && !drawToolRef.current && g.pointers.size === 0) {
      e.preventDefault();
      e.stopPropagation();
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local) return;
      setLassoPath([local]);
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g.moved = true;
      return;
    }

    // ★ 元素连线模式：写入两端（fromType/fromId + targetType/targetId）
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
            const from = g.connectSource;
            const to = target;
            // 同一个元素 → 取消，不生成自环
            if (from.type === to.type && from.id === to.id) {
              g.connectSource = null;
              return;
            }
            const links = pageRef.current.elementLinks || [];
            // 已存在（任一端相同）→ 不重复添加
            const dup = links.find((x: any) =>
              (x.fromType === from.type && x.fromId === from.id && x.targetType === to.type && x.targetId === to.id) ||
              (x.fromType === to.type && x.fromId === to.id && x.targetType === from.type && x.targetId === from.id)
            );
            if (!dup) {
              onUpdateRef.current({
                elementLinks: [...links, {
                  id: `el-${Date.now()}`,
                  fromType: from.type as ElementLinkTargetType,
                  fromId: from.id,
                  targetType: to.type as ElementLinkTargetType,
                  targetId: to.id,
                  createdAt: Date.now(),
                } as ElementLink],
              });
              /* ★ 连接活化：关系建立瞬间的克制反馈（不改变元素最终位置） */
              showFreshLink(from.id, to.id);
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
      const nearLast = Math.hypot(e.clientX - last0.x, e.clientY - last0.y) < 30;
      if (last0.id === hitId && now0 - last0.time < 400 && nearLast) {
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

      /* ★ 创作单元整体拖动：成员全部未命中 + 无进行中框选时，检查 Unit 外框命中带。
         优先级低于成员（上面各 hit* 分支已全部 return），高于空白操作（框选/双击建字）。 */
      if (!boxRef.current) {
        const lx = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
        if (lx.inside) {
          const unitHit = hitUnitBorder(lx.x, lx.y);
          if (unitHit) {
            e.preventDefault();
            g.mode = "dragUnit";
            g.unitDrag = {
              unitId: unitHit.unit.id,
              members: snapshotUnitMembers(unitHit.unit),
              bboxSnapshot: unitHit.unit.bbox ? { x: unitHit.unit.bbox.x, y: unitHit.unit.bbox.y } : null,
              start: { x: e.clientX, y: e.clientY },
              moved: false,
            };
            g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
            return;
          }
        }
      }

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
    /* ★ 套索：累积轨迹点（stage 局部坐标） */
    if (lassoPath && g.pointers.has(e.pointerId)) {
      const local = getStageLocal(e.clientX, e.clientY);
      if (local) {
        setLassoPath((prev) => prev ? [...prev, local] : null);
        g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      return;
    }
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
        ...brushToShapePatch(brushRef.current),
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
      const bp = brushRef.current;
      setDraft({
        id: "draft",
        kind: d.kind,
        layer: "paper",
        x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        points: d.points ? [...d.points] : undefined,
        pressures: d.pressures ? [...d.pressures] : undefined,
        color: st.color,
        strokeWidth: st.strokeWidth,
        opacity: st.opacity,
        ...brushToShapePatch(bp),
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

    /* ★ 创作单元整体拖动：屏幕 delta → 纸张局部 delta，统一平移全部成员。
       新位置 = pointerdown 快照 + 总 delta（不累加）。
       text 按 layer 区分坐标空间（paper→纸张局部，background→stage 局部）。 */
    if (g.mode === "dragUnit" && g.unitDrag) {
      const sdx = e.clientX - g.unitDrag.start.x;
      const sdy = e.clientY - g.unitDrag.start.y;
      if (Math.hypot(sdx, sdy) > 2) g.unitDrag.moved = true;
      const { ldx, ldy } = screenDeltaToPaperLocal(sdx, sdy);
      applyUnitMemberMove(g.unitDrag.unitId, ldx, ldy, sdx, sdy);
      g.moved = true;
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
      /* ★ 组合活化：框选整体拖动后，成员（含 text）位置已变 → 增量重算涉及成员的所有 Unit.bbox */
      syncUnitBboxes((g.boxOriginalMembers || []).map((m: any) => m.id));
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

    /* ★ 连接动作：点一下 = 拾取对象。
       放在最前面 —— 连接进行中，"点"的语义是选对象，不是框选/绘制。
       没拖过（!g.moved）才算"点"，避免误把拖动当成选择。 */
    if (connectPicking && !g.moved && g.mode !== "drawing") {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      g.mode = "idle";
      const hit = hitAnyElement(e.clientX, e.clientY);
      if (hit) onConnectPickObjectRef.current?.(hit as { type: string; id: string });
      return;
    }
    /* ★ 套索闭合：射线法判定 → 命中元素编组 + 生成包围盒 */
    if (lassoPath && lassoPath.length > 3) {
      const path = lassoPath;
      setLassoPath(null);
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      clearTimeout(g.longPressTimer);
      g.mode = "idle";
      g.moved = false;

      const stage = stageRef.current;
      const sr = stage?.getBoundingClientRect();
      if (!sr) return;

      const inside = (px: number, py: number, poly: { x: number; y: number }[]) => {
        let n = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x, yi = poly[i].y;
          const xj = poly[j].x, yj = poly[j].y;
          if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) n++;
        }
        return n % 2 === 1;
      };

      const pg = pageRef.current;
      const hitIds: string[] = [];
      const tryHit = (type: string, id: string) => {
        const c = centerOf(type, id);
        if (!c) return;
        const screenPt = paperLocalToScreen(c.x, c.y, stage, paperStateRef.current);
        if (inside(screenPt.x - sr.left, screenPt.y - sr.top, path)) hitIds.push(id);
      };

      (pg.shapes || []).forEach((s) => tryHit("shape", s.id));
      (pg.images || []).forEach((s) => tryHit("image", s.id));
      (pg.notes  || []).forEach((s) => tryHit("note", s.id));
      (pg.tables || []).forEach((s) => tryHit("table", s.id));
      (pg.links  || []).forEach((s) => tryHit("link", s.id));

      if (hitIds.length > 0) {
        const gid = `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        onUpdateRef.current({
          groups: [...(pg.groups || []), { id: gid, memberIds: hitIds, createdAt: Date.now() }],
        });
        setBoxGroupId(gid);
        boxGroupIdRef.current = gid;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        hitIds.forEach((id) => {
          const c =
            centerOf("shape", id) || centerOf("image", id) || centerOf("note", id) ||
            centerOf("table", id) || centerOf("link", id);
          if (!c) return;
          const pt = paperLocalToScreen(c.x, c.y, stage, paperStateRef.current);
          const lx = pt.x - sr.left;
          const ly = pt.y - sr.top;
          if (lx < minX) minX = lx;
          if (ly < minY) minY = ly;
          if (lx > maxX) maxX = lx;
          if (ly > maxY) maxY = ly;
        });
        const b = { x: minX - 20, y: minY - 20, w: maxX - minX + 40, h: maxY - minY + 40 };
        boxRef.current = b;
        setBox(b);
      }
      return;
    }
    if (lassoPath) { setLassoPath(null); }
    if (e.pointerType === "pen") {
      /* ★ BUG-01：复位必须连带清掉时间戳，否则残留时间戳会误判 pen 仍活跃 */
      g.activePen = false;
      (g as any).activePenId = null;
      (g as any).activePenAt = 0;
    }
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
          const bp = brushRef.current;
          const shape: ShapeNode = {
            id, kind: d.kind, layer: "paper",
            x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
            points: d.points,
            pressures: d.pressures,
            color: st.color, strokeWidth: st.strokeWidth, opacity: st.opacity,
            ...brushToShapePatch(bp),
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

    /* ★ 结束创作单元整体拖动：成员位置已逐帧提交（手停哪停哪），
       这里做 bbox 最终校准（以成员当前真实坐标重算，吸收 background 层
       text 的 stage 坐标差异）+ 清状态。 */
    if (g.mode === "dragUnit") {
      const u = g.unitDrag;
      g.mode = "idle"; g.moved = false;
      g.unitDrag = null;
      if (u?.moved) {
        const pg = pageRef.current;
        const unit = (pg.units || []).find((x: any) => x.id === u.unitId);
        if (unit) {
          /* syncUnitBboxes 是函数声明，下方定义处可见；此处直接调用 */
          syncUnitBboxes(unit.memberIds || []);
        }
      }
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
        /* ★ P0-4：框选完成后立刻弹出画布级轻操作弹窗（组合/连接/排列/复制/删除），
           位置 = 框选框（stage 局部 → 屏幕坐标），不放全透明层锁画布。 */
        const count = currentGroupMemberIds().length;
        if (count > 0) {
          const sr = stageRef.current?.getBoundingClientRect();
          if (sr) {
            setBoxPopup({
              x: Math.min(sr.left + b.x + b.w, sr.right - 190),
              y: Math.min(sr.top + b.y + b.h + 8, sr.bottom - 200),
              count,
            });
          }
        }
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
    /* ★ BUG-01：取消手势时同步清 pen 时间戳 */
    (g as any).activePenId = null;
    (g as any).activePenAt = 0;

    if (g.mode === "drawing") {
      g.mode = "idle"; g.moved = false;
    }

    /* ★ 创作单元整体拖动：cancel 不还原，保留已移动到的位置（手停哪停哪），
       同样做 bbox 最终校准。成员坐标已逐帧提交，无撤销需求。 */
    if (g.mode === "dragUnit") {
      const u = g.unitDrag;
      g.unitDrag = null;
      g.mode = "idle"; g.moved = false;
      if (u?.moved) {
        const pg = pageRef.current;
        const unit = (pg.units || []).find((x: any) => x.id === u.unitId);
        if (unit) syncUnitBboxes(unit.memberIds || []);
      }
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
  /** 元素在纸张局部坐标系下的中心点。用于连线渲染与套索命中判定。 */
  function centerOf(type: string, id: string): { x: number; y: number } | null {    const pg = pageRef.current;
    if (type === "image") { const n = (pg.images || []).find((x) => x.id === id); return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null; }
    if (type === "note")  { const n = (pg.notes  || []).find((x) => x.id === id); return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null; }
    if (type === "table") { const n = (pg.tables || []).find((x) => x.id === id); return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null; }
    if (type === "link")  { const n = (pg.links  || []).find((x) => x.id === id); return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null; }
    if (type === "shape") {
      const n = (pg.shapes || []).find((x) => x.id === id);
      if (!n) return null;
      if (isFreeKind(n.kind) && n.points && n.points.length > 0) {
        const b = shapeLocalBox(n);
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      }
      return { x: (n.x1 + n.x2) / 2, y: (n.y1 + n.y2) / 2 };
    }
    if (type === "text") {
      const t = textsRef.current.find((x) => x.id === id);
      if (!t) return null;
      const approxW = Math.max(20, (t.text || "").length * t.fontSize * 0.6);
      return { x: t.x + approxW / 2, y: t.y + t.fontSize * 0.8 };
    }
    return null;
  }

  /* ★ 创作单元整体拖动 —— 命中检测 / 快照 / 成员平移。
     坐标真相源唯一：成员在 page 各数组里的真实坐标。
     Unit 本身不存位置，拖动 = 平移 memberIds 对应成员。 */

  /** 命中 Unit「外框命中带」（bbox 外扩 12px 的环形带，不含内部空白）。
      内部空白仍走原有空白操作（框选 / 双击建文字），不抢占。 */
  function hitUnitBorder(lx: number, ly: number): { unit: any; members: { type: string; id: string }[] } | null {
    const pg = pageRef.current;
    const units = pg.units || [];
    if (!units.length) return null;
    const PAD = 12;
    const inRing = (u: any) => {
      const b = u.bbox;
      if (!b) return false;
      const outer = { x: b.x - PAD, y: b.y - PAD, w: b.w + PAD * 2, h: b.h + PAD * 2 };
      const inner = { x: b.x + PAD, y: b.y + PAD, w: Math.max(0, b.w - PAD * 2), h: Math.max(0, b.h - PAD * 2) };
      const inOuter = lx >= outer.x && lx <= outer.x + outer.w && ly >= outer.y && ly <= outer.y + outer.h;
      const inInner = inner.w > 0 && inner.h > 0
        && lx >= inner.x && lx <= inner.x + inner.w && ly >= inner.y && ly <= inner.y + inner.h;
      return inOuter && !inInner;
    };
    /* 多个 Unit 重叠时取落点距外框边缘最近者，判定稳定可预测 */
    let best: { unit: any; members: { type: string; id: string }[] } | null = null;
    let bestDist = Infinity;
    for (const u of units) {
      if (!inRing(u)) continue;
      const b = u.bbox!;
      const dist = Math.min(
        Math.abs(lx - b.x), Math.abs(lx - (b.x + b.w)),
        Math.abs(ly - b.y), Math.abs(ly - (b.y + b.h)),
      );
      if (dist >= bestDist) continue;
      /* 成员解析：六类（text/image/note/table/link/shape）均可整体平移，
         text 有真实定位坐标（TextNode.x/y，TextElement 直接 left/top 渲染） */
      const members: { type: string; id: string }[] = [];
      (u.memberIds || []).forEach((mid: string) => {
        if ((pg.texts || []).some((n: any) => n.id === mid)) members.push({ type: "text", id: mid });
        else if ((pg.images || []).some((n: any) => n.id === mid)) members.push({ type: "image", id: mid });
        else if ((pg.notes || []).some((n: any) => n.id === mid)) members.push({ type: "note", id: mid });
        else if ((pg.tables || []).some((n: any) => n.id === mid)) members.push({ type: "table", id: mid });
        else if ((pg.links || []).some((n: any) => n.id === mid)) members.push({ type: "link", id: mid });
        else if ((pg.shapes || []).some((n: any) => n.id === mid)) members.push({ type: "shape", id: mid });
      });
      if (members.length) { best = { unit: u, members }; bestDist = dist; }
    }
    return best;
  }

  /* 屏幕 delta → 纸张局部 delta（旋转补偿 + 缩放归一，与 dragShape 分支同款换算） */
  function screenDeltaToPaperLocal(sdx: number, sdy: number): { ldx: number; ldy: number } {
    const p = paperStateRef.current;
    const rad = (-p.rotate * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return { ldx: (sdx * cos - sdy * sin) / (p.scale || 1), ldy: (sdx * sin + sdy * cos) / (p.scale || 1) };
  }

  /* 一次 Unit 整体拖动的完整成员快照（按类型深拷贝当前节点）。
     - shape：全量字段（x1/y1/x2/y2/points/pressures）
     - text：TextNode 原样（text 有真实 x/y 定位，TextElement 直接 left/top 渲染，
             与 image/note 同一坐标体系；paper 层 text 走 updateText 批量平移）
     其余类型取原始节点。pointermove 一律 新位置 = 快照 + 总 delta。 */
  function snapshotUnitMembers(unit: any): { type: "text" | "image" | "note" | "table" | "link" | "shape"; id: string; node: any }[] {
    const pg = pageRef.current;
    const out: { type: "text" | "image" | "note" | "table" | "link" | "shape"; id: string; node: any }[] = [];
    (unit.memberIds || []).forEach((mid: string) => {
      const txt = (pg.texts || []).find((n) => n.id === mid);
      if (txt) { out.push({ type: "text", id: mid, node: { ...txt } }); return; }
      const img = (pg.images || []).find((n) => n.id === mid);
      if (img) { out.push({ type: "image", id: mid, node: { ...img } }); return; }
      const note = (pg.notes || []).find((n) => n.id === mid);
      if (note) { out.push({ type: "note", id: mid, node: { ...note } }); return; }
      const table = (pg.tables || []).find((n) => n.id === mid);
      if (table) { out.push({ type: "table", id: mid, node: { ...table } }); return; }
      const lk = (pg.links || []).find((n) => n.id === mid);
      if (lk) { out.push({ type: "link", id: mid, node: { ...lk } }); return; }
      const sh = (pg.shapes || []).find((n) => n.id === mid);
      if (sh) {
        out.push({
          type: "shape", id: mid,
          node: { ...sh, points: sh.points ? sh.points.map((p: any) => ({ ...p })) : undefined, pressures: sh.pressures ? [...sh.pressures] : undefined },
        });
      }
    });
    return out;
  }

  /* 按统一 ldx/ldy 平移 Unit 全部成员（text/image/note/table/link/shape 全覆盖）。
     新位置 = pointerdown 快照 + 当前总 delta（绝不基于当前帧坐标累加）。
     一次 onUpdate 提交所有类型数组 + bbox，拖动只产生一条文档改动。

     坐标体系区分（与现有文字拖动逻辑一致）：
     - text 有 layer 字段：
       layer="paper"  → 坐标为纸张局部，用 ldx/ldy（纸张局部 delta）
       layer="background" → 坐标为 stage 局部，用屏幕 delta（sdx/sdy）
     - image/note/table/link/shape 全部在纸张局部坐标，用 ldx/ldy */
  function applyUnitMemberMove(unitId: string, ldx: number, ldy: number, sdx: number, sdy: number) {
    const g = gRef.current;
    const drag = g.unitDrag;
    if (!drag) return;
    const pg = pageRef.current;
    const snap = new Map(drag.members.map((m) => [m.id, m] as const));

    /* text：按 layer 区分坐标空间 */
    const nextTexts = (pg.texts || []).map((t: any) => {
      const m = snap.get(t.id);
      if (!m || m.type !== "text") return t;
      const o = m.node;
      const isBg = o.layer === "background";
      const dx = isBg ? sdx : ldx;
      const dy = isBg ? sdy : ldy;
      return { ...o, x: o.x + dx, y: o.y + dy };
    });

    /* image/note/table/link：纸张局部坐标，统一用 ldx/ldy */
    const patchPaperXY = (list: any[], type: string) =>
      list.map((x: any) => {
        const m = snap.get(x.id);
        return m && m.type === type ? { ...m.node, x: m.node.x + ldx, y: m.node.y + ldy } : x;
      });

    const nextShapes = (pg.shapes || []).map((s: any) => {
      const m = snap.get(s.id);
      if (!m || m.type !== "shape") return s;
      const o: any = m.node;
      return {
        ...o,
        x1: o.x1 + ldx, y1: o.y1 + ldy,
        x2: o.x2 + ldx, y2: o.y2 + ldy,
        points: o.points ? o.points.map((p: any) => ({ x: p.x + ldx, y: p.y + ldy })) : undefined,
      };
    });
    /* bbox 按快照平移（与成员位移严格一致） */
    const nextUnits = (pg.units || []).map((u: any) =>
      u.id === unitId && u.bbox && drag.bboxSnapshot
        ? { ...u, bbox: { ...u.bbox, x: drag.bboxSnapshot.x + ldx, y: drag.bboxSnapshot.y + ldy } }
        : u,
    );

    textsRef.current = nextTexts;
    onUpdateRef.current({
      texts: nextTexts,
      images: patchPaperXY(pg.images || [], "image"),
      notes: patchPaperXY(pg.notes || [], "note"),
      tables: patchPaperXY(pg.tables || [], "table"),
      links: patchPaperXY(pg.links || [], "link"),
      shapes: nextShapes,
      units: nextUnits,
    });
  }

  function getSelectedRefs(): { type: any; id: string }[] {
    const out: { type: any; id: string }[] = [];
    /* 框选：收集框内所有可定位成员（text/image/note/table/link/shape），
       不再只看文字 —— 这是排列/组合/连接能作用到「框选对象」的真相来源。 */
    const b = boxRef.current;
    if (b && b.w >= 4 && b.h >= 4) {
      computeMembersInBox(b).forEach((id) => {
        const ref = resolveMemberRef(id);
        out.push(ref || { type: "text", id });
      });
    }
    const sel = selectedElRef.current;
    if (sel) out.push({ type: sel.type, id: sel.id });
    return out;
  }

  /** 按 id 解析成员真实类型（图片/便签/表格/链接/图形），找不到再按 text 兜底 */
  function resolveMemberRef(id: string): { type: string; id: string } | null {
    const pg = pageRef.current;
    if ((pg.images || []).some((n) => n.id === id)) return { type: "image", id };
    if ((pg.notes || []).some((n) => n.id === id)) return { type: "note", id };
    if ((pg.tables || []).some((n) => n.id === id)) return { type: "table", id };
    if ((pg.links || []).some((n) => n.id === id)) return { type: "link", id };
    if ((pg.shapes || []).some((n) => n.id === id)) return { type: "shape", id };
    return null;
  }

  function boundsOf(type: string, id: string): { x: number; y: number; w: number; h: number } | null {
    const pg = pageRef.current;
    if (type === "image") { const n = (pg.images || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "note")  { const n = (pg.notes || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "table") { const n = (pg.tables || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "link")  { const n = (pg.links || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "text") {
      const n = (pg.texts || []).find((x) => x.id === id);
      if (!n) return null;
      /* 文字不存宽高（按内容撑开），取 DOM 实际尺寸；取不到时按字号估一个 */
      const el = document.querySelector(`[data-text-id="${id}"]`) as HTMLElement | null;
      return {
        x: n.x, y: n.y,
        w: el?.offsetWidth || 40,
        h: el?.offsetHeight || (n.fontSize || 16) * 1.6,
      };
    }
    if (type === "shape") {
      const n = (pg.shapes || []).find((x) => x.id === id);
      if (!n) return null;
      return { x: Math.min(n.x1, n.x2), y: Math.min(n.y1, n.y2), w: Math.abs(n.x2 - n.x1), h: Math.abs(n.y2 - n.y1) };
    }
    return null;
  }

  /* ★ 组合活化：重算所有包含成员 id 的 Unit.bbox（只更新 bbox 字段，不改成员真实坐标）。
     调用时机：批量 setPos 之后（排列/对齐/分布）。增量修改，老逻辑不动。
     支持传入 unit.id 直接重算该 Unit（创作单元整体拖动时按帧调用）。 */
  function syncUnitBboxes(ids: string[]) {
    const pg = pageRef.current;
    const units = pg.units || [];
    if (!units.length) return;
    const idSet = new Set(ids);
    let changed = false;
    const nextUnits = units.map((u: any) => {
      /* 直接命中的 unit 自身，或包含成员 id 的 unit，都需要重算 */
      const isSelf = idSet.has(u.id);
      const containsMember = u.memberIds?.some((m: string) => idSet.has(m));
      if (!isSelf && !containsMember) return u;
      /* 成员在 page 中可能已移动：逐个取当前 bounds，取外接包围盒 */
      const boxes = u.memberIds
        .map((mid: string) => boundsOfForSync(mid))
        .filter(Boolean) as { x: number; y: number; w: number; h: number }[];
      if (!boxes.length) return u;
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      const x2 = Math.max(...boxes.map((b) => b.x + b.w));
      const y2 = Math.max(...boxes.map((b) => b.y + b.h));
      const nb = { x, y, w: x2 - x, h: y2 - y };
      const cur = u.bbox;
      if (cur && Math.abs(cur.x - nb.x) < 0.5 && Math.abs(cur.y - nb.y) < 0.5 &&
          Math.abs(cur.w - nb.w) < 0.5 && Math.abs(cur.h - nb.h) < 0.5) return u;
      changed = true;
      return { ...u, bbox: nb };
    });
    if (changed) onUpdateRef.current({ units: nextUnits });
  }
  /* 仅用于 bbox 同步：text 类型没有 bounds（不可移动定位单元），其余类型直接查 pageRef 当前值 */
  function boundsOfForSync(id: string): { x: number; y: number; w: number; h: number } | null {
    const pg = pageRef.current;
    const img = (pg.images || []).find((x) => x.id === id);
    if (img) return { x: img.x, y: img.y, w: img.w, h: img.h };
    const note = (pg.notes || []).find((x) => x.id === id);
    if (note) return { x: note.x, y: note.y, w: note.w, h: note.h };
    const table = (pg.tables || []).find((x) => x.id === id);
    if (table) return { x: table.x, y: table.y, w: table.w, h: table.h };
    const lk = (pg.links || []).find((x) => x.id === id);
    if (lk) return { x: lk.x, y: lk.y, w: lk.w, h: lk.h };
    const shape = (pg.shapes || []).find((x) => x.id === id);
    if (shape) return { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
    /* ★ 组合活化补充：text 成员入 Unit 后 bbox 也需计入。
       paper 层 text 坐标为纸张局部（可直接用）；
       background 层 text 在 stage 坐标，混入纸张 bbox 会失真 → 跳过（仅计纸张局部成员）。 */
    const txt = (pg.texts || []).find((x) => x.id === id);
    if (txt && txt.layer === "paper") {
      const w = Math.max(20, (txt.text || "").length * txt.fontSize * 0.6);
      return { x: txt.x, y: txt.y, w, h: txt.fontSize * 1.4 };
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

    useEffect(() => {
    const h = (ev: any) => {
      const c = ev.detail;
      if (c === "undo") undoShape();
      if (c === "redo") redoShape();
      if (c === "delete") deleteSelection();
      if (c === "copy") copySelection();
    };
    window.addEventListener("ranjing:cmd", h);
    return () => window.removeEventListener("ranjing:cmd", h);
  }, []);

  useEffect(() => {
    (window as any).__ranjingCommands = {
      // ★ 统一走 undoShape / redoShape，与 ranjing:cmd 事件共用同一套历史栈，
      //   避免出现两套 redo 栈互不同步（右键菜单撤销后无法重做）的问题。
      undo: () => undoShape(),
      redo: () => redoShape(),
      delete: () => deleteSelection(),
      copy: () => {
        /* ★ P0-9：复制走内部元素剪贴板（框选/点选多类型，保留类型+相对位置） */
        copySelection();
      },
      paste: () => {
        /* ★ P0-9：粘贴错位 +32，保留各元素真实类型与相对位置 */
        pasteSelection();
      },
      /* 导出原先挂在长按弹窗上，现统一收进侧边栏「存」，由 SaveDrawer 调用这条命令 */
      exportCanvas: (format: "svg" | "png" | "png-transparent") => exportCanvas(format),
      eraser: () => onDrawToolChangeRef.current?.("eraser"),
      selectAll: () => {
        const sr = stageRef.current?.getBoundingClientRect();
        if (!sr) return;
        const b = { x: 8, y: 8, w: sr.width - 16, h: sr.height - 16 };
        boxRef.current = b;
        setBox(b);
      },
    };
  }, []);

function handleSheetAction(kind: string) {
    /* ★ BUG-02/03：模式切换指令由父组件持有 state，Editor 只负责转发。
       注意：CreationLocalRoom.dispatchSheet 已就地拦截这两个 kind 并翻转 state，
       故本分支是「双保险」——若父层不再拦截，此处仍能工作。 */
    if (kind === "connect-toggle") {
      onToggleConnect?.();
      return;
    }
    if (kind === "lasso-toggle") {
      onToggleLasso?.();
      return;
    }
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
      syncUnitBboxes(sel.map((s) => s.id));
      return;
    }

    if (kind === "bring-front" || kind === "bring-forward" || kind === "send-backward" || kind === "send-back") {
      /* 分两条路：
         · 笔迹（shape）整体在一个 <svg> 里，靠数组次序叠放 → 仍用数组重排
         · 文字/图片/便签/表格/链接同处一层，靠 CSS z-index 叠放 → 重排后重算 z
         两条路可以同时发生（框选里混着笔迹和其他元素时）。 */

      /* ── 非笔迹元素：按 z 排序后挪位，再重新分配 z ── */
      const domSel = sel.filter((s) => s.type !== "shape");
      if (domSel.length) {
        const ARR: Record<string, string> = { text: "texts", image: "images", note: "notes", table: "tables", link: "links" };
        const ZD: Record<string, number> = { text: Z_TEXT, image: Z_IMAGE, note: Z_NOTE, table: Z_TABLE, link: Z_LINK };
        const pg: any = pageRef.current;

        const key = (ty: string, id: string) => `${ty}:${id}`;
        const picked = new Set(domSel.map((s) => key(s.type, s.id)));

        const list: { type: string; id: string; z: number }[] = [];
        for (const ty of Object.keys(ARR)) {
          for (const n of (pg[ARR[ty]] || [])) {
            if (n.layer !== "paper") continue;
            list.push({ type: ty, id: n.id, z: typeof n.z === "number" ? n.z : ZD[ty] });
          }
        }
        if (!list.some((x) => picked.has(key(x.type, x.id)))) { /* 选中的不在本页，跳过 */ }
        else {
          list.sort((a, b) => a.z - b.z);

          let ordered: typeof list;
          const selItems = list.filter((x) => picked.has(key(x.type, x.id)));
          const restItems = list.filter((x) => !picked.has(key(x.type, x.id)));

          if (kind === "bring-front") {
            ordered = [...restItems, ...selItems];
          } else if (kind === "send-back") {
            ordered = [...selItems, ...restItems];
          } else {
            const step = kind === "bring-forward" ? 1 : -1;
            ordered = [...list];
            const idxs = ordered.map((x, i) => (picked.has(key(x.type, x.id)) ? i : -1)).filter((i) => i >= 0);
            /* 向「上」挪时从最上面开始处理，避免两个相邻的选中项互相顶住 */
            const seq = step > 0 ? [...idxs].reverse() : idxs;
            for (const i of seq) {
              const j = i + step;
              if (j < 0 || j >= ordered.length) continue;
              if (picked.has(key(ordered[j].type, ordered[j].id))) continue;
              const tmp = ordered[i]; ordered[i] = ordered[j]; ordered[j] = tmp;
            }
          }

          /* 重算 z：按新次序给 10/20/30…，与默认值同量纲，老数据观感不变 */
          const patch: any = {};
          for (const ty of Object.keys(ARR)) patch[ARR[ty]] = [...(pg[ARR[ty]] || [])];
          ordered.forEach((item, i) => {
            const arr = patch[ARR[item.type]];
            const node = arr.find((n: any) => n.id === item.id);
            if (node) node.z = (i + 1) * 10;
          });
          textsRef.current = patch.texts || textsRef.current;
          onUpdateRef.current(patch);
        }
      }

      /* ── 笔迹：保留原有的数组重排 ── */
      const ids = sel.filter((s) => s.type === "shape").map((s) => s.id);
      if (ids.length) {
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
      }
      return;
    }

    if (kind === "distribute-h" || kind === "distribute-v") {
      const bs = sel
        .map((s) => ({ s, b: boundsOf(s.type, s.id) }))
        .filter((x) => x.b) as { s: any; b: any }[];
      if (bs.length < 3) return; // 少于 3 个没意义
      if (kind === "distribute-h") {
        bs.sort((a, b) => a.b.x - b.b.x);
        const minX = bs[0].b.x;
        const maxX = bs[bs.length - 1].b.x + bs[bs.length - 1].b.w;
        const totalW = bs.reduce((sum, x) => sum + x.b.w, 0);
        const gap = (maxX - minX - totalW) / (bs.length - 1);
        let cursor = minX;
        bs.forEach(({ s, b }) => {
          const dx = cursor - b.x;
          if (dx) setPos(s.type, s.id, dx, 0);
          cursor += b.w + gap;
        });
      } else {
        bs.sort((a, b) => a.b.y - b.b.y);
        const minY = bs[0].b.y;
        const maxY = bs[bs.length - 1].b.y + bs[bs.length - 1].b.h;
        const totalH = bs.reduce((sum, x) => sum + x.b.h, 0);
        const gap = (maxY - minY - totalH) / (bs.length - 1);
        let cursor = minY;
        bs.forEach(({ s, b }) => {
          const dy = cursor - b.y;
          if (dy) setPos(s.type, s.id, 0, dy);
          cursor += b.h + gap;
        });
      }
      syncUnitBboxes(bs.map((x) => x.s.id));
      return;
    }

    /* ===== 框选弹窗：组合（选中成员 → 登记 Unit，成员仍独立可编辑，整体可移动）===== */
    if (kind === "box-compose") {
      const ids = sel.map((s) => s.id);
      if (ids.length < 2) { showCanvasFlash("至少框选 2 个对象才能组合"); return; }
      const uid = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      /* 成员当前真实坐标 → 外接包围盒（text 用近似宽高） */
      const boxes = sel
        .map((s) => { const b = boundsOfForSync(s.id); return b ? { b, t: s.type } : null; })
        .filter(Boolean) as { b: { x: number; y: number; w: number; h: number }; t: string }[];
      let bbox: { x: number; y: number; w: number; h: number } | undefined;
      if (boxes.length) {
        const x = Math.min(...boxes.map((v) => v.b.x));
        const y = Math.min(...boxes.map((v) => v.b.y));
        const x2 = Math.max(...boxes.map((v) => v.b.x + v.b.w));
        const y2 = Math.max(...boxes.map((v) => v.b.y + v.b.h));
        bbox = { x, y, w: x2 - x, h: y2 - y };
      }
      const gid = `g-${uid}`;
      onUpdateRef.current({
        groups: [...(pageRef.current.groups || []), { id: gid, memberIds: ids, createdAt: Date.now() }],
        units: [...(pageRef.current.units || []), {
          id: uid, kind: "card", memberIds: ids, name: "组合",
          bbox, createdAt: Date.now(),
        }],
      });
      showCanvasFlash("已组合，成员仍可单独编辑");
      return;
    }

    /* ===== 框选弹窗：关系链（按选择顺序 A→B→C→D 建 elementLinks，非全互连）===== */
    if (kind === "box-chain-story" || kind === "box-chain-display" || kind === "box-chain-flow") {
      const relType: "story" | "display" | "flow" = kind.slice("box-chain-".length) as any;
      const LABELS: Record<string, string> = { story: "接着", display: "解释", flow: "触发" };
      const chain = sel.filter((s) => s.type !== "text"); /* text 无稳定连线端点，跳过 */
      if (chain.length < 2) { showCanvasFlash("至少选择 2 个对象建立关系链"); return; }
      const links = pageRef.current.elementLinks || [];
      const now = Date.now();
      const newLinks: ElementLink[] = [];
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i], b = chain[i + 1];
        /* 已存在同向关系则跳过，避免重复 */
        const dup = links.some((l: any) =>
          l.fromId === a.id && l.targetId === b.id) ||
          newLinks.some((l) => l.fromId === a.id && l.targetId === b.id);
        if (dup) continue;
        newLinks.push({
          id: `el-${now}-${i}`,
          fromType: a.type as ElementLinkTargetType, fromId: a.id,
          targetType: b.type as ElementLinkTargetType, targetId: b.id,
          createdAt: now, relType, label: LABELS[relType],
        });
      }
      if (newLinks.length) {
        onUpdateRef.current({ elementLinks: [...links, ...newLinks] });
        showCanvasFlash(`已建立 ${newLinks.length} 段「${LABELS[relType]}」关系`);
      }
      return;
    }

    /* ===== 框选弹窗：复制/删除（画布级，不 alert，删后清框选）===== */
    if (kind === "box-copy") {
      copySelection();
      setBoxPopup(null);
      return;
    }
    if (kind === "box-delete") {
      deleteSelection();
      clearBox();
      setBoxPopup(null);
      return;
    }

    if (kind === "bind-strokes") {

      // 简易实现：把当前框选内的所有 shape 打成一个 group
      const ids = (pageRef.current.shapes || [])
        .filter((s) => selectedElRef.current?.type === "shape"
          ? s.id === selectedElRef.current.id
          : sel.some((x) => x.type === "shape" && x.id === s.id))
        .map((s) => s.id);
      if (!ids.length) return;
      const gid = `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      onUpdateRef.current({
        groups: [...(pageRef.current.groups || []), { id: gid, memberIds: ids, createdAt: Date.now() }],
      });
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

    /* ===== 关系类型（第 3 层）：把已有连线升级为有语义的关系 =====
       对「当前选中的元素对 / 最近一条元素连线」写入 relType。
       若用户未选中连线，则对本页所有未标注类型的连线统一标注（批量归纳）。 */
    /* ===== 关系类型（第 3 层）：把已有连线升级为有语义的关系 =====
       对本页所有未标注类型的连线统一标注（批量归纳）；
       最近一条（用户刚建的）同时补默认关系词。 */
    if (kind === "rel-story" || kind === "rel-display" || kind === "rel-flow") {
      const rel = kind.slice(4);
      const links = pageRef.current.elementLinks || [];
      if (!links.length) return;
      const LABELS: Record<string, string> = { story: "接着", display: "解释", flow: "触发" };
      onUpdateRef.current({
        elementLinks: links.map((l: any, i: number) => {
          if (i === links.length - 1) return { ...l, relType: rel, label: l.label || LABELS[rel] };
          return l.relType ? l : { ...l, relType: rel };
        }),
      });
      return;
    }

    /* ===== 跳转锚点（第 3 层）：建立页级 flow 关系 =====
       本页 → 下一页（若存在），经 onJumpAnchor 由父组件写入真实 PageLink。 */
    if (kind === "jump-anchor") {
      const pages = allPages || [];
      const idx = pages.findIndex((p) => p.id === page.id);
      const target = pages[idx + 1];
      if (!target) return;
      onJumpAnchor?.(target.id, "flow");
      return;
    }

    /* ===== 智能合成（第 2 层）：归纳式识别 + 排列入位 + 登记 Unit =====
       不是套模板，是读用户已摆好的相对布局，归纳出形态：
       - synth-card   图文卡片：1 图 + 1 文本（相邻）→ 图上文下
       - synth-label  图标+文字：小图形 + 短文本 → 标签（横排）
       - synth-sticky 便签+底纸：便签落在某纸张区域内 → 贴附
       - synth-zone   链接+容器：链接被图形/卡片包围 → 可点区域
       执行 3 步：对齐入位（排列）→ 编组锁定（组合）→ 登记 Unit（新对象） */
    if (kind === "synth-card" || kind === "synth-label" || kind === "synth-sticky" || kind === "synth-zone") {
      const bounds = sel
        .map((s) => ({ s, b: boundsOf(s.type, s.id) }))
        .filter((x): x is { s: { type: any; id: string }; b: { x: number; y: number; w: number; h: number } } => !!x.b);
      if (bounds.length < 2) return;
      /* 归纳：按元素类型分类 */
      const imgs = bounds.filter((x) => x.s.type === "image");
      const notes = bounds.filter((x) => x.s.type === "note");
      const shapes = bounds.filter((x) => x.s.type === "shape");
      const links = bounds.filter((x) => x.s.type === "link");
      const texts = bounds.filter((x) => x.s.type === "text");
      const t = pageRef.current;
      const tNode = (id: string) => (t.texts || []).find((x) => x.id === id);
      const pickPair = (a: { s: any; b: any }[], b: { s: any; b: any }[]) => {
        if (!a.length || !b.length) return null;
        /* 取相对位置最近的一对 */
        let best: { a: any; b: any; d: number } | null = null;
        for (const x of a) for (const y of b) {
          const d = Math.hypot((x.b.x + x.b.w / 2) - (y.b.x + y.b.w / 2), (x.b.y + x.b.h / 2) - (y.b.y + y.b.h / 2));
          if (!best || d < best.d) best = { a: x, b: y, d };
        }
        return best;
      };

      if (kind === "synth-card") {
        /* 图文卡片：1 图 + 1 短文本（任意长，优先短） */
        const shortTexts = texts.filter((x) => (tNode(x.s.id)?.text || "").length <= 40);
        const pool = shortTexts.length ? shortTexts : texts;
        const pair = pickPair(imgs, pool);
        if (!pair) return;
        const { a, b } = pair;
        /* 形态归纳：图在文上方 = 卡片竖排；否则横排 */
        const imgAbove = a.b.y < b.b.y;
        const pattern: "row" | "col" = imgAbove ? "col" : "row";
        /* 排列：把成员对齐到同一基线（卡片内部节奏） */
        if (pattern === "col") {
          /* 图上文下：水平居中对齐 + 文字顶到图底 + spacing */
          const dx = (a.b.x + a.b.w / 2) - (b.b.x + b.b.w / 2);
          setPos(a.s.type, a.s.id, dx, 0);
          setPos(b.s.type, b.s.id, dx, a.b.y + a.b.h - b.b.y + 8);
        } else {
          /* 图左文右：垂直居中对齐 + 文字左缘到图右 + spacing */
          const dy = (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2);
          setPos(a.s.type, a.s.id, 0, dy);
          setPos(b.s.type, b.s.id, a.b.x + a.b.w - b.b.x + 8, dy);
        }
        /* 组合：编组 + 登记 Unit */
        const uid = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const memberIds = [a.s.id, b.s.id];
        onUpdateRef.current({
          groups: [...(pageRef.current.groups || []), {
            id: `g-${uid}`, memberIds, createdAt: Date.now(),
          }],
          units: [...(pageRef.current.units || []), {
            id: uid, kind: "card", memberIds, name: "卡片",
            layout: { pattern, spacing: 8 },
            bbox: {
              x: Math.min(a.b.x, b.b.x), y: Math.min(a.b.y, b.b.y),
              w: Math.max(a.b.x + a.b.w, b.b.x + b.b.w) - Math.min(a.b.x, b.b.x),
              h: Math.max(a.b.y + a.b.h, b.b.y + b.b.h) - Math.min(a.b.y, b.b.y),
            },
            createdAt: Date.now(),
          }],
        });
        return;
      }

      if (kind === "synth-label") {
        /* 图标+文字：小图形 + 短文本（横排，文字在右） */
        const shortTexts = texts.filter((x) => (tNode(x.s.id)?.text || "").length <= 12);
        const pool = shortTexts.length ? shortTexts : texts;
        if (!shapes.length || !pool.length) return;
        const pair = pickPair(shapes, pool);
        if (!pair) return;
        const { a, b } = pair;
        /* 排版：文字水平贴到图形右缘 */
        const dy = (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2);
        setPos(a.s.type, a.s.id, 0, dy);
        setPos(b.s.type, b.s.id, a.b.x + a.b.w - b.b.x + 6, dy);
        const uid = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        onUpdateRef.current({
          groups: [...(pageRef.current.groups || []), { id: `g-${uid}`, memberIds: [a.s.id, b.s.id], createdAt: Date.now() }],
          units: [...(pageRef.current.units || []), {
            id: uid, kind: "label", memberIds: [a.s.id, b.s.id], name: "图签",
            layout: { pattern: "row", spacing: 6 },
            bbox: {
              x: a.b.x, y: Math.min(a.b.y, b.b.y),
              w: a.b.w + (a.b.x + a.b.w - b.b.x + 6) + b.b.w - a.b.w + 6,
              h: Math.max(a.b.h, b.b.h),
            },
            createdAt: Date.now(),
          }],
        });
        return;
      }

      if (kind === "synth-sticky") {
        /* 便签+底纸：便签落在纸张区域 = 贴附关系（成员整体随底纸） */
        const base = (imgs.length ? imgs[0] : null) || (shapes.length ? shapes[0] : null);
        if (!notes.length || !base) return;
        const { a: n, b: p } = pickPair(notes, [base])!;
        /* 排版：便签居底纸中心 */
        const dx = (p.b.x + p.b.w / 2) - (n.b.x + n.b.w / 2);
        const dy = (p.b.y + p.b.h / 2) - (n.b.y + n.b.h / 2);
        setPos(n.s.type, n.s.id, dx, dy);
        const uid = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        onUpdateRef.current({
          groups: [...(pageRef.current.groups || []), { id: `g-${uid}`, memberIds: [n.s.id, p.s.id], createdAt: Date.now() }],
          units: [...(pageRef.current.units || []), {
            id: uid, kind: "sticky", memberIds: [n.s.id, p.s.id], name: "贴签",
            layout: { pattern: "center" },
            bbox: p.b,
            createdAt: Date.now(),
          }],
        });
        return;
      }

      if (kind === "synth-zone") {
        /* 链接+容器：链接被图形/图片包围 = 可点区域 */
        if (!links.length) return;
        const container = (imgs.length ? imgs[0] : null) || (shapes.length ? shapes[0] : null);
        const target = links[0];
        const base = container;
        if (!base) return;
        /* 排版：链接居容器中心 */
        const dx = (base.b.x + base.b.w / 2) - (target.b.x + target.b.w / 2);
        const dy = (base.b.y + base.b.h / 2) - (target.b.y + target.b.h / 2);
        setPos(target.s.type, target.s.id, dx, dy);
        const uid = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        onUpdateRef.current({
          groups: [...(pageRef.current.groups || []), { id: `g-${uid}`, memberIds: [target.s.id, base.s.id], createdAt: Date.now() }],
          units: [...(pageRef.current.units || []), {
            id: uid, kind: "zone", memberIds: [target.s.id, base.s.id], name: "区域",
            layout: { pattern: "center" },
            bbox: base.b,
            createdAt: Date.now(),
          }],
        });
        return;
      }
    }
    if (kind === "ungroup") {
      const gid = boxGroupIdRef.current;
      if (gid) {
        onUpdateRef.current({ groups: (pageRef.current.groups || []).filter((g) => g.id !== gid) });
        clearBox();
      }
      return;
    }

    /* ★ BUG-06：兜底 —— 未识别指令不再静默吞掉。
       用 console.warn 而非 alert（工单第 8 条禁用 alert/confirm/prompt）。 */
    // eslint-disable-next-line no-console
    console.warn("[handleSheetAction] 未处理指令:", kind);
  }

  useEffect(() => {
    if (!sheetAction) return;
    const k = String(sheetAction.kind);
    if (k === "frame-2x2" || k === "frame-2x3" || k === "frame-3x3") {
      const parts: [number, number] = k === "frame-2x2" ? [2, 2] : k === "frame-2x3" ? [2, 3] : [3, 3];
      const [cols, rows] = parts;
      const ppr = paperStateRef.current;
      const W = ppr.w > 0 ? ppr.w : 400;
      const H = ppr.h > 0 ? ppr.h : 600;
      const gap = 6;
      const cw = (W - gap * (cols + 1)) / cols;
      const ch = (H - gap * (rows + 1)) / rows;
      /* 第 4 层：镜 = Frame（order 叙事顺序，缺省 Z 字形阅读序 1..N） */
      const out: { id: string; x: number; y: number; w: number; h: number; order: number; elementIds?: string[] }[] = [];
      let n = 0;
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          n += 1;
          out.push({ id: `f-${rr}-${cc}`, x: gap + cc * (cw + gap), y: gap + rr * (ch + gap), w: cw, h: ch, order: n });
        }
      }
      setComicFrames(out);
      /* 镜序列持久化到 page.frames（刷新后保留） */
      onUpdateRef.current({ frames: out });
      return;
    }
    if (k === "frame-clear") { setComicFrames([]); onUpdateRef.current({ frames: [] }); return; }

    /* ===== 第 4 层：镜序（frame-swap）=====
       交互约定：画布上镜的编号可点。点镜 A → 再点镜 B → 交换 A/B 的叙事顺序。
       实现：镜编号点击走 DOM 事件 → 本地 state 记录「上一次点选的镜」，
       第二次点选若命中的是另一镜，则 frame-swap 触发交换。
       简化：本次先实现「与阅读序上一镜交换」的版本（点击镜 = 向前挪一格），
       完整的双镜交换后续在编号 DOM 里做点选记录。 */
    if (k === "frame-swap") {
      /* 当前选中框内的镜（若框选了镜编号区）或最近高亮镜 → 与上一镜交换 */
      const cur = playingIdx >= 0 ? comicFrames[playingIdx] : null;
      const target = cur ? cur : comicFrames[0];
      if (!target) return;
      const sorted = [...comicFrames].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const idx = sorted.findIndex((f) => f.id === target.id);
      if (idx <= 0) return; /* 第一镜没有「上一镜」，不交换 */
      const prev = sorted[idx - 1];
      const next = sorted.map((f) =>
        f.id === target.id ? { ...f, order: prev.order } :
        f.id === prev.id ? { ...f, order: target.order } : f
      );
      setComicFrames(next);
      onUpdateRef.current({ frames: next } as any);
      return;
    }

    /* ===== 第 5 层：节奏档位 =====
       perfo-speed-*：写入 page.performances 的 timing（当前页的演出对象） */
    if (k.startsWith("perfo-speed-")) {
      const speed = k.replace("perfo-speed-", "");
      const ms = speed === "slow" ? 1400 : speed === "mid" ? 800 : 450;
      const perfos: any[] = pageRef.current.performances || [];
      const perf: any = perfos.find((x) => x.id === "main") || {
        id: "main",
        frames: comicFrames.map((f: any) => f.id),
        crossLinks: (pageRef.current.elementLinks || []).filter((l: any) => l.relType === "flow" || l.relType === "story").map((l: any) => l.id),
      };
      perf.timing = { perFrameMs: ms };
      perf.frames = comicFrames.map((f: any) => f.id);
      onUpdateRef.current({
        performances: [...perfos.filter((x: any) => x.id !== "main"), perf],
      } as any);
      (window as any).__ranjingPerfSpeed = ms;
      return;
    }
    /* 序列预设：按镜顺序（阅读序）/ 按关系顺序（故事线推进）
       两者都真实生效：重排 comicFrames 的 order + 持久化 page.frames */
    if (k === "perfo-order-frames" || k === "perfo-order-links") {
      const frames = [...comicFrames];
      if (!frames.length) return;
      if (k === "perfo-order-frames") {
        /* 按镜顺序：恢复 Z 字形阅读序（按坐标重排 order） */
        frames.sort((a: any, b: any) => a.y - b.y || a.x - b.x);
      } else {
        /* 按关系顺序：按故事线（relType=story 的元素连线）推进重排镜的 order
           故事线连接的两个元素若分属不同镜 → 被线连接的镜排在一起、按线顺序 */
        const storyLinks = (pageRef.current.elementLinks || []).filter((l: any) => l.relType === "story");
        if (!storyLinks.length) {
          /* 无故事线 → 等同按镜顺序 */
          frames.sort((a: any, b: any) => a.y - b.y || a.x - b.x);
        } else {
          /* 元素 → 所在镜：按坐标包含判定 */
          const frameOfEl = (x: number, y: number) =>
            frames.find((f: any) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
          /* 按故事线建立镜序列：每条线的「起点镜」先于「终点镜」 */
          const seq: string[] = [];
          storyLinks.forEach((l: any) => {
            const fromC = centerOf(l.fromType || "", l.fromId || "");
            const toC = centerOf(l.targetType || "", l.targetId || "");
            const ff = fromC ? frameOfEl(fromC.x, fromC.y) : undefined;
            const ft = toC ? frameOfEl(toC.x, toC.y) : undefined;
            if (ff && !seq.includes(ff.id)) seq.push(ff.id);
            if (ft && ft.id !== ff?.id && !seq.includes(ft.id)) seq.push(ft.id);
          });
          /* 未入线的镜保持原阅读序附后 */
          frames.sort((a: any, b: any) => a.y - b.y || a.x - b.x);
          frames.sort((a: any, b: any) => {
            const ia = seq.indexOf(a.id), ib = seq.indexOf(b.id);
            const ra = ia < 0 ? 999 : ia, rb = ib < 0 ? 999 : ib;
            return ra - rb;
          });
        }
      }
      /* 写入 order 1..N + 持久化 */
      const next = frames.map((f: any, i: number) => ({ ...f, order: i + 1 }));
      setComicFrames(next);
      onUpdateRef.current({ frames: next } as any);
      return;
    }

    /* ===== 第 5 层：播放 = 演出（读已有结构）=====
       镜序列（排列）→ 单元渐现（组合）→ 关系展开（连接）→ 按节奏走
       ★ 跨页演出：本页所有镜播完后，按 PageLink(relType="flow") 找下一页 →
         切换页面 → 新页 Editor remount 时检测 window.__ranjingCrossPage 自动续播。
         循环保护：visited 栈防止 A→B→A 无限跳。无下一页 / 目标页不存在 → 正常结束。 */
    if (k === "play") {
      if (comicFrames.length === 0) { showCanvasFlash("请先在排列里选一个分格版式"); return; }
      /* ★ 节奏活化：默认节奏从结构生长（基础 + 镜内 Unit 数 + 该镜关系数），
         用户已通过 perfo-speed-* 锁定则保留原固定时长（系统提供节奏，不锁死节奏） */
      const lockedMs = (window as any).__ranjingPerfSpeed as number | undefined;
      const seq = [...comicFrames].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const pg = pageRef.current;
      const allUnits = pg.units || [];
      const allLinks = pg.elementLinks || [];
      const frameOfEl = (x: number, y: number) =>
        seq.find((f: any) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
      const timings = seq.map((f: any) => {
        const unitsInFrame = allUnits.filter((u: any) =>
          (u.memberIds || []).some((mid: string) => (f.elementIds || []).includes(mid))).length;
        const linksInFrame = allLinks.filter((l: any) => {
          const c1 = centerOf(l.fromType || "", l.fromId || "");
          const c2 = centerOf(l.targetType || "", l.targetId || "");
          return (c1 && frameOfEl(c1.x, c1.y)?.id === f.id) || (c2 && frameOfEl(c2.x, c2.y)?.id === f.id);
        }).length;
        return 700 + Math.min(unitsInFrame, 4) * 150 + Math.min(linksInFrame, 5) * 180;
      });
      playTimingsRef.current = lockedMs ? seq.map(() => lockedMs) : timings;
      /* 关系线按故事线（story）顺序依次展开，其余按创建序附后 —— 关系决定展示顺序 */
      const storyIds = allLinks.filter((l: any) => l.relType === "story").map((l: any) => l.id);
      const restIds = allLinks.filter((l: any) => l.relType !== "story").map((l: any) => l.id);
      setActiveLinks([...storyIds, ...restIds]);

      /* ★ 跨页状态：记录演出是否跨页 + 已访问页栈（循环保护）+ 本页是否为首页。
         首帧播放时初始化（用户主动触发）；续播时沿用已有 visited。 */
      const cross = (window as any).__ranjingCrossPage;
      const isContinuation = cross && cross.active && cross.pageIds.includes(page.id);
      const visited: string[] = isContinuation ? cross.pageIds : [page.id];

      let i = 0;
      setPlayingIdx(0);
      /* 逐镜调度（节奏可变）：第 n 镜停留 playTimingsRef[n]，到点推下一步。
         stop 语义：play-stop 分支会 clearTimeout(__ranjingPlayTimer) 使 pending 回调
         不再触发，同时清 __ranjingCrossPage，续播 effect 检测标记为 null 不会误续。 */
      const step = () => {
        i += 1;
        if (i >= seq.length) {
          /* 本页末镜完成 → 查 PageLink 里 relType="flow" 且 from=本页 的下一条页 */
          const links = pageLinksRef.current;
          const flowLink = links.find((l: any) => l.from === page.id && l.relType === "flow");
          const nextId: string | undefined = flowLink?.to;
          /* 目标页必须真实存在，否则安全停止 */
          const nextPage = nextId
            ? (allPagesRef.current || []).find((p: any) => p.id === nextId)
            : null;
          if (nextPage && nextId && !visited.includes(nextId)) {
            /* 有下一页且未访问过 → 记录跨页状态后切页，新 Editor remount 时自动续播 */
            (window as any).__ranjingCrossPage = {
              active: true,
              pageIds: [...visited, nextId],
            };
            setPlayingIdx(-1);
            setActiveLinks([]);
            onSelectPageRef.current?.(nextId);
            return;
          }
          /* 无 flow 关系 / 目标已访问过（循环）/ 目标不存在 → 正常结束整条演出 */
          setPlayingIdx(-1);
          setActiveLinks([]);
          (window as any).__ranjingCrossPage = null;
          return;
        }
        setPlayingIdx(i);
        (window as any).__ranjingPlayTimer = window.setTimeout(step, playTimingsRef.current[i] || 800);
      };
      (window as any).__ranjingPlayTimer = window.setTimeout(step, playTimingsRef.current[0] || 800);
      (window as any).__ranjingPlaySeq = seq;
      return;
    }
    if (k === "play-step") {
      const seq = (window as any).__ranjingPlaySeq ||
        [...comicFrames].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      if (!seq.length) return;
      /* 单步：从当前 playingIdx 走一步（-1 表示从头） */
      const next = Math.min(playingIdx + 1, seq.length - 1);
      setPlayingIdx(playingIdx < 0 ? 0 : next);
      /* 单步不自动停，用户再按可继续 */
      return;
    }
    if (k === "play-stop") {
      const tm = (window as any).__ranjingPlayTimer;
      if (tm) { window.clearTimeout(tm); window.clearInterval(tm); }
      setPlayingIdx(-1);
      setActiveLinks([]);
      /* ★ 跨页演出：停止时同步清除跨页状态，防止新 Editor remount 时误续播 */
      (window as any).__ranjingCrossPage = null;
      return;
    }
    handleSheetAction(sheetAction.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetAction?.id, sheetAction?.kind]);
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

  const hasBoxSel = !!box && box.w >= 4 && box.h >= 4;
  const hasElSel  = !!selectedEl;
  const hasSelection = hasBoxSel || hasElSel || !!boxGroupId;

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    onSelectionChangeRef.current?.(hasSelection);
  }, [hasSelection]);
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


  /* ★ 整页内容渲染（任意页面，只读、不参与选中/编辑）。
     其他纸以前只画 texts + shapes，notes/images/tables/links 全是空白，
     导致「延伸物」看起来是一张空纸、也点不到里面的对象。
     这里把 6 种元素按 layer=paper 全画出来，和当前纸同一套 z 常量。
     当前纸的渲染路径完全不动。 */
  function renderPageContent(pg: Page) {
    const pw = pg.paperW && pg.paperW > 0 ? pg.paperW : 0;
    const ph = pg.paperH && pg.paperH > 0 ? pg.paperH : 0;
    return (
      <>
        {(pg.texts || []).filter((t) => t.layer === "paper").map((t) => (
          <div
            key={t.id}
            style={{
              position: "absolute", zIndex: t.z ?? Z_TEXT,
              left: t.x, top: t.y,
              fontSize: t.fontSize,
              fontFamily: t.fontFamily || DEFAULT_FONT,
              color: t.color, lineHeight: 1.4,
              whiteSpace: "pre", width: "max-content",
              pointerEvents: "none",
            }}
          >{t.text}</div>
        ))}
        {(pg.images || []).filter((im) => im.layer === "paper").map((im) => (
          <img
            key={im.id} src={im.src} alt="" draggable={false}
            style={{
              position: "absolute", zIndex: im.z ?? Z_IMAGE,
              left: im.x, top: im.y, width: im.w, height: im.h,
              objectFit: "contain",
              transform: `rotate(${im.rotate || 0}deg)`, transformOrigin: "center center",
              pointerEvents: "none",
            }}
          />
        ))}
        {(pg.notes || []).filter((n) => n.layer === "paper").map((n) => (
          <div
            key={n.id}
            style={{
              position: "absolute", zIndex: n.z ?? Z_NOTE,
              left: n.x, top: n.y, width: n.w, height: n.h,
              background: n.bgColor, color: n.textColor,
              borderRadius: 6,
              transform: `rotate(${n.rotate || 0}deg)`, transformOrigin: "center center",
              padding: 10, boxSizing: "border-box",
              fontSize: n.fontSize, lineHeight: 1.4,
              overflow: "hidden", whiteSpace: "pre-wrap",
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,.08)",
            }}
          >{n.text}</div>
        ))}
        {(pg.tables || []).filter((t) => t.layer === "paper").map((t) => (
          <div
            key={t.id}
            style={{
              position: "absolute", zIndex: t.z ?? Z_TABLE,
              left: t.x, top: t.y, width: t.w, height: t.h,
              display: "grid",
              gridTemplateRows: `repeat(${t.rows}, 1fr)`,
              gridTemplateColumns: `repeat(${t.cols}, 1fr)`,
              pointerEvents: "none",
              transform: `rotate(${t.rotate || 0}deg)`, transformOrigin: "center center",
              border: "1.5px solid #3a352e",
              boxSizing: "border-box", background: "#ffffff",
            }}
          >
            {Array.from({ length: t.rows }).map((_, r) =>
              Array.from({ length: t.cols }).map((__, c) => (
                <div key={`${r}-${c}`} style={{
                  borderRight: c < t.cols - 1 ? "1px solid #3a352e" : "none",
                  borderBottom: r < t.rows - 1 ? "1px solid #3a352e" : "none",
                  fontSize: 12, padding: 4, boxSizing: "border-box", overflow: "hidden",
                }}>{t.cells[r]?.[c] || ""}</div>
              ))
            )}
          </div>
        ))}
        {(pg.links || []).filter((l) => l.layer === "paper").map((l) => (
          <div
            key={l.id}
            style={{
              position: "absolute", zIndex: l.z ?? Z_LINK,
              left: l.x, top: l.y, width: l.w, height: l.h,
              background: "#eaf3fb", color: "#2a4a6b",
              transform: `rotate(${l.rotate || 0}deg)`, transformOrigin: "center center",
              border: "1px solid rgba(42,74,107,.3)",
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
          width="100%" height="100%"
          viewBox={pw > 0 && ph > 0 ? `0 0 ${pw} ${ph}` : undefined}
          preserveAspectRatio={pw > 0 && ph > 0 ? "none" : "xMidYMid meet"}
          style={{ position: "absolute", zIndex: Z_SHAPES, left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}
        >
          {(pg.shapes || []).filter((s) => s.layer === "paper").map((s) => renderShape(s))}
        </svg>
      </>
    );
  }

  const paperInner = (
    <>
      {texts.filter((t) => t.layer === "paper").map((t) => (
        <TextElement
          key={t.id}
          t={t}
          z={t.z ?? Z_TEXT}
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
            zIndex: im.z ?? Z_IMAGE,
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
            zIndex: n.z ?? Z_NOTE,
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
            zIndex: t.z ?? Z_TABLE,
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
            zIndex: l.z ?? Z_LINK,
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
          zIndex: Z_SHAPES,
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
        {/* 元素连线渲染 —— 关系系统：带方向 + 关系词标签 + 类型视觉差异
            relType：story=实线箭头（叙事推进）/ display=虚线细线（解释标注）/ flow=粗线（触发跳转）/ page=金色虚线（跨页） */}
        {(page.elementLinks || []).map((link: any) => {
          // 老数据缺 fromId 时跳过，不迁移不报错
          if (!link.fromId || !link.fromType) return null;
          const a = centerOf(link.fromType, link.fromId);
          const b = centerOf(link.targetType, link.targetId);
          if (!a || !b) return null;
          const rel = link.relType || "display";
          const color = rel === "story" ? "rgba(122,90,52,0.95)"
            : rel === "flow" ? "rgba(58,53,46,0.9)"
            : rel === "page" ? "rgba(201,168,124,0.9)"
            : "rgba(201,168,124,0.7)";
          const width = rel === "flow" ? 3.5 : rel === "story" ? 2 : 1.2;
          const dash = rel === "display" ? "5 4" : rel === "page" ? "8 4" : "none";
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          /* 箭头：终点端画小三角 */
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const ah = rel === "display" ? 0 : 7;
          const ax = b.x - ah * Math.cos(ang), ay = b.y - ah * Math.sin(ang);
          /* ★ 演出关系展开：播放时按关系顺序点亮——排在前面的线全显，后面的线保持暗隐
             （起点→关系→目标的连续过程由 activeLinks 顺序驱动，非整体降透明） */
          const linkOn = activeLinks.indexOf(link.id) >= 0;
          const linkOpacity = playingIdx >= 0 ? (linkOn ? 1 : 0.25) : 1;
          return (
            <g key={link.id} opacity={linkOpacity} style={{ transition: "opacity .4s" }}>
              <line
                x1={a.x} y1={a.y} x2={ax} y2={ay}
                stroke={color} strokeWidth={width}
                strokeDasharray={dash} strokeLinecap="round"
              />
              {ah > 0 && (
                <polygon
                  points={`${b.x},${b.y} ${ax + 5 * Math.sin(ang)},${ay - 5 * Math.cos(ang)} ${ax - 5 * Math.sin(ang)},${ay + 5 * Math.cos(ang)}`}
                  fill={color}
                />
              )}
              <circle cx={a.x} cy={a.y} r={3} fill={color} />
              {/* 标签随关系出现：非播放态全显；播放中仅该关系已点亮时显 */}
              {link.label && (playingIdx < 0 || linkOn) && (
                <g>
                  <rect x={mx - link.label.length * 5 - 4} y={my - 11} width={link.label.length * 10 + 8} height={16}
                    rx={4} fill="#fffdfa" stroke={color} strokeWidth={0.8} />
                  <text x={mx} y={my} fontSize={10} fill={color} textAnchor="middle" dominantBaseline="central"
                    fontFamily="serif">{link.label}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* ★ 连接活化：关系刚建立的克制反馈层（1s 自动收敛，不改变任何元素位置）
            两端元素轻微向对方靠拢（8% 距离）+ 金色线从起点向终点生长 + 小三角箭头渐显 */}
        {freshLink && (() => {
          const f = freshLink.from, t = freshLink.to;
          const dx = t.x - f.x, dy = t.y - f.y;
          const fx = f.x + dx * 0.08, fy = f.y + dy * 0.08;
          const tx = t.x - dx * 0.08, ty = t.y - dy * 0.08;
          const ang = Math.atan2(ty - fy, tx - fx);
          return (
            <g style={{ pointerEvents: "none" }}>
              {/* 两端微牵引：端点圆环 */}
              <circle cx={fx} cy={fy} r={5} fill="none" stroke="rgba(201,168,124,0.9)" strokeWidth={1.5}
                style={{ animation: "ranjingLinkGrow 0.9s ease-out forwards" }} />
              <circle cx={tx} cy={ty} r={5} fill="none" stroke="rgba(201,168,124,0.9)" strokeWidth={1.5}
                style={{ animation: "ranjingLinkGrow 0.9s ease-out forwards" }} />
              {/* 线生长：dasharray=全长，dashoffset 内联从全长→0（CSS transition 驱动） */}
              {(() => {
                const ln = Math.hypot(tx - fx, ty - fy);
                return (
                  <line
                    x1={fx} y1={fy} x2={tx} y2={ty}
                    stroke="rgba(201,168,124,1)" strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeDasharray={`${ln}`}
                    strokeDashoffset={ln}
                    style={{
                      /* CSS 变量驱动 line-grow 动画：from dashoffset=ln → to 0 */
                      ["--rj-len" as any]: ln,
                      animation: "ranjingLinkDraw2 0.85s ease-out forwards",
                    } as React.CSSProperties}
                  />
                );
              })()}
              {/* 箭头渐显 */}
              <polygon
                points={`${tx},${ty} ${tx + 5 * Math.sin(ang)},${ty - 5 * Math.cos(ang)} ${tx - 5 * Math.sin(ang)},${ty - 5 * Math.cos(ang)}`}
                fill="rgba(201,168,124,0.95)"
                style={{ animation: "ranjingLinkFade 0.9s ease-out forwards" }}
              />
            </g>
          );
        })()}

        {/* 创作单元外框 —— 组从此在画布上可辨识：浅色包围框 + 名字小标。
            ★ 整体拖动时（gRef.unitDrag）该 Unit 外框高亮，命中带视觉提示 */}
        {(page.units || []).map((u: any) => {
          const isDragging = gRef.current.unitDrag?.unitId === u.id;
          return (
          <g key={u.id}>
            <rect
              x={u.bbox?.x ?? 0} y={u.bbox?.y ?? 0}
              width={u.bbox?.w ?? 0} height={u.bbox?.h ?? 0}
              fill={isDragging ? "rgba(201,168,124,0.12)" : "none"}
              stroke={isDragging ? "rgba(201,168,124,0.9)" : "rgba(201,168,124,0.4)"}
              strokeWidth={isDragging ? 2 : 1}
              strokeDasharray="4 3" rx={3}
              style={isDragging ? { transition: "stroke .1s, fill .1s" } : undefined}
            />
            <text x={(u.bbox?.x ?? 0) + 4} y={(u.bbox?.y ?? 0) - 4} fontSize={9}
              fill={isDragging ? "rgba(122,90,52,1)" : "rgba(122,90,52,0.75)"} fontFamily="serif"
              style={{ pointerEvents: "none" }}>
              {u.name || ({ card: "卡片", label: "图签", sticky: "贴签", zone: "区域" } as Record<string, string>)[u.kind]}
            </text>
          </g>
          );
        })}

        {/* 镜渲染：按叙事顺序（order）排布 + 编号可点（点镜 = 与上一镜交换故事顺序） */}
        {[...comicFrames].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)).map((f: any, idx: number) => {
          const seqIdx = [...comicFrames].findIndex((x: any) => x.id === f.id);
          const isHot = seqIdx === playingIdx;
          const dim = playingIdx >= 0 && !isHot;
          const sorted = [...comicFrames].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
          const storyNo = idx + 1;
          return (
            <g key={f.id} opacity={dim ? 0.25 : 1} style={{ transition: "opacity 0.4s" }}>
              <rect
                x={f.x} y={f.y} width={f.w} height={f.h}
                fill={isHot ? "rgba(201,168,124,0.15)" : "none"}
                stroke={isHot ? "rgba(201,168,124,1)" : "rgba(201,168,124,0.55)"}
                strokeWidth={isHot ? 3 : 1.5}
                strokeDasharray={isHot ? "none" : "6 4"}
                style={{ transition: "stroke 0.3s, stroke-width 0.3s, fill 0.3s" }}
              />
              {/* 镜内渐现的成员：播放时逐单元亮起（组合产物参与演出） */}
              {isHot && (f.elementIds?.length ?? 0) > 0 && (page.units || []).filter((u: any) =>
                u.memberIds?.some((id: string) => (f.elementIds || []).includes(id))
              ).map((u: any, ui: number) => (
                <rect key={u.id}
                  x={u.bbox?.x ?? 0} y={u.bbox?.y ?? 0}
                  width={u.bbox?.w ?? 0} height={u.bbox?.h ?? 0}
                  fill="none" stroke="rgba(201,168,124,0.9)" strokeWidth={1.5}
                  rx={3} opacity={0.4 + 0.2 * Math.min(ui, 2)}
                />
              ))}
              {/* 编号 = 故事顺序；点击编号 → 与上一镜交换 */}
              <g onClick={(e) => {
                e.stopPropagation();
                /* 直接执行：与阅读序中的上一镜交换 order */
                const cur = sorted.find((x: any) => x.id === f.id);
                if (!cur) return;
                const prev = idx > 0 ? sorted[idx - 1] : null;
                if (!prev) return;
                const next = sorted.map((x: any) =>
                  x.id === f.id ? { ...x, order: prev.order } :
                  x.id === prev.id ? { ...x, order: cur.order } : x
                );
                setComicFrames(next);
                onUpdateRef.current({ frames: next } as any);
              }}>
                <text
                  x={f.x + 10} y={f.y + 22} fontSize="13"
                  fill={playingIdx === seqIdx ? "rgba(122,90,52,1)" : "rgba(201,168,124,0.8)"}
                  fontFamily="serif" style={{ cursor: "pointer" }}
                >
                  {String(storyNo).padStart(2, "0")}
                </text>
                {/* 编号命中区（不可见，扩大点击范围） */}
                <rect x={f.x + 4} y={f.y + 6} width={34} height={20} fill="transparent" />
              </g>
            </g>
          );
        })}
      </svg>
    </>
  );

  /* ── 连接模式：把纸竖着排开 ─────────────────────────────
     连接是「眼前的几张纸之间点出来」的动作，纸重叠在一起就点不到。
     这里只改显示用的 transform，不写进文档；退出连接模式即恢复。
     当前纸在上，其余纸依次往下，整摞垂直居中。 */
  const connArrangeOn = !!connectArrange;
  const arrPaperW = paper.w > 0 ? paper.w : 390;
  const arrPaperH = paper.h > 0 ? paper.h : 844;
  const ARR_SCALE = 0.42;
  const ARR_GAP = 16;
  const arrStep = arrPaperH * ARR_SCALE + ARR_GAP;
  const arrCount = (allPages || []).length || 1;
  const arrTop = -((arrCount - 1) * arrStep) / 2;
  /* ★ 格子是固定的：起点纸永远在第一格（最上），其余纸按文档顺序往下。
     这样点延伸物时只有「谁是当前纸」变，纸本身不会跳位置 ——
     否则用户刚点的那张会突然窜到顶上，看着像出了 bug。 */
  const arrOrder = [
    ...(connectDraft?.fromPageId && (allPages || []).some((x) => x.id === connectDraft.fromPageId)
      ? [connectDraft.fromPageId] : []),
    ...(allPages || []).map((x) => x.id).filter((id) => id !== connectDraft?.fromPageId),
  ];
  const slotOf = (pgId: string) => Math.max(0, arrOrder.indexOf(pgId));
  const slotY = (k: number) => arrTop + k * arrStep;
  const arrMainY = slotY(slotOf(page.id));

  /* 命中测试（screenToPaperLocal）读的是 paperStateRef。
     连接模式下纸被排开，显示值和文档里存的不一样，
     必须把显示值同步进去，否则点延伸物里的对象永远点不中。 */
  if (connArrangeOn) paperStateRef.current = { ...paper, x: 0, y: arrMainY, scale: ARR_SCALE, rotate: 0 };
  else paperStateRef.current = paper;

  /* 连接模式下其他纸可点：由上层决定何时传 onPaperPick */
  const papersPickable = connArrangeOn && !!onPaperPick;
  papersPickableRef.current = papersPickable;
  const mainPaperTransform = connArrangeOn
    ? `translate(0px, ${arrMainY}px) scale(${ARR_SCALE}) rotate(0deg)`
    : `translate(${paper.x}px, ${paper.y}px) scale(${paper.scale}) rotate(${paper.rotate}deg)`;

  /* ── 连接线：闭环的可见证据 ─────────────────────────────
     连接不是一条记录，是一条看得见的线：起点对象 → 延伸物那张纸 → 延伸物里的对象 → 回到起点。
     两端元素中心都换算到画布坐标，所以在排开模式下两张纸之间的线是真实可画、可看的。 */
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStageBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 元素在纸张局部坐标里的包围盒（任意页面，不只是当前页） */
  function elemBoxIn(pg: Page, type: string, id: string) {
    if (type === "note")  { const n = (pg.notes || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "image") { const n = (pg.images || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "table") { const n = (pg.tables || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "link")  { const n = (pg.links || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "shape") {
      const n = (pg.shapes || []).find((x) => x.id === id);
      if (!n) return null;
      return { x: Math.min(n.x1, n.x2), y: Math.min(n.y1, n.y2), w: Math.abs(n.x2 - n.x1), h: Math.abs(n.y2 - n.y1) };
    }
    if (type === "text") {
      const n = (pg.texts || []).find((x) => x.id === id);
      if (!n) return null;
      /* 文字按内容撑开，DOM 在渲染过就能量到真宽；量不到按字号估 */
      const el = document.querySelector(`[data-text-id="${id}"]`) as HTMLElement | null;
      let w = el?.offsetWidth || 0;
      if (!w) { for (const ch of String(n.text || "")) w += /[一-鿿　-〿＀-￯]/.test(ch) ? n.fontSize : n.fontSize * 0.56; }
      return { x: n.x, y: n.y, w: Math.max(w, 8), h: el?.offsetHeight || n.fontSize * 1.5 };
    }
    return null;
  }

  /** 某张纸此刻显示在画布上的位置与缩放（排开模式用排开值） */
  function paperDisplay(pgId: string) {
    if (!connArrangeOn) {
      const tr = (allPages || []).find((x) => x.id === pgId)?.transform || { x: 0, y: 0, scale: 1 };
      return { tx: tr.x, ty: tr.y, s: tr.scale };
    }
    if (pgId === page.id) return { tx: 0, ty: arrMainY, s: ARR_SCALE };
    if (!(allPages || []).some((x) => x.id === pgId)) return null;
    return { tx: 0, ty: slotY(slotOf(pgId)), s: ARR_SCALE };
  }

  /** 某张纸里某个元素的中心，换算到画布坐标 */
  function elemCenterOnStage(pgId: string, type: string, id: string) {
    const pg = (allPages || []).find((x) => x.id === pgId);
    if (!pg || !type || !id) return null;
    const d = paperDisplay(pgId);
    if (!d) return null;
    const b = elemBoxIn(pg, type, id);
    if (!b) return null;
    const pw = pg.paperW && pg.paperW > 0 ? pg.paperW : 390;
    const ph = pg.paperH && pg.paperH > 0 ? pg.paperH : 844;
    return {
      x: stageBox.w / 2 + d.tx + (b.x + b.w / 2 - pw / 2) * d.s,
      y: stageBox.h / 2 + d.ty + (b.y + b.h / 2 - ph / 2) * d.s,
    };
  }

  /** 连接线：已完成的闭环 + 正在形成的这条 */
  const connLines = (() => {
    if (!connArrangeOn || stageBox.w <= 0) return [] as { id: string; d: string; x1: number; y1: number; x2: number; y2: number; done: boolean }[];
    const seg = (id: string, a: { x: number; y: number } | null, b: { x: number; y: number } | null, done: boolean) => {
      if (!a || !b) return null;
      const dy = (b.y - a.y) * 0.45;
      return { id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, done, d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}` };
    };
    const out: { id: string; d: string; x1: number; y1: number; x2: number; y2: number; done: boolean }[] = [];
    /* 正在形成的线：起点 → 承接纸 → 承接对象，一段一段长出来 */
    if (connectDraft?.fromPageId && connectDraft?.fromElementId) {
      const a = elemCenterOnStage(connectDraft.fromPageId, connectDraft.fromElementType || "note", connectDraft.fromElementId);
      const c = connectDraft.toPageId && connectDraft.toElementId
        ? elemCenterOnStage(connectDraft.toPageId, connectDraft.toElementType || "note", connectDraft.toElementId)
        : null;
      const toPageId = connectDraft.toPageId;
      const pb = toPageId
        ? { x: stageBox.w / 2, y: stageBox.h / 2 + slotY(slotOf(toPageId)) }
        : null;
      const s1 = seg("draft1", a, c || pb, false);
      if (s1) out.push(s1);
      if (connectDone) {
        const back = seg("draft2", c || pb, a, true);
        if (back) out.push(back);
      }
    }
    /* 已存进文档的闭环 */
    (interactions || []).forEach((ix) => {
      const a = elemCenterOnStage(ix.fromPageId, ix.fromElementType || "note", ix.fromElementId);
      const b = elemCenterOnStage(ix.toPageId, ix.toElementType || "note", ix.toElementId);
      const s = seg("ix-" + ix.id, a, b, true);
      if (s) out.push(s);
    });
    return out;
  })();

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
      <style>{`
        @keyframes ranjingLinkGrow { 0% { opacity: 0; } 40% { opacity: 1; } 100% { opacity: 0.85; } }
        @keyframes ranjingLinkFade { 0% { opacity: 0; } 40% { opacity: 0.95; } 100% { opacity: 0.9; } }
        /* 线生长：初始 dashoffset=全长（由 inline 设定），动画 0.85s 内到 0 */
        @keyframes ranjingLinkDraw2 {
          from { stroke-dashoffset: var(--rj-len, 200); opacity: 0.9; }
          to   { stroke-dashoffset: 0; opacity: 1; }
        }
      `}</style>
      {canvasFlash && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          padding: "6px 14px", borderRadius: 999, background: "rgba(122,90,52,0.92)",
          color: "#fffdfa", fontSize: 12, fontWeight: 500, letterSpacing: "0.02em",
          pointerEvents: "none", zIndex: 20,
          animation: "ranjingFlashIn .2s ease-out",
        }}>{canvasFlash}</div>
      )}
      <style>{`
        @keyframes ranjingFlashIn { from { opacity: 0; transform: translateX(-50%) translateY(-4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
      {/* 连接线：闭环的可见证据。正在形成的线是虚线，闭环后变实线 */}
      {connLines.length > 0 && (
        <svg style={{
          position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 8, overflow: "visible",
        }}>
          {connLines.map((L) => (
            <g key={L.id}>
              <path
                d={L.d}
                fill="none"
                stroke={L.done ? "rgba(122,90,52,.9)" : "rgba(122,90,52,.55)"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={L.done ? undefined : "7 6"}
              />
              <circle cx={L.x1} cy={L.y1} r={5} fill="rgba(122,90,52,.95)" stroke="#fffdfa" strokeWidth={2} />
              {L.done && <circle cx={L.x2} cy={L.y2} r={5} fill="rgba(122,90,52,.95)" stroke="#fffdfa" strokeWidth={2} />}
            </g>
          ))}
        </svg>
      )}

      {otherPages.map((p, i) => {
        const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        const isSelected = selectedPageIds.has(p.id);
        const hasSize = !!(p.paperW && p.paperH && p.paperW > 0 && p.paperH > 0);
        const innerChildren = renderPageContent(p);
        const boxShadow = isSelected
          ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
          : "0 4px 24px rgba(0,0,0,.1)";
        const transform = connArrangeOn
          ? `translate(0px, ${slotY(slotOf(p.id))}px) scale(${ARR_SCALE}) rotate(0deg)`
          : `translate(${tr.x}px, ${tr.y}px) scale(${tr.scale}) rotate(${tr.rotate}deg)`;
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
        /* 可点的是「纸本身」这一块，不是整块画布：
           这样点空白不会误触发，点当前纸 / 点其他纸各自命中各自的纸。 */
        if (papersPickable) {
          style.pointerEvents = "auto";
          style.cursor = "pointer";
          style.boxShadow = `0 0 0 2px rgba(122,90,52,.45), 0 4px 24px rgba(0,0,0,.1)`;
        }
        return (
          <div
            key={p.id}
            data-other-page={p.id}
            /* zIndex 只在连接模式给：平时必须是 auto，
               靠 DOM 顺序被后面那张不透明的当前纸盖住；
               一旦给 5，其他纸就会浮到当前纸上面，屏幕上糊成一片。 */
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: connArrangeOn ? 5 : undefined }}
          >
            <div
              style={style}
              onClick={papersPickable ? () => onPaperPick?.(p.id) : undefined}
            >{innerChildren}</div>
            {connArrangeOn && papersPickable && (
              <div style={{
                position: "absolute", left: "50%", top: "50%",
                width: (p.paperW || 390) * ARR_SCALE, height: arrPaperH * ARR_SCALE,
                marginLeft: -((p.paperW || 390) * ARR_SCALE) / 2,
                marginTop: -(arrPaperH * ARR_SCALE) / 2 + slotY(slotOf(p.id)),
                borderRadius: 10,
                pointerEvents: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  fontSize: 12, color: "rgba(122,90,52,.9)",
                  background: "rgba(255,253,250,.94)", padding: "4px 10px", borderRadius: 999,
                  border: "1px dashed rgba(122,90,52,.5)",
                }}>点这张纸</span>
              </div>
            )}
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
            transform: mainPaperTransform,
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
            transform: mainPaperTransform,
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

      {lassoPath && lassoPath.length > 1 && (
        <svg
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: "100%", height: "100%",
            pointerEvents: "none",
            zIndex: 145,
          }}
        >
          <polyline
            points={lassoPath.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(201,168,124,0.08)"
            stroke="rgba(201,168,124,0.9)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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

      {/* ★ P0-4：框选完成后的画布级轻操作弹窗（组合/连接/排列/复制/删除）。
          不放全透明层锁画布；只在本弹窗打开时用一个极小透明层点外即关，
          且 z-index 低于所有画布层，不挡后续手势。 */}
      {boxPopup && (
        <>
          <div data-box-popup-bg onClick={() => setBoxPopup(null)}
            style={{ position: "fixed", inset: 0, zIndex: 2490, background: "transparent", pointerEvents: "auto" }} />
          <div data-box-popup
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{
              position: "fixed",
              left: Math.max(8, Math.min(boxPopup.x, window.innerWidth - 220)),
              top: Math.max(8, Math.min(boxPopup.y, window.innerHeight - 120)),
              zIndex: 2491,
              display: "flex", gap: 6, padding: 6,
              background: "rgba(251,250,247,.97)",
              backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
              borderRadius: 12, boxShadow: "0 8px 28px rgba(58,53,46,.2)",
              border: "1px solid rgba(74,70,63,.08)",
              maxWidth: 220,
            }}>
            <div style={{ flex: "none", padding: "4px 8px", fontSize: 10, color: "#8a8178", alignSelf: "center", whiteSpace: "nowrap" }}>
              {boxPopup.count} 个
            </div>
            <button type="button" onClick={() => { handleSheetAction("box-compose"); setBoxPopup(null); }}
              style={{ flex: "none", padding: "6px 10px", border: 0, borderRadius: 8, background: "#3a352e", color: "#fff", fontSize: 12, cursor: "pointer" }}>
              组合
            </button>
            <button type="button" onClick={() => { handleSheetAction("box-chain-story"); setBoxPopup(null); }}
              style={{ flex: "none", padding: "6px 10px", border: 0, borderRadius: 8, background: "rgba(122,90,52,.12)", color: "#7a5a34", fontSize: 12, cursor: "pointer" }}>
              接着
            </button>
            <button type="button" onClick={() => { handleSheetAction("box-copy"); }}
              style={{ flex: "none", padding: "6px 10px", border: 0, borderRadius: 8, background: "rgba(74,70,63,.06)", color: "#57524c", fontSize: 12, cursor: "pointer" }}>
              复制
            </button>
            <button type="button" onClick={() => { handleSheetAction("box-delete"); }}
              style={{ flex: "none", padding: "6px 10px", border: 0, borderRadius: 8, background: "rgba(192,57,43,.1)", color: "#c0392b", fontSize: 12, cursor: "pointer" }}>
              删除
            </button>
          </div>
        </>
      )}

      {ctxMenu && (
        <>
          {/* ★ 遮罩关闭必须用 onPointerDown，不能用 onClick。
              触摸抬手时浏览器会补发一次 click，落点正是这个刚出现的遮罩，
              结果长按菜单在手指一抬起的瞬间就被自己关掉 ——
              手机上这个功能完全无法使用（桌面鼠标不受影响，所以容易漏掉）。
              pointerdown 只在「新的一次按下」时触发，开启菜单那一次按下
              发生在遮罩出现之前，因此不会误关。 */}
          <div data-ctx-menu onPointerDown={() => setCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 2499, background: "transparent" }} />
          <div data-ctx-menu
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{
              position: "fixed",
              left: Math.min(ctxMenu.x, window.innerWidth - 190),
              top: Math.min(ctxMenu.y, window.innerHeight - 280),
              zIndex: 2500, width: 180, padding: 6,
              background: "rgba(251,250,247,.98)",
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              borderRadius: 12, boxShadow: "0 8px 32px rgba(58,53,46,.24)",
              border: "1px solid rgba(74,70,63,.08)",
            }}>
            {ctxMenu.sub === "edit" ? (
              /* ★ 编辑：图层位置。
                 水平翻面按产品决定不做（使用度不高、要动数据结构+渲染+导出+命中测试）。
                 边界说明：笔迹整体在同一 <svg> 内，是「一整层」，
                 它与其他类型之间可以整体换层，但单根笔迹无法插到图片中间。 */
              <>
                <CtxItem label="← 返回" onClick={() => setCtxMenu({ ...ctxMenu, sub: undefined })} />
                <div style={{ height: 1, background: "rgba(74,70,63,.08)", margin: "4px 8px" }} />
                <CtxItem label="置顶" onClick={() => { setCtxMenu(null); handleSheetAction("bring-front"); }} />
                <CtxItem label="移上一下" onClick={() => { setCtxMenu(null); handleSheetAction("bring-forward"); }} />
                <CtxItem label="移下一下" onClick={() => { setCtxMenu(null); handleSheetAction("send-backward"); }} />
                <CtxItem label="置底" onClick={() => { setCtxMenu(null); handleSheetAction("send-back"); }} />
              </>
            ) : ctxMenu.sub === "align" ? (
              /* ★ 排列：只作用于当前被选对象，单对象长按也可用 */
              <>
                <CtxItem label="← 返回" onClick={() => setCtxMenu({ ...ctxMenu, sub: undefined })} />
                <div style={{ height: 1, background: "rgba(74,70,63,.08)", margin: "4px 8px" }} />
                <CtxItem label="左对齐" onClick={() => { setCtxMenu(null); handleSheetAction("align-left"); }} />
                <CtxItem label="水平居中" onClick={() => { setCtxMenu(null); handleSheetAction("align-hcenter"); }} />
                <CtxItem label="右对齐" onClick={() => { setCtxMenu(null); handleSheetAction("align-right"); }} />
                <CtxItem label="顶对齐" onClick={() => { setCtxMenu(null); handleSheetAction("align-top"); }} />
                <CtxItem label="垂直居中" onClick={() => { setCtxMenu(null); handleSheetAction("align-vcenter"); }} />
                <CtxItem label="底对齐" onClick={() => { setCtxMenu(null); handleSheetAction("align-bottom"); }} />
                <CtxItem label="水平等距" onClick={() => { setCtxMenu(null); handleSheetAction("distribute-h"); }} />
                <CtxItem label="垂直等距" onClick={() => { setCtxMenu(null); handleSheetAction("distribute-v"); }} />
              </>
            ) : ctxMenu.kind === "blank" ? (
              /* ★ 空白菜单：作用对象是白纸本身（用户按空白背景 = 想删/复制/粘贴白纸）。
                 已按产品定义移除「复制为→」「选中全部」；导出统一移到侧边栏「存」。 */
              <>
                <CtxItem label="删除" danger onClick={() => { setCtxMenu(null); onDeletePage?.(); }} />
                <CtxItem label="复制" onClick={() => { setCtxMenu(null); onCopyPage?.(); }} />
                <CtxItem label="粘贴" onClick={() => { setCtxMenu(null); onPastePage?.(ctxMenu.x, ctxMenu.y); }} />
                <div style={{ height: 1, background: "rgba(74,70,63,.08)", margin: "4px 8px" }} />
                {/* 临摹素材作用于「这张纸」，所以放在长按白纸的菜单里 */}
                <CtxItem label="导入临摹素材" onClick={pickTraceImage} />
              </>
            ) : (
              <>
                <CtxItem label="复制" onClick={() => { setCtxMenu(null); copySelection(); }} />
                <CtxItem label="粘贴" onClick={() => { setCtxMenu(null); pasteSelection(); }} />
                <CtxItem label="排列 →" onClick={() => setCtxMenu({ ...ctxMenu, sub: "align" })} />
                <CtxItem label="组合" onClick={() => { setCtxMenu(null); handleSheetAction("box-compose"); }} />
                <CtxItem label="编辑 →" onClick={() => setCtxMenu({ ...ctxMenu, sub: "edit" })} />
                {/* ★ 连接入口：长按对象 → 点这里 → 连接模式开启（不开抽屉，
                    画布上直接做四步闭环）。替换掉原来的「连接(接着)」。 */}
                <CtxItem label="连接" onClick={() => { setCtxMenu(null); onStartConnect?.(ctxMenu.hitEl || { type: "", id: "" }); }} />
                <CtxItem label="删除" danger onClick={() => { setCtxMenu(null); deleteSelection(); clearBox(); }} />
              </>
            )}
          </div>
        </>
      )}

      {textPanel && (
        <div data-ctx-menu
          onPointerDown={(ev) => ev.stopPropagation()}
          style={{
            position: "fixed",
            left: Math.min(textPanel.x + 14, window.innerWidth - 160),
            top: Math.max(20, textPanel.y - 60),
            zIndex: 2400, width: 150, padding: 10,
            background: "rgba(251,250,247,.98)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            borderRadius: 12, boxShadow: "0 8px 32px rgba(58,53,46,.24)",
            border: "1px solid rgba(74,70,63,.08)",
          }}>
          <div style={{ fontSize: 10, color: "#8a8178", marginBottom: 8, letterSpacing: ".1em" }}>字体</div>
          <button type="button" onClick={() => { const t = textsRef.current.find(x => x.id === editingIdRef.current); if (t) updateText(t.id, { fontSize: 28 }); }}
            style={{ display: "block", width: "100%", height: 30, marginBottom: 4, border: 0, borderRadius: 6, background: "rgba(74,70,63,.06)", fontSize: 12, cursor: "pointer" }}>大</button>
          <button type="button" onClick={() => { const t = textsRef.current.find(x => x.id === editingIdRef.current); if (t) updateText(t.id, { fontSize: 16 }); }}
            style={{ display: "block", width: "100%", height: 30, marginBottom: 4, border: 0, borderRadius: 6, background: "rgba(74,70,63,.06)", fontSize: 12, cursor: "pointer" }}>中</button>
          <button type="button" onClick={() => { const t = textsRef.current.find(x => x.id === editingIdRef.current); if (t) updateText(t.id, { fontSize: 12 }); }}
            style={{ display: "block", width: "100%", height: 30, marginBottom: 4, border: 0, borderRadius: 6, background: "rgba(74,70,63,.06)", fontSize: 12, cursor: "pointer" }}>小</button>
          <button type="button" onClick={() => setTextPanel(null)}
            style={{ width: "100%", height: 26, marginTop: 4, border: 0, borderRadius: 6, background: "transparent", color: "#a49a8f", fontSize: 11, cursor: "pointer" }}>关闭</button>
        </div>
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

      {/* 临摹素材：隐藏的文件选择器（accept=image/* 在手机上会直接开相册） */}
      <input
        ref={traceInputRef}
        type="file"
        accept="image/*"
        onChange={onTraceFilePicked}
        style={{ display: "none" }}
      />

      {/* 临摹素材浮层：fixed 定位在画布变换之外，因此不随画布平移缩放而跑丢 */}
      {traceImg && (
        <>
          <img
            src={traceImg.src}
            alt=""
            draggable={false}
            style={{
              position: "fixed",
              left: traceImg.x, top: traceImg.y,
              width: traceImg.w, height: traceImg.h,
              opacity: traceImg.opacity,
              pointerEvents: "none",     // 手势穿透，不影响在画布上作画
              userSelect: "none", WebkitUserSelect: "none",
              zIndex: 2600,
              objectFit: "contain",
            }}
          />
          {/* 控制条：浮层上唯一可交互的部分 */}
          <div
            data-ctx-menu
            style={{
              position: "fixed",
              left: Math.min(Math.max(4, traceImg.x), Math.max(4, window.innerWidth - 190)),
              top: Math.max(4, traceImg.y - 34),
              zIndex: 2601,
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 8px", borderRadius: 10,
              background: "rgba(251,250,247,.96)",
              boxShadow: "0 4px 16px rgba(58,53,46,.22)",
              border: "1px solid rgba(74,70,63,.10)",
              touchAction: "none",
            }}
          >
            <div
              onPointerDown={onTraceHandleDown}
              onPointerMove={onTraceHandleMove}
              onPointerUp={onTraceHandleUp}
              onPointerCancel={onTraceHandleUp}
              style={{ cursor: "grab", fontSize: 14, lineHeight: 1, padding: "4px 6px", color: "#57524c", touchAction: "none" }}
              title="拖动"
            >✥</div>
            <input
              type="range" min={0.1} max={1} step={0.05}
              value={traceImg.opacity}
              onChange={(e) => setTraceImg((t) => t ? { ...t, opacity: Number(e.target.value) } : t)}
              style={{ width: 64 }}
              title="透明度"
            />
            <button
              type="button"
              onClick={() => setTraceImg(null)}
              style={{ border: 0, background: "transparent", fontSize: 15, lineHeight: 1, color: "#8a8178", cursor: "pointer", padding: "2px 4px" }}
              title="关闭"
            >×</button>
          </div>
        </>
      )}

    </div>
  );
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        display: "block", width: "100%", height: 34, padding: "0 12px",
        border: 0, borderRadius: 8, background: "transparent",
        color: danger ? "#c0392b" : "#3a352e", fontSize: 13, cursor: "pointer",
        textAlign: "left", fontFamily: "inherit",
      }}>{label}</button>
  );
}

function TextElement({
  t,
  z,
  isEditing,
  isDragging,
  isSelected,
}: {
  t: TextNode;
  z?: number;
  isEditing: boolean;
  isDragging: boolean;
  isSelected: boolean;
}) {
  return (
    <div
      data-text-id={t.id}
      style={{
        position: "absolute",
        zIndex: z,
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