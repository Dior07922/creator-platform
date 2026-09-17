// name=src/components/creation/CreationLocalRoom.tsx
import React, { useEffect, useRef, useState } from "react";
import { makeEmptyDoc } from "../../lib/documents";
import { loadLocalDoc, saveLocalDoc } from "../../lib/localDocuments";
import type { DocModel, Page, PageLink, ShapeKind, ShapeNode, TextNode, NoteNode, TableNode, LinkNode } from "../../types/document";
import Editor from "./Editor";
import {
  ObjectDrawer, ShapeDrawer, WindowDrawer,
  ColorDrawer, SpecDrawer, LockDrawer, FontDrawer,
} from "./CreationDrawer";
import PageSheet from "./PageSheet";
import { specScale } from "../../lib/paperSpecs";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import AssetBrowser from "./AssetBrowser";

type Props = { onBack?: () => void; initialText?: string; docKey?: string };

type SideKind = "lock" | "page" | "object" | "color" | "shape" | "font" | "spec" | "door";

const SIDE_ITEMS: { id: string; def: string; kind: SideKind }[] = [
  { id: "spec",   def: "规格", kind: "spec" },
  { id: "shape",  def: "笔",   kind: "shape" },
  { id: "color",  def: "色",   kind: "color" },
  { id: "font",   def: "字",   kind: "font" },
  { id: "object", def: "物",   kind: "object" },
  { id: "page",   def: "页",   kind: "page" },
  { id: "lock",   def: "🔒",   kind: "lock" },
  { id: "door",   def: "门",   kind: "door" },
];

const LABELS_KEY = "ranjing.sideLabels";

function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mini-confirm-overlay">
      <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg">{message}</div>
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok" onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}

function RenameDialog({ initial, onConfirm, onCancel }: { initial: string; onConfirm: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="mini-confirm-overlay" onClick={onCancel}>
      <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg" style={{ marginBottom: 10 }}>改名</div>
        <input
          ref={ref}
          value={v}
          maxLength={6}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(v.trim() || initial);
            if (e.key === "Escape") onCancel();
          }}
          style={{
            width: "100%", height: 36, padding: "0 10px", boxSizing: "border-box",
            border: "1px solid rgba(74,70,63,.2)", borderRadius: 8,
            background: "#fff", color: "#3a352e", fontSize: 14, outline: "none",
            textAlign: "center", marginBottom: 14,
          }}
        />
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok" onClick={() => onConfirm(v.trim() || initial)}>确定</button>
        </div>
      </div>
    </div>
  );
}

function SideEntryButton({
  label, onClick, onRename,
}: { label: string; onClick: () => void; onRename: () => void }) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const movedRef = useRef(false);

  function down(e: React.PointerEvent) {
    firedRef.current = false;
    movedRef.current = false;
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) movedRef.current = true;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!movedRef.current) {
        firedRef.current = true;
        onRename();
      }
    }, 600);
  }
  function click(e: React.MouseEvent) {
    if (firedRef.current) { e.preventDefault(); e.stopPropagation(); firedRef.current = false; return; }
    onClick();
  }

  return (
    <button type="button" className="cd-side-entry" onPointerDown={down} onClick={click}>
      {label}
    </button>
  );
}

export default function CreationLocalRoom({ onBack, initialText, docKey }: Props) {
  useEffect(() => {
    ScreenOrientation.unlock().catch(() => {});
    return () => { ScreenOrientation.unlock().catch(() => {}); };
  }, []);

  const DOC_ID = docKey || "default-doc";

  const [doc, setDoc] = useState<DocModel>(() => {
    const loaded = loadLocalDoc(DOC_ID);
    if (loaded) return loaded;
    const fresh = makeEmptyDoc(DOC_ID);
    if (initialText) {
      fresh.pages.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`,
        title: "白纸 1",
        content: initialText,
        texts: [],
        transform: { x: 0, y: 0, scale: 1, rotate: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return fresh;
  });

  const [currentPageId, setCurrentPageId] = useState<string>(() => doc.pages[0]?.id || "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [connectMode, setConnectMode] = useState<{ from: string } | null>(null);

  const _curPage = doc.pages.find((p) => p.id === currentPageId) || null;
  const paperColor = _curPage?.paperColor ?? "#ffffff";
  const paperAlpha = _curPage?.paperAlpha ?? 1;
  const [stageColor, setStageColor] = useState("#f8f5ef");
  const [stageAlpha, setStageAlpha] = useState(1);
  const [currentFont, setCurrentFont] = useState<string>('"Noto Sans SC", sans-serif');
  const [showAssets, setShowAssets] = useState(false);
  const [drawTool, setDrawTool] = useState<ShapeKind | null>(null);

  const [elementConnectMode, setElementConnectMode] = useState(false);
  const [lassoMode, setLassoMode] = useState(false);
  const [sheetAction, setSheetAction] = useState<{ id: number; kind: string } | null>(null);

  function dispatchSheet(kind: string) {
    if (kind === "connect-toggle") {
      setElementConnectMode((v) => {
        const next = !v;
        return next;
      });
      return;
    }
    if (kind === "lasso-toggle") {
      setLassoMode((v) => !v);
      return;
    }
    setSheetAction({ id: Date.now(), kind });
  }

  const [openDrawer, setOpenDrawer] = useState<
    "page" | "object" | "shape" | "color" | "spec" | "lock" | "window" | "font" | null
  >(null);

  const [sideLabels, setSideLabels] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(LABELS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  });
  function labelOf(id: string, def: string) { return sideLabels[id] ?? def; }
  function setLabel(id: string, v: string) {
    setSideLabels((prev) => {
      const next = { ...prev, [id]: v };
      try { localStorage.setItem(LABELS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  function onSideAction(kind: SideKind) {
    switch (kind) {
      case "lock":   setOpenDrawer("lock"); break;
      case "page":   setOpenDrawer("page"); break;
      case "object": setShowAssets(true); break;
      case "color":  setOpenDrawer("color"); break;
      case "shape":  setOpenDrawer("shape"); break;
      case "font":   setOpenDrawer("font"); break;
      case "spec":   setOpenDrawer("spec"); break;
      case "door":   setOpenDrawer("window"); break;
    }
  }

  const [pageClipboard, setPageClipboard] = useState<Page | null>(null);
  const saveTimer = useRef<number | null>(null);

  function applyDoc(updater: (prev: DocModel) => DocModel) {
    setDoc((prev) => {
      const next = updater(prev);
      next.updatedAt = Date.now();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const ok = saveLocalDoc(next);
        if (ok) { setSaveStatus("saved"); setSaveError(null); }
        else { setSaveStatus("error"); setSaveError("本地保存失败（localStorage）"); }
      }, 600);
      return next;
    });
  }

  function findPage(id: string) { return doc.pages.find((p) => p.id === id) || null; }

  function setPaperColor(c: string) {
    applyDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === currentPageId ? { ...p, paperColor: c, updatedAt: Date.now() } : p
      ),
    }));
  }
  function setPaperAlpha(a: number) {
    applyDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === currentPageId ? { ...p, paperAlpha: a, updatedAt: Date.now() } : p
      ),
    }));
  }

  function setCurrentPageSpec(w: number, h: number) {
    applyDoc((prev) => {
      const stageW = typeof window !== "undefined" ? window.innerWidth : 800;
      const stageH = typeof window !== "undefined" ? window.innerHeight : 600;
      const s = specScale(w, h, stageW, stageH);
      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== targetId) return p;
          return {
            ...p,
            transform: { x: 0, y: 0, scale: s, rotate: 0 },
            paperW: w > 0 ? w : undefined,
            paperH: h > 0 ? h : undefined,
            updatedAt: Date.now(),
          };
        }),
      };
    });
  }

  function insertTextAtCenter(text: string) {
    applyDoc((prev) => {
      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== targetId) return p;
          const W = p.paperW ?? 400;
          const H = p.paperH ?? 400;
          const node: TextNode = {
            id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text,
            x: W / 2 - 40,
            y: H / 2 - 20,
            fontSize: 22,
            color: "#3a352e",
            layer: "paper",
            fontFamily: currentFont,
          };
          return { ...p, texts: [...(p.texts || []), node], updatedAt: Date.now() };
        }),
      };
    });
  }

  function insertShapeAtCenter(kind: ShapeKind) {
    if (kind === "eraser") return;
    applyDoc((prev) => {
      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== targetId) return p;
          const W = p.paperW ?? 400;
          const H = p.paperH ?? 400;
          const size = Math.min(W, H) * 0.4;
          const shape: ShapeNode = {
            id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind,
            layer: "paper",
            x1: W / 2 - size / 2,
            y1: H / 2 - size / 2,
            x2: W / 2 + size / 2,
            y2: H / 2 + size / 2,
            color: "#3a352e",
            strokeWidth: 2,
          };
          return { ...p, shapes: [...(p.shapes || []), shape], updatedAt: Date.now() };
        }),
      };
    });
  }

  function addNewPage(): boolean {
    if (doc.pages.length >= 30) { alert("最多 30 页"); return false; }
    const now = Date.now();
    const active = findPage(currentPageId) || doc.pages[doc.pages.length - 1];
    const stageRect = (typeof window !== "undefined") ? { w: window.innerWidth } : { w: 800 };
    const offsetX = active ? stageRect.w + 60 : 0;
    const baseX = active?.transform?.x ?? 0;
    const baseY = active?.transform?.y ?? 0;
    const page: Page = {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
      title: `白纸 ${doc.pages.length + 1}`,
      content: "",
      texts: [],
      transform: active ? { x: baseX + offsetX, y: baseY, scale: 1, rotate: 0 } : { x: 0, y: 0, scale: 1, rotate: 0 },
      createdAt: now, updatedAt: now,
      paperColor: "#ffffff", paperAlpha: 1,
    };
    applyDoc((prev) => ({ ...prev, pages: [...prev.pages, page] }));
    setCurrentPageId(page.id);
    return true;
  }

  function copyCurrentPage() {
    const cur = findPage(currentPageId);
    if (!cur) return;
    setPageClipboard(JSON.parse(JSON.stringify(cur)));
  }

  function pastePageAt(localX: number, localY: number) {
    if (!pageClipboard) return;
    if (doc.pages.length >= 30) { alert("最多 30 页"); return; }
    const sr = { w: window.innerWidth, h: window.innerHeight };
    const now = Date.now();
    const newId = crypto.randomUUID ? crypto.randomUUID() : `p-${now}`;
    const clonedTexts = (pageClipboard.texts || [])
      .map((t) => ({ ...t, id: `t-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const clonedShapes = (pageClipboard.shapes || [])
      .map((s) => ({ ...s, id: `s-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const newPage: Page = {
      id: newId,
      title: `${pageClipboard.title || "白纸"} 副本`,
      content: pageClipboard.content || "",
      texts: clonedTexts,
      shapes: clonedShapes,
      transform: {
        x: localX - sr.w / 2, y: localY - sr.h / 2,
        scale: pageClipboard.transform?.scale ?? 1,
        rotate: pageClipboard.transform?.rotate ?? 0,
      },
      createdAt: now, updatedAt: now,
      groups: undefined,
      paperColor: pageClipboard.paperColor ?? "#ffffff",
      paperAlpha: pageClipboard.paperAlpha ?? 1,
    };
    if (pageClipboard.paperW && pageClipboard.paperH) {
      newPage.paperW = pageClipboard.paperW;
      newPage.paperH = pageClipboard.paperH;
    }
    applyDoc((prev) => ({ ...prev, pages: [...prev.pages, newPage] }));
    setCurrentPageId(newId);
  }

  function duplicatePage(pageId: string) {
    const src = findPage(pageId);
    if (!src) return;
    if (doc.pages.length >= 30) { alert("最多 30 页"); return; }
    const now = Date.now();
    const newId = crypto.randomUUID ? crypto.randomUUID() : `p-${now}`;
    const clonedTexts = (src.texts || [])
      .map((t) => ({ ...t, id: `t-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const clonedShapes = (src.shapes || [])
      .map((s) => ({ ...s, id: `s-${now}-${Math.random().toString(36).slice(2, 8)}` }));
    const newPage: Page = {
      id: newId,
      title: `${src.title || "白纸"} 副本`,
      content: src.content || "",
      texts: clonedTexts,
      shapes: clonedShapes,
      transform: { ...(src.transform || { x: 0, y: 0, scale: 1, rotate: 0 }) },
      createdAt: now, updatedAt: now,
      groups: undefined,
      paperColor: src.paperColor ?? "#ffffff",
      paperAlpha: src.paperAlpha ?? 1,
    };
    if (src.paperW && src.paperH) {
      newPage.paperW = src.paperW;
      newPage.paperH = src.paperH;
    }
    applyDoc((prev) => {
      const idx = prev.pages.findIndex((p) => p.id === pageId);
      const pages = prev.pages.slice();
      pages.splice(idx < 0 ? pages.length : idx + 1, 0, newPage);
      return { ...prev, pages };
    });
    setCurrentPageId(newId);
  }

  function requestDeletePage(pageId: string) {
    const page = findPage(pageId);
    if (!page) return;
    setConfirmState({
      message: `确认删除页面 "${page.title}" 吗？（删除后不可恢复）`,
      onConfirm: () => { setConfirmState(null); deletePage(pageId); },
    });
  }

  function renamePage(id: string, title: string) {
    applyDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => p.id === id ? { ...p, title, updatedAt: Date.now() } : p),
    }));
  }

  function deletePage(pageId: string) {
    applyDoc((prev) => {
      const pages = prev.pages.filter((p) => p.id !== pageId);
      const links = prev.links.filter((l) => l.from !== pageId && l.to !== pageId);
      return { ...prev, pages, links };
    });
    if (currentPageId === pageId) {
      const rest = doc.pages.filter((p) => p.id !== pageId);
      setCurrentPageId(rest[0]?.id || "");
    }
  }

  function startConnect(fromPageId: string) {
    setConnectMode({ from: fromPageId });
    setOpenDrawer("page");
  }
  function completeConnect(toPageId: string): boolean {
    if (!connectMode) return false;
    if (connectMode.from === toPageId) { alert("不能连接到自己"); setConnectMode(null); return false; }
    applyDoc((prev) => {
      const exists = prev.links.find((l) => l.from === connectMode.from && l.to === toPageId);
      if (exists) {
        return { ...prev, links: prev.links.filter((l) => !(l.from === connectMode.from && l.to === toPageId)) };
      }
      const link: PageLink = { from: connectMode.from, to: toPageId, createdAt: Date.now() };
      return { ...prev, links: [...prev.links, link] };
    });
    setConnectMode(null);
    return true;
  }

  useEffect(() => {
    if (!loadLocalDoc(doc.id)) saveLocalDoc(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    if (doc.pages.length === 0) {
      const now = Date.now();
      const newPage: Page = {
        id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
        title: "白纸 1",
        content: "",
        texts: [],
        transform: { x: 0, y: 0, scale: 1, rotate: 0 },
        createdAt: now, updatedAt: now,
        paperColor: "#ffffff", paperAlpha: 1,
      };
      applyDoc((prev) => ({ ...prev, pages: [newPage] }));
      setCurrentPageId(newPage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.pages.length]);

  useEffect(() => {
    if (!currentPageId && doc.pages.length) setCurrentPageId(doc.pages[0].id);
    if (!doc.pages.find((p) => p.id === currentPageId)) setCurrentPageId(doc.pages[0]?.id || "");
  }, [doc.pages, currentPageId]);

  const currentPage = doc.pages.find((p) => p.id === currentPageId) || null;
  const closeDrawer = () => setOpenDrawer(null);

  const editorKey = currentPage
    ? `${currentPage.id}_${currentPage.paperW ?? 0}x${currentPage.paperH ?? 0}`
    : "none";

  return (
    <div className="creation-room" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#f8f5ef" }}>
      <main style={{ position: "absolute", inset: 0, display: "flex" }}>
        {currentPage && (
          <Editor
            key={editorKey}
            page={currentPage}
            allPages={doc.pages}
            onUpdate={(patch) => {
              applyDoc((prev) => ({
                ...prev,
                pages: prev.pages.map((p) =>
                  p.id === currentPageId ? { ...p, ...patch, updatedAt: Date.now() } : p
                ),
              }));
            }}
            onSelectPage={(id) => setCurrentPageId(id)}
            onCopyPage={copyCurrentPage}
            onPastePage={pastePageAt}
            onUpdatePageTransform={(pid, tr) => {
              applyDoc((prev) => ({
                ...prev,
                pages: prev.pages.map((p) =>
                  p.id === pid ? { ...p, transform: tr, updatedAt: Date.now() } : p
                ),
              }));
            }}
            hasClipboard={!!pageClipboard}
            onRequestConnect={() => startConnect(currentPageId)}
            paperColor={paperColor}
            paperAlpha={paperAlpha}
            stageColor={stageColor}
            stageAlpha={stageAlpha}
            currentFont={currentFont}
            drawTool={drawTool}
            onDrawToolConsumed={() => setDrawTool(null)}
            onDrawToolChange={(k) => setDrawTool(k)}
            elementConnectMode={elementConnectMode}
            lassoMode={lassoMode}
            sheetAction={sheetAction}
          />
        )}
      </main>

      {openDrawer === null && (
        <div className="cd-side-entries">
          {SIDE_ITEMS.map((it) => (
            <SideEntryButton
              key={it.id}
              label={labelOf(it.id, it.def)}
              onClick={() => onSideAction(it.kind)}
              onRename={() => setRenaming({ id: it.id, label: labelOf(it.id, it.def) })}
            />
          ))}
        </div>
      )}

      {openDrawer === "page" && (
        <PageSheet
          pages={doc.pages}
          currentPageId={currentPageId}
          links={doc.links}
          onSelectPage={(id) => { setCurrentPageId(id); closeDrawer(); }}
          onAddPage={() => { addNewPage(); }}
          onDeletePage={(id) => requestDeletePage(id)}
          onRenamePage={(id, title) => renamePage(id, title)}
          onDuplicatePage={(id) => duplicatePage(id)}
          onExit={() => onBack && onBack()}
          onClose={closeDrawer}
          dispatchAction={dispatchSheet}
          connectModeActive={elementConnectMode}
          lassoModeActive={lassoMode}
        />
      )}
      {openDrawer === "object" && <ObjectDrawer onClose={closeDrawer} />}
      {openDrawer === "shape" && (
        <ShapeDrawer
          onClose={closeDrawer}
          onPickTool={(kind) => { setDrawTool(kind); closeDrawer(); }}
          onInsertText={(text) => { insertTextAtCenter(text); closeDrawer(); }}
          onInsertShape={(kind) => { insertShapeAtCenter(kind); closeDrawer(); }}
        />
      )}
      {openDrawer === "window" && <WindowDrawer onClose={closeDrawer} />}
      {openDrawer === "color" && (
        <ColorDrawer
          paperColor={paperColor}
          paperAlpha={paperAlpha}
          stageColor={stageColor}
          stageAlpha={stageAlpha}
          onPaperColorChange={setPaperColor}
          onPaperAlphaChange={setPaperAlpha}
          onStageColorChange={setStageColor}
          onStageAlphaChange={setStageAlpha}
          onPicked={closeDrawer}
          onClose={closeDrawer}
        />
      )}
      {openDrawer === "font" && (
        <FontDrawer
          currentFont={currentFont}
          onFontChange={setCurrentFont}
          onPicked={closeDrawer}
          onClose={closeDrawer}
        />
      )}
      {openDrawer === "spec" && (
        <SpecDrawer
          onClose={closeDrawer}
          onPicked={(w, h) => { setCurrentPageSpec(w, h); closeDrawer(); }}
        />
      )}
      {openDrawer === "lock" && (
        <LockDrawer onClose={closeDrawer} onPicked={closeDrawer} />
      )}

      {confirmState && (
        <Confirm message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />
      )}

      {renaming && (
        <RenameDialog
          initial={renaming.label}
          onConfirm={(v) => { setLabel(renaming.id, v); setRenaming(null); }}
          onCancel={() => setRenaming(null)}
        />
      )}

      <div style={{ position: "absolute", right: 18, bottom: 18, zIndex: 1600 }}>
        {saveStatus === "error" && (
          <div style={{ background: "#ffecee", color: "#a06f64", padding: 8, borderRadius: 8 }}>{saveError}</div>
        )}
      </div>

      {showAssets && (
        <AssetBrowser
          onClose={() => setShowAssets(false)}
          onPick={(a) => {
            // 插入图片
            applyDoc((prev) => {
              const targetId = currentPageId || (prev.pages[0]?.id ?? "");
              return {
                ...prev,
                pages: prev.pages.map((p) => {
                  if (p.id !== targetId) return p;
                  const W = p.paperW ?? 400;
                  const H = p.paperH ?? 400;
                  const sc = Math.min((W * 0.6) / a.w, (H * 0.6) / a.h, 1);
                  const w = a.w * sc, h = a.h * sc;
                  return {
                    ...p,
                    images: [...(p.images || []), {
                      id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      src: a.src,
                      x: (W - w) / 2, y: (H - h) / 2,
                      w, h, layer: "paper",
                    }],
                    updatedAt: Date.now(),
                  };
                }),
              };
            });
            setShowAssets(false);
          }}
          onAction={(action) => {
            if (action === "photo" || action === "camera" || action === "file") {
              const input = document.createElement("input");
              input.type = "file";
              if (action !== "file") input.accept = "image/*";
              if (action === "camera") input.setAttribute("capture", "environment");
              input.onchange = () => {
                const f = input.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const src = reader.result as string;
                  const img = new Image();
                  img.onload = () => {
                    const natW = img.naturalWidth || 600;
                    const natH = img.naturalHeight || 400;
                    applyDoc((prev) => {
                      const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                      return {
                        ...prev,
                        pages: prev.pages.map((p) => {
                          if (p.id !== targetId) return p;
                          const W = p.paperW ?? 400;
                          const H = p.paperH ?? 400;
                          const sc = Math.min((W * 0.6) / natW, (H * 0.6) / natH, 1);
                          const w = natW * sc, h = natH * sc;
                          return {
                            ...p,
                            images: [...(p.images || []), {
                              id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                              src, x: (W - w) / 2, y: (H - h) / 2, w, h, layer: "paper",
                            }],
                            updatedAt: Date.now(),
                          };
                        }),
                      };
                    });
                  };
                  img.src = src;
                };
                reader.readAsDataURL(f);
              };
              input.click();
              setShowAssets(false);
              return;
            }
            if (action === "note") {
              applyDoc((prev) => {
                const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                return {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== targetId) return p;
                    const W = p.paperW ?? 400;
                    const H = p.paperH ?? 400;
                    const w = Math.min(220, W * 0.5);
                    const h = Math.min(160, H * 0.4);
                    return {
                      ...p,
                      notes: [...(p.notes || []), {
                        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        text: "便签",
                        x: (W - w) / 2, y: (H - h) / 2, w, h,
                        bgColor: "#fde8a8", textColor: "#5a4520", fontSize: 14,
                        layer: "paper",
                      }],
                      updatedAt: Date.now(),
                    };
                  }),
                };
              });
              setShowAssets(false);
              return;
            }
            if (action === "table") {
              applyDoc((prev) => {
                const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                return {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== targetId) return p;
                    const W = p.paperW ?? 400;
                    const H = p.paperH ?? 400;
                    const rows = 3, cols = 3;
                    const w = Math.min(360, W * 0.7);
                    const h = Math.min(240, H * 0.5);
                    return {
                      ...p,
                      tables: [...(p.tables || []), {
                        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        rows, cols,
                        x: (W - w) / 2, y: (H - h) / 2, w, h,
                        cells: Array.from({ length: rows }).map(() => Array.from({ length: cols }).map(() => "")),
                        layer: "paper",
                      }],
                      updatedAt: Date.now(),
                    };
                  }),
                };
              });
              setShowAssets(false);
              return;
            }
            if (action === "link") {
              const url = window.prompt("输入链接地址", "https://");
              if (!url || url === "https://") { setShowAssets(false); return; }
              applyDoc((prev) => {
                const targetId = currentPageId || (prev.pages[0]?.id ?? "");
                return {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== targetId) return p;
                    const W = p.paperW ?? 400;
                    const H = p.paperH ?? 400;
                    const w = Math.min(280, W * 0.7);
                    const h = 60;
                    return {
                      ...p,
                      links: [...(p.links || []), {
                        id: `lk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        url, title: url.replace(/^https?:\/\//, "").split("/")[0],
                        x: (W - w) / 2, y: (H - h) / 2, w, h,
                        layer: "paper",
                      }],
                      updatedAt: Date.now(),
                    };
                  }),
                };
              });
              setShowAssets(false);
              return;
            }
          }}
        />
      )}
    </div>
  );
}
