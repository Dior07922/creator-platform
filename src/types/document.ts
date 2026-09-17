// name=src/types/document.ts
export type TextNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  layer: "background" | "paper";
  fontFamily?: string;
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
};

export type PaperTransform = { x: number; y: number; scale: number; rotate: number };
export type Group = { id: string; memberIds: string[]; pageIds?: string[]; createdAt: number };

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
  paperColor?: string;
  paperAlpha?: number;
  paperW?: number;
  paperH?: number;
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, any>;
};

export type PageLink = { from: string; to: string; createdAt: number };

export type DocModel = {
  id: string;
  title?: string;
  pages: Page[];
  links: PageLink[];
  createdAt: number;
  updatedAt: number;
  cloudDocumentId?: string;
};
export type ElementLink = {
  id: string;
  targetType: "text" | "shape" | "image" | "note" | "table" | "link";
  targetId: string;
  createdAt: number;
};

export type SheetAction = {
  id: number;
  kind:
    | "align-left" | "align-hcenter" | "align-right"
    | "align-top" | "align-vcenter" | "align-bottom"
    | "distribute-h" | "distribute-v"
    | "bring-front" | "bring-forward" | "send-backward" | "send-back"
    | "group" | "ungroup" | "bind-strokes"
    | "connect-toggle" | "lasso-toggle" | "connect-cancel";
};