// name=src/components/creation/CreationCloudRoom.tsx
import { cloudSaveDoc } from "../../lib/cloudDocuments";
import React, { useEffect, useRef, useState } from "react";
import { makeEmptyDoc } from "../../lib/documents";
import { loadLocalDoc, saveLocalDoc } from "../../lib/localDocuments";
import type { DocModel, Page, PageLink } from "../../types/document";
import Editor from "./Editor";
import { PageDrawer, ObjectDrawer, WindowDrawer, ColorDrawer, SpecDrawer, FontDrawer, LockDrawer } from "./CreationDrawer";
import { ScreenOrientation } from "@capacitor/screen-orientation";

type Props = {
  onBack?: () => void;
  initialText?: string;
  docKey?: string;
};

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

export default function CreationCloudRoom({ onBack, initialText, docKey }: Props) {
  useEffect(() => {
    ScreenOrientation.unlock().catch(() => {});
    return () => { ScreenOrientation.unlock().catch(() => {}); };
  }, []);

  const DOC_ID = docKey || "default-doc";

  const [doc, setDoc] = useState<DocModel>(() => {
    const loaded = loadLocalDoc(DOC_ID);
    if (loaded) return loaded;
    const fresh = makeEmptyDoc(DOC_ID);
    if (initialText) fresh.pages[0].content = initialText;
    return fresh;
  });

  const [currentPageId, setCurrentPageId] = useState<string>(() => doc.pages[0]?.id);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [connectMode, setConnectMode] = useState<{ from: string } | null>(null);

  const [paperColor, setPaperColor] = useState("#ffffff");
  const [paperAlpha, setPaperAlpha] = useState(1);
  const [stageColor, setStageColor] = useState("#f8f5ef");
  const [stageAlpha, setStageAlpha] = useState(1);

  const [openDrawer, setOpenDrawer] = useState<"page" | "object" | "color" | "spec" | "font" | "lock" | "window" | null>(null);

  const [pageClipboard, setPageClipboard] = useState<Page | null>(null);

  const saveTimer = useRef<number | null>(null);

  function scheduleLocalSave(nextDoc: DocModel) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const ok = saveLocalDoc(nextDoc);
      if (!ok) { setSaveStatus("error"); setSaveError("本地保存失败"); return; }
      const res = await cloudSaveDoc(nextDoc, currentPageId);
      if (!res.ok) { setSaveStatus("error"); setSaveError(res.error || "云端保存失败"); return; }
      if (res.cloudDocumentId && res.cloudDocumentId !== nextDoc.cloudDocumentId) {
        const merged = { ...nextDoc, cloudDocumentId: res.cloudDocumentId };
        setDoc(merged);
        saveLocalDoc(merged);
      }
      setSaveStatus("saved"); setSaveError(null);
    }, 600);
  }

  function findPage(id: string) { return doc.pages.find((p) => p.id === id) || null; }
  function setDocAndPersist(next: DocModel) {
    next.updatedAt = Date.now();
    setDoc(next);
    scheduleLocalSave(next);
  }

  function addNewPage() {
    if (doc.pages.length >= 30) {
      alert("最多 30 页");
      return;
    }
    const cur = findPage(currentPageId);
    if (cur && cur.paperHidden === true) {
      const pages = doc.pages.map((p) =>
        p.id === cur.id ? { ...p, paperHidden: false, updatedAt: Date.now() } : p
      );
      setDocAndPersist({ ...doc, pages });
      return;
    }
    const now = Date.now();
    const active = findPage(currentPageId) || doc.pages[doc.pages.length - 1];
    const stageRect = (typeof window !== "undefined") ? { w: window.innerWidth } : { w: 800 };
    const offsetX = stageRect.w + 60;
    const baseX = active?.transform?.x ?? 0;
    const baseY = active?.transform?.y ?? 0;
    const page: Page = {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
      title: `白纸 ${doc.pages.length + 1}`,
      content: "",
      texts: [],
      transform: { x: baseX + offsetX, y: baseY, scale: 1, rotate: 0 },
      createdAt: now,
      updatedAt: now,
    };
    setDocAndPersist({ ...doc, pages: [...doc.pages, page] });
    setCurrentPageId(page.id);
  }

  function copyCurrentPage() {
    const cur = findPage(currentPageId);
    if (!cur) return;
    const clone: Page = JSON.parse(JSON.stringify(cur));
    setPageClipboard(clone);
  }

  function pastePageAt(localX: number, localY: number) {
    if (!pageClipboard) return;
    if (doc.pages.length >= 30) {
      alert("最多 30 页");
      return;
    }
    const sr = { w: window.innerWidth, h: window.innerHeight };
    const offsetX = localX - sr.w / 2;
    const offsetY = localY - sr.h / 2;

    const now = Date.now();
    const newId = crypto.randomUUID ? crypto.randomUUID() : `p-${now}`;
    const clonedTexts = (pageClipboard.texts || [])
      .filter((t) => t.layer === "paper")
      .map((t) => ({
        ...t,
        id: `t-${now}-${Math.random().toString(36).slice(2, 8)}`,
      }));
    const newPage: Page = {
      id: newId,
      title: `${pageClipboard.title || "白纸"} 副本`,
      content: pageClipboard.content || "",
      texts: clonedTexts,
      transform: {
        x: offsetX,
        y: offsetY,
        scale: pageClipboard.transform?.scale ?? 1,
        rotate: pageClipboard.transform?.rotate ?? 0,
      },
      createdAt: now,
      updatedAt: now,
      groups: undefined,
    };
    setDocAndPersist({ ...doc, pages: [...doc.pages, newPage] });
    setCurrentPageId(newId);
  }

  function requestDeletePage(pageId: string) {
    const page = findPage(pageId);
    if (!page) return;
    if (doc.pages.length === 1) {
      alert("文档至少保留一页，无法删除最后一页");
      return;
    }
    setConfirmState({
      message: `确认删除当前页面 "${page.title}" 吗？（删除后不可恢复）`,
      onConfirm: () => { setConfirmState(null); deletePage(pageId); },
    });
  }

  function renamePage(id: string, title: string) {
    const pages = doc.pages.map((p) => p.id === id ? { ...p, title, updatedAt: Date.now() } : p);
    setDocAndPersist({ ...doc, pages });
  }

  function deletePage(pageId: string) {
    const pages = doc.pages.filter((p) => p.id !== pageId);
    const links = doc.links.filter((l) => l.from !== pageId && l.to !== pageId);
    const next = { ...doc, pages, links, updatedAt: Date.now() };
    setDocAndPersist(next);
    if (currentPageId === pageId) setCurrentPageId(pages[0]?.id || "");
  }

  function startConnect(fromPageId: string) {
    setConnectMode({ from: fromPageId });
    setOpenDrawer("page");
  }

  function completeConnect(toPageId: string) {
    if (!connectMode) return;
    if (connectMode.from === toPageId) {
      alert("不能连接到自己");
      setConnectMode(null);
      return;
    }
    const exists = doc.links.find((l) => l.from === connectMode.from && l.to === toPageId);
    if (exists) {
      const links = doc.links.filter((l) => !(l.from === connectMode.from && l.to === toPageId));
      setDocAndPersist({ ...doc, links, updatedAt: Date.now() });
      setConnectMode(null);
      return;
    }
    const link: PageLink = { from: connectMode.from, to: toPageId, createdAt: Date.now() };
    setDocAndPersist({ ...doc, links: [...doc.links, link], updatedAt: Date.now() });
    setConnectMode(null);
  }

  useEffect(() => {
    if (!currentPageId && doc.pages.length) setCurrentPageId(doc.pages[0].id);
    if (doc.pages.find((p) => p.id === currentPageId) == null) {
      setCurrentPageId(doc.pages[0]?.id || "");
    }
    if (!loadLocalDoc(doc.id)) saveLocalDoc(doc);
  }, [doc, currentPageId]);

  const currentPage = doc.pages.find((p) => p.id === currentPageId) || null;

  return (
    <div
      className="creation-room"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#f8f5ef",
      }}
    >
      <main style={{ position: "absolute", inset: 0, display: "flex" }}>
        {currentPage && (
          <Editor
            page={currentPage}
            allPages={doc.pages}
            onUpdate={(patch) => {
              const pages = doc.pages.map((p) =>
                p.id === currentPageId ? { ...p, ...patch, updatedAt: Date.now() } : p
              );
              setDocAndPersist({ ...doc, pages });
            }}
            onSelectPage={(id) => setCurrentPageId(id)}
            onCopyPage={copyCurrentPage}
            onPastePage={pastePageAt}
            onUpdatePageTransform={(pid, tr) => {
              const pages = doc.pages.map((p) =>
                p.id === pid ? { ...p, transform: tr, updatedAt: Date.now() } : p
              );
              setDocAndPersist({ ...doc, pages });
            }}
            hasClipboard={!!pageClipboard}
            onRequestConnect={() => startConnect(currentPageId)}
            paperColor={paperColor}
            paperAlpha={paperAlpha}
            stageColor={stageColor}
            stageAlpha={stageAlpha}
          />
        )}
      </main>

      {openDrawer === null && (
        <div className="cd-side-entries">
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("lock")} aria-label="锁">🔒</button>
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("page")}>页</button>
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("object")}>物</button>
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("color")}>色</button>
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("spec")}>规格</button>
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("font")}>字</button>
          <div aria-hidden style={{ width: 16, height: 1, margin: "8px auto", background: "rgba(74,70,63,.15)" }} />
          <button type="button" className="cd-side-entry" onClick={() => setOpenDrawer("window")} aria-label="窗">窗</button>
        </div>
      )}

      {openDrawer === "page" && (
        <PageDrawer
          pages={doc.pages}
          currentPageId={currentPageId}
          links={doc.links}
          connectMode={connectMode}
          onSelectPage={(id) => setCurrentPageId(id)}
          onAddPage={() => addNewPage()}
          onDeletePage={(id) => requestDeletePage(id)}
          onRenamePage={(id, title) => renamePage(id, title)}
          onCompleteConnect={(toId) => completeConnect(toId)}
          onStartConnect={() => startConnect(currentPageId)}
          onCancelConnect={() => setConnectMode(null)}
          onExit={() => onBack && onBack()}
          onClose={() => setOpenDrawer(null)}
        />
      )}

      {openDrawer === "object" && <ObjectDrawer onClose={() => setOpenDrawer(null)} />}
      {openDrawer === "window" && <WindowDrawer onClose={() => setOpenDrawer(null)} />}

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
          onClose={() => setOpenDrawer(null)}
        />
      )}
      {openDrawer === "spec" && <SpecDrawer onClose={() => setOpenDrawer(null)} />}
      {openDrawer === "font" && <FontDrawer onClose={() => setOpenDrawer(null)} />}
      {openDrawer === "lock" && <LockDrawer onClose={() => setOpenDrawer(null)} />}

      {confirmState && (
        <Confirm
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      <div style={{ position: "absolute", right: 18, bottom: 18, zIndex: 1600 }}>
        {saveStatus === "error" && (
          <div style={{ background: "#ffecee", color: "#a06f64", padding: 8, borderRadius: 8 }}>
            {saveError}
          </div>
        )}
      </div>
    </div>
  );
}