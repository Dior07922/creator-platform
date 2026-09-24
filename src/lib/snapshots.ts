// name=src/lib/snapshots.ts
import type { DocModel } from "../types/document";

/*
 * 作品快照（本地版本历史）
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 *   画布里的图片是 data URI 内嵌在文档里的，一份文档轻易几 MB，
 *   而 localStorage 整个源只有 5MB 左右配额，存两三份快照就写不进去了。
 *   IndexedDB 容量按磁盘走，且支持按索引查询，适合做版本历史。
 *
 * 快照是「整份文档的深拷贝」——不是增量。所以回滚一定回到当时的完整样子，
 * 不受后续任何改动影响。
 */

const DB_NAME = "ranjing-snapshots";
const DB_VERSION = 1;
const STORE = "snapshots";
const INDEX_DOC = "docId";

/** 每份文档最多保留多少张快照（超出丢最旧的） */
export const MAX_SNAPSHOTS = 20;

export type Snapshot = {
  id: string;
  docId: string;
  createdAt: number;
  /** 快照时的页面数，用于列表展示和快速辨认 */
  pageCount: number;
  /** 快照时的文档标题（首屏标题） */
  title: string;
  /** 整份文档的深拷贝 */
  doc: DocModel;
};

/** 列表用的轻量条目（不含 doc，避免为了画个列表把几 MB 读进内存） */
export type SnapshotMeta = Omit<Snapshot, "doc">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex(INDEX_DOC, INDEX_DOC, { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("INDEXEDDB_REQ_FAILED"));
    t.oncomplete = () => db.close();
  }));
}

function newId() {
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 存一张快照。返回存好的元信息。 */
export async function saveSnapshot(doc: DocModel, label?: string): Promise<SnapshotMeta> {
  const snap: Snapshot = {
    id: newId(),
    docId: doc.id,
    createdAt: Date.now(),
    pageCount: doc.pages?.length || 0,
    title: doc.pages?.[0]?.title || label || "未命名",
    /* 深拷贝：避免之后画布继续改动时把快照里的内容也一起改了 */
    doc: JSON.parse(JSON.stringify(doc)) as DocModel,
  };

  await tx("readwrite", (store) => store.put(snap));
  await trimOld(doc.id);

  const { doc: _omit, ...meta } = snap;
  return meta;
}

/** 列出某份文档的快照（新的在前），不带 doc 正文 */
export async function listSnapshots(docId: string): Promise<SnapshotMeta[]> {
  const all = await tx<Snapshot[]>("readonly", (store) => store.index(INDEX_DOC).getAll(docId) as IDBRequest<Snapshot[]>);
  return all
    .map(({ doc: _omit, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 取某张快照的完整文档 */
export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const snap = await tx<Snapshot | undefined>("readonly", (store) => store.get(id) as IDBRequest<Snapshot | undefined>);
  return snap || null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

export async function clearSnapshots(docId: string): Promise<void> {
  const list = await listSnapshots(docId);
  await Promise.all(list.map((s) => deleteSnapshot(s.id)));
}

/** 超出上限时丢弃最旧的，避免无限增长把磁盘吃满 */
async function trimOld(docId: string) {
  const list = await listSnapshots(docId);
  if (list.length <= MAX_SNAPSHOTS) return;
  const drop = list.slice(MAX_SNAPSHOTS);
  await Promise.all(drop.map((s) => deleteSnapshot(s.id)));
}

/** 把时间戳格式化成「今天 14:32」这种好认的样子 */
export function formatSnapshotTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
