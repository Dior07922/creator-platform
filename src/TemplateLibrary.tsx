import React, { useState, useEffect, useRef } from "react";
import { Template, FREE_TEMPLATES, VIP_TEMPLATES } from "./templates";

const A4_W = 794;
const A4_H = 1123;

type Props = {
  mode: "local" | "cloud";
  isVip: boolean;
  onBack: () => void;
  onUseTemplate: (t: Template) => void;
  onUpgradeVip: () => void;
};

const CATS: { key: string; label: string }[] = [
  { key: "hot", label: "热门精选" },
  { key: "daily", label: "日常记录" },
  { key: "inspiration", label: "灵感创作" },
  { key: "study", label: "学习笔记" },
  { key: "reading", label: "读书笔记" },
];

function A4Paper({ scale, children }: { scale: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: A4_W * scale,
        height: A4_H * scale,
        position: "relative",
        margin: "0 auto",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 2px 14px rgba(0,0,0,.08)",
        border: "1px solid rgba(74,70,63,.06)",
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
          fontFamily: '"Songti SC", "STSong", "PingFang SC", serif',
          fontSize: 15,
          lineHeight: 1.9,
          color: "#3a352e",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function TemplateLibrary({
  mode,
  isVip,
  onBack,
  onUseTemplate,
  onUpgradeVip,
}: Props) {
  const [cat, setCat] = useState("hot");
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  function filterByCat(t: Template) {
    if (cat === "hot") return true;
    return t.category === cat;
  }

  const freeList = FREE_TEMPLATES.filter(filterByCat);
  const vipList = mode === "cloud" ? VIP_TEMPLATES.filter(filterByCat) : [];

  function handleUse(t: Template) {
    if (t.vip && !isVip) {
      onUpgradeVip();
      return;
    }
    onUseTemplate(t);
  }

  return (
    <div className="tpl-library">
      <header className="tpl-library-header">
        <button type="button" onClick={onBack}>← 返回</button>
        <strong>{mode === "local" ? "本地创作" : "云端创作"}</strong>
        <span />
      </header>

      <div className="tpl-tabs">
        {CATS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={cat === c.key ? "is-active" : ""}
            onClick={() => setCat(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="tpl-scroll">
        <div className="tpl-section-label">免费模板</div>
        <div className="tpl-grid">
          {freeList.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              isVip={isVip}
              mode={mode}
              onPreview={() => setPreviewTemplate(t)}
              onUse={() => handleUse(t)}
            />
          ))}
        </div>

        {mode === "cloud" && vipList.length > 0 && (
          <>
            <div className="tpl-section-label tpl-section-label--vip">
              专业模板 <span className="tpl-vip-tag">VIP</span>
            </div>
            <div className="tpl-grid">
              {vipList.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isVip={isVip}
                  mode={mode}
                  onPreview={() => setPreviewTemplate(t)}
                  onUse={() => handleUse(t)}
                />
              ))}
            </div>

            <div className="tpl-collab-row">
              <span>多人实时协作</span>
              <span className="tpl-vip-tag">VIP</span>
            </div>
          </>
        )}
      </div>

      {previewTemplate && (
        <TemplatePreview
          template={previewTemplate}
          isVip={isVip}
          onBack={() => setPreviewTemplate(null)}
          onUse={() => {
            const t = previewTemplate;
            setPreviewTemplate(null);
            handleUse(t);
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  isVip,
  mode,
  onPreview,
  onUse,
}: {
  template: Template;
  isVip: boolean;
  mode: "local" | "cloud";
  onPreview: () => void;
  onUse: () => void;
}) {
  // 本地创作：整卡片可点，直接进编辑器，无预览/使用按钮
  if (mode === "local") {
    return (
      <button
        type="button"
        className="tpl-card tpl-card--tappable"
        onClick={onUse}
      >
        <div className="tpl-card-mark">文</div>
        <div className="tpl-card-name">{template.name}</div>
        <div className="tpl-card-desc">{template.desc}</div>
      </button>
    );
  }

  // 云端创作：保留原来的按钮布局
  return (
    <div className="tpl-card">
      {template.vip && <span className="tpl-vip-badge">VIP</span>}
      <div className="tpl-card-mark">文</div>
      <div className="tpl-card-name">{template.name}</div>
      <div className="tpl-card-desc">{template.desc}</div>
      <div className="tpl-card-actions">
        <button type="button" className="tpl-btn-preview" onClick={onPreview}>
          预览
        </button>
        <button type="button" className="tpl-btn-use" onClick={onUse}>
          {template.vip ? (isVip ? "使用" : "VIP · 使用") : "使用"}
        </button>
      </div>
    </div>
  );
}

function TemplatePreview({
  template,
  isVip,
  onBack,
  onUse,
}: {
  template: Template;
  isVip: boolean;
  onBack: () => void;
  onUse: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.42);

  useEffect(() => {
    function calc() {
      const el = wrapRef.current;
      if (!el) return;
      const avail = el.clientWidth - 32;
      setScale(Math.max(0.15, avail / A4_W));
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return (
    <div className="tpl-preview-overlay">
      <div className="tpl-preview-page">
        <header className="tpl-preview-header">
          <h1>{template.name}</h1>
          <p>{template.desc}</p>
        </header>

        <div className="tpl-preview-content" ref={wrapRef}>
          <div className="tpl-preview-note">交互预览 · 输入仅用于体验，不会保存</div>
          <A4Paper scale={scale}>
            {template.initialText || "（空白模板）"}
          </A4Paper>
        </div>

        <footer className="tpl-preview-actions">
          <button type="button" className="tpl-btn-preview" onClick={onBack}>
            返回
          </button>
          <button type="button" className="tpl-btn-use" onClick={onUse}>
            {template.vip ? (isVip ? "使用" : "VIP · 使用") : "使用"}
          </button>
        </footer>
      </div>
    </div>
  );
}