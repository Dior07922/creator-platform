// name=src/lib/localDocuments.ts

import type { DocModel } from "../types/document";

const KEY_PREFIX = "ranjing.doc.";

export function saveLocalDoc(doc: DocModel) {
  try {
    localStorage.setItem(KEY_PREFIX + doc.id, JSON.stringify(doc));
    return true;
  } catch (e) {
    console.error("saveLocalDoc error", e);
    return false;
  }
}

export function loadLocalDoc(id: string): DocModel | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as DocModel;
  } catch (e) {
    console.error("loadLocalDoc error", e);
    return null;
  }
}