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

export type PaperTransform = {
  x: number;
  y: number;
  scale: number;
  rotate: number;
};

export type Group = {
  id: string;
  memberIds: string[];
  pageIds?: string[];
  createdAt: number;
};

export type Page = {
  id: string;
  title: string;
  content: string;
  texts?: TextNode[];
  transform?: PaperTransform;
  groups?: Group[];
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, any>;
};

export type PageLink = {
  from: string;
  to: string;
  createdAt: number;
};

export type DocModel = {
  id: string;
  title?: string;
  pages: Page[];
  links: PageLink[];
  createdAt: number;
  updatedAt: number;
  cloudDocumentId?: string;
};