// name=src/components/creation/ColorPicker.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh >= 0 && hh < 1) { r = c; g = x; b = 0; }
  else if (hh < 2) { r = x; g = c; b = 0; }
  else if (hh < 3) { r = 0; g = c; b = x; }
  else if (hh < 4) { r = 0; g = x; b = c; }
  else if (hh < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + to2(r) + to2(g) + to2(b);
}

function hexToRgb(hex: string) {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 255, g: 255, b: 255 };
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

// 苒境网格色板：6 列 × 6 行
const GRID_COLORS: string[] = [
  "#000000", "#2B2B2B", "#666666", "#999999", "#D9D9D9", "#FFFFFF",
  "#F7F3EA", "#E8DFD0", "#D6C3A5", "#B89B72", "#8A6F55", "#5F554D",
  "#F7B2AD", "#E96B63", "#C8463D", "#8F2D2D", "#FFD59A", "#F5B85C",
  "#E68A3F", "#F3D56B", "#C9D8B6", "#86A873", "#4F7D5B", "#294E3A",
  "#B8D8E8", "#6FA9C7", "#477B9D", "#274C69", "#D7C3E8", "#A98BC3",
  "#765A91", "#4F3C63", "#F1C5CF", "#E69AAF", "#C96682", "#8D4058",
];

type Tab = "grid" | "spectrum" | "slider";

type Props = {
  color: string;
  alpha: number;
  onChange: (hex: string) => void;
  onAlphaChange: (a: number) => void;
};

export default function ColorPicker({ color, alpha, onChange, onAlphaChange }: Props) {
  const [tab, setTab] = useState<Tab>("grid");

  const [hsv, setHsv] = useState(() => {
    const rgb = hexToRgb(color);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  });
  const [hexInput, setHexInput] = useState(color);
  const [recent, setRecent] = useState<string[]>([]);

  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rgb = hexToRgb(color);
    const cur = hsvToRgb(hsv.h, hsv.s, hsv.v);
    if (rgbToHex(cur.r, cur.g, cur.b) !== color.toLowerCase()) {
      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    }
    setHexInput(color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ranjing.recentColors");
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function pushRecent(c: string) {
    const cc = c.toLowerCase();
    setRecent((prev) => {
      const next = [cc, ...prev.filter((x) => x !== cc)].slice(0, 10);
      try { localStorage.setItem("ranjing.recentColors", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function commit(next: { h: number; s: number; v: number }) {
    setHsv(next);
    const { r, g, b } = hsvToRgb(next.h, next.s, next.v);
    const hex = rgbToHex(r, g, b);
    setHexInput(hex);
    onChange(hex);
  }

  function commitRgb(r: number, g: number, b: number) {
    const hex = rgbToHex(r, g, b);
    setHsv(rgbToHsv(r, g, b));
    setHexInput(hex);
    onChange(hex);
  }

  function pickColor(hex: string) {
    const rgb = hexToRgb(hex);
    setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    setHexInput(hex);
    onChange(hex);
    pushRecent(hex);
  }

  function makeDragHandlers(
    getEl: () => HTMLDivElement | null,
    onMove: (px: number, py: number, rect: DOMRect) => void,
  ) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        const el = getEl();
        if (!el) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        const rect = el.getBoundingClientRect();
        onMove(e.clientX - rect.left, e.clientY - rect.top, rect);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const el = getEl();
        if (!el) return;
        if (!el.hasPointerCapture(e.pointerId)) return;
        const rect = el.getBoundingClientRect();
        onMove(e.clientX - rect.left, e.clientY - rect.top, rect);
      },
      onPointerUp: (e: React.PointerEvent) => {
        const el = getEl();
        if (!el) return;
        try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      },
      onPointerCancel: (e: React.PointerEvent) => {
        const el = getEl();
        if (!el) return;
        try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      },
    };
  }

  const areaHandlers = makeDragHandlers(
    () => areaRef.current,
    (px, py, rect) => {
      const s = Math.max(0, Math.min(1, px / rect.width));
      const v = Math.max(0, Math.min(1, 1 - py / rect.height));
      commit({ h: hsv.h, s, v });
    },
  );

  const hueHandlers = makeDragHandlers(
    () => hueRef.current,
    (px, _py, rect) => {
      const h = Math.max(0, Math.min(360, (px / rect.width) * 360));
      commit({ h, s: hsv.s, v: hsv.v });
    },
  );

  const alphaHandlers = makeDragHandlers(
    () => alphaRef.current,
    (px, _py, rect) => {
      const a = Math.max(0, Math.min(1, px / rect.width));
      onAlphaChange(a);
    },
  );

  const hueRgb = hsvToRgb(hsv.h, 1, 1);
  const hueHex = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);
  const rgb = hexToRgb(color);

  // ===== 内联样式常量 =====
  const tabsWrapStyle: React.CSSProperties = {
    display: "flex",
    gap: 4,
    padding: 3,
    borderRadius: 10,
    background: "rgba(74,70,63,.06)",
    marginBottom: 10,
  };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 32,
    border: 0,
    borderRadius: 8,
    background: active ? "#fff" : "transparent",
    color: active ? "#3a352e" : "#756f68",
    fontWeight: active ? 600 : 400,
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.06)" : "none",
  });
  const gridWrapStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 6,
    padding: "4px 0",
  };
  const gridCellStyle: React.CSSProperties = {
    aspectRatio: "1 / 1",
    border: 0,
    borderRadius: 6,
    padding: 0,
    cursor: "pointer",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)",
  };
  const slidersWrapStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "6px 0",
  };
  const sliderRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };
  const sliderLabelStyle: React.CSSProperties = {
    width: 16,
    fontSize: 12,
    color: "#756f68",
    flex: "none",
    textAlign: "center",
  };
  const sliderStyle: React.CSSProperties = {
    flex: 1,
    height: 20,
    accentColor: "#5f554d",
  };
  const sliderValueStyle: React.CSSProperties = {
    width: 40,
    textAlign: "right",
    fontSize: 12,
    color: "#4a463f",
    fontFamily: "ui-monospace, monospace",
    flex: "none",
  };

  return (
    <div className="cp-root">
      {/* Tab 切换 */}
      <div style={tabsWrapStyle}>
        <button
          type="button"
          style={tabBtnStyle(tab === "grid")}
          onClick={() => setTab("grid")}
        >网格</button>
        <button
          type="button"
          style={tabBtnStyle(tab === "spectrum")}
          onClick={() => setTab("spectrum")}
        >光谱</button>
        <button
          type="button"
          style={tabBtnStyle(tab === "slider")}
          onClick={() => setTab("slider")}
        >滑块</button>
      </div>

      {/* 网格 */}
      {tab === "grid" && (
        <div style={gridWrapStyle}>
          {GRID_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              style={{ ...gridCellStyle, background: c }}
              onClick={() => pickColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      )}

      {/* 光谱 */}
      {tab === "spectrum" && (
        <>
          <div
            className="cp-area"
            ref={areaRef}
            {...areaHandlers}
            style={{ background: hueHex }}
          >
            <div className="cp-area-white" />
            <div className="cp-area-black" />
            <div
              className="cp-area-cursor"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>
          <div className="cp-hue" ref={hueRef} {...hueHandlers}>
            <div className="cp-hue-cursor" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
        </>
      )}

      {/* 滑块（RGB） */}
      {tab === "slider" && (
        <div style={slidersWrapStyle}>
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>R</span>
            <input
              type="range" min={0} max={255} value={rgb.r}
              style={sliderStyle}
              onChange={(e) => commitRgb(Number(e.target.value), rgb.g, rgb.b)}
            />
            <span style={sliderValueStyle}>{rgb.r}</span>
          </div>
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>G</span>
            <input
              type="range" min={0} max={255} value={rgb.g}
              style={sliderStyle}
              onChange={(e) => commitRgb(rgb.r, Number(e.target.value), rgb.b)}
            />
            <span style={sliderValueStyle}>{rgb.g}</span>
          </div>
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>B</span>
            <input
              type="range" min={0} max={255} value={rgb.b}
              style={sliderStyle}
              onChange={(e) => commitRgb(rgb.r, rgb.g, Number(e.target.value))}
            />
            <span style={sliderValueStyle}>{rgb.b}</span>
          </div>
        </div>
      )}

      {/* 透明度 —— 三个 tab 共用 */}
      <div className="cp-alpha" ref={alphaRef} {...alphaHandlers}>
        <div className="cp-alpha-fill" style={{ background: `linear-gradient(to right, transparent, ${color})` }} />
        <div className="cp-alpha-cursor" style={{ left: `${alpha * 100}%` }} />
      </div>

      {/* HEX 输入 —— 共用 */}
      <div className="cp-hex-row">
        <span className="cp-hex-label">HEX</span>
        <input
          className="cp-hex-input"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={() => {
            let v = hexInput.trim();
            if (!v.startsWith("#")) v = "#" + v;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              const lc = v.toLowerCase();
              onChange(lc);
              pushRecent(lc);
            } else {
              setHexInput(color);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
        />
      </div>

      {/* 最近 —— 共用 */}
      <div className="cp-recent-row">
        <span className="cp-recent-label">最近</span>
        <div className="cp-recent-list">
          {recent.length === 0 && <span className="cp-recent-empty">—</span>}
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              className="cp-recent-item"
              style={{ background: c }}
              onClick={() => { onChange(c); pushRecent(c); }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </div>
  );
}