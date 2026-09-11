// name=src/CreationMinimalRoom.tsx
import React, { useEffect, useRef, useState } from "react";
import { makeEmptyDoc, DocModel, loadLocalDoc, saveLocalDoc, cloudSaveDoc, Page, PageLink } from "./documents";

const A4_W = 794;
const A4_H = 1123;

type Props = {
  onBack?: () => void;
  saveTarget?: "local" | "cloud";
  initialText?: string;
  docKey?: string;
};

function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="panel-overlay" role="dialog" aria-modal>
      <div style={{ background: "white", padding: 16, borderRadius: 10, maxWidth: 320 }}>
        <div style={{ marginBottom: 12 }}>{message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 12px" }}>取消</button>
          <button onClick={onConfirm} style={{ padding: "8px 12px", background: "#a88968", color: "#fff", borderRadius: 6 }}>确认</button>
        </div>
      </div>
    </div>
  );
}

export default function CreationMinimalRoom({ onBack, saveTarget, initialText, docKey }: Props) {
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

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const [connectMode, setConnectMode] = useState<{ from: string } | null>(null);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    function calc() {
      const el = canvasWrapRef.current;
      if (!el) return;
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - 24;
      const s = Math.min(availW / A4_W, availH / A4_H);
      setScale(Math.max(0.2, s));
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const saveTimer = useRef<number | null>(null);
  function scheduleLocalSave(nextDoc: DocModel) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const ok = saveLocalDoc(nextDoc);
      if (ok) {
        setSaveStatus("saved");
        setSaveError(null);
      } else {
        setSaveStatus("error");
        setSaveError("本地保存失败（localStorage）");
      }
    }, 600);
  }

  function findPage(id: string) {
    return doc.pages.find((p) => p.id === id) || null;
  }

  function setDocAndPersist(next: DocModel) {
    next.updatedAt = Date.now();
    setDoc(next);
    scheduleLocalSave(next);
  }

  function addNewPage(afterPageId?: string) {
    const now = Date.now();
    const page: Page = {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${now}`,
      title: `页面 ${doc.pages.length + 1}`,
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    const pages = [...doc.pages];
    if (afterPageId) {
      const idx = pages.findIndex((p) => p.id === afterPageId);
      pages.splice(idx + 1, 0, page);
    } else {
      pages.push(page);
    }
    const next = { ...doc, pages };
    setDocAndPersist(next);
    setCurrentPageId(page.id);
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
      onConfirm: () => {
        setConfirmState(null);
        deletePage(pageId);
      },
    });
  }

  function deletePage(pageId: string) {
    const pages = doc.pages.filter((p) => p.id !== pageId);
    const links = doc.links.filter((l) => l.from !== pageId && l.to !== pageId);
    const next = { ...doc, pages, links, updatedAt: Date.now() };
    setDocAndPersist(next);
    setCurrentPageId(pages[0]?.id || "");
  }

  function startConnect(fromPageId: string) {
    setConnectMode({ from: fromPageId });
    setMenuVisible(false);
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
      const next = { ...doc, links, updatedAt: Date.now() };
      setDocAndPersist(next);
      setConnectMode(null);
      return;
    }
    const link: PageLink = { from: connectMode.from, to: toPageId, createdAt: Date.now() };
    const next = { ...doc, links: [...doc.links, link], updatedAt: Date.now() };
    setDocAndPersist(next);
    setConnectMode(null);
  }

  function updateCurrentPageContent(content: string) {
    const pages = doc.pages.map((p) => (p.id === currentPageId ? { ...p, content, updatedAt: Date.now() } : p));
    const next = { ...doc, pages, updatedAt: Date.now() };
    setDoc(next);
    scheduleLocalSave(next);
  }

  function handleCanvasPointerDown(e: React.PointerEvent) {
    if ((e as any).button && (e as any).button !== 0) return;
    longPressTimer.current = window.setTimeout(() => {
      setMenuAt({ x: e.clientX, y: e.clientY });
      setMenuVisible(true);
    }, 600);
  }
  function handleCanvasPointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  async function handleSave() {
    const alsoCloud = saveTarget === "cloud";
    setSaveStatus("saving");
    setSaveError(null);
    const okLocal = saveLocalDoc(doc);
    if (!okLocal) {
      setSaveStatus("error");
      setSaveError("本地保存失败");
      return;
    }
    if (alsoCloud) {
      const res = await cloudSaveDoc(doc);
      if (!res.ok) {
        setSaveStatus("error");
        setSaveError(res.error || "云端保存失败");
        return;
      }
    }
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 800);
  }

  async function handleShare() {
    try {
      const current = findPage(currentPageId || "");
      const payload = { docId: doc.id, title: doc.title, page: current || null, links: doc.links };
      const textToShare = JSON.stringify(payload, null, 2);
      if (navigator.share) {
        await navigator.share({
          title: doc.title || "苒境文档",
          text: current ? `${current.title}\n\n${current.content}` : doc.title,
        });
      } else {
        const blob = new Blob([textToShare], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err: any) {
      alert("分享失败：" + (err?.message || String(err)));
    }
  }

  const currentPage = findPage(currentPageId || "") || doc.pages[0];

  useEffect(() => {
    if (!currentPageId && doc.pages.length) setCurrentPageId(doc.pages[0].id);
    if (doc.pages.find((p) => p.id === currentPageId) == null) {
      setCurrentPageId(doc.pages[0]?.id || "");
    }
    if (!loadLocalDoc(doc.id)) saveLocalDoc(doc);
  }, [doc, currentPageId]);

  return (
    <div className="creation-room" style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8f5ef" }}>
      {/* 顶栏 */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#fbfaf7", flex: "0 0 auto" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <button onClick={() => onBack && onBack()} style={{ padding: "6px 10px", border: 0, background: "transparent", color: "#756f68", fontSize: 14, cursor: "pointer" }}>← 返回</button>
          <strong style={{ fontFamily: '"Songti SC","STSong",serif', fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</strong>
          <span style={{ color: "#7d7a74", fontSize: 12, whiteSpace: "nowrap" }}>· 第 {doc.pages.findIndex(p => p.id === currentPage?.id) + 1} / {doc.pages.length} 页</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#8b857a" }}>{saveTarget === "cloud" ? "云端模式" : "本地模式"}</span>
          <button onClick={handleShare} style={{ padding: "6px 10px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "#fff", color: "#57524c", fontSize: 12, cursor: "pointer" }}>分享</button>
          <button onClick={handleSave} className="save-button" aria-label="保存">
            {saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "已保存" : "保存"}
          </button>
        </div>
      </header>

      {/* A4 画布区 */}
      <div
        ref={canvasWrapRef}
        style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: 12, position: "relative" }}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        <div
          style={{
            width: A4_W * scale,
            height: A4_H * scale,
            margin: "0 auto",
            position: "relative",
            background: "#fff",
            boxShadow: "0 2px 16px rgba(0,0,0,.08)",
            border: "1px solid rgba(74,70,63,.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: A4_W,
              height: A4_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              padding: "72px 64px",
              boxSizing: "border-box",
              position: "relative",
            }}
          >
            <textarea
              value={currentPage?.content || ""}
              onChange={(e) => updateCurrentPageContent(e.target.value)}
              onFocus={() => document.querySelector(".handbook-app")?.classList.add("editor-open")}
              onBlur={() => document.querySelector(".handbook-app")?.classList.remove("editor-open")}
              placeholder="在此编辑当前页面内容。长按空白区域打开页面操作菜单。"
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                outline: "none",
                resize: "none",
                background: "transparent",
                fontFamily: '"Songti SC","STSong","PingFang SC",serif',
                fontSize: 15,
                lineHeight: 1.9,
                color: "#3a352e",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </div>

      {/* 底部：页码 + 新建页 */}
      <footer style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid rgba(0,0,0,0.05)", background: "#fbfaf7" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {doc.pages.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => {
                if (connectMode) { completeConnect(p.id); return; }
                setCurrentPageId(p.id);
              }}
              style={{
                flex: "0 0 auto",
                minWidth: 36,
                height: 32,
                padding: "0 10px",
                borderRadius: 16,
                border: "1px solid rgba(0,0,0,0.06)",
                background: p.id === currentPageId ? "#ece6de" : "#fff",
                color: "#5d574f",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {connectMode ? `连到 ${idx + 1}` : `第${idx + 1}页`}
            </button>
          ))}
          <button
            onClick={() => addNewPage()}
            style={{ flex: "0 0 auto", minWidth: 36, height: 32, padding: "0 12px", borderRadius: 16, border: "1px dashed rgba(0,0,0,0.15)", background: "transparent", color: "#756f68", fontSize: 12, cursor: "pointer" }}
          >＋</button>
        </div>
        {connectMode && <span style={{ color: "#a06f64", fontSize: 12 }}>请选择目标页</span>}
      </footer>

      {/* 长按菜单 */}
      {menuVisible && menuAt && (
        <div className="panel-overlay" onClick={() => { setMenuVisible(false); setMenuAt(null); }} style={{ pointerEvents: "auto" }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: menuAt.x,
              top: menuAt.y,
              transform: "translate(-50%, 6px)",
              background: "#fff",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              padding: 8,
              minWidth: 160,
              zIndex: 2000,
            }}
          >
            <button onClick={() => { addNewPage(currentPage?.id); setMenuVisible(false); }} style={{ display: "block", width: "100%", padding: "8px 10px", textAlign: "left" }}>增加新页</button>
            <button onClick={() => { setMenuVisible(false); requestDeletePage(currentPage?.id || ""); }} style={{ display: "block", width: "100%", padding: "8px 10px", textAlign: "left" }}>删除当前页</button>
            <button onClick={() => { startConnect(currentPage?.id || ""); }} style={{ display: "block", width: "100%", padding: "8px 10px", textAlign: "left" }}>点击连接（选择目标页）</button>
          </div>
        </div>
      )}

      {confirmState && <Confirm message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}

      <div style={{ position: "absolute", right: 18, bottom: 18, zIndex: 1600 }}>
        {saveStatus === "error" && <div style={{ background: "#ffecee", color: "#a06f64", padding: 8, borderRadius: 8, fontSize: 12 }}>{saveError}</div>}
      </div>
    </div>
  );
}