// name=src/lib/documents.ts
import type { DocModel } from "../types/document";

export function makeEmptyDoc(id = `doc-${String(Date.now())}`): DocModel {
  const now = Date.now();
  return {
    id,
    title: "未命名文档",
    pages: [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
}