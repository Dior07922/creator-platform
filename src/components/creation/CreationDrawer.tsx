// name=src/components/creation/CreationDrawer.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Page, PageLink } from "../../types/document";
import ColorPicker from "./ColorPicker";

const PAGE_LIMIT = 30;

/* ============================================================
   页抽屉
============================================================ */
type PageDrawerProps = {
  pages: Page[];
  currentPageId: string;
  links: PageLink[];
  connectMode: { from: string } | null;
  onSelectPage: (id: string) => void;
  onAddPage: (afterId?: string) => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string, title: string) => void;
  onCompleteConnect: (toId: string) => void;
  onStartConnect: () => void;
  onCancelConnect: () => void;
  onExit: () => void;
  onClose: () => void;
};

export function PageDrawer({
  pages,
  currentPageId,
  links,
  connectMode,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  onCompleteConnect,
  onCancelConnect,
  onExit,
  onClose,
}: PageDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [pageOpen, setPageOpen] = useState(true);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  function startEdit(p: Page) {
    setEditingId(p.id);
    setDraftTitle(p.title || "");
  }
  function commitEdit() {
    if (!editingId) return;
    const t = draftTitle.trim() || "新增页面";
    onRenamePage(editingId, t);
    setEditingId(null);
    setDraftTitle("");
  }
  function cancelEdit() {
    setEditingId(null);
    setDraftTitle("");
  }

  const curIdx = Math.max(0, pages.findIndex((p) => p.id === currentPageId));
  const curPage = pages[curIdx];
  const atLimit = pages.length >= PAGE_LIMIT;

  return (
    <aside className="cd-panel">
      <div className="cd-body">
        {connectMode && (
          <div className="cd-connect-hint">
            <span>点击目标页面完成连接</span>
            <button type="button" onClick={onCancelConnect}>取消</button>
          </div>
        )}

        <button
          type="button"
          className={`cd-top-head ${pageOpen ? "is-open" : ""}`}
          onClick={() => setPageOpen((v) => !v)}
        >
          <span>页面管理</span>
          <span className="cd-top-arrow">{pageOpen ? "▾" : "▸"}</span>
        </button>

        {pageOpen && (
          <div className="cd-top-body">
            {curPage && (
              <div className="cd-cur-card">
                <div className="cd-cur-name">{curPage.title || "新增页面"}</div>
                <div className="cd-cur-idx">{curIdx + 1} / {pages.length} · 上限 {PAGE_LIMIT}</div>
              </div>
            )}

            <button
              type="button"
              className="cd-cur-add"
              onClick={() => onAddPage()}
              disabled={atLimit}
              style={atLimit ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
            >
              {atLimit ? `已达上限（${PAGE_LIMIT} 页）` : "＋ 新增"}
            </button>

            <div className="cd-layers-list">
              {pages.slice().reverse().map((p, i) => {
                const realIdx = pages.length - 1 - i;
                const active = p.id === currentPageId;
                return (
                  <div
                    key={p.id}
                    className={`cd-layer-row ${active ? "is-active" : ""}`}
                    onClick={() => {
                      if (connectMode) { onCompleteConnect(p.id); return; }
                      onSelectPage(p.id);
                    }}
                  >
                    <span className="cd-layer-num">{realIdx + 1}</span>
                    {editingId === p.id ? (
                      <input
                        ref={inputRef}
                        className="cd-layer-name-input"
                        value={draftTitle}
                        maxLength={20}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="cd-layer-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEdit(p);
                        }}
                      >{p.title || "新增页面"}</span>
                    )}
                    <button
                      type="button"
                      className="cd-layer-close"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDeletePage(p.id);
                      }}
                      aria-label="删除"
                    >×</button>
                  </div>
                );
              })}
            </div>

            {links.length > 0 && (
              <div className="fp-links">
                <div className="fp-links-title">连接</div>
                {links.map((l) => (
                  <div key={`${l.from}-${l.to}`} className="fp-link-row">
                    {pages.find((p) => p.id === l.from)?.title || "?"} →{" "}
                    {pages.find((p) => p.id === l.to)?.title || "?"}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cd-footer">
        <button type="button" onClick={onExit}>← 退出创作</button>
      </div>

      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>
    </aside>
  );
}

/* ============================================================
   物抽屉（占位）
============================================================ */
export function ObjectDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="cd-panel">
      <div className="cd-body">
        <div className="cd-empty-block">
          <div className="cd-empty-title">物</div>
          <div className="cd-empty-desc">
            图片 / 图形 / 贴纸 / 手绘
            <br />下一阶段做
          </div>
        </div>
      </div>
      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>
    </aside>
  );
}

/* ============================================================
   窗（占位）
============================================================ */
export function WindowDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="cd-panel">
      <div className="cd-body">
        <div className="cd-empty-block">
          <div className="cd-empty-title">窗</div>
          <div className="cd-empty-desc">
            外面的世界
            <br />建设中
          </div>
        </div>
      </div>
      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>
    </aside>
  );
}

/* ============================================================
   色抽屉
============================================================ */
type ColorDrawerProps = {
  paperColor: string;
  paperAlpha: number;
  stageColor: string;
  stageAlpha: number;
  onPaperColorChange: (c: string) => void;
  onPaperAlphaChange: (a: number) => void;
  onStageColorChange: (c: string) => void;
  onStageAlphaChange: (a: number) => void;
  onClose: () => void;
};

export function ColorDrawer({
  paperColor,
  paperAlpha,
  stageColor,
  stageAlpha,
  onPaperColorChange,
  onPaperAlphaChange,
  onStageColorChange,
  onStageAlphaChange,
  onClose,
}: ColorDrawerProps) {
  const [target, setTarget] = useState<"paper" | "stage">("paper");
  const color = target === "paper" ? paperColor : stageColor;
  const alpha = target === "paper" ? paperAlpha : stageAlpha;
  const setColor = target === "paper" ? onPaperColorChange : onStageColorChange;
  const setAlpha = target === "paper" ? onPaperAlphaChange : onStageAlphaChange;

  return (
    <aside className="cd-panel">
      <div className="cd-tabs">
        <button
          type="button"
          className={target === "paper" ? "is-active" : ""}
          onClick={() => setTarget("paper")}
        >纸色</button>
        <button
          type="button"
          className={target === "stage" ? "is-active" : ""}
          onClick={() => setTarget("stage")}
        >背景色</button>
      </div>

      <div className="cd-body">
        <ColorPicker
          color={color}
          alpha={alpha}
          onChange={setColor}
          onAlphaChange={setAlpha}
        />
      </div>

      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>
    </aside>
  );
}

/* ============================================================
   规格抽屉
============================================================ */
export function SpecDrawer({ onClose }: { onClose: () => void }) {
  const [openCat, setOpenCat] = useState<string | null>("phone");
  const [picked, setPicked] = useState<string>("");

  const CATS: { id: string; title: string; items: string[] }[] = [
    {
      id: "phone",
      title: "手机",
      items: [
        "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16", "iPhone 17",
        "安卓 20:9", "安卓 19.5:9", "折叠屏", "自定义",
      ],
    },
    { id: "tablet", title: "平板", items: ["iPad", "安卓平板", "华为平板", "自定义"] },
    { id: "web", title: "网站", items: ["桌面网页", "移动网页", "1920 × 1080", "1440 × 900", "自定义"] },
    { id: "paper", title: "纸张 / 办公", items: ["A3", "A4", "A5", "A6", "自定义"] },
    {
      id: "social",
      title: "社交媒体",
      items: [
        "朋友圈背景", "小红书封面", "小红书长图",
        "公众号首图", "公众号正文配图", "漫画宫格",
        "小说封面", "短视频封面",
      ],
    },
    { id: "fan", title: "应援模板", items: ["自定义（自由画布）"] },
  ];

  return (
    <aside className="cd-panel">
      <div className="cd-body">
        {picked && <div className="cd-picked">当前规格：{picked}</div>}
        {CATS.map((c) => {
          const open = openCat === c.id;
          return (
            <div className="cd-sub" key={c.id}>
              <button
                type="button"
                className={`cd-sub-head ${open ? "is-open" : ""}`}
                onClick={() => setOpenCat(open ? null : c.id)}
              >
                <span>{c.title}</span>
                <span className="cd-sub-arrow">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="cd-sub-body">
                  {c.items.map((it) => (
                    <button
                      key={it}
                      type="button"
                      className="cd-item"
                      onClick={() => {
                        setPicked(it);
                        alert(`已选规格：${it}（尺寸切换下阶段实现）`);
                      }}
                    >
                      {it}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>
    </aside>
  );
}

/* ============================================================
   字抽屉
============================================================ */
export function FontDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside className="cd-panel">
      <div className="cd-body">
        <div className="cd-empty-block">
          <div className="cd-empty-title">字</div>
          <div className="cd-empty-desc">
            字体 / 字号 / 粗细 / 字距 / 行距 / 对齐 / 颜色
            <br />下一阶段做
          </div>
        </div>
      </div>
      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>
    </aside>
  );
}

/* ============================================================
   🔒 方向锁
============================================================ */
export function LockDrawer({ onClose }: { onClose: () => void }) {
  const [dirDialog, setDirDialog] = useState(false);

  async function applyLock(kind: "landscape" | "portrait") {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.lock({ orientation: kind });
    } catch (err) {
      console.warn("方向锁定失败：", err);
    }
    setDirDialog(false);
  }

  async function releaseLock() {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.unlock();
    } catch (err) {
      console.warn("方向解锁失败：", err);
    }
  }

  return (
    <aside className="cd-panel">
      {/* 让内容垂直居中：外层撑满、内层居中 */}
      <div
        className="cd-body"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "stretch",
            gap: 12,
            paddingBottom: 60,
          }}
        >
          <button
            type="button"
            className="cd-item"
            onClick={() => setDirDialog(true)}
            style={{
              textAlign: "center",
              padding: "16px 14px",
              fontSize: 14,
            }}
          >
            🔓 锁方向
          </button>
          <button
            type="button"
            className="cd-item"
            onClick={releaseLock}
            style={{
              textAlign: "center",
              padding: "16px 14px",
              fontSize: 14,
            }}
          >
            ↺ 自动旋转
          </button>
        </div>
      </div>

      <button
        type="button"
        className="cd-collapse-handle"
        onClick={onClose}
        aria-label="收起"
      >‹</button>

      {dirDialog && (
        <div className="mini-confirm-overlay" onClick={() => setDirDialog(false)}>
          <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="mini-confirm-msg" style={{ textAlign: "left", fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>锁定方向</div>
              <div style={{ fontSize: 11, color: "#918981", marginBottom: 14, lineHeight: 1.7 }}>
                锁定后需到系统设置里重新开启自动旋转。
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => applyLock("landscape")}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid rgba(74,70,63,.15)", background: "#fff", fontSize: 13, cursor: "pointer" }}
                >横屏</button>
                <button
                  type="button"
                  onClick={() => applyLock("portrait")}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid rgba(74,70,63,.15)", background: "#fff", fontSize: 13, cursor: "pointer" }}
                >竖屏</button>
              </div>
            </div>
            <div className="mini-confirm-actions" style={{ marginTop: 12 }}>
              <button type="button" className="mini-confirm-cancel" onClick={() => setDirDialog(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}