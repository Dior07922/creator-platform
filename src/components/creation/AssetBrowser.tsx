// name=src/components/creation/AssetBrowser.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ASSET_CATEGORIES, CATEGORY_ACTIONS, type Asset, type AssetAction } from "../../lib/sampleAssets";
import {
  searchPexels, trendingPexels,
  searchUnsplash, trendingUnsplash,
  searchOpenverse, trendingOpenverse,
  searchEuropeana, trendingEuropeana,
  searchWikimedia, trendingWikimedia,
  loadIconfont,
  type RemoteAsset,
} from "../../lib/assetSources";

export default function AssetBrowser({
  onPick, onClose, onAction,
}: {
  onPick: (asset: Asset) => void;
  onClose: () => void;
  onAction: (action: AssetAction) => void;
}) {
  const [catId, setCatId] = useState(ASSET_CATEGORIES[0].id);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<RemoteAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [icons, setIcons] = useState<RemoteAsset[] | null>(null);
  const [source, setSource] = useState<"pexels" | "unsplash" | "openverse" | "europeana" | "wikimedia">("pexels");
  const [refreshKey, setRefreshKey] = useState(0);

  const cat = ASSET_CATEGORIES.find((c) => c.id === catId) || ASSET_CATEGORIES[0];
  const actions = CATEGORY_ACTIONS[cat.id] || [];

  // 图标
  useEffect(() => {
    if (catId !== "icons") return;
    if (icons) return;
    setLoading(true); setErr(null);
    loadIconfont()
      .then(setIcons)
      .catch((e) => setErr(e?.message || "图标加载失败"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, refreshKey]);

  // 远程推荐（切分类 / 切源）
  useEffect(() => {
    if (catId !== "explore" && catId !== "photo") { setRemote(null); return; }
    if (q.trim()) return;
    setLoading(true); setErr(null);
    const loader =
      source === "pexels" ? trendingPexels :
      source === "unsplash" ? trendingUnsplash :
      source === "openverse" ? trendingOpenverse :
      source === "europeana" ? trendingEuropeana :
      trendingWikimedia;
    loader(24)
      .then((list) => setRemote(list))
      .catch((e) => setErr(e?.message || "加载失败"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, source, refreshKey]);

  // 搜索
  useEffect(() => {
    if (!q.trim()) {
      if (catId === "explore" || catId === "photo") {
        setLoading(true); setErr(null);
        const loader =
          source === "pexels" ? trendingPexels :
          source === "unsplash" ? trendingUnsplash :
          source === "openverse" ? trendingOpenverse :
          source === "europeana" ? trendingEuropeana :
          trendingWikimedia;
        loader(24)
          .then(setRemote)
          .catch((e) => setErr(e?.message || "加载失败"))
          .finally(() => setLoading(false));
      } else setRemote(null);
      return;
    }
    setLoading(true); setErr(null);
    const t = window.setTimeout(() => {
      const searcher =
        source === "pexels" ? searchPexels :
        source === "unsplash" ? searchUnsplash :
        source === "openverse" ? searchOpenverse :
        source === "europeana" ? searchEuropeana :
        searchWikimedia;
      searcher(q, 30)
        .then(setRemote)
        .catch((e) => setErr(e?.message || "搜索失败"))
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [q, catId, source, refreshKey]);

  const filteredGroups = useMemo(() => {
    if (remote !== null) return [];
    if (!q.trim()) return cat.groups;
    const t = q.trim().toLowerCase();
    return cat.groups
      .map((g) => ({ ...g, items: g.items.filter((it) => it.name.toLowerCase().includes(t)) }))
      .filter((g) => g.items.length > 0);
  }, [cat, q, remote]);

  const showRemote = remote !== null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "#121214",
        color: "#eee",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* 顶栏 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(env(safe-area-inset-top) + 14px) 18px 12px",
      }}>
        <div style={{ width: 36 }} />
        <div style={{
          fontSize: 15, fontWeight: 600,
          letterSpacing: ".22em", textIndent: ".22em",
        }}>素材</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: 18, border: 0,
            background: "#5ac8fa", color: "#fff",
            fontSize: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 10px rgba(90,200,250,.35)",
          }}
        >✓</button>
      </div>

      {/* 分类 */}
      <div style={{
        display: "flex", gap: 8, padding: "2px 18px 12px",
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {ASSET_CATEGORIES.map((c) => {
          const active = c.id === catId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatId(c.id)}
              style={{
                flex: "none",
                height: 38, padding: "0 15px",
                borderRadius: 19, border: 0, cursor: "pointer",
                background: active ? "#5ac8fa" : "#1e1e21",
                color: active ? "#fff" : "#9a9aa0",
                fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
                transition: "background .18s, color .18s",
              }}
            >
              <span style={{ fontSize: 15 }}>{c.icon}</span>
              <span>{c.title}</span>
            </button>
          );
        })}
      </div>

      {/* 源切换 */}
      {(catId === "explore" || catId === "photo") && (
        <div style={{
          display: "flex", gap: 8, padding: "0 18px 10px",
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {(["pexels", "unsplash", "openverse", "europeana", "wikimedia"] as const).map((s) => {
            const active = source === s;
            const label =
              s === "pexels" ? "Pexels" :
              s === "unsplash" ? "Unsplash" :
              s === "openverse" ? "Openverse" :
              s === "europeana" ? "Europeana" :
              "Wikimedia";
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                style={{
                  flex: "none",
                  height: 30, padding: "0 12px",
                  borderRadius: 15, border: 0, cursor: "pointer",
                  background: active ? "#3a352e" : "#1e1e21",
                  color: active ? "#fff" : "#9a9aa0",
                  fontSize: 12, letterSpacing: ".04em",
                  transition: "background .18s, color .18s",
                }}
              >{label}</button>
            );
          })}
        </div>
      )}

      {/* 搜索框 */}
      <div style={{ padding: "0 18px 14px" }}>
        <div style={{
          height: 42, borderRadius: 21, background: "#1b1b1d",
          display: "flex", alignItems: "center", padding: "0 14px", gap: 8,
        }}>
          <span style={{ fontSize: 15, color: "#666" }}>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索 · 猫 / 星空 / 中式 / 咖啡"
            style={{
              flex: 1, border: 0, background: "transparent", outline: "none",
              color: "#eee", fontSize: 14, fontFamily: "inherit",
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              style={{ border: 0, background: "transparent", color: "#888", fontSize: 18, cursor: "pointer", padding: 0 }}
            >×</button>
          )}
        </div>
      </div>

      {/* 内容区：浅米色画布 */}
      <div style={{
        flex: 1, overflowY: "auto",
        background: "#f2ede5",
        borderRadius: "22px 22px 0 0",
        padding: "18px 14px calc(env(safe-area-inset-bottom) + 24px)",
        color: "#3a352e",
      }}>
        {/* 分类顶部操作卡 */}
        {!showRemote && catId !== "icons" && actions.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10, marginBottom: 20,
          }}>
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={() => onAction(a.action)}
                style={{
                  height: 74, borderRadius: 16, border: 0,
                  background: "#ffffff",
                  color: "#3a352e", cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(74,70,63,.08), 0 6px 16px rgba(74,70,63,.04)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: 22 }}>{a.icon}</span>
                <span style={{ fontSize: 12, letterSpacing: ".04em" }}>{a.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 图标网格 */}
        {catId === "icons" && icons && (
          <>
            <div style={{
              display: "flex", alignItems: "baseline", gap: 6,
              margin: "2px 4px 12px",
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".04em" }}>图标</span>
              <span style={{ fontSize: 11, color: "#a49a8f" }}>{icons.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {icons.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick({ id: it.id, src: it.src, w: it.w, h: it.h, name: it.name })}
                  title={it.name}
                  style={{
                    aspectRatio: "1 / 1",
                    padding: 12, border: 0, borderRadius: 16,
                    background: "#ffffff",
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(74,70,63,.08), 0 6px 16px rgba(74,70,63,.04)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <img
                    src={it.src}
                    alt={it.name}
                    draggable={false}
                    style={{ width: "72%", height: "72%", objectFit: "contain", pointerEvents: "none" }}
                  />
                </button>
              ))}
            </div>
          </>
        )}

        {loading && (
          <div style={{ color: "#8a8178", textAlign: "center", padding: "40px 0", fontSize: 13 }}>加载中…</div>
        )}
        {!loading && err && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ color: "#c04a4a", fontSize: 12, marginBottom: 14 }}>{err}</div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              style={{
                height: 36, padding: "0 24px", borderRadius: 18, border: 0,
                background: "#3a352e", color: "#fff",
                fontSize: 13, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(58,53,46,.2)",
              }}
            >重试</button>
          </div>
        )}

        {/* 远程图片瀑布流 */}
        {!loading && !err && showRemote && remote!.length > 0 && (
          <div style={{ columnCount: 2, columnGap: 10 }}>
            {remote!.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick({ id: it.id, src: it.src, w: it.w, h: it.h, name: it.name })}
                style={{
                  display: "block", width: "100%",
                  padding: 0, border: 0, marginBottom: 10,
                  borderRadius: 14, overflow: "hidden",
                  background: "#ffffff",
                  boxShadow: "0 1px 3px rgba(74,70,63,.08), 0 6px 16px rgba(74,70,63,.04)",
                  cursor: "pointer", breakInside: "avoid",
                  position: "relative",
                }}
              >
                <img
                  src={it.thumb}
                  alt={it.name}
                  draggable={false}
                  loading="lazy"
                  style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }}
                />
              </button>
            ))}
          </div>
        )}

        {!loading && !err && showRemote && remote!.length === 0 && (
          <div style={{ color: "#8a8178", textAlign: "center", padding: "40px 0", fontSize: 13 }}>没有匹配</div>
        )}

        {/* 本地静态分组 */}
        {!loading && !showRemote && catId !== "icons" && filteredGroups.map((g) => (
          <div key={g.id} style={{ marginBottom: 22 }}>
            <div style={{
              display: "flex", alignItems: "baseline", gap: 6,
              margin: "2px 4px 12px",
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#3a352e", letterSpacing: ".04em" }}>{g.title}</span>
              <span style={{ fontSize: 11, color: "#a49a8f" }}>{g.items.length}</span>
            </div>
            <div style={{ columnCount: 2, columnGap: 10 }}>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick(it)}
                  style={{
                    display: "block", width: "100%",
                    padding: 0, border: 0, marginBottom: 10,
                    borderRadius: 14, overflow: "hidden",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(74,70,63,.08), 0 6px 16px rgba(74,70,63,.04)",
                    cursor: "pointer", breakInside: "avoid",
                  }}
                >
                  <img
                    src={it.src}
                    alt={it.name}
                    draggable={false}
                    style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}