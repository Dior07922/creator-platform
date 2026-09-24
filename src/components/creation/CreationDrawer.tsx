// name=src/components/creation/CreationDrawer.tsx
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Page, PageLink, ShapeKind, DocModel } from "../../types/document";
import type { BrushParams, EasingName } from "./Editor";
import ColorPicker from "./ColorPicker";
import { FONT_LIBRARY } from "../../lib/fonts";
import { SPEC_CATEGORIES } from "../../lib/paperSpecs";
import {
  saveSnapshot, listSnapshots, getSnapshot, deleteSnapshot,
  formatSnapshotTime, MAX_SNAPSHOTS,
  type SnapshotMeta,
} from "../../lib/snapshots";
import { API_BASE } from "../../lib/apiBase";

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
  const clickTimerRef = useRef<number | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);

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

  function handleCardClick(p: Page) {
    if (editingId === p.id) return;
    if (connectMode) { onCompleteConnect(p.id); return; }

    // 立即可见的按下反馈
    setPressedId(p.id);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }

    if (clickTimerRef.current != null) {
      // 180ms 内的第二下 → 双击 → 进改名
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      setPressedId(null);
      startEdit(p);
      return;
    }
    // 第一下 → 180ms 后切页
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      setPressedId(null);
      onSelectPage(p.id);
      onClose();
    }, 180);
  }

  const atLimit = pages.length >= PAGE_LIMIT;

  return (
    <aside
      className="cd-panel"
      style={{ width: 180, maxWidth: 180, minWidth: 180 }}
    >
      <div style={{
        flex: "none",
        padding: "calc(env(safe-area-inset-top) + 12px) 12px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", color: "#3a352e" }}>
          页面
        </span>
        <span style={{ fontSize: 10, color: "#a49a8f" }}>
          {pages.length}/{PAGE_LIMIT}
        </span>
      </div>

      {connectMode && (
        <div style={{
          flex: "none",
          margin: "0 10px 8px",
          padding: "8px 10px",
          borderRadius: 8,
          background: "#f0e8dc",
          color: "#75655a",
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          <div style={{ marginBottom: 6 }}>点击目标页面完成连接</div>
          <button
            type="button"
            onClick={onCancelConnect}
            style={{
              border: 0, background: "transparent", color: "#5f554d",
              fontSize: 11, textDecoration: "underline", cursor: "pointer", padding: 0,
            }}
          >取消</button>
        </div>
      )}

      <div className="cd-body" style={{ padding: "2px 10px 8px", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pages.map((p, idx) => {
            const active = p.id === currentPageId;
            const label = p.title || "未命名";
            const wRatio = p.paperW && p.paperH ? p.paperW / p.paperH : 0.75;
            const thumbH = Math.max(52, Math.min(88, 64 / Math.max(0.45, Math.min(1.6, wRatio))));

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleCardClick(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: 6,
                  border: active ? "1.5px solid #3a352e" : "1px solid rgba(74,70,63,.10)",
                  borderRadius: 10,
                  background: active ? "#f1ece4" : "#fffdfa",
                  cursor: "pointer",
                  textAlign: "left",
                  transform: pressedId === p.id ? "scale(0.96)" : "scale(1)",
                  boxShadow: pressedId === p.id
                    ? "0 0 0 2px rgba(58,53,46,.18)"
                    : "none",
                  transition: "transform .08s ease, box-shadow .08s ease, background .15s, border-color .15s",
                }}
              >
                <div style={{
                  flex: "none",
                  width: 44,
                  height: thumbH,
                  maxHeight: 76,
                  borderRadius: 6,
                  background: p.paperColor || "#ffffff",
                  border: pressedId === p.id
                    ? "1.5px solid #3a352e"
                    : "1px solid rgba(74,70,63,.10)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "border-color .08s",
                }}>
                  <div style={{
                    position: "absolute", left: 4, top: 3,
                    fontSize: 8, color: "rgba(74,70,63,.4)",
                  }}>{idx + 1}</div>
                </div>

                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  {editingId === p.id ? (
                    <input
                      ref={inputRef}
                      value={draftTitle}
                      maxLength={20}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        height: 22,
                        padding: "0 5px",
                        border: "1px solid #75655a",
                        borderRadius: 5,
                        background: "#fff",
                        color: "#3a352e",
                        fontSize: 11,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <span
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 11,
                        fontWeight: active ? 600 : 400,
                        color: active ? "#2b241c" : "#57524c",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >{label}</span>
                  )}
                  {active && (
                    <span style={{ fontSize: 9, color: "#a49a8f", letterSpacing: ".06em" }}>当前</span>
                  )}
                </div>

                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDeletePage(p.id);
                  }}
                  style={{
                    flex: "none",
                    width: 18, height: 18,
                    borderRadius: 9,
                    color: active ? "#c0392b" : "#cbc6c0",
                    fontSize: 13, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >×</span>
              </button>
            );
          })}

          {!atLimit && (
            <button
              type="button"
              onClick={() => { onAddPage(); onClose(); }}
              style={{
                width: "100%",
                height: 36,
                borderRadius: 10,
                border: "1.5px dashed rgba(74,70,63,.24)",
                background: "transparent",
                color: "#756f68",
                fontSize: 12,
                cursor: "pointer",
                letterSpacing: ".04em",
              }}
            >＋ 新增页面</button>
          )}
        </div>

        {links.length > 0 && (
          <div style={{
            marginTop: 12,
            paddingTop: 8,
            borderTop: "1px solid rgba(74,70,63,.08)",
          }}>
            <div style={{ fontSize: 10, color: "#8b857a", marginBottom: 6 }}>连接</div>
            {links.map((l) => (
              <div key={`${l.from}-${l.to}`} style={{
                fontSize: 10, color: "#57524c", margin: "3px 0",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {pages.find((p) => p.id === l.from)?.title || "?"} → {pages.find((p) => p.id === l.to)?.title || "?"}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: "none", padding: "8px 10px calc(env(safe-area-inset-bottom) + 10px)" }}>
        <button
          type="button"
          onClick={onExit}
          style={{
            width: "100%", height: 36,
            border: 0, borderRadius: 10,
            background: "#5f554d", color: "#fff",
            fontSize: 12, cursor: "pointer",
            letterSpacing: ".06em",
          }}
        >← 退出创作</button>
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
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130 }}>
      <div className="cd-body">
        <div className="cd-empty-block">
          <div className="cd-empty-title">物</div>
          <div className="cd-empty-desc">
            图片 / 贴纸 / 手绘
            <br />建设中
          </div>
        </div>
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
    </aside>
  );
}

/* ============================================================
   形抽屉
============================================================ */
/** 笔刷手感默认值 —— 与 Editor.tsx renderShape 的缺省值保持一致，
 *  这样未存参数的历史笔迹和新建笔迹渲染结果一致。 */
export const BRUSH_DEFAULTS: BrushParams = {
  size: undefined,
  thinning: 0.35,
  smoothing: 0.55,
  streamline: 0.45,
  easingName: "linear",
  startTaper: 0,
  startCap: true,
  endTaper: 0,
  endCap: false,
  fill: false,
  simulatePressure: true,
};

const PEN_TOOLS: { kind: ShapeKind; name: string; sw: number }[] = [
  { kind: "crayon",    name: "蜡笔",   sw: 3.2 },
  { kind: "free",      name: "自由笔", sw: 1.4 },
  { kind: "sketch",    name: "素描笔", sw: 2.0 },
  { kind: "marker",    name: "马克笔", sw: 4.0 },
  { kind: "pencil",    name: "铅笔",   sw: 1.8 },
  { kind: "ink",       name: "勾线笔", sw: 1.0 },
  { kind: "handwrite", name: "手写笔", sw: 2.4 },
];

const GEOM_TOOLS: { kind: ShapeKind; name: string; icon: string }[] = [
  { kind: "line",     name: "直线",   icon: "／" },
  { kind: "arrow",    name: "箭头",   icon: "→" },
  { kind: "rect",     name: "矩形",   icon: "▢" },
  { kind: "circle",   name: "圆形",   icon: "◯" },
  { kind: "triangle", name: "三角",   icon: "△" },
  { kind: "heart",    name: "心形",   icon: "♡" },
  { kind: "star",     name: "星形",   icon: "☆" },
  { kind: "speech",   name: "对话",   icon: "▭" },
  { kind: "cloud",    name: "云朵",   icon: "☁" },
];

const EMOJIS = [
  "(´・ω・`)", "(*^▽^*)", "(≧▽≦)", "٩(•̤̀ᵕ•̤́๑)",
  "(๑•̀ㅂ•́)و✧", "♡( ◡‿◡ )", "(｡•́︿•̀｡)", "o(≧v≦)o",
  "ヽ(￣▽￣)ノ", "(づ｡◕‿‿◕｡)づ", "(*≧ω≦)", "(￣▽￣)",
];

const LINE_ARTS: { kind: ShapeKind; name: string; icon: string }[] = [
  { kind: "heart",    name: "心形线", icon: "♡" },
  { kind: "star",     name: "五角星", icon: "☆" },
  { kind: "speech",   name: "对话框", icon: "▭" },
  { kind: "cloud",    name: "云朵",   icon: "☁" },
  { kind: "triangle", name: "三角",   icon: "△" },
];

export function ShapeDrawer({
  onClose, onPickTool, onInsertText, onInsertShape,
  brush, onBrushChange,
}: {
  onClose: () => void;
  onPickTool: (kind: ShapeKind) => void;
  onInsertText: (text: string) => void;
  onInsertShape: (kind: ShapeKind) => void;
  brush: BrushParams;
  onBrushChange: (patch: Partial<BrushParams>) => void;
}) {
  const [tab, setTab] = useState<"pen" | "shapes" | "emoji" | "line" | "eraser">("pen");

  const tabsWrapStyle: React.CSSProperties = {
    display: "flex", gap: 2, padding: 4, margin: "0 0 10px 0",
    position: "sticky", top: 0, zIndex: 3,
    background: "#fbfaf7", borderRadius: 10,
    boxShadow: "0 2px 4px rgba(74,70,63,.04)",
  };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, height: 30, border: 0, borderRadius: 8,
    background: active ? "#fff" : "transparent",
    color: active ? "#3a352e" : "#756f68",
    fontWeight: active ? 600 : 400,
    fontSize: 10, fontFamily: "inherit", cursor: "pointer",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.06)" : "none",
    padding: 0,
  });
  const fixBtnStyle: React.CSSProperties = {
    flex: 1, height: 30, border: 0, borderRadius: 6,
    background: "rgba(74,70,63,.06)", color: "#4a463f",
    fontSize: 14, cursor: "pointer", padding: 0,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: "#8a8178", letterSpacing: ".1em",
    margin: "14px 2px 10px",
  };
  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: 36, height: 20, borderRadius: 10, border: 0, padding: 0,
    background: on ? "#5f554d" : "rgba(74,70,63,.15)",
    position: "relative", cursor: "pointer", flex: "none",
  });
  const knobStyle = (on: boolean): React.CSSProperties => ({
    position: "absolute", top: 2, left: on ? 18 : 2,
    width: 16, height: 16, borderRadius: 8, background: "#fff",
    transition: "left .2s",
  });
  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginBottom: 8,
  };

  return (
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130, paddingTop: "calc(env(safe-area-inset-top) + 8px)", top: 0 }}>
      <div className="cd-body" style={{ paddingTop: 0 }}>

        {/* 撤销 / 重做 / 复制 */}
        <div style={{ display: "flex", gap: 4, padding: "0 4px 10px", borderBottom: "1px solid rgba(74,70,63,.08)", marginBottom: 10 }}>
          <button type="button" title="撤销" onClick={() => window.dispatchEvent(new CustomEvent("ranjing:cmd", { detail: "undo" }))} style={fixBtnStyle}>↶</button>
          <button type="button" title="重做" onClick={() => window.dispatchEvent(new CustomEvent("ranjing:cmd", { detail: "redo" }))} style={fixBtnStyle}>↷</button>
          <button type="button" title="复制" onClick={() => window.dispatchEvent(new CustomEvent("ranjing:cmd", { detail: "copy" }))} style={fixBtnStyle}>⧉</button>
        </div>

        {/* tab 切换 */}
        <div style={tabsWrapStyle}>
          <button type="button" style={tabBtnStyle(tab === "pen")} onClick={() => setTab("pen")}>笔</button>
          <button type="button" style={tabBtnStyle(tab === "shapes")} onClick={() => setTab("shapes")}>形状</button>
          <button type="button" style={tabBtnStyle(tab === "emoji")} onClick={() => setTab("emoji")}>颜</button>
          <button type="button" style={tabBtnStyle(tab === "line")} onClick={() => setTab("line")}>线</button>
          <button type="button" style={tabBtnStyle(tab === "eraser")} onClick={() => setTab("eraser")}>橡</button>
        </div>

        {tab === "pen" && (
          <>
            {/* 笔列表 */}
            <div style={sectionLabel}>笔</div>
            {PEN_TOOLS.map((t) => (
              <button key={t.kind} type="button" className="cd-item"
                onClick={() => onPickTool(t.kind)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", fontSize: 14, width: "100%" }}>
                <span style={{ width: 26, display: "flex", justifyContent: "center", flex: "none" }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" style={{ display: "block", flex: "none" }}>
                    <path
                      d="M4 20 L7 17 L17 7 Q19 5 21 7 Q23 9 21 11 L11 21 L8 21 L4 20 Z"
                      fill="none"
                      stroke="#3a352e"
                      strokeWidth={t.sw / 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{t.name}</span>
              </button>
            ))}


            {/* 笔刷手感参数面板 —— perfect-freehand */}
            <div style={{
              marginTop: 14, padding: "12px 10px",
              background: "rgba(74,70,63,.04)", borderRadius: 10,
            }}>
              <div style={{ fontSize: 11, color: "#8a8178", letterSpacing: ".1em", marginBottom: 12 }}>笔刷手感</div>

              <PenSlider label="尺寸" value={brush.size ?? 0} min={0} max={40} step={1}
                onChange={(v) => onBrushChange({ size: v > 0 ? v : undefined })} />
              <PenSlider label="精简" value={brush.streamline} min={0} max={1} step={0.05}
                onChange={(v) => onBrushChange({ streamline: v })} />
              <PenSlider label="平滑" value={brush.smoothing} min={0} max={1} step={0.05}
                onChange={(v) => onBrushChange({ smoothing: v })} />

              {/* 缓释（easing） */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#756f68", width: 52, flex: "none" }}>缓释</span>
                <select
                  value={brush.easingName ?? "linear"}
                  onChange={(e) => onBrushChange({ easingName: e.target.value as EasingName })}
                  style={{
                    flex: 1, minWidth: 0, height: 26, padding: "0 6px",
                    border: "1px solid rgba(74,70,63,.15)", borderRadius: 6,
                    background: "#fff", color: "#3a352e", fontSize: 11, outline: "none",
                  }}
                >
                  <option value="linear">线性</option>
                  <option value="easeIn">缓入</option>
                  <option value="easeOut">缓出</option>
                  <option value="easeInOut">缓入缓出</option>
                </select>
              </div>

              <PenSlider label="渐弱起步" value={brush.startTaper} min={0} max={60} step={1}
                onChange={(v) => onBrushChange({ startTaper: v })} />

              {/* 启动 cap */}
              <div style={rowStyle}>
                <span style={{ fontSize: 11, color: "#756f68" }}>启动</span>
                <button type="button" aria-pressed={!!brush.startCap}
                  onClick={() => onBrushChange({ startCap: !brush.startCap })} style={toggleStyle(!!brush.startCap)}>
                  <span style={knobStyle(!!brush.startCap)} />
                </button>
              </div>


              <PenSlider label="锥形端" value={brush.endTaper} min={0} max={60} step={1}
                onChange={(v) => onBrushChange({ endTaper: v })} />

              {/* 缓和结尾 cap */}
              <div style={rowStyle}>
                <span style={{ fontSize: 11, color: "#756f68" }}>缓和结尾</span>
                <button type="button" aria-pressed={!!brush.endCap}
                  onClick={() => onBrushChange({ endCap: !brush.endCap })} style={toggleStyle(!!brush.endCap)}>
                  <span style={knobStyle(!!brush.endCap)} />
                </button>
              </div>

              {/* 充满 */}
              <div style={rowStyle}>
                <span style={{ fontSize: 11, color: "#756f68" }}>充满</span>
                <button type="button" aria-pressed={!!brush.fill}
                  onClick={() => onBrushChange({ fill: !brush.fill })} style={toggleStyle(!!brush.fill)}>
                  <span style={knobStyle(!!brush.fill)} />
                </button>
              </div>

              <PenSlider label="中风" value={brush.thinning} min={-1} max={1} step={0.05}
                onChange={(v) => onBrushChange({ thinning: v })} />

              {/* 模拟压力 */}
              <div style={{ ...rowStyle, marginTop: 10, marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: "#756f68" }}>模拟压力</span>
                <button type="button" aria-pressed={brush.simulatePressure}
                  onClick={() => onBrushChange({ simulatePressure: !brush.simulatePressure })}
                  style={toggleStyle(brush.simulatePressure)}>
                  <span style={knobStyle(brush.simulatePressure)} />
                </button>
              </div>

              {/* 重置 */}
              <button
                type="button"
                onClick={() => onBrushChange({ ...BRUSH_DEFAULTS })}
                style={{
                  width: "100%", height: 30, marginTop: 12, borderRadius: 6,
                  border: "1px solid rgba(74,70,63,.15)", background: "#fff",
                  color: "#756f68", fontSize: 11, cursor: "pointer",
                }}
              >重置选项</button>
            </div>
          </>
        )}

        {tab === "shapes" && (
          <>
            <div className="cd-sub-label">形状</div>
            {GEOM_TOOLS.map((t) => (
              <button key={t.kind} type="button" className="cd-item"
                onClick={() => onPickTool(t.kind)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", fontSize: 14, width: "100%" }}>
                <span style={{ fontSize: 18, width: 26, textAlign: "center", color: "#5f554d" }}>{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </>
        )}

        {tab === "emoji" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {EMOJIS.map((e, i) => (
              <button key={i} type="button" className="cd-item"
                onClick={() => onInsertText(e)}
                style={{ padding: "12px 10px", fontSize: 14, width: "100%", textAlign: "left" }}>{e}</button>
            ))}
          </div>
        )}

        {tab === "line" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {LINE_ARTS.map((t) => (
              <button key={t.kind} type="button" className="cd-item"
                onClick={() => onInsertShape(t.kind)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px", fontSize: 14, width: "100%" }}>
                <span style={{ fontSize: 20, width: 26, textAlign: "center", color: "#5f554d" }}>{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "eraser" && (
          <div style={{ padding: "4px 0" }}>
            <button type="button" onClick={() => onPickTool("eraser")}
              style={{
                width: "100%", height: 72, borderRadius: 12, border: 0,
                background: "linear-gradient(180deg,#fff 0%,#f7f3ec 100%)",
                boxShadow: "0 2px 8px rgba(90,80,65,.12)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                fontSize: 16, color: "#3a352e", cursor: "pointer",
              }}>
              <span style={{ fontSize: 24 }}>⌫</span>
              <span>橡皮擦</span>
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: "#a49a8f", textAlign: "center", lineHeight: 1.6 }}>
              划过已画的线条<br />即可擦除
            </div>
          </div>
        )}
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
    </aside>
  );
}

/* ============================================================
   窗
============================================================ */
export function WindowDrawer({ onClose }: { onClose: () => void }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { CapacitorHttp } = await import("@capacitor/core");
        const res = await CapacitorHttp.get({
          url: `${API_BASE}/api/hotspots?source=%E5%85%A8%E9%83%A8`,
        });
        if (!alive) return;
        const d = res.data;
        const list = Array.isArray(d?.items) ? d.items : [];
        setItems(list);
      } catch (e: any) {
        if (alive) setErr(e?.message || "加载失败");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130 }}>
      <div className="cd-body">
        <div style={{
          fontSize: 13, fontWeight: 600, color: "#3a352e",
          letterSpacing: ".1em", padding: "4px 4px 12px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ width: 5, height: 11, border: "1.2px solid #756f68", borderRight: "0.6px solid #756f68", borderRadius: "2px 0 0 2px" }} />
            <span style={{ width: 5, height: 11, border: "1.2px solid #756f68", borderLeft: "0.6px solid #756f68", borderRadius: "0 2px 2px 0" }} />
          </span>
          <span>门 · 社交</span>
        </div>

        {loading && <div style={{ fontSize: 12, color: "#918981", padding: "12px 4px" }}>加载中…</div>}
        {!loading && err && <div style={{ fontSize: 12, color: "#a06f64", padding: "12px 4px" }}>{err}</div>}
        {!loading && !err && items.length === 0 && (
          <div style={{ fontSize: 12, color: "#918981", padding: "12px 4px" }}>暂无内容</div>
        )}
        {!loading && !err && items.map((it, i) => (
          <button
            key={it.id ?? i}
            type="button"
            onClick={() => {
              const url = it.url || it.link;
              if (url && typeof window !== "undefined") window.open(url, "_blank");
            }}
            style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              width: "100%", padding: "10px 10px", marginBottom: 6,
              border: "1px solid rgba(74,70,63,.10)",
              borderRadius: 10, background: "#fffdfa",
              textAlign: "left", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 10, color: "#a49a8f", flex: "none", paddingTop: 2, width: 16 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 12, color: "#3a352e", lineHeight: 1.5,
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              } as React.CSSProperties}>
                {it.title || "(无标题)"}
              </span>
              {it.sourceLabel && (
                <span style={{ display: "block", fontSize: 10, color: "#a49a8f", marginTop: 4 }}>
                  {it.sourceLabel}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
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
  onPicked?: () => void;
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
  onPicked,
  onClose,
}: ColorDrawerProps) {
  const [target, setTarget] = useState<"paper" | "stage">("paper");
  const color = target === "paper" ? paperColor : stageColor;
  const alpha = target === "paper" ? paperAlpha : stageAlpha;
  const setColor = target === "paper" ? onPaperColorChange : onStageColorChange;
  const setAlpha = target === "paper" ? onPaperAlphaChange : onStageAlphaChange;

  return (
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130 }}>
      <div className="cd-tabs">
        <button type="button" className={target === "paper" ? "is-active" : ""} onClick={() => setTarget("paper")}>纸色</button>
        <button type="button" className={target === "stage" ? "is-active" : ""} onClick={() => setTarget("stage")}>背景色</button>
      </div>
      <div className="cd-body">
        <ColorPicker color={color} alpha={alpha} onChange={setColor} onAlphaChange={setAlpha} onCommit={onPicked} />
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
    </aside>
  );
}

/* ============================================================
   规格
============================================================ */
const customInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 36, padding: "0 8px", boxSizing: "border-box",
  border: "1px solid rgba(74,70,63,.2)", borderRadius: 8,
  background: "#fff", color: "#3a352e", fontSize: 14, outline: "none",
  textAlign: "center",
};

function CustomSpecDialog({ onConfirm, onCancel }: { onConfirm: (w: number, h: number) => void; onCancel: () => void }) {
  const [w, setW] = useState("1080");
  const [h, setH] = useState("1080");
  return (
    <div className="mini-confirm-overlay" onClick={onCancel}>
      <div className="mini-confirm-box" style={{ width: "min(86vw, 300px)", maxWidth: 300, boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg" style={{ marginBottom: 12 }}>自定义尺寸（px）</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input autoFocus value={w} inputMode="numeric" onChange={(e) => setW(e.target.value.replace(/\D/g, ""))} style={customInputStyle} />
          <span style={{ alignSelf: "center", color: "#8b857a" }}>×</span>
          <input value={h} inputMode="numeric" onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} style={customInputStyle} />
        </div>
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok"
            onClick={() => {
              const nw = Math.max(50, Math.min(8000, Number(w) || 0));
              const nh = Math.max(50, Math.min(8000, Number(h) || 0));
              if (nw && nh) onConfirm(nw, nh);
            }}>确定</button>
        </div>
      </div>
    </div>
  );
}

export function SpecDrawer({ onClose, onPicked }: { onClose: () => void; onPicked?: (w: number, h: number) => void }) {
  const [openCat, setOpenCat] = useState<string | null>("phone");
  const [picked, setPicked] = useState<string>("");
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130 }}>
      <div className="cd-body">
        {picked && <div className="cd-picked">当前规格：{picked}</div>}
        {SPEC_CATEGORIES.map((c) => {
          const open = openCat === c.id;
          return (
            <div className="cd-sub" key={c.id}>
              <button type="button" className={`cd-sub-head ${open ? "is-open" : ""}`} onClick={() => setOpenCat(open ? null : c.id)}>
                <span>{c.title}</span><span className="cd-sub-arrow">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="cd-sub-body">
                  {c.items.map((it) => (
                    <button key={it.name} type="button" className="cd-item"
                      onClick={() => { setPicked(it.name); onPicked?.(it.w, it.h); }}>
                      {it.name}
                      {it.w > 0 && it.h > 0 && (
                        <span style={{ color: "#aaa39b", fontSize: 10, marginLeft: 6 }}>{it.w}×{it.h}</span>
                      )}
                    </button>
                  ))}
                  {c.allowCustom && (
                    <button type="button" className="cd-item" onClick={() => setCustomOpen(true)}>自定义…</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
      {customOpen && (
        <CustomSpecDialog
          onConfirm={(w, h) => { setCustomOpen(false); setPicked(`自定义 ${w}×${h}`); onPicked?.(w, h); }}
          onCancel={() => setCustomOpen(false)}
        />
      )}
    </aside>
  );
}

/* ============================================================
   字
============================================================ */
export function FontDrawer({
  currentFont, onFontChange, onPicked, onClose,
}: {
  currentFont: string;
  onFontChange: (family: string) => void;
  onPicked?: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130 }}>
      <div className="cd-body">
        <div style={{ fontSize: 11, color: "#918981", padding: "0 4px 12px", letterSpacing: ".08em" }}>字体</div>
        {FONT_LIBRARY.map((f) => {
          const active = currentFont === f.family;
          return (
            <button key={f.id} type="button"
              onClick={() => { onFontChange(f.family); onPicked?.(); }}
              style={{
                width: "100%", padding: "16px 12px", marginBottom: 6,
                border: active ? "1.5px solid #75655a" : "1px solid rgba(74,70,63,.12)",
                borderRadius: 10, background: active ? "#f3eee8" : "#fffdfa",
                textAlign: "left", cursor: "pointer",
                fontFamily: f.family, fontSize: 17, color: "#3a352e",
              }}>{f.name}</button>
          );
        })}
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
    </aside>
  );
}

/* ============================================================
   方向锁
============================================================ */
export function LockDrawer({ onClose, onPicked }: { onClose: () => void; onPicked?: () => void }) {
  const [dirDialog, setDirDialog] = useState(false);

  async function applyLock(kind: "landscape" | "portrait") {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.lock({ orientation: kind });
    } catch (err) { console.warn("方向锁定失败：", err); }
    setDirDialog(false);
    onPicked?.();
  }
  async function releaseLock() {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.unlock();
    } catch (err) { console.warn("方向解锁失败：", err); }
    onPicked?.();
  }

  return (
    <aside className="cd-panel" style={{ width: "min(30vw, 130px)", maxWidth: 130 }}>
      <div className="cd-body" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "stretch", gap: 12, paddingBottom: 60 }}>
          <button type="button" className="cd-item" onClick={() => setDirDialog(true)}
            style={{ textAlign: "center", padding: "16px 14px", fontSize: 14 }}>🔓 锁方向</button>
          <button type="button" className="cd-item" onClick={releaseLock}
            style={{ textAlign: "center", padding: "16px 14px", fontSize: 14 }}>↺ 自动旋转</button>
        </div>
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>
      {dirDialog && (
        <div className="mini-confirm-overlay" onClick={() => setDirDialog(false)}>
          <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="mini-confirm-msg" style={{ textAlign: "left", fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>锁定方向</div>
              <div style={{ fontSize: 11, color: "#918981", marginBottom: 14, lineHeight: 1.7 }}>锁定后需到系统设置里重新开启自动旋转。</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => applyLock("landscape")}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid rgba(74,70,63,.15)", background: "#fff", fontSize: 13, cursor: "pointer" }}>横屏</button>
                <button type="button" onClick={() => applyLock("portrait")}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid rgba(74,70,63,.15)", background: "#fff", fontSize: 13, cursor: "pointer" }}>竖屏</button>
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

/* ============================================================
   存：保存 + 快照/回滚 + 导出
   导出原先挂在长按弹窗上（空白菜单和元素菜单各一份、内容重复），
   现按产品定义统一收进侧边栏「存」。
============================================================ */
export function SaveDrawer({ onClose, onSave, getDoc, onRestore }: {
  onClose: () => void;
  onSave?: () => void;
  /** 取当前文档（存快照用） */
  getDoc?: () => DocModel;
  /** 用快照内容整体替换当前文档（回滚用） */
  onRestore?: (doc: DocModel) => void;
}) {
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  /** 待确认回滚的那张快照（非空时弹确认框） */
  const [pendingRestore, setPendingRestore] = useState<SnapshotMeta | null>(null);
  const msgTimer = useRef<number | null>(null);

  const flash = useCallback((text: string) => {
    setMsg(text);
    if (msgTimer.current != null) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => { msgTimer.current = null; setMsg(""); }, 1800);
  }, []);
  useEffect(() => () => { if (msgTimer.current != null) window.clearTimeout(msgTimer.current); }, []);

  const refresh = useCallback(async () => {
    const d = getDoc?.();
    if (!d) return;
    try { setSnaps(await listSnapshots(d.id)); }
    catch { setSnaps([]); }
  }, [getDoc]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function takeSnapshot() {
    const d = getDoc?.();
    if (!d || busy) return;
    setBusy(true);
    try {
      const meta = await saveSnapshot(d);
      await refresh();
      flash(`已存快照 ${formatSnapshotTime(meta.createdAt)}`);
    } catch (e) {
      flash(e instanceof Error && e.message === "INDEXEDDB_UNAVAILABLE" ? "此环境不支持快照" : "快照保存失败");
    } finally { setBusy(false); }
  }

  async function doRestore(meta: SnapshotMeta) {
    setPendingRestore(null);
    setBusy(true);
    try {
      const snap = await getSnapshot(meta.id);
      if (!snap) { flash("快照已不存在"); return; }
      /* 深拷贝后再交付：避免后续编辑把 IndexedDB 里的这份快照也改掉 */
      onRestore?.(JSON.parse(JSON.stringify(snap.doc)) as DocModel);
      flash(`已回滚到 ${formatSnapshotTime(meta.createdAt)}`);
    } catch {
      flash("回滚失败");
    } finally { setBusy(false); }
  }

  async function removeSnapshot(meta: SnapshotMeta) {
    try { await deleteSnapshot(meta.id); await refresh(); flash("已删除快照"); }
    catch { flash("删除失败"); }
  }

  const latest = snaps[0] || null;
  const itemStyle: React.CSSProperties = { textAlign: "center", padding: "14px 6px", fontSize: 13, whiteSpace: "nowrap" };

  return (
    <aside className="cd-panel" style={{ width: "min(34vw, 150px)", maxWidth: 150 }}>
      <div className="cd-body" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 60 }}>

          <button type="button" className="cd-item" onClick={() => { onSave?.(); onClose(); }} style={itemStyle}>保存</button>

          {/* ── 快照 ── */}
          <button type="button" className="cd-item" disabled={busy}
            onClick={() => { void takeSnapshot(); }}
            style={{ ...itemStyle, opacity: busy ? 0.5 : 1 }}>点击快照</button>

          <button type="button" className="cd-item" disabled={busy || !latest}
            onClick={() => { if (latest) setPendingRestore(latest); }}
            style={{ ...itemStyle, opacity: (busy || !latest) ? 0.45 : 1 }}>
            一键回滚
          </button>

          {msg && (
            <div style={{ fontSize: 10, color: "#7a5a34", textAlign: "center", lineHeight: 1.5, padding: "0 4px" }}>{msg}</div>
          )}

          {/* ── 快照列表（新的在上，点一条就回滚到那一条） ── */}
          {snaps.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <div style={{ fontSize: 10, color: "#a49a8f", letterSpacing: ".06em", marginBottom: 4, paddingLeft: 2 }}>
                快照 {snaps.length}/{MAX_SNAPSHOTS}
              </div>
              <div style={{ maxHeight: 168, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {snaps.map((s) => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "6px 7px", borderRadius: 8,
                    background: "#fffdfa", border: "1px solid rgba(74,70,63,.10)",
                  }}>
                    <button type="button" onClick={() => setPendingRestore(s)}
                      style={{
                        flex: 1, minWidth: 0, border: 0, background: "transparent", cursor: "pointer",
                        textAlign: "left", padding: 0, fontFamily: "inherit",
                      }}>
                      <div style={{ fontSize: 11, color: "#3a352e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatSnapshotTime(s.createdAt)}
                      </div>
                      <div style={{ fontSize: 9, color: "#a49a8f" }}>{s.pageCount} 页</div>
                    </button>
                    <button type="button" onClick={() => { void removeSnapshot(s); }}
                      title="删除这张快照"
                      style={{ border: 0, background: "transparent", color: "#b4ada5", fontSize: 13, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 导出 ── */}
          <div style={{ height: 1, background: "rgba(74,70,63,.08)", margin: "4px 0" }} />
          <button type="button" className="cd-item" onClick={() => { (window as any).__ranjingCommands?.exportCanvas?.("svg"); onClose(); }} style={itemStyle}>导出 SVG</button>
          <button type="button" className="cd-item" onClick={() => { (window as any).__ranjingCommands?.exportCanvas?.("png"); onClose(); }} style={itemStyle}>导出 PNG</button>
          <button type="button" className="cd-item" onClick={() => { (window as any).__ranjingCommands?.exportCanvas?.("png-transparent"); onClose(); }} style={itemStyle}>导出透明 PNG</button>
        </div>
      </div>
      <button type="button" className="cd-collapse-handle" onClick={onClose} aria-label="收起">‹</button>

      {/* 回滚确认：回滚会覆盖当前所有改动，必须二次确认 */}
      {pendingRestore && (
        <div className="mini-confirm-overlay" onClick={() => setPendingRestore(null)}>
          <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="mini-confirm-msg" style={{ fontSize: 13, lineHeight: 1.7 }}>
              回滚到 {formatSnapshotTime(pendingRestore.createdAt)} 的快照？<br />
              <span style={{ fontSize: 11, color: "#918981" }}>当前的改动会被覆盖。</span>
            </div>
            <div className="mini-confirm-actions">
              <button type="button" className="mini-confirm-cancel" onClick={() => setPendingRestore(null)}>取消</button>
              <button type="button" className="mini-confirm-ok" onClick={() => { void doRestore(pendingRestore); }}>回滚</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ============================================================
   笔刷手感滑条
============================================================ */
function PenSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: "#756f68", width: 52, flex: "none" }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 0, accentColor: "#5f554d", height: 4 }}
      />
      <span style={{ fontSize: 10, color: "#a49a8f", width: 28, textAlign: "right", flex: "none" }}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}