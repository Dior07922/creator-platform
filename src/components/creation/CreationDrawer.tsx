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

/* 手稿：「每支笔不写'什么什么笔'，直接写 自由」——
   去掉「笔」字后缀，名字短了，笔刷滑竿控制器就在旁边。 */
const PEN_TOOLS: { kind: ShapeKind; name: string; sw: number }[] = [
  { kind: "crayon",    name: "蜡笔",   sw: 3.2 },
  { kind: "free",      name: "自由",   sw: 1.4 },
  { kind: "sketch",    name: "素描",   sw: 2.0 },
  { kind: "marker",    name: "马克",   sw: 4.0 },
  { kind: "pencil",    name: "铅笔",   sw: 1.8 },
  { kind: "ink",       name: "勾线",   sw: 1.0 },
  { kind: "handwrite", name: "手写",   sw: 2.4 },
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

/** 文具盒 · 笔 —— 原「笔」抽屉整体搬进盒内当内容块（功能一字不动）。 */
export function PenBody({
  onPickTool, onInsertText, onInsertShape,
  brush, onBrushChange, activeTool,
}: {
  onPickTool: (kind: ShapeKind) => void;
  onInsertText: (text: string) => void;
  onInsertShape: (kind: ShapeKind) => void;
  brush: BrushParams;
  onBrushChange: (patch: Partial<BrushParams>) => void;
  /** 当前拿在手里的工具（父组件状态）——滑竿控制器跟着它显示在对应笔旁 */
  activeTool?: ShapeKind | null;
}) {
  const [tab, setTab] = useState<"pen" | "shapes" | "emoji" | "line" | "eraser">("pen");
  /** 滑竿控制器挂在哪支笔下面（默认第一支；父组件已选笔时跟随父状态） */
  const [activePen, setActivePen] = useState<ShapeKind>(
    () => PEN_TOOLS.find((p) => p.kind === activeTool)?.kind ?? PEN_TOOLS[0].kind,
  );
  useEffect(() => {
    if (activeTool && PEN_TOOLS.some((p) => p.kind === activeTool)) setActivePen(activeTool);
  }, [activeTool]);

  const tabsWrapStyle: React.CSSProperties = {
    display: "flex", gap: 2, padding: 4, margin: "0 0 10px 0",
    position: "sticky", top: 0, zIndex: 3,
    background: "var(--rj-surface)", borderRadius: 10,
    boxShadow: "0 2px 4px rgba(83,101,113,.04)",
  };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, height: 30, border: 0, borderRadius: 8,
    background: active ? "var(--rj-surface-raised)" : "transparent",
    color: active ? "var(--rj-text)" : "var(--rj-text-muted)",
    fontWeight: active ? 600 : 400,
    fontSize: 10, fontFamily: "inherit", cursor: "pointer",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.06)" : "none",
    padding: 0,
  });
  const fixBtnStyle: React.CSSProperties = {
    flex: 1, height: 30, border: 0, borderRadius: 6,
    background: "var(--rj-surface-hover)", color: "var(--rj-text-subtle)",
    fontSize: 14, cursor: "pointer", padding: 0,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: "var(--rj-text-muted)", letterSpacing: ".1em",
    margin: "14px 2px 10px",
  };
  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: 36, height: 20, borderRadius: 10, border: 0, padding: 0,
    background: on ? "var(--rj-text-subtle)" : "var(--rj-line)",
    position: "relative", cursor: "pointer", flex: "none",
  });
  const knobStyle = (on: boolean): React.CSSProperties => ({
    position: "absolute", top: 2, left: on ? 18 : 2,
    width: 16, height: 16, borderRadius: 8, background: "var(--rj-surface-raised)",
    transition: "left .2s",
  });
  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginBottom: 8,
  };

  return (
    <div className="cd-body" style={{ paddingTop: 0 }}>

        {/* 撤销 / 重做 / 复制 */}
        <div style={{ display: "flex", gap: 4, padding: "0 4px 10px", borderBottom: "1px solid var(--rj-line-soft)", marginBottom: 10 }}>
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
            {/* 笔列表：手稿——名字直接写「自由/蜡笔…」，滑竿跟着选中的笔走 */}
            <div style={sectionLabel}>笔</div>
            {PEN_TOOLS.map((t) => (
              <React.Fragment key={t.kind}>
                <button type="button" className="cd-item"
                  onClick={() => { onPickTool(t.kind); setActivePen(t.kind); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", fontSize: 14, width: "100%" }}>
                  <span style={{ width: 26, display: "flex", justifyContent: "center", flex: "none" }}>
                    <svg viewBox="0 0 24 24" width="22" height="22" style={{ display: "block", flex: "none" }}>
                      <path
                        d="M4 20 L7 17 L17 7 Q19 5 21 7 Q23 9 21 11 L11 21 L8 21 L4 20 Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={t.sw / 2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>{t.name}</span>
                </button>

                {/* 笔刷手感参数面板 —— perfect-freehand；
                    手稿：控制器就挂在选中的这支笔下面（内容一字未动，只挪位置） */}
                {activePen === t.kind && (
                  <div style={{
                    margin: "2px 0 10px", padding: "12px 10px",
                    background: "var(--rj-surface-hover)", borderRadius: 10,
                  }}>
                    <div style={{ fontSize: 11, color: "var(--rj-text-muted)", letterSpacing: ".1em", marginBottom: 12 }}>笔刷手感</div>

                    <PenSlider label="尺寸" value={brush.size ?? 0} min={0} max={40} step={1}
                      onChange={(v) => onBrushChange({ size: v > 0 ? v : undefined })} />
                    <PenSlider label="精简" value={brush.streamline} min={0} max={1} step={0.05}
                      onChange={(v) => onBrushChange({ streamline: v })} />
                    <PenSlider label="平滑" value={brush.smoothing} min={0} max={1} step={0.05}
                      onChange={(v) => onBrushChange({ smoothing: v })} />

                    {/* 缓释（easing） */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--rj-text-muted)", width: 52, flex: "none" }}>缓释</span>
                      <select
                        value={brush.easingName ?? "linear"}
                        onChange={(e) => onBrushChange({ easingName: e.target.value as EasingName })}
                        style={{
                          flex: 1, minWidth: 0, height: 26, padding: "0 6px",
                          border: "1px solid var(--rj-line)", borderRadius: 6,
                          background: "var(--rj-surface-raised)", color: "var(--rj-text)", fontSize: 11, outline: "none",
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
                      <span style={{ fontSize: 11, color: "var(--rj-text-muted)" }}>启动</span>
                      <button type="button" aria-pressed={!!brush.startCap}
                        onClick={() => onBrushChange({ startCap: !brush.startCap })} style={toggleStyle(!!brush.startCap)}>
                        <span style={knobStyle(!!brush.startCap)} />
                      </button>
                    </div>

                    <PenSlider label="锥形端" value={brush.endTaper} min={0} max={60} step={1}
                      onChange={(v) => onBrushChange({ endTaper: v })} />

                    {/* 缓和结尾 cap */}
                    <div style={rowStyle}>
                      <span style={{ fontSize: 11, color: "var(--rj-text-muted)" }}>缓和结尾</span>
                      <button type="button" aria-pressed={!!brush.endCap}
                        onClick={() => onBrushChange({ endCap: !brush.endCap })} style={toggleStyle(!!brush.endCap)}>
                        <span style={knobStyle(!!brush.endCap)} />
                      </button>
                    </div>

                    {/* 充满 */}
                    <div style={rowStyle}>
                      <span style={{ fontSize: 11, color: "var(--rj-text-muted)" }}>充满</span>
                      <button type="button" aria-pressed={!!brush.fill}
                        onClick={() => onBrushChange({ fill: !brush.fill })} style={toggleStyle(!!brush.fill)}>
                        <span style={knobStyle(!!brush.fill)} />
                      </button>
                    </div>

                    <PenSlider label="中风" value={brush.thinning} min={-1} max={1} step={0.05}
                      onChange={(v) => onBrushChange({ thinning: v })} />

                    {/* 模拟压力 */}
                    <div style={{ ...rowStyle, marginTop: 10, marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--rj-text-muted)" }}>模拟压力</span>
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
                        border: "1px solid var(--rj-line)", background: "var(--rj-surface-raised)",
                        color: "var(--rj-text-muted)", fontSize: 11, cursor: "pointer",
                      }}
                    >重置选项</button>
                  </div>
                )}
              </React.Fragment>
            ))}
          </>
        )}

        {tab === "shapes" && (
          <>
            <div className="cd-sub-label">形状</div>
            {GEOM_TOOLS.map((t) => (
              <button key={t.kind} type="button" className="cd-item"
                onClick={() => onPickTool(t.kind)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", fontSize: 14, width: "100%" }}>
                <span style={{ fontSize: 18, width: 26, textAlign: "center", color: "var(--rj-text-subtle)" }}>{t.icon}</span>
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
                <span style={{ fontSize: 20, width: 26, textAlign: "center", color: "var(--rj-text-subtle)" }}>{t.icon}</span>
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
                background: "linear-gradient(180deg,var(--rj-surface-raised) 0%,var(--rj-app-bg) 100%)",
                boxShadow: "0 2px 8px rgba(32,49,57,.12)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                fontSize: 16, color: "var(--rj-text)", cursor: "pointer",
              }}>
              <span style={{ fontSize: 24 }}>⌫</span>
              <span>橡皮擦</span>
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--rj-placeholder)", textAlign: "center", lineHeight: 1.6 }}>
              划过已画的线条<br />即可擦除
            </div>
          </div>
        )}
    </div>
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
}: ColorDrawerProps) {
  const [target, setTarget] = useState<"paper" | "stage">("paper");
  const color = target === "paper" ? paperColor : stageColor;
  const alpha = target === "paper" ? paperAlpha : stageAlpha;
  const setColor = target === "paper" ? onPaperColorChange : onStageColorChange;
  const setAlpha = target === "paper" ? onPaperAlphaChange : onStageAlphaChange;

  return (
    <aside className="cd-panel">
      <div className="cd-tabs">
        <button type="button" className={target === "paper" ? "is-active" : ""} onClick={() => setTarget("paper")}>纸色</button>
        <button type="button" className={target === "stage" ? "is-active" : ""} onClick={() => setTarget("stage")}>背景色</button>
      </div>
      <div className="cd-body">
        <ColorPicker color={color} alpha={alpha} onChange={setColor} onAlphaChange={setAlpha} onCommit={onPicked} />
      </div>
    </aside>
  );
}

/* ============================================================
   规格
============================================================ */
const customInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 36, padding: "0 8px", boxSizing: "border-box",
  border: "1px solid var(--rj-line)", borderRadius: 8,
  background: "var(--rj-surface-raised)", color: "var(--rj-text)", fontSize: 14, outline: "none",
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
          <span style={{ alignSelf: "center", color: "var(--rj-text-muted)" }}>×</span>
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

/** 文具盒 · 规格 —— 原「规格」抽屉内容；卡片选完直接回白纸执行。
 *  手稿：「点开规格 所有模板卡片预览图」——不再一层层折叠，
 *  每一类直接铺开：类名 + 按真实比例的缩略卡。 */
export function SpecBody({ onPicked }: { onPicked?: (w: number, h: number) => void }) {
  const [picked, setPicked] = useState<string>("");
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="cd-body">
        {picked && <div className="cd-picked">当前规格：{picked}</div>}
        {SPEC_CATEGORIES.map((c) => (
          <div className="cd-sub" key={c.id}>
            <div className="cd-sub-head is-open"><span>{c.title}</span></div>
            <div className="cd-sub-body">
              {/* 每条规格一张按真实比例的缩略卡，不再只是文字行 */}
              <div className="cd-spec-grid">
                {c.items.map((it) => {
                  const ratio = it.w > 0 && it.h > 0 ? it.w / it.h : 1;
                  const th = 46;
                  const tw = Math.round(Math.min(56, Math.max(12, th * ratio)));
                  return (
                    <button key={it.name} type="button" className="cd-spec-card"
                      onClick={() => { setPicked(it.name); onPicked?.(it.w, it.h); }}>
                      <span className="cd-spec-thumb" style={{ width: tw, height: th }} />
                      <span className="cd-spec-name">{it.name}</span>
                      {it.w > 0 && it.h > 0 && (
                        <span className="cd-spec-size">{it.w}×{it.h}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {c.allowCustom && (
                <button type="button" className="cd-item" style={{ marginTop: 6 }} onClick={() => setCustomOpen(true)}>自定义…</button>
              )}
            </div>
          </div>
        ))}
      {customOpen && (
        <CustomSpecDialog
          onConfirm={(w, h) => { setCustomOpen(false); setPicked(`自定义 ${w}×${h}`); onPicked?.(w, h); }}
          onCancel={() => setCustomOpen(false)}
        />
      )}
    </div>
  );
}

/* ============================================================
   字
============================================================ */
/** 文具盒 · 字 —— 原「字」抽屉内容块。 */
export function FontBody({
  currentFont, onFontChange, onPicked,
}: {
  currentFont: string;
  onFontChange: (family: string) => void;
  onPicked?: () => void;
}) {
  return (
    <div className="cd-body">
        <div style={{ fontSize: 11, color: "var(--rj-text-muted)", padding: "0 4px 12px", letterSpacing: ".08em" }}>字体</div>
        {FONT_LIBRARY.map((f) => {
          const active = currentFont === f.family;
          return (
            <button key={f.id} type="button"
              onClick={() => { onFontChange(f.family); onPicked?.(); }}
              style={{
                width: "100%", padding: "16px 12px", marginBottom: 6,
                border: active ? "1.5px solid var(--rj-text-muted)" : "1px solid var(--rj-line-soft)",
                borderRadius: 10, background: active ? "var(--rj-app-bg-low)" : "var(--rj-surface)",
                textAlign: "left", cursor: "pointer",
                fontFamily: f.family, fontSize: 17, color: "var(--rj-text)",
              }}>{f.name}</button>
          );
        })}
    </div>
  );
}

/* ============================================================
   存：保存 + 快照/回滚 + 导出
   导出原先挂在长按弹窗上（空白菜单和元素菜单各一份、内容重复），
   现按产品定义统一收进侧边栏「存」。
============================================================ */
export function SaveDrawer({ onClose, onSave, getDoc, onRestore, onExportShare, onOpenMemory }: {
  onClose: () => void;
  onSave?: () => void;
  /** 取当前文档（存快照用） */
  getDoc?: () => DocModel;
  /** 用快照内容整体替换当前文档（回滚用） */
  onRestore?: (doc: DocModel) => void;
  /** 导出分享（未登录由主程序先接登录流程） */
  onExportShare?: () => void;
  /** 打开记忆空间（本地记录页） */
  onOpenMemory?: () => void;
}) {
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  /** 待确认回滚的那张快照（非空时弹确认框） */
  const [pendingRestore, setPendingRestore] = useState<SnapshotMeta | null>(null);
  /** 方向锁（原外沿「锁」整块搬进保存 —— 锁不再占外沿位置） */
  const [dirDialog, setDirDialog] = useState(false);
  const msgTimer = useRef<number | null>(null);

  async function applyLock(kind: "landscape" | "portrait") {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.lock({ orientation: kind });
    } catch (err) { console.warn("方向锁定失败：", err); }
    setDirDialog(false);
  }
  async function releaseLock() {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.unlock();
    } catch (err) { console.warn("方向解锁失败：", err); }
  }

  const flash = useCallback((text: string) => {
    setMsg(text);
    if (msgTimer.current != null) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => { msgTimer.current = null; setMsg(""); }, 1800);
  }, []);
  useEffect(() => () => { if (msgTimer.current != null) window.clearTimeout(msgTimer.current); }, []);

  /* 第二步·界面设置：真实读写 ranjing:ui-theme / ranjing:ui-font，
     与首页V3、GPT副本同一约定、同一读写键；只动软件外壳，不动作品。 */
  const [uiTheme, setUiTheme] = useState<"system" | "mist" | "dark">("system");
  const [uiFont, setUiFont] = useState<"sans" | "serif">("sans");
  useEffect(() => {
    const read = () => {
      try {
        const t = localStorage.getItem("ranjing:ui-theme");
        setUiTheme(t === "dark" ? "dark" : t === "mist" ? "mist" : "system");
        setUiFont(localStorage.getItem("ranjing:ui-font") === "serif" ? "serif" : "sans");
      } catch { /* 隐私模式读不到就维持默认 */ }
    };
    read();
    window.addEventListener("ranjing:ui-settings", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("ranjing:ui-settings", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const applyUiSetting = (kind: "theme" | "font", value: string) => {
    try {
      if (kind === "theme") {
        if (value === "system") localStorage.removeItem("ranjing:ui-theme");
        else localStorage.setItem("ranjing:ui-theme", value);
      } else {
        localStorage.setItem("ranjing:ui-font", value);
      }
    } catch { flash("此环境无法保存界面设置"); return; }
    /* 同页即时生效：房间主题钩子与首页读同一事件；跨标签页由 storage 兜底 */
    window.dispatchEvent(new Event("ranjing:ui-settings"));
    flash(kind === "theme"
      ? `界面：${value === "system" ? "跟随系统" : value === "dark" ? "夜间 · 深镜" : "白天 · 雾镜"}`
      : `首页字体：${value === "serif" ? "衬线" : "无衬线"}`);
  };

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
  /* 界面设置：当前选中项淡蓝底提示；颜色全部走 token，日夜自动跟随 */
  const choiceStyle: React.CSSProperties = { ...itemStyle, borderRadius: 8 };
  const choiceOnStyle: React.CSSProperties = { background: "var(--rj-action-soft)", color: "var(--rj-text)" };

  return (
    <aside className="cd-panel">
      <div className="cd-body" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 60 }}>

          {/* ── 记忆空间（第六步：保存页=本地记录页的入口） ── */}
          <button type="button" className="cd-item" onClick={() => { onOpenMemory?.(); onClose(); }} style={itemStyle}>
            记忆空间 · 本地记录
          </button>

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
            <div style={{ fontSize: 10, color: "var(--rj-text-muted)", textAlign: "center", lineHeight: 1.5, padding: "0 4px" }}>{msg}</div>
          )}

          {/* ── 快照列表（新的在上，点一条就回滚到那一条） ── */}
          {snaps.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <div style={{ fontSize: 10, color: "var(--rj-placeholder)", letterSpacing: ".06em", marginBottom: 4, paddingLeft: 2 }}>
                快照 {snaps.length}/{MAX_SNAPSHOTS}
              </div>
              <div style={{ maxHeight: 168, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {snaps.map((s) => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "6px 7px", borderRadius: 8,
                    background: "var(--rj-surface)", border: "1px solid var(--rj-line-soft)",
                  }}>
                    <button type="button" onClick={() => setPendingRestore(s)}
                      style={{
                        flex: 1, minWidth: 0, border: 0, background: "transparent", cursor: "pointer",
                        textAlign: "left", padding: 0, fontFamily: "inherit",
                      }}>
                      <div style={{ fontSize: 11, color: "var(--rj-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatSnapshotTime(s.createdAt)}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--rj-placeholder)" }}>{s.pageCount} 页</div>
                    </button>
                    <button type="button" onClick={() => { void removeSnapshot(s); }}
                      title="删除这张快照"
                      style={{ border: 0, background: "transparent", color: "var(--rj-placeholder)", fontSize: 13, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 方向锁（从外沿「锁」搬来；锁不再占外面位置） ── */}
          <div style={{ height: 1, background: "var(--rj-line-soft)", margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: "var(--rj-text-muted)", letterSpacing: ".06em", marginBottom: 4, paddingLeft: 2 }}>方向锁</div>
          <button type="button" className="cd-item" onClick={() => setDirDialog(true)} style={itemStyle}>🔓 锁方向</button>
          <button type="button" className="cd-item" onClick={() => { void releaseLock(); }} style={itemStyle}>↺ 自动旋转</button>

          {/* ── 界面设置（第二步：日夜/跟随系统 + 首页字体；只动外壳不动作品） ── */}
          <div style={{ height: 1, background: "var(--rj-line-soft)", margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: "var(--rj-text-muted)", letterSpacing: ".06em", marginBottom: 4, paddingLeft: 2 }}>界面设置</div>
          {([["system", "跟随系统"], ["mist", "白天 · 雾镜"], ["dark", "夜间 · 深镜"]] as const).map(([v, label]) => (
            <button key={v} type="button" className="cd-item" aria-pressed={uiTheme === v}
              onClick={() => applyUiSetting("theme", v)}
              style={{ ...choiceStyle, ...(uiTheme === v ? choiceOnStyle : null) }}>{label}</button>
          ))}
          {([["serif", "首页衬线字"], ["sans", "首页无衬线字"]] as const).map(([v, label]) => (
            <button key={v} type="button" className="cd-item" aria-pressed={uiFont === v}
              onClick={() => applyUiSetting("font", v)}
              style={{ ...choiceStyle, ...(uiFont === v ? choiceOnStyle : null) }}>{label}</button>
          ))}

          {/* ── 导出分享（第六步：登录闸门挪到这里；三种格式收进面板里） ── */}
          <div style={{ height: 1, background: "var(--rj-line-soft)", margin: "4px 0" }} />
          <button type="button" className="cd-item" onClick={() => { onExportShare?.(); onClose(); }} style={itemStyle}>导出分享</button>
        </div>
      </div>

      {/* 方向锁：横屏 / 竖屏（原 LockDrawer 弹窗原样搬入） */}
      {dirDialog && (
        <div className="mini-confirm-overlay" onClick={() => setDirDialog(false)}>
          <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="mini-confirm-msg" style={{ textAlign: "left", fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>锁定方向</div>
              <div style={{ fontSize: 11, color: "var(--rj-text-muted)", marginBottom: 14, lineHeight: 1.7 }}>锁定后需到系统设置里重新开启自动旋转。</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { void applyLock("landscape"); }}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid var(--rj-line)", background: "var(--rj-surface-raised)", fontSize: 13, cursor: "pointer" }}>横屏</button>
                <button type="button" onClick={() => { void applyLock("portrait"); }}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid var(--rj-line)", background: "var(--rj-surface-raised)", fontSize: 13, cursor: "pointer" }}>竖屏</button>
              </div>
            </div>
            <div className="mini-confirm-actions" style={{ marginTop: 12 }}>
              <button type="button" className="mini-confirm-cancel" onClick={() => setDirDialog(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 回滚确认：回滚会覆盖当前所有改动，必须二次确认 */}
      {pendingRestore && (
        <div className="mini-confirm-overlay" onClick={() => setPendingRestore(null)}>
          <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="mini-confirm-msg" style={{ fontSize: 13, lineHeight: 1.7 }}>
              回滚到 {formatSnapshotTime(pendingRestore.createdAt)} 的快照？<br />
              <span style={{ fontSize: 11, color: "var(--rj-text-muted)" }}>当前的改动会被覆盖。</span>
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
      <span style={{ fontSize: 11, color: "var(--rj-text-muted)", width: 52, flex: "none" }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 0, accentColor: "var(--rj-text-subtle)", height: 4 }}
      />
      <span style={{ fontSize: 10, color: "var(--rj-placeholder)", width: 28, textAlign: "right", flex: "none" }}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}