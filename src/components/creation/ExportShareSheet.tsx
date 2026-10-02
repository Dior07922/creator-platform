"use client";

/* 导出分享面板（第六步·手稿第 ⑤ 步）
   点「导出分享」→（未登录先走登录）→ 回到当前页弹出本面板：
     导出到本地 / 导出 SVG / 导出 PNG / 透明背景
     生成网页链接（导出一个可离线打开、可直接发人的自包含网页文件）
     分享：朋友圈 / 小红书 / 微博 / 抖音
   分享的真实机制：优先系统分享面板（手机）带图片文件；
   桌面浏览器没有系统分享 → 回退为「导出图片 + 复制文案」，如实提示去对应 App 粘贴。 */
import { useEffect, useState } from "react";

export default function ExportShareSheet({ open, onClose, docTitle }: {
  open: boolean;
  onClose: () => void;
  docTitle: string;
}) {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (open) setMsg(""); }, [open]);
  if (!open) return null;

  const commands = () => (window as unknown as { __ranjingCommands?: Record<string, (...a: unknown[]) => unknown> }).__ranjingCommands;

  function exportAs(format: "svg" | "png" | "png-transparent", label: string) {
    commands()?.exportCanvas?.(format);
    setMsg(`已导出 ${label}`);
  }

  async function exportWebPage() {
    const svg = commands()?.getPageSvg?.(false) as string | null | undefined;
    if (!svg) { setMsg("画布还没准备好，稍后再试"); return; }
    const stamp = Date.now();
    const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(docTitle)} · 苒境</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef0f1}main{width:min(92vw,860px)}svg{width:100%;height:auto;display:block;border-radius:6px;background:#fff;box-shadow:0 10px 40px rgba(36,51,60,.14)}</style>
</head><body><main>${svg}</main></body></html>`;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `ranjing-${stamp}.html`);
    setMsg("已导出网页文件：双击即可离线打开，也能直接发给别人");
  }

  async function shareTo(platform: string) {
    const caption = `${docTitle} · 来自苒境`;
    setMsg(`正在准备分享到${platform}…`);
    try {
      const svg = commands()?.getPageSvg?.(false) as string | null | undefined;
      if (svg && typeof navigator.share === "function") {
        const blob = await svgToPngBlob(svg);
        const file = new File([blob], `ranjing-${Date.now()}.png`, { type: "image/png" });
        const canShare = (navigator as unknown as { canShare?: (d: unknown) => boolean }).canShare;
        if (!canShare || canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: docTitle, text: caption });
          setMsg(`已打开系统分享面板，选择${platform}即可`);
          return;
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") { setMsg(""); return; }
    }
    /* 回退：桌面浏览器没有系统分享 → 导出图片并复制文案 */
    commands()?.exportCanvas?.("png");
    let copied = false;
    try { await navigator.clipboard.writeText(caption); copied = true; } catch { /* 剪贴板被拒就只导出图片 */ }
    setMsg(`图片已导出${copied ? "、文案已复制" : ""}；打开${platform}粘贴发布`);
  }

  const rowStyle: React.CSSProperties = {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "13px 14px", border: "1px solid var(--rj-line-soft)", borderRadius: 10,
    background: "var(--rj-surface)", color: "var(--rj-text)", fontFamily: "inherit",
    fontSize: 13, cursor: "pointer", textAlign: "left",
  };
  const subStyle: React.CSSProperties = { fontSize: 10, color: "var(--rj-placeholder)", marginTop: 3 };
  const chipStyle: React.CSSProperties = {
    flex: 1, padding: "10px 6px", borderRadius: 10, border: "1px solid var(--rj-line-soft)",
    background: "var(--rj-surface)", color: "var(--rj-text)", fontFamily: "inherit",
    fontSize: 12.5, cursor: "pointer",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "absolute", inset: 0, zIndex: 1300, background: "rgba(24,32,37,.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rj-ui"
        style={{
          width: "min(100%, 520px)", maxHeight: "86%", overflowY: "auto",
          background: "var(--rj-surface-raised, var(--rj-surface))", color: "var(--rj-text)",
          borderRadius: "18px 18px 0 0", padding: "16px 16px calc(env(safe-area-inset-bottom) + 18px)",
          boxShadow: "0 -12px 40px rgba(0,0,0,.22)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <strong style={{ fontSize: 14, letterSpacing: ".1em", fontWeight: 600 }}>导出分享</strong>
          <button type="button" onClick={onClose} aria-label="关闭"
            style={{ border: 0, background: "transparent", color: "var(--rj-text-muted)", fontSize: 18, cursor: "pointer", padding: "2px 6px" }}>✕</button>
        </div>

        <div style={{ fontSize: 10, color: "var(--rj-text-muted)", letterSpacing: ".08em", marginBottom: 8 }}>导出</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={rowStyle} onClick={() => exportAs("png", "图片（PNG）")}>
            <span>导出到本地<span style={subStyle}>把画面存成图片文件</span></span><span style={{ color: "var(--rj-text-muted)" }}>›</span>
          </button>
          <button type="button" style={rowStyle} onClick={() => exportAs("svg", "SVG")}>
            <span>导出 SVG<span style={subStyle}>矢量格式，放大不糊</span></span><span style={{ color: "var(--rj-text-muted)" }}>›</span>
          </button>
          <button type="button" style={rowStyle} onClick={() => exportAs("png", "PNG")}>
            <span>导出 PNG<span style={subStyle}>标准位图</span></span><span style={{ color: "var(--rj-text-muted)" }}>›</span>
          </button>
          <button type="button" style={rowStyle} onClick={() => exportAs("png-transparent", "透明背景 PNG")}>
            <span>透明背景 PNG<span style={subStyle}>只留内容，不带纸面</span></span><span style={{ color: "var(--rj-text-muted)" }}>›</span>
          </button>
          <button type="button" style={rowStyle} onClick={() => void exportWebPage()}>
            <span>生成网页链接<span style={subStyle}>导出可离线打开、可直接发人的网页文件</span></span><span style={{ color: "var(--rj-text-muted)" }}>›</span>
          </button>
        </div>

        <div style={{ fontSize: 10, color: "var(--rj-text-muted)", letterSpacing: ".08em", margin: "14px 0 8px" }}>分享</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["朋友圈", "小红书", "微博", "抖音"].map((p) => (
            <button key={p} type="button" style={chipStyle} onClick={() => void shareTo(p)}>{p}</button>
          ))}
        </div>

        {msg && (
          <div role="status" style={{ marginTop: 12, fontSize: 11, color: "var(--rj-text-muted)", lineHeight: 1.7 }}>{msg}</div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SVG 文本 → PNG Blob（按 SVG 自带宽高 1:1 光栅化） */
function svgToPngBlob(svgText: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth || img.width || 800);
      canvas.height = Math.max(1, img.naturalHeight || img.height || 1000);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("NO_CANVAS")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        blob ? resolve(blob) : reject(new Error("TO_BLOB_FAILED"));
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG_LOAD_FAILED")); };
    img.src = url;
  });
}
