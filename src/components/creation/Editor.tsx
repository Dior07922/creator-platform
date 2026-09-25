// name=src/components/creation/Editor.tsx
import React, { useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import type {
  ElementLink, ElementLinkTargetType, Group, ImageNode, Interaction, LinkNode, NoteNode, Page, PageLink, RigJoint, ShapeKind, ShapeNode, TableNode, TextNode,
} from "../../types/document";
import { warpTo, makeArmBones, defaultRadius } from "../../lib/rigWarp";

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
  onConnectPickObject?: (el: { type: string; id: string }, pageId?: string) => void;
  /** 长按弹窗里点了「连接」：以这个对象为起点开启连接模式 */
  onStartConnect?: (el: { type: string; id: string }) => void;
  /* （原 connectArrange：把纸排开 —— 整套已删除，连接不再动任何纸张的位置） */
  /** 骨钉模式：把当前纸拍平成位图 → 按 6 个关节形变 → 铺在纸上，
      再叠一层可拖的关节把手。只在开启时挂载，平时一行不动。 */
  rigMode?: boolean;
  /** 当前纸实际要用的关节（已经过活页继承解算，可能是从前面某张继承来的） */
  rigJoints?: RigJoint[];
  /** ★ 用户正拿在手里的骨钉（关节位 id）＋手指当前屏幕位置 —— 画放大镜用 */
  rigHolding?: string | null;
  rigHover?: { x: number; y: number } | null;
  /** ★ 关节定点图：该钉在哪儿的参考位置（淡淡的、钉一个少一个） */
  rigGuide?: { id: string; x: number; y: number }[];
  /** ★ 骨钉这个独立空间自己的视野（镜头）—— 只改"怎么看"，纸的坐标不动 */
  rigView?: { k: number; vx: number; vy: number };
  /** ★ 模板的呈现选项：黑白画面 */
  rigMono?: boolean;
  /** ★ 模板库选中的呈现形态（手稿第五张底部三块）：
      anim＝电视机（框里装画）／book＝漫画书册（切成小格装订成册）／strip＝连环画（折角大画布） */
  rigTemplate?: "anim" | "strip" | "book" | null;
  /** 漫画书册用几格：3 格 / 6 格（用户 2026-09-26：「可以按 3 格和 6 格来做」） */
  rigCells?: 3 | 6;
  /** 书册/连环画：翻下一页（点右下角折角） */
  onRigFlip?: () => void;
  onRigViewChange?: (v: { k: number; vx: number; vy: number }) => void;
  /** 影响半径 */
  rigRadius?: number;
  /** 用户拖了某个关节 */
  onRigJointMove?: (id: string, x: number, y: number) => void;
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
  /** ★ 运行态：连接已闭环。此时点对象 = 【直接跳过去】，不画连线过程。
      手稿第五张：「在完成交互连接的设置后，就是实现路线跳转的时候。
      在我的页面，点击对象，不显示连接线的过程，而是直接跳转到页面。」 */
  connectRun?: boolean;
  /** ★ 演示模式：固定视口、一次只显示一个页面；只有这时点对象才跳转。
      普通创作画布里点对象永远只是"选中/编辑"（用户 2026-09-26 定的边界）。 */
  demoOn?: boolean;
  /** ★ 抽屉面板开着 = 用户正在做"功能性工作"。
      这时画布上【禁止触发任何弹窗、禁止触发框选】（用户 2026-09-26 第十一条，定死）。
      只在工作结束（抽屉关掉）时才恢复。 */
  drawerBusy?: boolean;
  /** ★ 演示态：手指从屏幕左边缘往右扫 → 把左侧工具栏叫回来。
      演示时工具栏默认收在屏幕外（纸要真实尺寸、满屏、零遮挡），
      所以给一个【纯识别、不拦任何点击】的唤出手势：
      只有"从左边往右扫"才触发，原地"点"照旧走跳转。 */
  onRevealRail?: () => void;
  /** ★ 连接编辑状态（页 → 连接 → 手机/网站模式）。
      用户 2026-09-26：「普通创作状态不显示连接线；进入连接编辑状态才显示完整连接关系」。
      所以连接线 / 连接高亮框的开关是它，不是"连过就常驻"。演示态另外掐掉。 */
  connectViewOn?: boolean;
  /** 演示模式里点中了有连接的对象（去程） */
  onConnectJump?: (ix: Interaction) => void;
  /** ★ 运行态里点中了【创作者指定的返程对象】（第十张第③步选的那个） */
  onConnectJumpBack?: (ix: Interaction) => void;
  /* （原 connectCanGoBack / onConnectBack：系统返回键 —— 已删除，返程走创作者指定的对象） */
  /** ★ 删掉一条连接（点那条线 / 长按对象列出来的那一条都用它） */
  onDeleteInteraction?: (id: string) => void;
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
  /* 单指拖纸（dragPaper）已删除：空白拖动一律是框选（手稿第一/六/七张），
     纸的平移由双指 pinch 分支承担。 */
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

/* ★ 手稿第七张：「拖四个角=拉大小」「拖上下边框=拉伸长宽」「拖左右边框=拉宽窄」。
   四条边 n/s/e/w 是这一批新加的 —— 以前只有四个角。 */
type ResizeHandle = "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w";

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
/* ★ 演示态「把工具栏叫回来」的手势：从屏幕最左边这一条起手，往右扫够这么远。
   起手区只有 24px，且只认"扫"（原地点击完全不拦），所以纸上的点击一点不受影响。 */
const EDGE_REVEAL_PX = 24;
const EDGE_REVEAL_SWIPE = 36;
/* ★ 框选对象上按下之后：往上滑多远才算"我要框选"。往下拖一律是移动。 */
const MOVE_OR_SELECT_PX = 26;
const DEFAULT_FONT = '"Noto Sans SC", sans-serif';

/* 各类型元素的默认图层顺序。
   数值与旧的渲染顺序一致（文字最底、笔迹最上），
   所以没设过 z 的老文档观感不变。用户「置顶/移上」后写入具体 z 值。 */
/* ★ 笔迹那一层的缓存 —— 必须放在【组件外面】。
   进骨钉时当前页会切成叠放里的第 1 张，editorKey 一变 Editor 整个重挂载，
   放组件里的 ref 会被清空，做位图时就抓不到笔迹（用户报「我的画不见了」）。 */
let STROKES_CACHE = "";

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

function renderShapeRaw(s: ShapeNode, selectedShapeId?: string | null) {
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

/** ★ 旋转 = 渲染时整体转，**不改 x1/y1/x2/y2**。
    为什么这么做：形状原本就是拿 x1..y2 画的，如果旋转去改这四个数，
    包围盒、命中测试、连接线端点、导出全都要跟着重算一遍，到处是坑。
    转渲染的话，坐标还是那套坐标，只有「看着的角度」变了。
    转轴 = 包围盒中心 —— 所以中心点不动，连接线端点和选框仍然对得上。 */
function renderShape(s: ShapeNode, selectedShapeId?: string | null) {
  const el = renderShapeRaw(s, selectedShapeId);
  if (!el) return el;
  const rot = s.rot || 0;
  if (!rot) return el;
  const cx = (s.x1 + s.x2) / 2;
  const cy = (s.y1 + s.y2) / 2;
  return <g key={s.id} transform={`rotate(${rot} ${cx} ${cy})`}>{el}</g>;
}

/** 把一个纸面坐标点，按形状的旋转角【反向转回去】。
    命中测试用：形状转了多少度，判定点就先倒着转同样度数，再拿原来的算法判。 */
function unrotateFor(s: ShapeNode, px: number, py: number): { x: number; y: number } {
  const rot = s.rot || 0;
  if (!rot) return { x: px, y: py };
  const cx = (s.x1 + s.x2) / 2;
  const cy = (s.y1 + s.y2) / 2;
  const a = (-rot * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
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
  onPaperPick,
  interactions,
  connectDraft,
  connectDone,
  connectRun,
  demoOn,
  drawerBusy,
  onRevealRail,
  connectViewOn,
  onConnectJump,
  onConnectJumpBack,
  onDeleteInteraction,
  rigMode,
  rigJoints,
  rigHolding,
  rigHover,
  rigGuide,
  rigView,
  rigMono,
  rigTemplate = null,
  rigCells = 6,
  onRigFlip,
  onRigViewChange,
  rigRadius,
  onRigJointMove,
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
  const onRevealRailRef = useRef(onRevealRail);
  const drawerBusyRef = useRef(drawerBusy);
  drawerBusyRef.current = drawerBusy;
  onRevealRailRef.current = onRevealRail;
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

  /* ══ 框（那圈虚线高亮）为什么要有"纸张坐标"这一份 ═══════════════════
     框在屏幕上按【画布坐标】画（boxRef）。但纸一旦缩放/平移/旋转
     （捏合缩放、换规格、整体平移），画布坐标那份就过期了：
     框会钉在屏幕原位，和对象越离越远（实测：scale 1→2.5，框和画面完全对不上）。
     所以框的真相记一份【纸张坐标】，纸一变就按它重算 —— 框永远黏着对象。
     两份的换算必须严格互逆（paperBoxToStage / stageBoxToPaper），
     否则每捏一次就胀一点点，捏十几次框就明显跑偏。 */
  const boxPaperRef = useRef<BoxState | null>(null);
  const rederivingRef = useRef(false);

  /* 纸变了 → 框按纸张坐标重算（必须排在 paperStateRef 同步之后） */
  useEffect(() => {
    const pb = boxPaperRef.current;
    if (!pb) return;
    const bb = paperBoxToStage(pb);
    if (!bb) return;
    rederivingRef.current = true;
    boxRef.current = bb;
    setBox(bb);
  }, [paper]);


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

  /* 框被改了（点选/框选/拖动/缩放）→ 重新记下它的纸张坐标（见上面 boxPaperRef 那段）。
     重算引起的那次改动要跳过，不然来回换算会自己跟自己较劲。 */
  useEffect(() => {
    if (rederivingRef.current) { rederivingRef.current = false; return; }
    boxPaperRef.current = box ? stageBoxToPaper(box) : null;
  }, [box]);
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
  const [ctxMenu, setCtxMenu] = useState<{ kind: "blank" | "element"; x: number; y: number; sub?: "align" | "edit" | "font"; hitEl?: { type: string; id: string } } | null>(null);

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
    /* ★ 按在【有内容的框上】之后，先定方向再动：往上滑=框选、往下/横着拖=移动。
       gating=true 表示"还没定"——这段距离内一点都不动（用户原话
       「稍微不注意就被拖走了」正是没这道闸造成的）。只有从内容上起手才上闸，
       空白处起手的框选不受影响。 */
    dirGate: true as boolean,
    /* 这一把捏合缩的是哪张纸（两指在哪张上就是哪张，见第九条） */
    pinchPageId: null as string | null,
    /* ★ 演示态「左边缘往右扫 → 叫回工具栏」用。纯识别：只有真的扫出去才触发，
       原地"点"完全不拦（点了就照旧走跳转）。 */
    edgeSwipeFrom: null as null | { x: number; y: number },
    edgeSwipeFired: false as boolean,
    dragTextId: null as string | null,
    pendingBox: false as boolean,
    boxSourceLayer: null as "background" | "paper" | null,
    boxIncludePaper: false as boolean,
    boxOriginalPaper: { x: 0, y: 0, scale: 1 },
    boxStartPoint: { x: 0, y: 0 },
    boxResizeHandle: "se" as ResizeHandle,
    boxOriginal: { x: 0, y: 0, w: 0, h: 0 },
    /* 框里所有成员的原样快照（各种类型都收）+ 框起手时的【纸张矩形】——
       拖动/拉大小一律以这两份为基准重算，绝不在每一帧上累加（那会越拖越胀）。 */
    boxOriginalMembers: [] as { type: string; id: string; node: any }[],
    boxPaperOrigin: null as BoxState | null,
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
    /* ★ 点中单个元素时设的那圈框的起点（画布坐标）。
       拖这个元素时框要跟着它走 —— 框留在原地而对象被拖走，高亮就是在骗人。 */
    dragBoxOrigin: null as BoxState | null,
    /* ★ 这一按【之前】的那圈框。双指落下时要用它把第一根手指造成的改动撤回：
       第一根手指会先起一个框选，第二根手指才切到捏合 ——
       实测：什么都不点直接捏合，也会凭空冒出一个框。 */
    boxBeforeGesture: null as BoxState | null,
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
      g.dragBoxOrigin = null;
      g.pendingBox = false;
      (g as any).boxArmed = false;
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
      g.dragBoxOrigin = null;
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
    /* ★ 这里原来会弹一个独立的「字体」小面板（大/中/小）。
       已删除：用户 2026-09-26 要求「把这个字体的弹窗移到长弹窗里，
       字体同属于有内容的区域，不准再出现」——
       字号现在只从【长按文字 → 字体 →】进。 */
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
      /* ★ 形状转过角度的话，先把这个判定点【倒着转回】它没转时的位置，
         再拿原来的算法判。不然转完就点不中了 —— 等于白转。 */
      const q = unrotateFor(s, px, py);
      const qx = q.x;
      const qy = q.y;
      if (isFreeKind(s.kind) && s.points && s.points.length >= 2) {
        for (let j = 0; j < s.points.length - 1; j++) {
          const d = pointToSegDist(qx, qy, s.points[j].x, s.points[j].y, s.points[j + 1].x, s.points[j + 1].y);
          if (d < TH) return s;
        }
      } else if (s.kind === "line" || s.kind === "arrow") {
        if (pointToSegDist(qx, qy, s.x1, s.y1, s.x2, s.y2) < TH) return s;
      } else {
        const x1 = Math.min(s.x1, s.x2) - TH;
        const y1 = Math.min(s.y1, s.y2) - TH;
        const x2 = Math.max(s.x1, s.x2) + TH;
        const y2 = Math.max(s.y1, s.y2) + TH;
        if (qx >= x1 && qx <= x2 && qy >= y1 && qy <= y2) return s;
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
  /** 框是不是【完整包住】了整张白纸。
      ★ 原实现最后一行返回的是 `!noOverlap` —— 只要有【任何一点重叠】就算 true，
        和函数名、和两个调用处的用途（白纸描蓝框 mainPaperSelected、
        要不要连纸一起动/删 boxIncludePaper）全都相反。
        后果：随便点中一个对象、框只有一根线那么大，整张白纸也被描上一圈蓝框。
        手稿第五张：「删除按键：……删整体的纸，是【白纸整个被框选】才删除」
        —— 必须是完整包住。 */
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
    return boxLeft <= paperLeft && boxTop <= paperTop &&
           boxRight >= paperRight && boxBottom >= paperBottom;
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
    /* ★ 热区必须【跟着框的大小收敛】。
       原来是写死的 ±28（每个角一个 56×56 的方块）：元素一画小，四个角就把整个框铺满，
       于是"想拉大小"变成了"一碰就拖走"，反过来想移动又抓不到中间。
       用户原话：「稍微不注意就被拖走了，我明明只想要把它拉小一点，拉不小只能拖走」。
       现在钳到框的 30%，并留 8px 下限；框中间那一块永远留给"拖着走"。 */
    const zone = Math.max(8, Math.min(HANDLE_HIT, b.w * 0.3, b.h * 0.3));
    /* 四角优先（角比边更常抓） */
    const pts: { h: ResizeHandle; x: number; y: number }[] = [
      { h: "nw", x: b.x, y: b.y },
      { h: "ne", x: b.x + b.w, y: b.y },
      { h: "se", x: b.x + b.w, y: b.y + b.h },
      { h: "sw", x: b.x, y: b.y + b.h },
    ];
    for (const p of pts) {
      if (Math.abs(local.x - p.x) <= zone && Math.abs(local.y - p.y) <= zone) return p.h;
    }
    /* 四条边：① 只在两条角热区【之间】那一段；② 只在外侧 35% 那一条带里。
       ② 是必须的：细长元素（比如一根 8px 高的线）如果只看距离，
       上下两条边的热区都会横跨整条线，中间就永远抓不到、移不动了。 */
    const inMidX = local.x > b.x + zone && local.x < b.x + b.w - zone;
    const inMidY = local.y > b.y + zone && local.y < b.y + b.h - zone;
    if (inMidX && local.y < b.y + b.h * 0.35 && local.y - b.y <= zone) return "n";
    if (inMidX && local.y > b.y + b.h * 0.65 && b.y + b.h - local.y <= zone) return "s";
    if (inMidY && local.x < b.x + b.w * 0.35 && local.x - b.x <= zone) return "w";
    if (inMidY && local.x > b.x + b.w * 0.65 && b.x + b.w - local.x <= zone) return "e";
    /* 中间那一块 → 交给 isInsideBox → 拖着框走 */
    return null;
  }
  function isInsideBox(sx: number, sy: number): boolean {
    const b = boxRef.current;
    if (!b) return false;
    const local = getStageLocal(sx, sy);
    if (!local) return false;
    return local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h;
  }
  /** 「框里是谁」—— 给定画布坐标的框，返回框内的元素 id。六类都要认。
      ★ 原来这里只查 `[data-text-id]`，等于只认文字。而用户画的画是笔迹：
        框一圈笔画 → 框里"没有人" → 框选菜单不弹（`count > 0` 才弹）、
        「组合」按钮永远出不来。手稿第四张：「有内容时点击什么，谁就被框选」。
      包围盒一律用各自的【真】包围盒：
        · 文字     → DOM 实测（按内容撑开，量不到按字号估）
        · 笔迹     → shapeLocalBox（自由笔迹的 x1..y2 只有起笔那 4px，不能直接用）
        · 其余四类 → 自身的 x/y/w/h
      比对方式与原实现一致：框是画布局部坐标，把元素包围盒抬到屏幕坐标再比。
      换算只有一份 —— 模块级的 paperLocalToScreen（和其余地方共用）。 */
  function computeMembersInBox(b: BoxState, restrictTo?: "paper" | "background"): string[] {
    const stage = stageRef.current;
    if (!stage) return [];
    const sr = stage.getBoundingClientRect();
    const bx1 = sr.left + b.x;
    const by1 = sr.top + b.y;
    const bx2 = bx1 + b.w;
    const by2 = by1 + b.h;
    const pg = pageRef.current;
    const ids: string[] = [];
    const p = paperStateRef.current;

    /* ★★ 框选只认【完整包住】的东西 —— 掠到一点边不算。
       用户 2026-09-26：「刚拉起框就把一个大家伙黏上了，这不合理」；
       手稿第六张：「按住框选时，框还没有；接触到完整内容时才成型；
       框选的对象是"完整"」。
       原来是相交就算（沾一点边就黏上），一个 5px 的小框能黏住整张画。 */
    const hitsBox = (lb: { x: number; y: number; w: number; h: number }) => {
      const c1 = paperLocalToScreen(lb.x, lb.y, stage, p);
      const c2 = paperLocalToScreen(lb.x + lb.w, lb.y + lb.h, stage, p);
      const x1 = Math.min(c1.x, c2.x);
      const y1 = Math.min(c1.y, c2.y);
      const x2 = Math.max(c1.x, c2.x);
      const y2 = Math.max(c1.y, c2.y);
      /* 框必须把整块内容【全部盖住】：四条边都不许露出去 */
      return x1 >= bx1 && x2 <= bx2 && y1 >= by1 && y2 <= by2;
    };
    const layerOk = (n: any) => !restrictTo || n.layer === restrictTo;
    const pushXYWH = (list: any[] | undefined) => {
      (list || []).forEach((n: any) => {
        if (layerOk(n) && hitsBox({ x: n.x, y: n.y, w: n.w, h: n.h })) ids.push(n.id);
      });
    };

    /* 文字：DOM 实测宽高（按内容撑开） */
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
    /* 图片 / 便签 / 表格 / 链接：自身的 x/y/w/h */
    pushXYWH(pg.images);
    pushXYWH(pg.notes);
    pushXYWH(pg.tables);
    pushXYWH(pg.links);
    /* 笔迹：真包围盒 */
    (pg.shapes || []).forEach((s: any) => {
      if (layerOk(s) && hitsBox(shapeLocalBox(s))) ids.push(s.id);
    });
    return ids;
  }
  /* ══ ★ 框住的东西：拖着框走 / 拉大小 / 拉长宽 ════════════════════════
     手稿第七张：按住拖=移动、拖四角=拉大小、拖上下边框=拉长、拖左右边框=拉宽窄。
     以前这三条【只对文字生效】—— 框里的线条、图形一个字都不动
     （用户原话：「我明明只想要把它拉小一点，拉不小只能拖走」）。
     现在统一按【纸张坐标】算：框在纸上的矩形从 A 变到 B，
     成员的 x/y/w/h、图形的 x1..y2 与 points 全部跟着 A→B 走。 */

  /** 把框里所有成员原样拍一份（文字/图片/便签/表格/链接/图形，各种都收） */
  function snapshotBoxMembers(): { type: string; id: string; node: any }[] {
    const pg = pageRef.current;
    const ids = new Set<string>(currentGroupMemberIds());
    const b = boxRef.current;
    if (b && b.w >= 4 && b.h >= 4) computeMembersInBox(b).forEach((id) => ids.add(id));
    const out: { type: string; id: string; node: any }[] = [];
    ids.forEach((id) => {
      const t = resolveMemberRef(id)?.type || "text";
      const arr: any[] = t === "image" ? (pg.images || []) : t === "note" ? (pg.notes || [])
        : t === "table" ? (pg.tables || []) : t === "link" ? (pg.links || [])
        : t === "shape" ? (pg.shapes || []) : (pg.texts || []);
      const node = arr.find((n) => n.id === id);
      if (node) out.push({ type: t, id, node: JSON.parse(JSON.stringify(node)) });
    });
    return out;
  }

  /** 一个成员按「框从 a 变到 b」重排（a / b 都是纸张坐标里的矩形） */
  function remapMember(type: string, node: any, a: BoxState, b: BoxState): any {
    const sx = a.w > 0.5 ? b.w / a.w : 1;
    const sy = a.h > 0.5 ? b.h / a.h : 1;
    const mx = (x: number) => b.x + (x - a.x) * sx;
    const my = (y: number) => b.y + (y - a.y) * sy;
    if (type === "text") {
      /* 字号只跟着"最小的那一维"走：单拉宽不应该把字撑高 */
      const fr = Math.max(0.05, Math.min(sx, sy));
      return { ...node, x: mx(node.x), y: my(node.y), fontSize: Math.max(4, (node.fontSize || 16) * fr) };
    }
    if (type === "shape") {
      const out: any = { ...node, x1: mx(node.x1), y1: my(node.y1), x2: mx(node.x2), y2: my(node.y2) };
      if (Array.isArray(node.points)) out.points = node.points.map((p: any) => ({ x: mx(p.x), y: my(p.y) }));
      return out;
    }
    /* image / note / table / link：x,y,w,h 一起走 */
    const out: any = { ...node, x: mx(node.x), y: my(node.y) };
    if (typeof node.w === "number") out.w = Math.max(4, node.w * sx);
    if (typeof node.h === "number") out.h = Math.max(4, node.h * sy);
    return out;
  }

  /** 把「框从 a 变到 b」真正写回文档。一次写全，不在 move 里堆历史。 */
  function applyBoxRemap(a: BoxState, b: BoxState) {
    const g = gRef.current;
    const members = g.boxOriginalMembers as unknown as { type: string; id: string; node: any }[];
    (window as any).__rb = { called: true, n: members ? members.length : -1, types: members ? members.map((m) => m.type) : [], a, b };   /* TEMP-DEBUG */
    if (!members || !members.length) return;
    const pg = pageRef.current;
    const buckets: Record<string, any[]> = {
      text: [...(pg.texts || [])], image: [...(pg.images || [])], note: [...(pg.notes || [])],
      table: [...(pg.tables || [])], link: [...(pg.links || [])], shape: [...(pg.shapes || [])],
    };
    let touched = false;
    for (const m of members) {
      const arr = buckets[m.type];
      if (!arr) continue;
      /* ★ 框里含整张纸时，纸层成员跟着【纸自己的缩放】走，这里不许再动一次（否则缩两遍） */
      if (g.boxIncludePaper && m.node?.layer === "paper") continue;
      const i = arr.findIndex((n) => n.id === m.id);
      if (i < 0) continue;
      arr[i] = remapMember(m.type, m.node, a, b);
      touched = true;
    }
    if (!touched) return;
    onUpdateRef.current({
      texts: buckets.text, images: buckets.image, notes: buckets.note,
      tables: buckets.table, links: buckets.link, shapes: buckets.shape,
    });
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

  /** 把当前框里的成员登记成一个 Group。
      ★ 返回登记到的成员数 —— 调用方要拿它决定"要不要弹框选菜单"。
        原来调用方是 `commitBoxAsGroup(); currentGroupMemberIds().length`，
        而 currentGroupMemberIds() 去 pageRef.current 里找这个刚建的 Group，
        **pageRef 要等这次事件处理完才更新** → 恒为 0 → 第一次框选永远不弹菜单。
        这里直接把数出来的人数返回，不再绕回去读还没更新的 ref。 */
  function commitBoxAsGroup(): number {
    const b = boxRef.current;
    if (!b) return 0;
    if (b.w < 4 || b.h < 4) {
      clearBox();
      return 0;
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
      if (includePaper) return memberIds.length;
      clearBox();
      if (gid) {
        const nextGroups = groups.filter((gg) => gg.id !== gid);
        onUpdateRef.current({ groups: nextGroups });
      }
      return 0;
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
    return memberIds.length;
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

    /* 笔迹：直接复用页面上已渲染好的那一层（单一来源，不写第二套）。
       ★ 骨钉模式下这一层已经不在 DOM 里了（纸换成了位图）——
         那时必须用【进骨钉前缓存下来的那一份】，否则位图里只有文字/图片，
         手画的线条和图形全丢，用户看到的就是一张白纸（实测：位图里只剩 22 个非白像素）。 */
    const strokes = rigMode
      ? (strokesCacheRef.current || STROKES_CACHE)
      : (stageRef.current?.querySelector("[data-shapes-svg]")?.innerHTML || "");
    if (strokes) P.push(strokes);

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
    /* ★ 兜底：按在任何元素的【真包围盒】里也算命中。
       为什么必须有这一层：上面那几个 hit*At 用的是"离笔画多近"的描边判定
       （图形是 8px 以内）。手画的圆圈/线条，按在圈里、离笔画超过 8px 的地方
       会被判成"空白" —— 于是【空白短弹窗出现在有内容的地方】。
       用户 2026-09-26 定死：「任何有内容的地方长按，短弹窗都不准出现，
       只准出现在空白处长按」。所以这里按包围盒再收一遍。 */
    const boxHit = hitContentByBox(lx.x, lx.y);
    if (boxHit) return boxHit;
    /* Unit 外框命中带也算对象命中（P0-4 单对象长按里的 Unit） */
    const unit = hitUnitBorder(lx.x, lx.y);
    if (unit) return { type: "unit", id: unit.unit.id };
    return null;
  }

  /** ★ 在【任意一张纸】上命中对象（不只当前纸）。
      连接模式专用：点别的纸上的对象原来完全失灵。
      换算用 paperDisplay（就是画连接线、画高亮框用的那一套），
      命中用各自的真包围盒（elemBoxIn），从后往前 = 后画的在上。 */
  function hitElementOnPage(pg: Page, sx: number, sy: number): { type: string; id: string } | null {
    const d = paperDisplay(pg.id);
    if (!d) return null;
    const pw = pg.paperW && pg.paperW > 0 ? pg.paperW : 390;
    const ph = pg.paperH && pg.paperH > 0 ? pg.paperH : 844;
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return null;
    const cx = sr.width / 2 + d.tx;
    const cy = sr.height / 2 + d.ty;
    const tr = (pg.transform || { rotate: 0 } as any).rotate || 0;
    const rad = (-tr * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = sx - sr.left - cx;
    const dy = sy - sr.top - cy;
    const s = d.s || 1;
    const lx = (dx * cos - dy * sin) / s + pw / 2;
    const ly = (dx * sin + dy * cos) / s + ph / 2;
    if (lx < 0 || lx > pw || ly < 0 || ly > ph) return null;
    const rows: { type: string; id: string }[] = [];
    (pg.images || []).forEach((n) => rows.push({ type: "image", id: n.id }));
    (pg.notes || []).forEach((n) => rows.push({ type: "note", id: n.id }));
    (pg.tables || []).forEach((n) => rows.push({ type: "table", id: n.id }));
    (pg.links || []).forEach((n) => rows.push({ type: "link", id: n.id }));
    (pg.shapes || []).forEach((n) => rows.push({ type: "shape", id: n.id }));
    (pg.texts || []).forEach((n) => rows.push({ type: "text", id: n.id }));
    for (let i = rows.length - 1; i >= 0; i--) {
      const b = elemBoxIn(pg, rows[i].type, rows[i].id);
      if (b && lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) return rows[i];
    }
    return null;
  }

  /** 纸内坐标落点：谁的【真包围盒】盖住它？（文字不走这里，hitText 已经按 DOM 盒判过） */
  function hitContentByBox(px: number, py: number): { type: string; id: string } | null {
    const pg = pageRef.current;
    const hit = (b: { x: number; y: number; w: number; h: number } | null) =>
      !!b && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    const rows: { type: string; id: string; b: { x: number; y: number; w: number; h: number } | null }[] = [];
    (pg.images || []).forEach((n) => rows.push({ type: "image", id: n.id, b: n }));
    (pg.notes || []).forEach((n) => rows.push({ type: "note", id: n.id, b: n }));
    (pg.tables || []).forEach((n) => rows.push({ type: "table", id: n.id, b: n }));
    (pg.links || []).forEach((n) => rows.push({ type: "link", id: n.id, b: n }));
    (pg.shapes || []).forEach((n) => rows.push({ type: "shape", id: n.id, b: shapeLocalBox(n) }));
    /* 后画的在上 → 从后往前找 */
    for (let i = rows.length - 1; i >= 0; i--) {
      if (hit(rows[i].b)) return { type: rows[i].type, id: rows[i].id };
    }
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
    /* ★ 骨钉把手同理：按在关节上必须直接放行，
       否则 stage 一 setPointerCapture，pointermove 就全改派到 stage，
       把手拖不动。 */
    if (__tgt.closest("[data-rig-handle]")) return;
    /* ★ 形状的旋转把手同理：按在把手上是要拖它转，不能被画布手势吃掉。 */
    if (__tgt.closest("[data-rot-handle]")) return;
    /* ★ 盖在画布上的界面（胶片条这类）同理：它们要自己收点击。
       不排除的话 stage 一捕获指针，按钮的 onClick 就永远收不到。 */
    if (__tgt.closest("[data-no-canvas-gesture]")) return;
    /* ★ 演示态：记下"这一下是不是从屏幕左边缘起的"。
       只是记，什么都不拦 —— 抬手时是扫就是唤出，是点就照旧跳转。 */
    gRef.current.edgeSwipeFired = false;
    gRef.current.edgeSwipeFrom = demoOn && e.clientX <= EDGE_REVEAL_PX
      ? { x: e.clientX, y: e.clientY }
      : null;
    /* ★ 框选起手点：每一次按下都重新记，别留给上一次手势。
       踩过的坑：加页/换页会让 Editor 整个重挂载（editorKey = 页id+规格），
       手势状态被重置成初值 {0,0}；而框选起手那条分支只赋了 startPoint、
       没赋 boxStartPoint —— 于是加页之后一拖，框从屏幕左上角 (0,0) 开始画，
       实测「手指走 100×100、框却是 (0,0) 到 (130,740)」。在这里统一兜住。 */
    {
      const lo = getStageLocal(e.clientX, e.clientY);
      if (lo) gRef.current.boxStartPoint = lo;
      gRef.current.pendingBox = false;
      (gRef.current as any).boxArmed = false;
    }
    {
      const sx = e.clientX, sy = e.clientY;
      const lp = window.setTimeout(() => {
        if (drawToolRef.current) return;
        /* ★ 第十一条：抽屉面板开着时，画布上禁止任何弹窗 */
        if (drawerBusyRef.current) return;
        /* ★ 双手指 = 捏合，不是长按。
           两根手指各起了一个定时器，而 window.__ranjingLongPress 只记得住最后一个，
           第一根手指那个会漏到 500ms 后开火 —— 实测：捏合到一半突然弹出元素菜单、
           还冒出一圈错位的框，就是这么来的。
           开火这一刻只有「确实只剩一根手指」才算长按。
           （另外下面把它也存进 g.longPressTimer：那个变量以前只被 clearTimeout、
             从来没被赋值，等于 16 处清理全是空转。） */
        if (gRef.current.pointers.size !== 1) return;
        gRef.current.longPressed = true;   /* ★ 这一下确实是长按，抬手时要用它区分 */
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
          /* ★ 自动框选高亮：把框设成该元素的包围盒（长按和点击走同一份实现）。
             框既是选中状态的来源（getSelectedRefs / selectedTextIds 都读它），
             也是画面上那圈高亮。
             以前这里直接用 boundsOf() 的【纸张坐标】当【画布坐标】塞进框 ——
             默认状态（纸铺满屏、缩放 1）两者恰好相等所以看不出来，
             一选规格或一缩放眼就歪。现在统一走 elementBoxOnStage。 */
          const bb = elementBoxOnStage(hitEl.type, hitEl.id);
          if (bb) {
            boxRef.current = bb;
            setBox(bb);
            setBoxGroupId(null); boxGroupIdRef.current = null;
          }
          setCtxMenu({ kind: "element", x: sx, y: sy, hitEl: hitEl as { type: string; id: string } });
        } else if (boxRef.current && isInsideBox(sx, sy)) {
          /* ★ 框选出来的框【里面】，一律也算"有内容的地方"。
             为什么必须有这一条：框住好几个对象时，对象【之间的空隙】不属于任何一个元素，
             原来会掉进"空白" → 短弹窗出现在有内容的地方。
             用户 2026-09-26 定死：「框选的对象同属于有内容的，同样走长弹窗，
             不要再出现短弹窗；有内容的区域出现短弹窗就是你的问题」。
             框保持原样（不重设），长弹窗的各项本来就作用于框里的内容。 */
          setCtxMenu({ kind: "element", x: sx, y: sy });
        } else {
          setCtxMenu({ kind: "blank", x: sx, y: sy });
        }
        try { navigator.vibrate && navigator.vibrate(12); } catch {}
      }, 500);
      (window as any).__ranjingLongPress = lp;
      gRef.current.longPressTimer = lp;   /* ★ 那 16 处 clearTimeout(g.longPressTimer) 从此真的有用 */
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
    /* ★ 每一按开始先把"这一下是不是长按"清掉，抬手时才有得判断。
       （这个标志以前只被清、从来没被置 true，等于永远为假 ——
        好几处逻辑都在读它，包括"运行态点击跳转"和"抬手要不要取消框"。） */
    g.longPressed = false;

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
          /* ★ 先看它是不是某个「组合」的成员：是 → 认整个组合，不认这一根线。
             （见 selectUnitOnPress 上面的说明） */
          const u = unitOfMember(hit.id);
          if (u) { selectUnitOnPress(u, e); return; }
          setSelectedEl({ type, id: hit.id });
          /* ★ 手稿第二张：「纸内对象 点击 出现框选高亮」。
             原来点击只有一层淡光晕（image/note 那圈 boxShadow），用户看不出
             「选中了没、选中的是不是这一个」；那圈框以前只有长按才有。
             框同时是「选中了谁」的唯一来源（getSelectedRefs / selectedTextIds
             都按画布坐标读它），不设框 = 后面所有对选中对象的操作都找不到目标。 */
          const bb = elementBoxOnStage(type, hit.id);
          if (bb) {
            boxRef.current = bb;
            setBox(bb);
            setBoxGroupId(null); boxGroupIdRef.current = null;
            g.dragBoxOrigin = bb;      // 接着拖动时，框跟着对象走
          }
          g.mode = "dragShape"; g.dirGate = false; g.startPoint = { x: e.clientX, y: e.clientY };
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
        /* ★ 同上：这一笔属于某个「组合」→ 认整个组合。
            这一条正是用户要的「我点击的是我画的人，就框整个人，不是框我点到的那根线」。 */
        const u = unitOfMember(hitShape.id);
        if (u) { selectUnitOnPress(u, e); return; }
        setSelectedEl({ type: "shape", id: hitShape.id });
        /* ★ 同上：点击笔迹/图形也要出那圈框（见上面 image/note 那条的说明）。
           笔迹的框必须走 shapeLocalBox —— 自由笔迹的 x1..y2 只覆盖起笔那 4px，
           真实范围在 points 里，用 x1..y2 会画出一颗看不见的小点。 */
        const bb = elementBoxOnStage("shape", hitShape.id);
        if (bb) {
          boxRef.current = bb;
          setBox(bb);
          setBoxGroupId(null); boxGroupIdRef.current = null;
          g.dragBoxOrigin = bb;
        }
        g.mode = "dragShape"; g.dirGate = false; g.startPoint = { x: e.clientX, y: e.clientY };
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
      /* ★ 先记下这一按之前的框（下面可能马上就会改它）。
         万一第二根手指随后落下（= 捏合），要用它把这一按造成的影响撤回。 */
      g.boxBeforeGesture = boxRef.current ? { ...boxRef.current } : null;
      /* ★ 落在某个「组合」的区域里（哪怕这一下没有压到任何一笔）→ 认这个组合。
         用户的原话：「我点击这个人物画像的那个区域，都是在框选这个人物的整体」——
         要的是【那个区域】，不是【必须精准压到某一根线】。 */
      {
        const la = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
        if (la.inside) {
          const ua = hitUnitArea(la.x, la.y);
          if (ua) { selectUnitOnPress(ua, e); return; }
        }
      }
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
          g.boxOriginalMembers = snapshotBoxMembers();
          g.boxPaperOrigin = stageBoxToPaper(boxRef.current);
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
          g.mode = "dragBox"; g.dirGate = false; g.startPoint = { x: e.clientX, y: e.clientY };
          const local = getStageLocal(e.clientX, e.clientY);
          g.boxMoveStart = local || { x: 0, y: 0 };
          g.boxMoveOriginal = { ...boxRef.current };
          g.boxIncludePaper = boxContainsPaper(boxRef.current);
          g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
          g.boxOriginalMembers = snapshotBoxMembers();
          g.boxPaperOrigin = stageBoxToPaper(boxRef.current);
          g.boxOriginalOtherPages = snapshotOriginalOtherPages();
          return;
        }
        /* 按在框外空白：抬手没动 → 取消框；一旦拖动 → 重新框选。
           原来这里只挂了个"抬手取消"，拖动就成了死动作
           （实测：纸没动、框没变、什么都没发生）。 */
        g.pendingClearBoxOnUp = true;
        g.pendingBox = true;
        g.boxSourceLayer = isInPaper(e.clientX, e.clientY) ? "paper" : "background";
        g.boxIncludePaper = false;
        g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
        { const local = getStageLocal(e.clientX, e.clientY); if (local) g.boxStartPoint = local; }
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

      /* ★ 空白处拖 = 框选。手稿第一张只写了「单击不动作 / 双击进编辑 / 长按弹窗」，
         第六、七张写的是「按住框选」「在框选对象上拖拉 = 移动」——
         **没有"单指拖空白 = 拖走整张纸"这一条**。
         原来纸内起手是 pendingBox=false → 走 dragPaper → 拖走整张纸，
         于是框选根本不会开始，纸上的笔画永远框不到，"组合"也就永远出不来（实测）。
         现在起点在纸内 → 选纸内元素；起点在纸外 → 选背景层元素。
         纸的平移交给双指（pinch 分支本来就带平移）。 */
      const inPaper = isInPaper(e.clientX, e.clientY);
      g.pendingBox = true;
      g.boxSourceLayer = inPaper ? "paper" : "background";
      g.boxIncludePaper = false;
      g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
      {
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
      clearTimeout((g as any).boxArmTimer);   /* ★ 框选的 70ms 保险作废：双指不是框选 */
      (g as any).boxArmTimer = 0;
      g.moved = true;
      g.longPressed = false;
      g.pendingBox = false;
      g.pendingSwitchPageId = null;
      /* ★ 双指 = 捏合，不是框选。第一根手指可能已经起了一个框选
         （实测：什么都不点直接捏合会凭空冒出框；拖动超 10px 时还会把原来的框
         重置成一颗小点）—— 这里把这一按造成的改动撤回去，恢复按之前那圈框。 */
      if (g.mode === "boxSelect") {
        g.mode = "idle";
        boxRef.current = g.boxBeforeGesture;
        setBox(g.boxBeforeGesture);
      }
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
      /* ★★ 两指缩放手势【在哪张纸上，就缩放哪张】—— 用户 2026-09-26 第九条：
         「两指缩放手势在哪，那就缩放，定死。不需要再点击一下页面进行切换」。
         所以起手时先看两指中点在谁的范围内：是本页就照旧走 setPaper；
         是【别的纸】就记住那张纸的 id，整段手势直接缩放它本人，
         ★ 不切当前页 —— 切页会让 Editor 整个重挂载，手势当场断掉。 */
      const other = hitOtherPage(snap.midX, snap.midY);
      g.pinchPageId = other ? other.id : page.id;
      if (other) {
        const tr = other.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        g.initial = {
          ...g.initial,
          x: tr.x, y: tr.y, scale: tr.scale, rotate: tr.rotate || 0,
          dist: snap.dist, angle: snap.angle, midX: snap.midX, midY: snap.midY,
        };
      } else {
        g.initial = {
          ...g.initial,
          x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
          dist: snap.dist, angle: snap.angle, midX: snap.midX, midY: snap.midY,
        };
      }
      g.mode = "pinch";
      (g as any).rigView0 = { ...(rigView || { k: 1, vx: 0, vy: 0 }) };   /* ★ 骨钉空间：这一把捏合的【起手视野】 */
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gRef.current;
    (window as any).__mv = { mode: g.mode, hasBox: !!boxRef.current, dragShapeOrigin: !!g.dragShapeOrigin, boxPaperOrigin: !!g.boxPaperOrigin, members: (g.boxOriginalMembers || []).length };   /* TEMP-DEBUG */
    if (g.justCommittedEdit) return;
    /* ★ 演示态：从左边缘往右扫够远 → 把工具栏叫回来（只触发一次）。
       这一下不做任何"消费"，手势继续按原样走，所以不拦点击。 */
    if (g.edgeSwipeFrom && !g.edgeSwipeFired) {
      const dxs = e.clientX - g.edgeSwipeFrom.x;
      const dys = Math.abs(e.clientY - g.edgeSwipeFrom.y);
      if (dxs >= EDGE_REVEAL_SWIPE && dys <= 60) {
        g.edgeSwipeFired = true;
        onRevealRailRef.current?.();
      }
    }
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

    /* ══ ★ 按下之后往哪走 —— 方向定死 ═══════════════════════════════════
       用户 2026-09-26 口头定的：「手指按住往上滑 = 框选」「手指按住往下拖 = 移动」。
       ⚠️ 这一条【不】在手稿第七张里 —— 第七张写的是「不用判断，把拖拽和框选融合」、
          「点击框选对象【中间】不松手并出现拖就是移动」（只看按在哪、不看方向）。
          用户明确要求「按我现在说的来」，所以照方向做，冲突时以这一条为准。
       实现：从【有内容的框上】起手时先上一道闸，26px 之内一动不动（这也顺手治了
       「稍微不注意就被拖走」）；超过之后看主方向——往上 → 转框选，其余 → 放行去做移动。 */
    if (!g.dirGate && g.pointers.size === 1 && g.mode !== "boxSelect") {
      const mvx = e.clientX - g.startPoint.x;
      const mvy = e.clientY - g.startPoint.y;
      if (Math.abs(mvx) <= MOVE_OR_SELECT_PX && Math.abs(mvy) <= MOVE_OR_SELECT_PX) return;
      g.dirGate = true;
      if (mvy < -MOVE_OR_SELECT_PX && Math.abs(mvy) >= Math.abs(mvx)) {
        /* 往上滑 → 框选：撤掉框、从按下点重新拉一个 */
        clearBox();
        g.mode = "boxSelect";
        g.boxStartPoint = getStageLocal(g.startPoint.x, g.startPoint.y) || { x: 0, y: 0 };
        g.pendingBox = false;
        const b0 = { x: g.boxStartPoint.x, y: g.boxStartPoint.y, w: 0, h: 0 };
        boxRef.current = b0;
        setBox(b0);
        return;
      }
    }

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
      followDragBox(ldx, ldy, p);
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
      followDragBox(ldx, ldy, p);
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
      followDragBox(ldx, ldy, p);
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
      followDragBox(ldx, ldy, paperStateRef.current);   // 框跟着整体走
      g.moved = true;
      return;
    }

    if (g.mode === "idle" && g.pointers.size === 1) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      /* ★ 手指"点一下" vs 真的要"拖"：门槛 22px（原来是 10px）。
         实测（照真机手指抖动复现，点空白）：
           抖动直线距离  9px → 不闪框
                       11px → 闪出 1 个框
                       13px、18px → 都闪
         真机上拇指点一下、滚一下就是十几像素，于是【每点一下就闪一个框】——
         用户原话：「点一下就是框，点一下就是框，跟羊癫疯一样」。
         22px：手指点一下抖不到；真要框选，随手一拖就是几十像素，不受影响。 */
      if (Math.hypot(dx, dy) > 22) {
        clearTimeout(g.longPressTimer);
        g.moved = true;
        g.pendingClearBoxOnUp = false;
        if (g.pendingBox) {
          /* ★ 空白起手：挂上"框选保险"之后就【停在这条路上】，不许掉到下面
             "拖文字"那条分支去 —— 上一版就是把 pendingBox 立刻置 false，
             结果下一帧掉进 else 变成 dragText，70ms 后保险一开火发现
             mode 不是 idle 直接作废，**上滑框选整个消失了**（用户当场抓到）。
             现在 pendingBox 一直留着，每次 move 都从这里 return。 */
          if (drawerBusyRef.current) return;              /* 抽屉开着：不起框 */
          if (!(g as any).boxArmed) {
            (g as any).boxArmed = true;
            /* ★★ 框选只在【往上滑】时起 —— 用户 2026-09-26 定死：
               「框选只有三个地方：点击内容、长按内容、按住往上滑。
                摁住往下拖就是移动，往下拖是不可能出现框选的」。
               方向不对就什么都不起（无效的动作就是不发生，也不弹字）。 */
            const 往上滑 = dy < 0 && Math.abs(dy) >= Math.abs(dx);
            if (往上滑) {
              /* ★★ 再加 70 毫秒保险 —— 两指缩放的"框跑出来"就是这儿漏的。
                 真机上两根手指不是同时落的：第一根先落、还会先滑一小段，
                 这一段被当成单指就会立刻拉出框；等第二根落下时框已经闪过了。
                 现在 70ms 后才真的起框：这 70ms 内第二根手指一落，保险作废。
                 真要框选的话，70ms 人眼无感。 */
              const armTimer = window.setTimeout(() => {
                (g as any).boxArmTimer = 0;
                if (gRef.current.pointers.size !== 1) return;      /* 第二根落了 → 不起框 */
                if (gRef.current.mode !== "idle") return;          /* 已成别的手势 → 不起框 */
                if (!gRef.current.pendingBox) return;              /* 已经放弃 → 不起框 */
                gRef.current.mode = "boxSelect";
                const b0 = { x: gRef.current.boxStartPoint.x, y: gRef.current.boxStartPoint.y, w: 0, h: 0 };
                boxRef.current = b0;
                setBox(b0);
                setBoxGroupId(null); boxGroupIdRef.current = null;
              }, 70);
              (g as any).boxArmTimer = armTimer;
            }
          }
          return;
        } else {
          /* 空白拖动已一律走框选（见 pointerdown 那段），
             这里只剩「按在文字上拖 = 移动文字」一种；dragPaper 已删。 */
          g.mode = "dragText";
          if (g.dragTextId) {
            const t = textsRef.current.find((x) => x.id === g.dragTextId);
            if (t) { setDraggingTextId(t.id); }
          }
        }
      }
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

    /* ★ 双指缩放/平移 = 直接操作【当前这一张纸】（x/y/scale）。
       用户 2026-09-26：「我点另一个 大小拉伸 两个一起大小拉伸」「还分不开」——
       之前把双指改成动镜头，结果所有纸一起缩放、单张纸再也分不开。
       这里改回来：手指动的是手里这张纸。 */
    if (g.mode === "pinch" && g.pointers.size === 2) {
      /* ★ 骨钉模式下双指【一律不动】—— 用户 2026-09-26：
         「不能拉伸大小；第一层不动；后面几层也不许自己动」。
         叠放的 10 张是同一张画面的不同姿势，纸一被缩放，整套叠放就散了。 */
      const snap = getTwoFingerSnapshot();
      /* ★ 骨钉是独立空间：双指改【视野】，不改纸 —— 纸的坐标一个字节都不写。 */
      if (rigMode) {
        /* ★★ 基准必须是【起手那一刻】的视野，不能用当前值 ——
           用当前值 = 每一帧都在已经缩过的基础上再缩一次，指数级乱跑
           （用户 2026-09-26：「画布不受控，乱跑乱飘，不是巨大就是巨小」）。 */
        const r0 = (g as any).rigView0 || { k: 1, vx: 0, vy: 0 };
        /* ★ 缩放下限不能是 0.12 —— 那样纸会缩成一个小点，等于把它弄丢了。
           用户 2026-09-26：「我画布飘走了」① 缩得没底 ② 平移没有边界。 */
        const k2 = Math.max(0.35, Math.min(4, r0.k * (snap.dist / (g.initial.dist || 1))));
        let vx2 = r0.vx + (snap.midX - g.initial.midX);
        let vy2 = r0.vy + (snap.midY - g.initial.midY);
        /* ★ 夹住平移：纸心永远留在屏幕【中间那一半】里，怎么拖都不会飘走 */
        const sr = stageRef.current?.getBoundingClientRect();
        if (sr && sr.width > 0) {
          const cxWant = sr.width / 2 + paper.x * k2 + vx2;
          const cyWant = sr.height / 2 + paper.y * k2 + vy2;
          const cxIn = Math.min(sr.width * 0.75, Math.max(sr.width * 0.25, cxWant));
          const cyIn = Math.min(sr.height * 0.75, Math.max(sr.height * 0.25, cyWant));
          vx2 += cxIn - cxWant;
          vy2 += cyIn - cyWant;
        }
        onRigViewChange?.({ k: k2, vx: vx2, vy: vy2 });
        return;
      }
      const ratio = snap.dist / (g.initial.dist || 1);
      /* ★ 双指 = 动【手里这一张纸】，别的纸一个字都不碰。
         用户 2026-09-26 原话：「纸是独立的，各玩各的。我拖谁谁走，我没拖谁就给我留在原地」
         「我拖一张纸，所有纸都跟着走」← 这是把双指做成"镜头"的后果，已经拆掉。
         缩放取手指间距比，位移取两指中点的移动量。 */
      const nextScale = Math.max(0.12, Math.min(6, (g.initial.scale || 1) * ratio));
      const nextX = (g.initial.x || 0) + (snap.midX - g.initial.midX);
      const nextY = (g.initial.y || 0) + (snap.midY - g.initial.midY);
      /* 两指在【别的纸】上 → 直接缩放那张纸（不切当前页，切页会重挂载、手势断掉） */
      if (g.pinchPageId && g.pinchPageId !== page.id) {
        onUpdatePageTransformRef.current?.(g.pinchPageId, {
          x: nextX, y: nextY, scale: nextScale, rotate: g.initial.rotate || 0,
        });
      } else {
        setPaper((prev) => (prev.x === nextX && prev.y === nextY && prev.scale === nextScale
          ? prev
          : { ...prev, x: nextX, y: nextY, scale: nextScale }));
      }
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

      /* ══ ★ 按下之后往哪走 —— 方向定死（用户 2026-09-26 口头定的规则）══════
         手指按住【往上滑】= 框选；手指按住【往下拖】= 移动。
         ⚠️ 这一条【不】在手稿第七张里 —— 第七张写的是「不用判断，把拖拽和框选融合」、
            「点击框选对象【中间】不松手并出现拖就是移动」（只看按在哪，不看方向）。
            用户明确说「按我现在说的来」，所以按方向走；两者冲突时以这一条为准。
         只认"明显竖着走"的那一下：横着拖（|dx| > |dy|）不算，仍按原来移动。 */
      if (dyStage < -MOVE_OR_SELECT_PX && Math.abs(dyStage) >= Math.abs(dxStage)) {
        /* 转成框选：先把这一小段已经产生的位移原样撤回去，再从按下点重新拉框 */
        const a0 = g.boxPaperOrigin;
        if (a0) applyBoxRemap(a0, a0);
        clearBox();
        g.mode = "boxSelect";
        g.boxStartPoint = { ...g.boxMoveStart };
        g.pendingBox = false;
        return;
      }

      /* ★ 拖着框走 = 把框里的【所有东西】一起平移（原来只搬文字，图形纹丝不动）。
         位移量按纸张坐标算，所以缩放/旋转过的纸也跟手。 */
      const a0 = g.boxPaperOrigin;
      const b0now = stageBoxToPaper(boxRef.current);
      (window as any).__g2 = { inDragBox: true, a0: a0 || null, b0now: b0now || null, members: (g.boxOriginalMembers || []).length };   /* TEMP-DEBUG */
      if (a0 && b0now) applyBoxRemap(a0, b0now);

      if (g.boxIncludePaper) {
        setPaper((prev) => ({
          ...prev,
          x: g.boxOriginalPaper.x + dxStage,
          y: g.boxOriginalPaper.y + dyStage,
        }));
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
        /* 四角 = 等比（拉大小）；四条边 = 只拉那一维（拉长 / 拉宽窄）。
           边的方向由图里定死：拉 e/w 只改宽、拉 n/s 只改高。 */
        const onlyX = g.boxResizeHandle === "e" || g.boxResizeHandle === "w";
        const onlyY = g.boxResizeHandle === "n" || g.boxResizeHandle === "s";
        const ratio = Math.max(0.05, onlyX ? ratioX : onlyY ? ratioY : Math.min(ratioX, ratioY));
        const ocx = o.x + o.w / 2;
        const ocy = o.y + o.h / 2;
        const ncx = nx + nw / 2;
        const ncy = ny + nh / 2;
        const sr = stageRef.current?.getBoundingClientRect();
        if (!sr) return;

        /* ★ 框里的【所有东西】按「框从纸张矩形 a0 变到 b1」一起重排 ——
           原来这一段只处理文字、只处理一个等比 ratio，图形/线条完全不动，
           于是用户"想拉小一根画出来的线"永远只能变成拖走。
           现在统一走 remapMember：图形的 x1..y2 与 points 也会跟着缩。
           四条边的单轴拉伸用一个"只放一维"的目标矩形表达。 */
        const a0 = g.boxPaperOrigin;
        const bAll = stageBoxToPaper(b);
        if (a0 && bAll) {
          const b1 = onlyX
            ? { x: bAll.x, y: a0.y, w: bAll.w, h: a0.h }
            : onlyY
              ? { x: a0.x, y: bAll.y, w: a0.w, h: bAll.h }
              : bAll;
          applyBoxRemap(a0, b1);
        }

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

    /* ★ 运行态：点一下 = 【直接跳过去】，不画连线过程。
       手稿第五张：「在完成交互连接的设置后，就是实现路线跳转的时候。
       在我的页面，点击对象，不显示连接线的过程，而是直接跳转到页面。」
       分界线就是这条线有没有闭环：闭环前点对象是「接着搭」，闭环后才「跳」。 */
    if (connectRun && !g.moved && !g.longPressed && g.mode !== "drawing") {
      const hit = hitAnyElement(e.clientX, e.clientY) as { id: string } | null;
      /* 去程：这个对象是某条连接的起点 → 跳到那条连接的承接页 */
      const fwd = hit
        ? (interactions || []).find((x) => x.fromPageId === page.id && x.fromElementId === hit.id)
        : null;
      /* 返程：这个对象是某条连接的【返程对象】（第十张第③步选的那个）
         → 按那条连接回到它的起页。规则：「点击返回对象，就按照事先建立的返程连接，
         返回指定页面」。★ 不加任何额外限制 —— 连接是四步闭环走完才记下的，
         每条记录本来就有返程；允许多页共用同一个返程目标。 */
      const back = !fwd && hit
        ? (interactions || []).find((x) => x.toPageId === page.id && x.toElementId === hit.id)
        : null;
      const ix = fwd || back;
      if (ix) {
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
        g.pointers.delete(e.pointerId);
        clearTimeout(g.longPressTimer);
        g.mode = "idle";
        if (fwd) onConnectJump?.(fwd); else onConnectJumpBack?.(back!);
        return;
      }
      /* 没点到有连接的对象 → 不拦。拦了的话运行态里除了那几个对象什么都点不动，
         用户想出都出不来。 */
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
      g.dragBoxOrigin = null;
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
      g.dragBoxOrigin = null;
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
    (window as any).__up = { pendingClearBoxOnUp, wasMode, wasMoved, wasLongPressed, hasBox: !!boxRef.current };   /* TEMP-DEBUG */
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    g.pointers.delete(e.pointerId);
    clearTimeout(g.longPressTimer);
    clearTimeout((g as any).boxArmTimer);

    if (pendingSwitch && !wasMoved) {
      g.pendingSwitchPageId = null;
      g.mode = "idle"; g.moved = false; g.longPressed = false;
      g.pendingClearBoxOnUp = false;
      onSelectPage?.(pendingSwitch);
      return;
    }
    g.pendingSwitchPageId = null;

    /* ══ ★ 单击 = 退出当前做的事（用户 2026-09-26 第七条 / 第八条）═══════════
       第七条：单击前没有活动 → 定死不动作。
       第八条：单击前活动频繁 → 突然单击就退出当前做的事。
       两条合起来就是这一句：**按在框外空白、没拖没长按 = 一下点掉，退出框选态**。
       没有框的时候它自然什么都不做（= 第七条），不用再单独判"有没有活动"。
       ★ 原来这里还多一个 `wasMode === "idle"` 的条件 —— 从"点中对象"（mode 是
         dragShape）过来时就不清了，实测「点了图形再点空白，框还在」。
         按第八条去掉它：只要没拖没长按，点空白就该退。 */
    /* ★ 不依赖 pointerdown 走了哪条分支 —— 那条路会被别的分支截走，
       实测「点了图形再点空白，框还在」。这里自己判：没拖、没长按的一下点击，
       落点在【当前框的外面】就退出（框内点击不算，那是选中框里的东西）。 */
    const 空点击 = !wasMoved && !wasLongPressed && !isInsideBox(g.startPoint.x, g.startPoint.y);
    if ((pendingClearBoxOnUp || 空点击) && !wasMoved && !wasLongPressed) {
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
        /* ★ P0-4：框选完成后立刻弹出画布级轻操作弹窗（组合/连接/排列/复制/删除），
           位置 = 框选框（stage 局部 → 屏幕坐标），不放全透明层锁画布。
           count 直接取 commitBoxAsGroup 的返回值 —— 不能再去读 pageRef，
           那个 ref 要等这次事件处理完才更新，第一次框选会恒为 0、菜单永远不弹。 */
        const count = commitBoxAsGroup();
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
    g.dragBoxOrigin = null;
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
      g.dragBoxOrigin = null;
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

  /* ★ 点中一个元素时那圈框要用的方框：纸张坐标的包围盒 → 画布坐标。
     两个坑都在这里堵上：

     ① 【坐标空间】框（boxRef）全网都按【画布坐标】读 —— computeMembersInBox
        是 `sr.left + b.x`，selectedTextIds 也由它算出来。给它喂纸张坐标，
        默认状态（纸铺满全屏、缩放 1）下两者恰好相等所以看不出来，
        但凡选了规格、或捏合缩放过，框就会画歪，selectedTextIds 还会跟着选错人。
        这里用和 screenToPaperLocal 严格互逆的换算，保证框落在命中测试认定的位置上。

     ② 【包围盒】形状类里的自由笔迹（笔、蜡笔、铅笔…）x1..y2 只在起笔那 4px 上
        （见 pendingDraw 起笔那段），真实范围存在 points 里 —— 直接用 x1..y2
        会算出一颗 4px 的小点。所以形状一律走 shapeLocalBox。 */
  function elementBoxOnStage(type: string, id: string): BoxState | null {
    if (!type || !id) return null;
    const b = elemBoxIn(pageRef.current, type, id);   /* 元素→纸张包围盒只有一份实现 */
    if (!b) return null;
    const r = paperBoxToStage(b);
    return r ? padBox(r) : null;
  }

  /* 纸张坐标的方框 → 画布坐标。纯换算，**不加外扩** ——
     外扩由调用方（padBox）在"造框"时加一次。
     保持可逆是有意的：框的纸张坐标那份要能跟着纸缩放来回换算，
     换算里夹带外扩的话，每捏一次框就胀一点，捏十几次就明显跑偏。
     换算与 screenToPaperLocal 严格互逆，框一定落在命中测试认定的位置上。 */
  function paperBoxToStage(b: { x: number; y: number; w: number; h: number }): BoxState | null {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return null;
    const p = paperStateRef.current;
    const W = p.w > 0 ? p.w : sr.width;
    const H = p.h > 0 ? p.h : sr.height;
    const s = p.scale || 1;
    const rad = (p.rotate * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const rx = (b.x + b.w / 2 - W / 2) * s;
    const ry = (b.y + b.h / 2 - H / 2) * s;
    const cx = sr.width / 2 + p.x + rx * cos - ry * sin;
    const cy = sr.height / 2 + p.y + rx * sin + ry * cos;
    return { x: cx - (b.w * s) / 2, y: cy - (b.h * s) / 2, w: b.w * s, h: b.h * s };
  }

  /** 画布坐标的框 → 纸张坐标（paperBoxToStage 的逆） */
  function stageBoxToPaper(b: BoxState): BoxState | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const sr = stage.getBoundingClientRect();
    const p = paperStateRef.current;
    const a = screenToPaperLocal(sr.left + b.x, sr.top + b.y, stage, p);
    const c = screenToPaperLocal(sr.left + b.x + b.w, sr.top + b.y + b.h, stage, p);
    return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
  }

  /** 元素/组合的框要外扩 2px 并保证最小 4px：
      细长的笔迹（h≈0）也要能过 getSelectedRefs 的 w/h>=4 判定。 */
  /* ★ 框必须和内容【1:1 贴边】，不许在外面多让出一圈。
     用户 2026-09-26：「太大了，所有框选都要按照点击的内容做 1:1 的框选空间，
     不要非常大一个框装一个小内容」。原来这里往外扩 2px（渲染时还再加 4px），
     于是一个小内容被一个大框套着。现在只保留"最小 4px"这道保护
     （细长笔迹不缩到 0，后面 getSelectedRefs 的 w/h>=4 判定还要用），
     【不再外扩】。 */
  function padBox(b: BoxState): BoxState {
    return { x: b.x, y: b.y, w: Math.max(b.w, 4), h: Math.max(b.h, 4) };
  }

  /* ══ 「组合」= 一个物体 ══════════════════════════════════════════════
     手稿第四张：「有内容时点击什么，谁就被框选」
     第六张：「框选的对象是"完整"。完整不是整体，而是明确的元素」
     第七张：两个框分别标「纸的整体」和「纸内元素或物体【整体】」
     ⇒ 功能的作用单位是【物体】，不是一根线。所以：
        点了组合里的任何一处（哪怕压到的是其中一根线、哪怕落在空隙里），
        框出来的都是【整个组合】，拖动也是整个组合一起走。 */

  /** 这个元素属于哪个「组合」？（从后往前 = 后组合的优先） */
  function unitOfMember(id: string): any | null {
    const units = pageRef.current.units || [];
    for (let i = units.length - 1; i >= 0; i--) {
      if ((units[i].memberIds || []).includes(id)) return units[i];
    }
    return null;
  }

  /** 这个纸张坐标落在哪个「组合」的区域里（重叠时取面积最小、最具体的那一个） */
  function hitUnitArea(lx: number, ly: number): any | null {
    const units = pageRef.current.units || [];
    let best: any = null;
    let bestArea = Infinity;
    for (const u of units) {
      const b = u.bbox;
      if (!b || b.w <= 0 || b.h <= 0) continue;
      if (lx < b.x || lx > b.x + b.w || ly < b.y || ly > b.y + b.h) continue;
      const area = b.w * b.h;
      if (area >= bestArea) continue;
      best = u; bestArea = area;
    }
    return best;
  }

  /** ★ 点中一个「组合」→ 选中它整个：框 = 整个组合的包围盒，拖动 = 整体拖（成员一起走）。
      用的是现成的 dragUnit 通路（成员按快照 + 总位移走，不会逐帧累积漂移）。 */
  function selectUnitOnPress(unit: any, e: React.PointerEvent) {
    const g = gRef.current;
    /* 走的是一条会在 `g.moved = false` 之前就 return 的路，
       所以这里得自己复位 —— 和下面 hitUnitBorder 那条老路保持一致。 */
    g.moved = false;
    g.longPressed = false;
    g.mode = "dragUnit";
    g.unitDrag = {
      unitId: unit.id,
      members: snapshotUnitMembers(unit),
      bboxSnapshot: unit.bbox ? { x: unit.bbox.x, y: unit.bbox.y } : null,
      start: { x: e.clientX, y: e.clientY },
      moved: false,
    };
    if (unit.bbox) {
      const r = paperBoxToStage(unit.bbox);
      const bb = r ? padBox(r) : null;
      if (bb) {
        boxRef.current = bb;
        setBox(bb);
        setBoxGroupId(null); boxGroupIdRef.current = null;
        g.dragBoxOrigin = bb;      // 拖动时框跟着整体走
      }
    }
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }

  /* ★ 拖动中：框跟着被拖的元素走。
     元素在纸上挪了 (ldx, ldy)，框按纸张当前的缩放 + 旋转换算成画布位移
     （和拖动元素本身用的换算是同一套，所以两者不会走散）。 */
  function followDragBox(ldx: number, ldy: number, p: PaperState) {
    const b = gRef.current.dragBoxOrigin;
    if (!b) return;
    const s = p.scale || 1;
    const rad = (p.rotate * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const nb: BoxState = {
      x: b.x + (ldx * cos - ldy * sin) * s,
      y: b.y + (ldx * sin + ldy * cos) * s,
      w: b.w, h: b.h,
    };
    boxRef.current = nb;
    setBox(nb);
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
    /* ★ 自由笔迹（铅笔/钢笔/蜡笔/马克笔…）的 x1..y2 只覆盖起笔那 4px，
       真实范围在 points 里（见 shapeLocalBox 存在的原因）。用 x1..y2 会让
       「组合」的包围盒缩成一颗小点 —— 框是歪的，"点这个区域"的判定也跟着歪。
       形状一律走 shapeLocalBox。 */
    if (shape) return shapeLocalBox(shape);
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
      /* 不够 2 个就【不组合】——无效的动作就是不发生，不弹字（手稿的规矩）。 */
      if (ids.length < 2) return;
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
      /* 不再弹「已组合，成员仍可单独编辑」——组合成功的反馈就是
         "它开始当一个物体动了"本身。屏幕上一个字都不用出现。 */
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

  /* 注：原「框选版工具条」在这里另写过一份 shapesInBox —— 全项目零调用，
     算法也已并进 computeMembersInBox（同一件事只留一份），故整块删除。 */

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

  /* ══ 骨钉层 ══════════════════════════════════════════════════════
     把当前纸拍平成一张位图（复用导出用的 buildPageSvg），
     再按 6 个关节做骨架蒙皮形变，铺在纸上。
     位图只在「进骨钉模式 / 换纸 / 换规格」时重拍一次；
     拖关节时只重跑形变，不重拍 —— 这是能实时拖的关键。 */
  const rigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /* ★ 进骨钉【之前】把笔迹那一层缓存下来 —— 骨钉模式下纸变成了位图，
     笔迹那层 svg 就不在 DOM 里了，做位图时会抓空（用户报「我的画不见了」）。 */
  const strokesCacheRef = useRef<string>(STROKES_CACHE);
  const [rigSrc, setRigSrc] = useState<HTMLCanvasElement | null>(null);
  const [rigDragId, setRigDragId] = useState<string | null>(null);
  const rigDragRef = useRef<string | null>(null);
  const buildPageSvgRef = useRef(buildPageSvg);
  buildPageSvgRef.current = buildPageSvg;

  const rigW = paper.w > 0 ? paper.w : 390;
  const rigH = paper.h > 0 ? paper.h : 844;

  /** 从关节 id 推出骨架。id 约定：sh/el/hd + -L/-R */
  function bonesOf(js: RigJoint[] | undefined) {
    const ids = new Set((js || []).map((j) => j.id));
    const groups: { sh: string; el: string; hd: string }[] = [];
    for (const suf of ["L", "R"]) {
      if (ids.has(`sh-${suf}`) && ids.has(`el-${suf}`) && ids.has(`hd-${suf}`)) {
        groups.push({ sh: `sh-${suf}`, el: `el-${suf}`, hd: `hd-${suf}` });
      }
    }
    return makeArmBones(groups);
  }
  const rigBones = bonesOf(rigJoints);

  useEffect(() => {
    if (!rigMode) { setRigSrc(null); return; }
    let dead = false;
    const W = rigW;
    const H = rigH;
    const svgText = buildPageSvgRef.current(W, H, true);
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d");
      if (g && !dead) { g.drawImage(img, 0, 0, W, H); setRigSrc(c); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rigMode, page.id, rigW, rigH]);

  useEffect(() => {
    if (rigMode) return;   /* 骨钉模式下这层已经没了，别把缓存覆盖成空 */
    const el = stageRef.current?.querySelector("[data-shapes-svg]");
    if (el && el.innerHTML) { strokesCacheRef.current = el.innerHTML; STROKES_CACHE = el.innerHTML; }
  });

  useEffect(() => {
    if (!rigMode || !rigSrc) return;
    const out = rigCanvasRef.current;
    const g = out?.getContext("2d");
    if (!out || !g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, out.width, out.height);
    /* ★★ 一个关节都还没钉的时候：【原样把画铺上去，不做形变】。
       用户 2026-09-26：「我进入骨钉连接，我的画布不见了，只有一张纸」——
       根因就是这里：进来不给自动布点了，关节是空的，而形变函数拿到 0 个关节
       什么都不画 → 纸变成空白。没有关节 = 没有形变 = 应该就是原画。 */
    if (!(rigJoints || []).length) {
      g.drawImage(rigSrc, 0, 0, out.width, out.height);
      return;
    }
    const R = rigRadius && rigRadius > 0 ? rigRadius : defaultRadius(out.width, out.height);
    warpTo(g, rigSrc, out.width, out.height, rigJoints || [], bonesOf(rigJoints), R, 16, 32);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rigMode, rigSrc, rigJoints, rigRadius]);

  /* 拖关节：屏幕坐标 → 纸张局部坐标，报给上层 */
  function rigLocal(e: React.PointerEvent) {
    return screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
  }
  function onRigDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    rigDragRef.current = id;
    setRigDragId(id);
    try { (e.currentTarget as unknown as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 捕获失败不影响拖动 */ }
  }
  function onRigMove(e: React.PointerEvent) {
    const id = rigDragRef.current;
    if (!id) return;
    e.stopPropagation();
    const p = rigLocal(e);
    onRigJointMove?.(id, p.x, p.y);
  }
  function onRigUp(e: React.PointerEvent) {
    if (!rigDragRef.current) return;
    e.stopPropagation();
    rigDragRef.current = null;
    setRigDragId(null);
    try { (e.currentTarget as unknown as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 已经释放过就算了 */ }
  }

  const paperInner = rigMode ? (
    /* ── 骨钉模式下的纸 ────────────────────────────────────────
       骨钉是「把整张画面拍平再扯动」，所以这里不画原本那套 DOM 元素，
       改画一张【已被骨架形变的位图】。位图来自 buildPageSvg（导出用的同一套），
       所以画面内容和平时的渲染是一致的，只是变成了一张图。
       退出骨钉模式立刻换回原本那套，一行没动。 */
    <>
      <canvas
        ref={rigCanvasRef}
        width={rigW}
        height={rigH}
        data-rig-canvas
        style={{
          position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
          pointerEvents: "none",
        }}
      />
      {/* 关节把手层 */}
      <svg
        viewBox={`0 0 ${rigW} ${rigH}`}
        style={{
          position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
          zIndex: 300, touchAction: "none",
        }}
        onPointerMove={onRigMove}
        onPointerUp={onRigUp}
        onPointerCancel={onRigUp}
      >
        {/* ★ 关节定点图：还没钉的位置给一个淡淡的虚线圈（钉过就不再画） */}
        {(rigGuide || []).filter((gd) => !(rigJoints || []).some((j) => j.id === gd.id)).map((gd) => (
          <circle key={"guide-" + gd.id} cx={gd.x} cy={gd.y} r={11} fill="none"
            stroke="rgba(201,138,60,.5)" strokeWidth={1.5} strokeDasharray="3 5"
            style={{ pointerEvents: "none" }} />
        ))}
        {/* 骨架：4 根骨画成粗线，让人看清这是一副骨架 */}
        {rigBones.map((b) => {
          const A = (rigJoints || []).find((j) => j.id === b.a);
          const B = (rigJoints || []).find((j) => j.id === b.b);
          if (!A || !B) return null;
          return (
            <line key={b.id} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="rgba(122,90,52,.28)" strokeWidth={9} strokeLinecap="round"
              style={{ pointerEvents: "none" }} />
          );
        })}
        {(rigJoints || []).map((j) => (
          <g key={j.id} data-rig-handle={j.id}>
            {/* 钉住的位置（不动）—— 让人看见「关节从哪被拽走的」 */}
            <circle cx={j.sx} cy={j.sy} r={5} fill="none"
              stroke="rgba(122,90,52,.4)" strokeWidth={2}
              style={{ pointerEvents: "none" }} />
            {rigDragId === j.id && (
              <line x1={j.sx} y1={j.sy} x2={j.x} y2={j.y}
                stroke="rgba(122,90,52,.5)" strokeWidth={2} strokeDasharray="8 6"
                style={{ pointerEvents: "none" }} />
            )}
            <circle
              cx={j.x} cy={j.y} r={14}
              fill={rigDragId === j.id ? "#7a5a34" : "rgba(122,90,52,.85)"}
              stroke="#fffdfa" strokeWidth={3}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => onRigDown(e, j.id)}
            />
          </g>
        ))}
      </svg>
    </>
  ) : (
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
        data-shapes-svg
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
          /* ★ 只在"正拖着它整体走"这一下画这圈虚框。
             原来不管什么时候都画：一圈虚线 + 一行名字（「组合」/「卡片」/「贴签」…），
             于是画面上永远挂着字 —— 用户原话「莫名其妙 总是在屏幕上打字」。
             组合的含义是"这些是一个物体"，不是要在画面上立一块牌子。
             要看见它是谁：点它一下，那圈选框会出现。 */
          if (!isDragging) return null;
          return (
          <g key={u.id}>
            <rect
              x={u.bbox?.x ?? 0} y={u.bbox?.y ?? 0}
              width={u.bbox?.w ?? 0} height={u.bbox?.h ?? 0}
              fill="rgba(201,168,124,0.12)"
              stroke="rgba(201,168,124,0.9)"
              strokeWidth={2}
              strokeDasharray="4 3" rx={3}
              style={{ transition: "stroke .1s, fill .1s" }}
            />
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

  /* 画布实测尺寸：排开的缩放要按它算，所以必须在排开之前就拿到。
     首帧 ref 还没挂上 → 先用兜底值，挂上后 ResizeObserver 会立刻纠正。 */
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

  /* ★ 模板三种壳要用的「纸有多大」——
     没选规格的纸（paperW/paperH 是空的）铺满整个画布，壳也必须照样画。
     以前壳全挂在「纸宽>0 且 纸高>0」上，没规格的纸 → 电视机/漫画书册/连环画一个都不出来
     （用户 2026-09-26：「反正电视机漫画书还有连环画都没有」）。 */
  const 壳W = paper.w > 0 ? paper.w : (stageBox.w > 0 ? stageBox.w : 390);
  const 壳H = paper.h > 0 ? paper.h : (stageBox.h > 0 ? stageBox.h : 844);

  /* ── 模板的呈现层 · ⑦ 漫画书册 ＋ 翻页折角（手稿第五张中下 / 右下）
     定义【一处】，两种纸（选了规格的 / 没规格铺满全屏的）都用它 —— 不摆两套。
     · 漫画书册：一整页切成小格，3 格＝竖着三条，6 格＝两列三行
       （用户 2026-09-26：「可以按 3 格和 6 格来做」）。
       格与格之间留缝，缝里【盖住你的画】——盖的色就是纸色，
       所以看上去是画被切成了分镜，不是画上划了几道线。
     · 折角：手稿第五张「连环画右下角有翻页折角」。折角不是画着看的，
       点它才翻页（动作就是动作本身）。 */
  const 纸面呈现层 = (() => {
    const 书册层 = rigMode && rigTemplate === "book" ? (() => {
      const 缝 = 9;
      const 列 = rigCells === 3 ? 1 : 2, 行 = 3;
      const cw = (壳W - 缝 * (列 + 1)) / 列;
      const ch = (壳H - 缝 * (行 + 1)) / 行;
      const 格: { x: number; y: number; w: number; h: number }[] = [];
      for (let r = 0; r < 行; r++) for (let c = 0; c < 列; c++) {
        格.push({ x: 缝 + c * (cw + 缝), y: 缝 + r * (ch + 缝), w: cw, h: ch });
      }
      /* 外框一整张纸 + 每个格挖空，evenodd 一挖，剩下的正好是「缝」 */
      const d = `M0 0H${壳W}V${壳H}H0Z ` +
        格.map((g) => `M${g.x} ${g.y}H${g.x + g.w}V${g.y + g.h}H${g.x}Z`).join(" ");
      return (
        <svg
          data-rig-book
          viewBox={`0 0 ${壳W} ${壳H}`}
          style={{
            position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
            zIndex: 310, pointerEvents: "none",
          }}
        >
          <path d={d} fillRule="evenodd" fill={paperColor} />
          {格.map((g, i) => (
            <rect key={i} x={g.x} y={g.y} width={g.w} height={g.h}
              fill="none" stroke="rgba(58,53,46,.5)" strokeWidth={1.5} />
          ))}
        </svg>
      );
    })() : null;
    const 折角层 = rigMode && (rigTemplate === "book" || rigTemplate === "strip") ? (
      <div
        data-rig-fold
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onPointerUp={(e) => { e.stopPropagation(); onRigFlip?.(); }}
        style={{
          position: "absolute", right: 0, bottom: 0,
          width: 46, height: 46, zIndex: 320, cursor: "pointer",
          touchAction: "none",
        }}
      >
        {/* 折起来的那一页：一个三角，斜边上一道阴影 */}
        <div style={{
          position: "absolute", right: 0, bottom: 0,
          width: 40, height: 40,
          clipPath: "polygon(0% 100%, 100% 0%, 100% 100%)",
          background: "linear-gradient(315deg, #fffdfa 0%, #f3eee6 55%, #ddd5c8 100%)",
          filter: "drop-shadow(-2px -2px 3px rgba(58,53,46,.35))",
        }} />
      </div>
    ) : null;
    return 书册层 || 折角层 ? <>{书册层}{折角层}</> : null;
  })();
  /* ── 连接模式：把纸并排排开 ─────────────────────────────
     纸是竖的。竖着摞两张会顶出屏幕、又窄又长，看不出「左→右承接」的关系；
     并排反而省地方，横向关系也更像「这边点一下、那边接住」。 */
  /* ══ ★ 连接模式【不再动任何纸张的位置】═══════════════════════════════
     这里原来有一整套"排开"：算格子、按角色排序（起点纸钉到最左）、把当前纸搬进槽位。
     用户实测报的「主页莫名其妙跑到右边」「连接完位置全跑丢」就是它；
     更糟的是这套排序同时喂给渲染、命中换算、连线端点、提示标签 —— 改一处动五处。
     按用户定的边界（2026-09-26）：
       · 创作画布是页面位置的**唯一**管理者，连接功能无权移动/交换/重算纸张位置
       · 连接模式只负责：选对象、选目标、画连接线、记关系
       · 连接线按纸张的**真实位置**计算，不靠重排纸张来定端点
     所以现在纸就待在用户摆的地方不动，连线按真实坐标画。 */

  /* 命中测试（screenToPaperLocal）读 paperStateRef —— 平时就是这张纸的真实坐标；
     演示时改成"固定视口"的那一份（见下），否则演示里点不中对象。 */
  /* ★ 演示：固定视口，一次一页 —— 只按【屏幕大小】算比例，纸张本身不改尺寸。
     用户 2026-09-26：「规格里面的纸都要按照真实的尺寸去做，对标」——
     所以【绝不为了躲 UI 去缩纸】（我一度按"舞台减工具栏"算，把 390 的纸缩成 338，
     被当场叫停）。纸张的真实坐标 / 尺寸一个字节都不写。 */
  const demoScale = (() => {
    if (!demoOn) return 1;
    if (paper.w > 0 && paper.h > 0) {
      const sw = stageBox.w > 0 ? stageBox.w : 390;
      const sh = stageBox.h > 0 ? stageBox.h : 844;
      return Math.min(sw / paper.w, sh / paper.h);
    }
    return 1;   /* 没设规格时纸本来就铺满屏幕 */
  })();
  /* 命中换算读的就是这一份：演示走固定视口；平时是"纸张坐标 × 视野"。
     ★ 拖动位移的换算也走它（除以 scale），所以视野缩放下拖东西依然跟手。 */
  paperStateRef.current = demoOn
    ? { ...paper, x: 0, y: 0, scale: demoScale, rotate: 0 }
    : rigMode
      ? { ...paper, x: paper.x * (rigView?.k ?? 1) + (rigView?.vx ?? 0), y: paper.y * (rigView?.k ?? 1) + (rigView?.vy ?? 0), scale: paper.scale * (rigView?.k ?? 1) }
      : { ...paper };

  /* 连接过程中，点"别的纸"＝确定承接页面（上层只在需要时传 onPaperPick） */
  const papersPickable = !!onPaperPick;
  papersPickableRef.current = papersPickable;
  /* 演示 = 固定视口，一屏一页：当前页摆正在屏幕中央，不按它自己存的偏移画。
     ★ 只改"怎么看"，绝不写回页面保存的位置和尺寸。 */
  /* ★ 无限画布：【镜头】必须同时作用在"画"和"算"两边。
     以前只写进了命中换算（paperStateRef / paperDisplay），渲染层完全没用它 ——
     所以加页或双指之后，画面纹丝不动，但手指的落点已经按另一个坐标系在算了：
     实测「加页前拖 100×100 → 框 100×100」，「加页后同样拖 100×100 → 框 200×400、起点跑到 (0,0)」，
     纸还被推到屏幕外 (x=450)。这就是用户报的"纸卡的死死的动不了"。
     镜头口径 = 以【舞台中心】为原点：纸心 = 舞台中心 + 纸坐标 × k + 平移。
     和 paperDisplay / screenToPaperLocal 用的是同一个口径，所以两边严格对齐。 */
  const rk = rigView?.k ?? 1, rvx = rigView?.vx ?? 0, rvy = rigView?.vy ?? 0;
  const mainPaperTransform = demoOn
    ? `translate(0px, 0px) scale(${demoScale}) rotate(0deg)`
    : rigMode
      ? `translate(${paper.x * rk + rvx}px, ${paper.y * rk + rvy}px) scale(${paper.scale * rk}) rotate(${paper.rotate}deg)`
      : `translate(${paper.x}px, ${paper.y}px) scale(${paper.scale}) rotate(${paper.rotate}deg)`;

  /* ── 连接线：闭环的可见证据 ─────────────────────────────
     连接不是一条记录，是一条看得见的线：起点对象 → 延伸物那张纸 → 延伸物里的对象 → 回到起点。
     两端元素中心都换算到画布坐标，所以在排开模式下两张纸之间的线是真实可画、可看的。 */

  /** 元素在纸张局部坐标里的包围盒（任意页面，不只是当前页） */
  function elemBoxIn(pg: Page, type: string, id: string) {
    if (type === "note")  { const n = (pg.notes || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "image") { const n = (pg.images || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "table") { const n = (pg.tables || []).find((x) => x.id === id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "link")  { const n = (pg.links || []).find((x) => x.id === id);  return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
    if (type === "shape") {
      const n = (pg.shapes || []).find((x) => x.id === id);
      /* 自由笔迹的 x1..y2 只覆盖起笔那一小段，真范围在 points 里 —— 一律走 shapeLocalBox */
      return n ? shapeLocalBox(n) : null;
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

  /** 某张纸此刻显示在画布上的位置与缩放 —— 就是它自己的真实坐标（不再有"排开值"）。
      演示模式下当前这一张按固定视口显示，换算跟着走，否则演示里点不中。 */
  function paperDisplay(pgId: string) {
    if (demoOn && pgId === page.id) return { tx: 0, ty: 0, s: demoScale };
    const tr = (allPages || []).find((x) => x.id === pgId)?.transform || { x: 0, y: 0, scale: 1 };
    return { tx: tr.x, ty: tr.y, s: tr.scale };
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

  /** 某个元素在画布上的方框（不是中心点，是整块）—— 画选框用 */
  function elemRectOnStage(pgId: string, type: string, id: string) {
    const pg = (allPages || []).find((x) => x.id === pgId);
    if (!pg || !type || !id) return null;
    const d = paperDisplay(pgId);
    if (!d) return null;
    const b = elemBoxIn(pg, type, id);
    if (!b) return null;
    const pw = pg.paperW && pg.paperW > 0 ? pg.paperW : 390;
    const ph = pg.paperH && pg.paperH > 0 ? pg.paperH : 844;
    return {
      x: stageBox.w / 2 + d.tx + (b.x - pw / 2) * d.s,
      y: stageBox.h / 2 + d.ty + (b.y - ph / 2) * d.s,
      w: b.w * d.s,
      h: b.h * d.s,
    };
  }

  /* ★ 旋转把手：选中一个形状 → 它包围盒的角上出现一个把手 → 手指拖着转。
     转轴 = 包围盒中心（和渲染用的轴是同一个），所以转的时候中心不动。
     把手位置要【跟着形状一起转】—— 否则形状转了把手还杵在原地，手感是断的。 */
  const rotDragRef = useRef<{ id: string; cx: number; cy: number; start: number; base: number } | null>(null);

  function stageLocal(e: React.PointerEvent) {
    const sr = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (sr?.left || 0), y: e.clientY - (sr?.top || 0) };
  }

  const rotHandle = (() => {
    if (isDrawing || selectedEl?.type !== "shape") return null;
    const shp = (page.shapes || []).find((s) => s.id === selectedEl.id);
    const r = elemRectOnStage(page.id, "shape", selectedEl.id);
    if (!shp || !r || r.w + r.h <= 0) return null;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const a = ((shp.rot || 0) * Math.PI) / 180;
    const ox = r.w / 2;
    const oy = -r.h / 2;                       // 没转时的「右上角」相对中心
    const rx = ox * Math.cos(a) - oy * Math.sin(a);
    const ry = ox * Math.sin(a) + oy * Math.cos(a);
    const len = Math.hypot(rx, ry) || 1;
    const k = (len + 28) / len;                // 再推出去 28px，别压在形状上
    return { cx, cy, hx: cx + rx * k, hy: cy + ry * k, deg: Math.round(shp.rot || 0) };
  })();

  function rotDown(e: React.PointerEvent) {
    if (!rotHandle) return;
    e.stopPropagation();
    const p = stageLocal(e);
    rotDragRef.current = {
      id: selectedEl?.id || "",
      cx: rotHandle.cx, cy: rotHandle.cy,
      start: Math.atan2(p.y - rotHandle.cy, p.x - rotHandle.cx),
      base: rotHandle.deg,
    };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }
  function rotMove(e: React.PointerEvent) {
    const d = rotDragRef.current;
    if (!d) return;
    const p = stageLocal(e);
    const now = Math.atan2(p.y - d.cy, p.x - d.cx);
    let deg = d.base + ((now - d.start) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    onUpdate({ shapes: (page.shapes || []).map((s) => (s.id === d.id ? { ...s, rot: Math.round(deg) } : s)) });
  }
  function rotUp(e: React.PointerEvent) {
    if (!rotDragRef.current) return;
    rotDragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  /* ★ 点中一条连接线 → 弹出这个小条，问要不要删掉它。
     连接以前只能加不能删（唯一写入口在父组件"闭环那一步"），
     上次测试的连接一直堆在文档里、点不了也删不掉，新的测试没法做。 */

  /** 这个对象身上的连接（长按菜单里列出来，逐条删） */
  const connsOfElement = (() => {
    const hitEl = (ctxMenu as any)?.hitEl as { type: string; id: string } | undefined;
    if (!hitEl?.id) return [] as { id: string; label: string }[];
    const pageName = (pid: string) => (allPages || []).find((p) => p.id === pid)?.title || "另一张";
    return (interactions || [])
      .filter((x) => x.fromElementId === hitEl.id || x.toElementId === hitEl.id)
      .map((x) => ({
        id: x.id,
        label: x.fromElementId === hitEl.id ? `连去「${pageName(x.toPageId)}」` : `来自「${pageName(x.fromPageId)}」`,
      }));
  })();

  /* ══ ★ 连接可视化（只在连接编辑状态显示）═══════════════════════════════
     用户 2026-09-26：普通创作状态【不显示】连接线；进「页 → 连接 → 手机模式」
     才显示完整连接关系。演示态也不显示（演示只管跑跳转）。
     ⚠️ 全部只读文档里的连接记录 + 纸张真实坐标来画，绝不摆位、绝不猜端点。 */
  const connView = !!connectViewOn && !demoOn && stageBox.w > 0;

  /** 某张纸此刻在画布上的矩形（线头要停在纸边上，所以需要整块，不只是中心） */
  function paperRectOnStage(pgId: string) {
    const pg = (allPages || []).find((x) => x.id === pgId);
    if (!pg) return null;
    const d = paperDisplay(pgId);
    if (!d) return null;
    const pw = pg.paperW && pg.paperW > 0 ? pg.paperW : 390;
    const ph = pg.paperH && pg.paperH > 0 ? pg.paperH : 844;
    const w = pw * d.s, h = ph * d.s;
    const cx = stageBox.w / 2 + d.tx, cy = stageBox.h / 2 + d.ty;
    return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
  }

  /** 从 a 朝这张纸的中心走，落在纸【边框】上的那个点。
      去程/返程的终点是「承接页面 / 原页面」本身，所以线头停在纸边上，不扎进纸里。
      纯几何求交，不看画面上谁离得近 —— 端点只由记录里的 id 决定。 */
  function paperEdgeToward(pgId: string, a: { x: number; y: number } | null) {
    if (!a) return null;
    const r = paperRectOnStage(pgId);
    if (!r) return null;
    /* 从纸心朝 a 的方向射出去，撞到纸框的那个点 = 线头要停的地方。
       ★ 这里第一版写错过：拿「纸半宽 / a到纸心的横向距离」当比例去缩 a→纸心 的向量，
         算出来停在离纸边还差十几像素的地方（实测端点落到了【起点那张纸】的边上）。
         正确做法是【从纸心往外走】：先求方向单位向量，再按半宽/半高反推撞框的距离。 */
    const dx = a.x - r.cx, dy = a.y - r.cy;
    const D = Math.hypot(dx, dy);
    if (D < 1e-6) return { x: r.cx, y: r.cy };
    const ux = dx / D, uy = dy / D;
    const hw = r.w / 2, hh = r.h / 2;
    const sx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
    const sy = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
    const s = Math.min(sx, sy);
    if (!Number.isFinite(s)) return { x: r.cx, y: r.cy };
    /* a 落在纸里面（纸叠在一起了）→ 没有"边"可停，线头就停在 a 上 */
    if (D <= s) return { x: a.x, y: a.y };
    return { x: r.cx + ux * s, y: r.cy + uy * s };
  }

  /* ★ 连接选框 —— 起点对象、返程对象【一直亮着】。
     以前只画"正在搭的那一份草稿"的框：刷新/重开 App 后草稿是空的，框全灭。
     现在改成读【已存进文档的连接记录】，所以刷新后照样在。
     用户要求：「起点对象和返程对象持续高亮」。 */
  const connMarks = (() => {
    type Mark = { id: string; x: number; y: number; w: number; h: number; now: boolean };
    if (!connView) return [] as Mark[];
    const out: Mark[] = [];
    const push = (key: string, pgId?: string, type?: string, id?: string, now = false) => {
      if (!pgId || !id) return;
      const r = elemRectOnStage(pgId, type || "note", id);
      if (r) out.push({ id: key, ...r, now });
    };
    (interactions || []).forEach((ix) => {
      push("s-" + ix.id, ix.fromPageId, ix.fromElementType, ix.fromElementId);
      push("t-" + ix.id, ix.toPageId, ix.toElementType, ix.toElementId);
    });
    /* 正在搭的这条：两个框更亮，一眼看出"当前操作的是它" */
    push("draft-from", connectDraft?.fromPageId, connectDraft?.fromElementType, connectDraft?.fromElementId, true);
    push("draft-to", connectDraft?.toPageId, connectDraft?.toElementType, connectDraft?.toElementId, true);
    return out;
  })();

  /** ★ 双向路线：每一组完整连接画【两条有方向的线】
      ① 去程：起点对象 → 承接页面（实线，箭头指承接页）
      ② 返程：承接页面里指定的返程对象 → 原页面（虚线，箭头指原页）
      用户：「去程和返程同时显示，分别使用实线和虚线，并显示方向箭头」
      「保留已有连接数据，不能根据画面上看起来最近的对象猜测端点」。 */
  const connLines = (() => {
    type Line = { id: string; d: string; arrow: string; back: boolean; now: boolean };
    if (!connView) return [] as Line[];
    const seg = (id: string, a: { x: number; y: number } | null, b: { x: number; y: number } | null, back: boolean, now: boolean) => {
      if (!a || !b) return null;
      const dy = (b.y - a.y) * 0.45;
      const c1 = { x: a.x, y: a.y + dy };
      const c2 = { x: b.x, y: b.y - dy };
      /* 箭头按曲线【末端切线】定向（末控制点 → 终点），才不会跟线脱节 */
      let ux = b.x - c2.x, uy = b.y - c2.y;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len; uy /= len;
      const px = -uy, py = ux;
      const L = 13, W = 5.5;
      const bx = b.x - ux * L, by = b.y - uy * L;
      const arrow = `${b.x},${b.y} ${bx + px * W},${by + py * W} ${bx - px * W},${by - py * W}`;
      return { id, back, now, arrow, d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}` };
    };
    const out: Line[] = [];
    /* ① 已存进文档的闭环：去程 + 返程，两条 */
    (interactions || []).forEach((ix) => {
      const 起点 = elemCenterOnStage(ix.fromPageId, ix.fromElementType || "note", ix.fromElementId);
      const 返程对象 = elemCenterOnStage(ix.toPageId, ix.toElementType || "note", ix.toElementId);
      /* 去程终点 = 承接纸的边框点（朝起点方向那一侧） */
      const go = seg("go-" + ix.id, 起点, paperEdgeToward(ix.toPageId, 起点), false, false);
      if (go) out.push(go);
      /* 返程终点 = 原纸的边框点（朝返程对象方向那一侧） */
      const bk = seg("bk-" + ix.id, 返程对象, paperEdgeToward(ix.fromPageId, 返程对象), true, false);
      if (bk) out.push(bk);
    });
    /* ② 正在搭的这条：起点 → 承接纸（还没选返程对象时先搭到纸的中心） */
    if (connectDraft?.fromPageId && connectDraft?.fromElementId) {
      const a = elemCenterOnStage(connectDraft.fromPageId, connectDraft.fromElementType || "note", connectDraft.fromElementId);
      const c = connectDraft.toPageId && connectDraft.toElementId
        ? elemCenterOnStage(connectDraft.toPageId, connectDraft.toElementType || "note", connectDraft.toElementId)
        : null;
      const toPageId = connectDraft.toPageId;
      const d2 = toPageId ? paperDisplay(toPageId) : null;
      const pb = d2 ? { x: stageBox.w / 2 + d2.tx, y: stageBox.h / 2 + d2.ty } : null;
      const s1 = seg("draft-go", a, c || pb, false, true);
      if (s1) out.push(s1);
      if (connectDone) {
        const back = seg("draft-bk", c || pb, a, true, true);
        if (back) out.push(back);
      }
    }
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
      {/* ★ 连接线 = 纯显示层。用户 2026-09-26：「所有连接线只负责显示，不得拦截触摸操作」
          —— 所以这一层整体 pointerEvents:none，线上没有任何可点区
          （原来那条 26px 的隐形点击带已删除，连带它的"点线删"弹窗一起删）。
          去程【实线】箭头指承接页；返程【虚线】箭头指原页，一眼分得清哪条去、哪条回。 */}
      {connLines.length > 0 && (
        <svg data-conn-lines style={{
          position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 8, overflow: "visible",
        }}>
          {connLines.map((L) => {
            /* 有草稿在搭时，已存的那些【适当弱化】，当前这条突出（用户要求三.3） */
            const dim = !L.now && connLines.some((x) => x.now);
            const op = dim ? 0.3 : (L.back ? 0.85 : 1);
            const col = `rgba(122,90,52,${(L.back ? 0.55 : 0.92) * op})`;
            return (
              <g key={L.id} opacity={dim ? 0.45 : 1}>
                <path
                  d={L.d}
                  fill="none"
                  stroke={col}
                  strokeWidth={L.now ? 2.8 : (L.back ? 2 : 2.4)}
                  strokeLinecap="round"
                  strokeDasharray={L.back ? "7 6" : undefined}
                />
                <polygon points={L.arrow} fill={col} />
              </g>
            );
          })}
        </svg>
      )}

      {/* ★ 连接选框：起点对象、返程对象【一直亮着】（读已存记录，刷新后照样在）。
          「多条连接存在时，当前操作的连接应清晰突出」——正在搭的那条更粗更亮。 */}
      {connMarks.length > 0 && (
        <div data-conn-marks style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9 }}>
          {connMarks.map((m) => (
            <div key={m.id} style={{
              position: "absolute",
              /* ★ 1:1 贴边：不再往外让 4px（用户：「太大了…要 1:1」） */
              left: m.x, top: m.y, width: m.w, height: m.h,
              boxSizing: "border-box",
              border: m.now ? "2.5px solid rgba(122,90,52,.98)" : "2px solid rgba(122,90,52,.7)",
              borderRadius: 5,
              background: m.now ? "rgba(122,90,52,.12)" : "rgba(122,90,52,.06)",
              boxShadow: m.now ? "0 0 0 4px rgba(122,90,52,.18)" : "none",
              transition: "border-color .18s ease-out, background .18s ease-out",
            }} />
          ))}
        </div>
      )}
      {/* ★ 旋转把手：选中一个形状 → 它角上出现这个圆点 → 拖着转。
          两个 div 分开：把手要收手势（可点），那根虚线只能看（不挡手势）。 */}
      {rotHandle && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 11 }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            <line x1={rotHandle.cx} y1={rotHandle.cy} x2={rotHandle.hx} y2={rotHandle.hy}
              stroke="rgba(59,130,246,.5)" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={rotHandle.cx} cy={rotHandle.cy} r={3} fill="rgba(59,130,246,.8)" />
          </svg>
        </div>
      )}
      {rotHandle && (
        <div
          data-rot-handle
          onPointerDown={rotDown}
          onPointerMove={rotMove}
          onPointerUp={rotUp}
          onPointerCancel={rotUp}
          style={{
            position: "absolute",
            left: rotHandle.hx - 22, top: rotHandle.hy - 22,
            width: 44, height: 44, borderRadius: 999,   /* 44 = 手指够得着的下限 */
            background: "rgba(255,253,250,.96)",
            border: "2px solid #3b82f6",
            boxShadow: "0 2px 10px rgba(0,0,0,.18)",
            cursor: "grab", touchAction: "none", zIndex: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, color: "#3b82f6", userSelect: "none",
          }}
        >↻</div>
      )}
      {/* ★ 这里原来画了一个系统返回键（画布左上角的 ◀）—— 已删除。
          用户返工单第 5 条：「返程对象由创作者指定，不能擅自生成脱离纸张的返回按钮」；
          用户截图原话：「返回键也不是从页面返回了，直接从手机外面返回了」。
          返程现在只能靠【创作者在页面里画的那个对象】执行（见 pointerup 里的返程反查）。 */}

      {/* ★ 其他纸什么时候画：**创作时都画**（纸要看得见、点得到 ——「我纸呢？」），
          **演示时只画当前这一张**（固定视口，一屏一页）。
         判据只有一个：是不是在演示模式。不再拿"闭环没闭环""跳没跳过"当开关。 */}
      {/* ★★ 放大镜 —— 用户拿着骨钉在画布上滑的时候跟着手指。
          用户 2026-09-26：「它的手滑到哪，那就有个放大镜放大各个局部，让它更好的钉住」。
          用的是骨钉模式本来就有的那张页面位图（rigSrc），直接 drawImage 放大，
          不重拍、不复制 DOM，所以不花钱。 */}
      {rigMode && rigHolding && rigHover && rigSrc && (() => {
        const R = 62, K = 2.4;
        const lp = screenToPaperLocal(rigHover.x, rigHover.y, stageRef.current, paperStateRef.current);
        if (!lp.inside) return null;
        const span = (2 * R) / K;
        return (
          <div data-rig-lens style={{
            position: "fixed", left: rigHover.x - R, top: rigHover.y - R - 118,
            width: 2 * R, height: 2 * R, borderRadius: "50%", overflow: "hidden",
            zIndex: 3002, pointerEvents: "none",
            border: "2px solid rgba(201,138,60,.95)",
            boxShadow: "0 8px 24px rgba(0,0,0,.35)", background: "#fffdfa",
          }}>
            <RigLens src={rigSrc} lx={lp.x} ly={lp.y} size={2 * R} span={span} />
            {/* 十字准星：钉在哪一点，看这个交点 */}
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 14, height: 14, pointerEvents: "none",
            }}>
              <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(201,138,60,.85)" }} />
              <div style={{ position: "absolute", top: "50%", left: 0, height: 1, width: "100%", background: "rgba(201,138,60,.85)" }} />
            </div>
          </div>
        );
      })()}

      {/* ★ 骨钉模式：10 张叠放，**只画当前这一张**（第一层）。
          用户 2026-09-26：「十张页面在画布上时，不可以显示多层画布，只显示第一层画布」——
          其余 9 张是叠在同一个位置的副本，画出来就是一堆重影。 */}
      {!demoOn && !rigMode && otherPages.map((p, i) => {
        const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        const isSelected = selectedPageIds.has(p.id);
        const hasSize = !!(p.paperW && p.paperH && p.paperW > 0 && p.paperH > 0);
        const innerChildren = renderPageContent(p);
        const boxShadow = isSelected
          ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
          : "0 4px 24px rgba(0,0,0,.1)";
        /* 其他纸也按各自的真实坐标画（不再有排开值），并且和当前纸一样吃【镜头】 ——
           否则一拉远镜头，当前纸缩小了、别的纸还是原大小，位置全对不上。 */
        const d = paperDisplay(p.id) || { tx: tr.x, ty: tr.y, s: tr.scale };
        const transform = `translate(${d.tx}px, ${d.ty}px) scale(${d.s}) rotate(${tr.rotate}deg)`;
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
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: undefined }}
          >
            <div
              style={style}
              onClick={papersPickable ? (ev: React.MouseEvent) => {
                /* ★★ 连接模式：「点谁就是谁」，不许有任何阻碍。
                   用户 2026-09-26：「进入连接页面，没有任何阻碍去妨碍用户随意挑选点击；
                   用户点击谁就是谁，点击谁就是连接的开头」「不允许出现左边点不了右边点，
                   而是都可以点，只要用户点，你就记住路线」。
                   原来这一下只交给"选页面"，于是【不是当前纸】那张纸上的对象永远点不中
                   （实测：点当前纸上的对象 高亮框 1；点别的纸上的对象 高亮框 0 —— 完全失灵）。
                   现在先在这张纸的坐标系里命中对象：命中就按"点对象"走，
                   没命中才按"点这张纸"走。 */
                if (connectPicking) {
                  const hit = hitElementOnPage(p, ev.clientX, ev.clientY);
                  if (hit) { onConnectPickObjectRef.current?.(hit, p.id); return; }
                }
                onPaperPick?.(p.id);
              } : undefined}
            >{innerChildren}</div>
            {/* ★ 这里原来挂着一个「点这张纸」的虚线标签 —— 用户原话
                「系统却不停提示你点这张纸、点那张纸」「系统不断出现《点这张纸》等提示，
                 反而限制了你的操作」，已删除。用户自己决定点哪个页面。 */}
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

      {/* ── 模板的呈现层 · ⑦ 漫画书册 ＋ 翻页折角（手稿第五张中下 / 右下）
          定义【一处】，两种纸（有规格的 / 没规格铺满全屏的）都用它 —— 不摆两套。
          · 漫画书册：一整页切成小格，3 格＝竖着三条，6 格＝两列三行
            （用户 2026-09-26：「可以按 3 格和 6 格来做」）。
            格与格之间留缝，缝里【盖住你的画】——盖的色就是纸色，
            所以看上去是画被切成了分镜，不是画上划了几道线。
          · 折角：手稿第五张「连环画右下角有翻页折角」。折角不是画着看的，
            点它才翻页（动作就是动作本身）。 */}
      {/* ── 模板的呈现层 · ⑧ 电视机（手稿第五张左下角）──────────────
          一个框，里面装着你的画：外圈是电视机身，纸就是【屏幕】。
          纸的尺寸一点没动（300×600 原样），机身在纸外面一圈，所以钉骨钉照样看得见。
          黑白/彩色还是走原来那个 rigMono（纸上的 grayscale），这里不重复一套。
          只在骨钉空间里画，普通创作/连接/演示一律不渲染。 */}
      {rigMode && rigTemplate === "anim" && 壳W > 0 && 壳H > 0 && (() => {
        const 侧 = 24, 上 = 24, 下 = 46;   /* 机身边框：下面厚一点，放旋钮和指示灯 */
        const W2 = 壳W + 侧 * 2, H2 = 壳H + 上 + 下;
        const 圆角矩形 = (x: number, y: number, w: number, h: number, r: number) =>
          `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
          `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
          `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
        /* ★ 机身画在纸【上面】的一圈（中间是透的），不是埋在纸底下一坨实体。
           埋在底下的话：没选规格的纸铺满整屏，机身全被挤到屏幕外，等于白画
           （实测截图 r26，只有左边一丝）。画成圈以后纸多大都看得见。
           两种纸共用这一套，不摆两套。 */
        return (
          <svg
            data-rig-tv
            viewBox={`0 0 ${W2} ${H2}`}
            style={{
              position: "absolute", left: "50%", top: "50%",
              width: W2, height: H2,
              marginLeft: -W2 / 2, marginTop: -(壳H / 2 + 上),
              transform: mainPaperTransform,
              /* ★ 缩放/旋转要绕着【纸心】转，不是绕着机身中心 ——
                 机身下面厚，中心比纸心低，绕机身中心转纸会往下滑。 */
              transformOrigin: `${壳W / 2 + 侧}px ${壳H / 2 + 上}px`,
              pointerEvents: "none", zIndex: 6,
            }}
          >
            <defs>
              <linearGradient id="rigTvBody" x1="0" y1="0" x2="0.85" y2="1">
                <stop offset="0%" stopColor="#5c5349" />
                <stop offset="55%" stopColor="#35302a" />
                <stop offset="100%" stopColor="#26221f" />
              </linearGradient>
              <radialGradient id="rigTvKnob" cx="0.35" cy="0.3" r="0.75">
                <stop offset="0%" stopColor="#e6bc78" />
                <stop offset="72%" stopColor="#a4703a" />
              </radialGradient>
            </defs>
            {/* 机身＝外圆角矩形挖掉内圆角矩形（evenodd），剩下的正好是一圈边框 */}
            <path
              fillRule="evenodd"
              fill="url(#rigTvBody)"
              d={圆角矩形(0, 0, W2, H2, 26) + " " + 圆角矩形(侧, 上, 壳W, 壳H, 14)}
            />
            {/* 屏幕那圈凹槽：贴着纸边一道黑，纸就是屏幕 */}
            <rect x={侧 - 5} y={上 - 5} width={壳W + 10} height={壳H + 10} rx={16}
              fill="none" stroke="#14110f" strokeWidth={10} />
            {/* 旋钮（手稿上画在右下角） */}
            <circle cx={W2 - 侧 - 9} cy={上 + 壳H + 下 / 2} r={9} fill="url(#rigTvKnob)" />
            {/* 指示灯（左下角，绿的） */}
            <circle cx={侧 + 5} cy={上 + 壳H + 下 / 2} r={4} fill="#6fbf73" />
          </svg>
        );
      })()}

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
            filter: rigMode && rigMono ? "grayscale(1)" : undefined,
            boxShadow: mainPaperSelected
              ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
              : "0 4px 24px rgba(0,0,0,.1)",
            overflow: "hidden",
            touchAction: "none",
            WebkitTouchCallout: "none" as any,
          }}
        >
          {paperInner}
          {纸面呈现层}
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
          {纸面呈现层}
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
            {ctxMenu.sub === "font" ? (
              /* ★ 字体：从原来那个独立小面板搬进来的（大 / 中 / 小）。
                 作用对象 = 这次长按的那一块文字。 */
              <>
                <CtxItem label="← 返回" onClick={() => setCtxMenu({ ...ctxMenu, sub: undefined })} />
                <div style={{ height: 1, background: "rgba(74,70,63,.08)", margin: "4px 8px" }} />
                {[{ label: "大", size: 28 }, { label: "中", size: 16 }, { label: "小", size: 12 }].map((f) => (
                  <CtxItem key={f.label} label={f.label}
                    onClick={() => {
                      const id = ctxMenu.hitEl?.id;
                      setCtxMenu(null);
                      if (id) updateText(id, { fontSize: f.size });
                    }} />
                ))}
              </>
            ) : ctxMenu.sub === "edit" ? (
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
                {/* ★ 字体：只在长按【文字】时出现 —— 字体属于"有内容的地方"，
                    所以它只能挂在长弹窗里，不许再单独弹一个小面板。
                    用户 2026-09-26：「点击字体的时候会出现一个关于字体的弹窗，
                    把这个字体的弹窗移到长弹窗里，字体同属于有内容的区域，不准再出现」。 */}
                {ctxMenu.hitEl?.type === "text" && (
                  <CtxItem label="字体 →" onClick={() => setCtxMenu({ ...ctxMenu, sub: "font" })} />
                )}
                <CtxItem label="排列 →" onClick={() => setCtxMenu({ ...ctxMenu, sub: "align" })} />
                <CtxItem label="组合" onClick={() => { setCtxMenu(null); handleSheetAction("box-compose"); }} />
                <CtxItem label="编辑 →" onClick={() => setCtxMenu({ ...ctxMenu, sub: "edit" })} />
                {/* ★ 连接入口：长按对象 → 点这里 → 连接模式开启（不开抽屉，
                    画布上直接做四步闭环）。替换掉原来的「连接(接着)」。 */}
                <CtxItem label="连接" onClick={() => { setCtxMenu(null); onStartConnect?.(ctxMenu.hitEl || { type: "", id: "" }); }} />
                {/* ★ 它身上的连接：列出来，点「删」就删掉那一条。
                    连接以前只能加不能删，旧的一直堆着 —— 这是删的第二条入口。 */}
                {connsOfElement.length > 0 && (
                  <>
                    <div style={{ height: 1, background: "rgba(74,70,63,.08)", margin: "4px 8px" }} />
                    <div style={{ padding: "2px 10px 4px", fontSize: 10.5, color: "#a49a8f" }}>
                      它身上的连接（{connsOfElement.length} 条）
                    </div>
                    {connsOfElement.map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 6px 1px 10px" }}>
                        <span style={{ flex: 1, fontSize: 11.5, color: "#57524c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setCtxMenu(null); onDeleteInteraction?.(c.id); }}
                          style={{ flex: "none", border: 0, borderRadius: 7, padding: "3px 9px", background: "rgba(192,57,43,.1)", color: "#c0392b", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                        >删</button>
                      </div>
                    ))}
                  </>
                )}
                <CtxItem label="删除" danger onClick={() => { setCtxMenu(null); deleteSelection(); clearBox(); }} />
              </>
            )}
          </div>
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
/** 骨钉放大镜的画布：把页面位图的一小块放大填满整个镜片。
    纯 drawImage，不重拍位图、不复制 DOM。 */
function RigLens({ src, lx, ly, size, span }: { src: HTMLCanvasElement; lx: number; ly: number; size: number; span: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, size, size);
    g.imageSmoothingEnabled = false;   /* 放大时看清笔画的边 */
    try {
      g.drawImage(src, lx - span / 2, ly - span / 2, span, span, 0, 0, size, size);
    } catch { /* 位图还没准备好，这一帧先不画 */ }
  });
  return <canvas ref={ref} width={size} height={size} style={{ display: "block" }} />;
}
