// name=src/types/document.ts
/*
 * 图层顺序（z）
 *
 * 六类元素原先靠「渲染顺序」固定叠放：文字 → 图片 → 便签 → 表格 → 链接 → 笔迹，
 * 用户无法调整，长按菜单里的「置顶 / 移上一下」只对笔迹生效。
 *
 * 现在每类元素都可带 z：
 *   · 未设置时按类型取默认值（DEFAULT_Z，见 Editor），与旧观感一致
 *   · 数值大的盖在数值小的上面
 *   · 笔迹整体在一个 <svg> 里，共用同一个层级；笔迹之间的顺序仍由数组次序决定
 */
export type TextNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  layer: "background" | "paper";
  fontFamily?: string;
  /** 图层顺序（缺省按类型默认值） */
  z?: number;
};

export type ImageNode = {
  id: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  layer: "background" | "paper";
  z?: number;
};

export type NoteNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bgColor: string;
  textColor: string;
  fontSize: number;
  layer: "background" | "paper";
  rotate?: number;
  z?: number;
};

export type TableNode = {
  id: string;
  rows: number;
  cols: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cells: string[][];
  layer: "background" | "paper";
  rotate?: number;
  z?: number;
};

export type LinkNode = {
  id: string;
  url: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: "background" | "paper";
  rotate?: number;
  z?: number;
};

export type ShapeKind =
  | "crayon" | "free" | "sketch" | "marker" | "pencil" | "ink" | "handwrite"
  | "line" | "arrow" | "rect" | "circle" | "triangle"
  | "heart" | "star" | "speech" | "cloud"
  | "eraser"
  | "redpen" | "highlight" | "brush";

export type ShapeNode = {
  id: string;
  kind: ShapeKind;
  layer: "background" | "paper";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points?: { x: number; y: number }[];
  pressures?: number[];
  color: string;
  strokeWidth: number;
  opacity?: number;
  fill?: string;
  /** 笔刷手感参数（perfect-freehand）。缺省时 renderShape 用内置默认值。 */
  size?: number;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  easing?: (t: number) => number;
  startTaper?: number;
  startCap?: boolean;
  endTaper?: number;
  endCap?: boolean;
  /** 实心填充自由笔迹（true 时 fill 用笔色，画成实心色块） */
  solid?: boolean;
  simulatePressure?: boolean;
};

export type PaperTransform = { x: number; y: number; scale: number; rotate: number };
export type Group = { id: string; memberIds: string[]; pageIds?: string[]; createdAt: number };

/* ===== 第 2 层：创作单元（组合产物）=====
   智能合成的输出对象。不是简单名单，是有身份的新对象：
   可命名、可整体移动、可再次参与连接/播放。
   全部字段（除 id/kind/memberIds/createdAt）可省，老数据自动兼容。 */
export type UnitKind = "card" | "label" | "sticky" | "zone";

export type Unit = {
  id: string;
  /** 合成形态（4 种真实差异，非模板） */
  kind: UnitKind;
  /** 成员元素（引用 page.texts/images/shapes/notes/tables/links 的 id） */
  memberIds: string[];
  /** 可命名（卡片/场景…），缺省按 kind 显示 */
  name?: string;
  /** 排版方式：row=横排（图左文右）、col=竖排（图上文下）、center=文字居图下 */
  layout?: { pattern: "row" | "col" | "center"; spacing?: number };
  /** 包围盒（纸张局部坐标）：由成员计算，整体移动时作为参考 */
  bbox?: { x: number; y: number; w: number; h: number };
  createdAt: number;
};

/* ===== 第 4 层：镜（排列产物，comicFrames 的数据化升级）=====
   镜不只是网格线，是镜头容器：有叙事顺序、有归属元素。 */
export type Frame = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 叙事顺序（1 起）。缺省按 Z 字形阅读序，老数据自动兼容 */
  order?: number;
  /** 归属元素（点选进镜内自动登记，跟随镜走） */
  elementIds?: string[];
};

export type Page = {
  id: string;
  title: string;
  content: string;
  texts?: TextNode[];
  shapes?: ShapeNode[];
  images?: ImageNode[];
  notes?: NoteNode[];
  tables?: TableNode[];
  links?: LinkNode[];
  elementLinks?: ElementLink[];
  transform?: PaperTransform;
  groups?: Group[];
  /** 创作单元（智能合成产物） */
  units?: Unit[];
  /** 镜（排列产物） */
  frames?: Frame[];
  /** 演出（节奏 tab 播放对象） */
  performances?: Performance[];
  paperColor?: string;
  paperAlpha?: number;
  paperW?: number;
  paperH?: number;
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, any>;
};

/* 关系语义：连接层的 4 种真实关系（不是画线，是建立关系） */
export type RelType = "story" | "display" | "flow" | "page";

export type PageLink = {
  from: string;
  to: string;
  createdAt: number;
  /** 关系类型（缺省按老数据=展示关系处理，不迁移不报错） */
  relType?: RelType;
  /** 关系词（接着/因为/跳转…），可编辑 */
  label?: string;
};

/*
 * 交互连接（手稿第十张定义的动作产物）
 *
 * 连接不是"摆一个写着连接的按钮"，而是用户走完一整套动作后长出来的：
 *   ① 在连接页面点对象（高亮）
 *   ② 点要去的承接页面
 *   ③ 在承接页面里也点一个对象
 *   ④ 点回连接页面 → 闭环
 *
 * 必须双向：单线只能跳转过去却回不来，所以两边都要有落点。
 */
export type Interaction = {
  id: string;
  /** 走的哪条模式（手机 / 网站） */
  mode: "phone" | "site";
  /** 起点：连接页面 + 页面上的对象 */
  fromPageId: string;
  fromElementId: string;
  /** 起点对象的类型（note/text/image/table/link/shape），画线和命中都要用 */
  fromElementType?: string;
  /** 终点：承接页面 + 页面上的对象 */
  toPageId: string;
  toElementId: string;
  toElementType?: string;
  createdAt: number;
};

export type DocModel = {
  id: string;
  title?: string;
  pages: Page[];
  links: PageLink[];
  /** 交互连接（动作建立的双向连接） */
  interactions?: Interaction[];
  createdAt: number;
  updatedAt: number;
  cloudDocumentId?: string;
};
export type ElementLinkTargetType = "text" | "shape" | "image" | "note" | "table" | "link";

export type ElementLink = {
  id: string;
  /** 起点（旧数据可能缺省，渲染时跳过） */
  fromType?: ElementLinkTargetType;
  fromId?: string;
  /** 终点 */
  targetType: ElementLinkTargetType;
  targetId: string;
  createdAt: number;
  /** 关系类型（老数据缺省 = 按展示关系渲染，不迁移不报错） */
  relType?: RelType;
  /** 关系词标签 */
  label?: string;
};

/* ===== 第 5 层：演出（节奏 tab 的播放对象）=====
   播放读的是已有结构：镜序列（排列）→ 单元渐现（组合）→ 关系展开（连接）→ 跨页跳转。
   不产生新状态，只描述「如何讲述」。 */
export type Performance = {
  id: string;
  /** 播放的镜序列（Frame id 列表，= 阅读顺序）；空 = 按页内全部镜 */
  frames: string[];
  /** 跨页/跨镜关系（ElementLink/PageLink id），关系线在演出中展开 */
  crossLinks: string[];
  /** 节奏：perFrameMs 缺省 = 自动（内容多停留久） */
  timing?: { perFrameMs?: number };
};

export type SheetAction = {
  id: number;
  kind:
    | "align-left" | "align-hcenter" | "align-right"
    | "align-top" | "align-vcenter" | "align-bottom"
    | "distribute-h" | "distribute-v"
    | "bring-front" | "bring-forward" | "send-backward" | "send-back"
    | "group" | "ungroup" | "bind-strokes"
    | "connect-toggle" | "lasso-toggle" | "connect-cancel"
    | "frame-2x2" | "frame-2x3" | "frame-3x3" | "frame-clear"
    | "frame-swap" | "frame-select"
    | "synth-card" | "synth-label" | "synth-sticky" | "synth-zone"
    | "rel-story" | "rel-display" | "rel-flow"
    | "jump-anchor"
    | "perfo-order-frames" | "perfo-order-links"
    | "perfo-speed-slow" | "perfo-speed-mid" | "perfo-speed-fast"
    | "play" | "play-step" | "play-stop"
    /* ★ 框选/长按弹窗（画布级操作入口）：组合 / 关系链 / 复制 / 删除 */
    | "box-compose"
    | "box-chain-story" | "box-chain-display" | "box-chain-flow"
    | "box-copy" | "box-delete";
};