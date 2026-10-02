// name=src/lib/works.ts
/* 记忆空间 · 本地作品库（第六步）
   「保存」= 把当前文档连同缩略图存进 IndexedDB。
   为什么不用 localStorage：作品文档可能带图片（dataURL），很快超过 5MB 配额；
   IndexedDB 容量大，且和快照（snapshots.ts）同一套用法，一致好维护。
   每张作品卡 = 一份可「继续创作」的完整文档，记忆空间本地记录页读它。 */
import type { DocModel } from "../types/document";

/** 与记忆空间大厅的分类对齐（手稿：全部记忆/草稿/已完成/笔记本/自定义） */
export type WorkCategory = "草稿" | "已完成" | "笔记本" | "自定义";

export type LocalWork = {
  id: string;
  title: string;
  category: WorkCategory;
  /** 卡片第二行小字：标签串（如「本地作品 / 3 页」） */
  tags: string;
  dateLabel: string;
  description: string;
  /** 卡片缩略图（dataURL，SVG 或 PNG） */
  thumb: string;
  /** 完整文档，「继续创作」用它恢复画面 */
  doc: DocModel;
  createdAt: number;
  updatedAt: number;
};

const DB_NAME = "ranjing-works";
const STORE = "works";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

/** 存一张作品。同 id 覆盖（再次保存同一份文档 = 更新作品卡）。 */
export async function saveWork(work: LocalWork): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(work);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("INDEXEDDB_WRITE_FAILED"));
    tx.onabort = () => reject(tx.error || new Error("INDEXEDDB_ABORTED"));
  });
  db.close();
}

/** 列出全部作品，最近更新的在前。 */
export async function listWorks(): Promise<LocalWork[]> {
  const db = await openDb();
  const works = await new Promise<LocalWork[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as LocalWork[]);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
  });
  db.close();
  return works.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getWork(id: string): Promise<LocalWork | null> {
  const db = await openDb();
  const work = await new Promise<LocalWork | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as LocalWork) || null);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
  });
  db.close();
  return work;
}

export async function deleteWork(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("INDEXEDDB_DELETE_FAILED"));
  });
  db.close();
}

/** 记忆空间里改分类（草稿 ↔ 已完成 ↔ 笔记本 ↔ 自定义） */
export async function setWorkCategory(id: string, category: WorkCategory): Promise<void> {
  const work = await getWork(id);
  if (!work) return;
  work.category = category;
  work.updatedAt = Date.now();
  await saveWork(work);
}

/** 卡片上的日期：MM.DD · 本地 */
export function workDateLabel(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd} · 本地`;
}
