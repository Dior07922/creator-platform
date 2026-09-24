"use client";
/* 临时验证页：GPU 位移图形变 vs Canvas 2D 切格子。
   同一个骨架、同一组关节，并排看画质差多少。验证完就删。
   import 的是真模块 src/lib/rigWarp.ts。 */
import { useEffect, useRef, useState } from "react";
import { type RigPoint, type RigBone, warpTo, defaultRadius, makeArmBones } from "@/lib/rigWarp";

const W = 390;
const H = 844;
const ONE_CM = 28;

function drawFigure(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#fdfaf5";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#3a352e";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cx = W / 2;
  const shoulderY = 300;
  ctx.beginPath(); ctx.arc(cx, 250, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 284); ctx.lineTo(cx, 560); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, 560); ctx.lineTo(cx - 46, 700);
  ctx.moveTo(cx, 560); ctx.lineTo(cx + 46, 700);
  ctx.stroke();
  for (const side of [-1, 1]) {
    const sx = cx + side * 26;
    const ex = cx + side * 92;
    const hx = cx + side * 118;
    ctx.beginPath();
    ctx.moveTo(sx, shoulderY);
    ctx.lineTo(ex, shoulderY + 70);
    ctx.lineTo(hx, shoulderY + 140);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, shoulderY + 140, 15, 0, Math.PI * 2); ctx.stroke();
  }
}

function armAngle(lift: number): number {
  const adx = 92;
  const dy = 140;
  if (lift <= 0) return 0;
  const f = (th: number) => dy * Math.cos(th) - adx * Math.sin(th) - (dy - lift);
  let lo = 0;
  let hi = Math.PI / 2;
  if (f(hi) > 0) hi = Math.PI;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function makePoints(lift: number): RigPoint[] {
  const cx = W / 2;
  const shoulderY = 300;
  const out: RigPoint[] = [];
  for (const side of [-1, 1]) {
    const tag = side < 0 ? "L" : "R";
    const sx = cx + side * 26;
    const ex = cx + side * 92;
    const hx = cx + side * 118;
    const elbowRest = shoulderY + 70;
    const handRest = shoulderY + 140;
    const th = armAngle(lift) * -side;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const rot = (px: number, py: number) => {
      const dx = px - sx;
      const dy = py - shoulderY;
      return { x: sx + dx * cos - dy * sin, y: shoulderY + dx * sin + dy * cos };
    };
    const e = rot(ex, elbowRest);
    const h = rot(hx, handRest);
    out.push({ id: `sh-${tag}`, sx, sy: shoulderY, x: sx, y: shoulderY });
    out.push({ id: `el-${tag}`, sx: ex, sy: elbowRest, x: e.x, y: e.y });
    out.push({ id: `hd-${tag}`, sx: hx, sy: handRest, x: h.x, y: h.y });
  }
  return out;
}

const BONES: RigBone[] = makeArmBones([
  { sh: "sh-L", el: "el-L", hd: "hd-L" },
  { sh: "sh-R", el: "el-R", hd: "hd-R" },
]);
const CHAIN: Record<string, string[]> = {
  "sh-L": ["el-L", "hd-L"], "el-L": ["hd-L"],
  "sh-R": ["el-R", "hd-R"], "el-R": ["hd-R"],
};

/* 位移图分辨率：比物理像素低很多也够 —— 位移场是平滑的，
   滤镜采样时会做双线性插值。1/3 分辨率 = 130×282，够且快。 */
const MW = 130;
const MH = 282;

export default function RigProof() {
  const srcRef = useRef<HTMLCanvasElement | null>(null);
  const out2dRef = useRef<HTMLCanvasElement | null>(null);
  const [lift, setLift] = useState(0);
  const [den, setDen] = useState(16);
  const [ms2d, setMs2d] = useState(0);
  const [msMap, setMsMap] = useState(0);
  const [srcUrl, setSrcUrl] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [dispScale, setDispScale] = useState(200);
  const ptsRef = useRef<RigPoint[]>(makePoints(0));
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: Map<string, { x: number; y: number }> } | null>(null);

  useEffect(() => {
    const c = srcRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawFigure(ctx);
    setSrcUrl(c.toDataURL("image/png"));
  }, []);

  ptsRef.current = makePoints(lift);
  const points = ptsRef.current;
  if (typeof window !== "undefined") {
    (window as unknown as { __rigPoints?: RigPoint[] }).__rigPoints = points;
  }

  /* ── 1. Canvas 2D 切格子 ── */
  useEffect(() => {
    const src = srcRef.current;
    const out = out2dRef.current;
    const ctx = out?.getContext("2d");
    if (!src || !out || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t0 = performance.now();
    warpTo(ctx, src, W, H, ptsRef.current, BONES, defaultRadius(W, H), den, den * 2);
    setMs2d(performance.now() - t0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift, den]);

  /* ── 2. GPU：把骨架位移场烘成一张位移贴图，交给 feDisplacementMap ── */
  useEffect(() => {
    const t0 = performance.now();
    const mc = document.createElement("canvas");
    mc.width = MW;
    mc.height = MH;
    const mctx = mc.getContext("2d");
    if (!mctx) return;
    const img = mctx.createImageData(MW, MH);
    const R = defaultRadius(W, H);
    /* 先扫一遍找最大位移，好定 feDisplacementMap 的 scale */
    let dmax = 0.001;
    const disp = new Float32Array(MW * MH * 2);
    for (let j = 0; j < MH; j++) {
      for (let i = 0; i < MW; i++) {
        const sx = ((i + 0.5) / MW) * W;
        const sy = ((j + 0.5) / MH) * H;
        const p = skinAt(sx, sy, ptsRef.current, R);
        const dx = p.x - sx;
        const dy = p.y - sy;
        const k = (j * MW + i) * 2;
        disp[k] = dx;
        disp[k + 1] = dy;
        const m = Math.hypot(dx, dy);
        if (m > dmax) dmax = m;
      }
    }
    /* feDisplacementMap: 位移 = scale × (通道/255 − 0.5)，所以 scale = 2×最大位移 */
    const scale = dmax * 2 * 1.02;
    for (let n = 0; n < MW * MH; n++) {
      const dx = disp[n * 2];
      const dy = disp[n * 2 + 1];
      const o = n * 4;
      img.data[o] = Math.max(0, Math.min(255, Math.round(128 + (dx / scale) * 255)));
      img.data[o + 1] = Math.max(0, Math.min(255, Math.round(128 + (dy / scale) * 255)));
      img.data[o + 2] = 0;
      img.data[o + 3] = 255;
    }
    mctx.putImageData(img, 0, 0);
    setDispScale(Math.round(scale));
    setMapUrl(mc.toDataURL("image/png"));
    setMsMap(performance.now() - t0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift]);

  function toLocal(e: React.PointerEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function onDown(e: React.PointerEvent) {
    const p0 = toLocal(e, e.currentTarget as HTMLElement);
    let best: string | null = null;
    let bd = 34;
    for (const p of ptsRef.current) {
      const d = Math.hypot(p0.x - p.x, p0.y - p.y);
      if (d < bd) { bd = d; best = p.id; }
    }
    if (!best) return;
    const follow = [best, ...(CHAIN[best] || [])];
    const origin = new Map<string, { x: number; y: number }>();
    for (const id of follow) {
      const p = ptsRef.current.find((q) => q.id === id);
      if (p) origin.set(id, { x: p.x, y: p.y });
    }
    dragRef.current = { id: best, startX: p0.x, startY: p0.y, origin };
    (e.currentTarget as unknown as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const p0 = toLocal(e, e.currentTarget as HTMLElement);
    const dx = p0.x - d.startX;
    const dy = p0.y - d.startY;
    ptsRef.current = ptsRef.current.map((p) => {
      const o = d.origin.get(p.id);
      return o ? { ...p, x: o.x + dx, y: o.y + dy } : p;
    });
    const src = srcRef.current;
    const out = out2dRef.current;
    const ctx = out?.getContext("2d");
    if (src && out && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      warpTo(ctx, src, W, H, ptsRef.current, BONES, defaultRadius(W, H), den, den * 2);
    }
  }

  const btn: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(74,70,63,.18)",
    background: "#fffdfa", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  };
  const panel: React.CSSProperties = { position: "relative", width: 195, height: 422 };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", background: "#f8f5ef", minHeight: "100vh" }}>
      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
        画质对比 · Canvas 2D 切格子（左） vs GPU 位移图（右）
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#8a8178", marginBottom: 3 }}>源图</div>
          <canvas ref={srcRef} width={W} height={H}
            style={{ width: 195, height: 422, border: "1px solid #ddd6ca", background: "#fff", display: "block" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8a8178", marginBottom: 3 }}>
            Canvas 2D 切格子 · {den}×{den * 2} · {ms2d.toFixed(1)}ms
          </div>
          <div style={panel}>
            <canvas ref={out2dRef} width={W} height={H}
              style={{ width: 195, height: 422, border: "1px solid #ddd6ca", background: "#fff", display: "block" }} />
            <svg viewBox={`0 0 ${W} ${H}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
              onPointerDown={onDown} onPointerMove={onMove}
              onPointerUp={() => { dragRef.current = null; }}>
              {points.map((p) => (
                <circle key={p.id} cx={p.x} cy={p.y} r={9} fill="rgba(122,90,52,.85)" stroke="#fffdfa" strokeWidth={3} />
              ))}
            </svg>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#7a5a34", marginBottom: 3 }}>
            GPU 位移图 · 贴图 {MW}×{MH} · scale {dispScale} · 烘图 {msMap.toFixed(1)}ms
          </div>
          <div style={panel}>
            {srcUrl && mapUrl && (
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 195, height: 422, display: "block", border: "1px solid #ddd6ca", background: "#fff" }}>
                <defs>
                  <filter id="rjWarp" x="-30%" y="-30%" width="160%" height="160%"
                    filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse">
                    <feImage href={mapUrl} preserveAspectRatio="none"
                      x="0" y="0" width={W} height={H} result="map" />
                    <feDisplacementMap in="SourceGraphic" in2="map"
                      scale={dispScale} xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                </defs>
                <image href={srcUrl} x="0" y="0" width={W} height={H} filter="url(#rjWarp)" />
                {points.map((p) => (
                  <circle key={p.id} cx={p.x} cy={p.y} r={9} fill="rgba(122,90,52,.85)" stroke="#fffdfa" strokeWidth={3} />
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btn} onClick={() => setLift(0)}>原图（不动）</button>
        <button style={btn} onClick={() => setLift(24)}>第一张 · 轻轻抬高一点</button>
        <button style={btn} onClick={() => setLift(24 + ONE_CM)}>第二张 · 再抬一公分</button>
        <span style={{ fontSize: 12, color: "#8a8178", marginLeft: 6 }}>网格</span>
        {[12, 16, 24, 32].map((d) => (
          <button key={d} style={{ ...btn, background: den === d ? "#3a352e" : "#fffdfa", color: den === d ? "#fffdfa" : "#3a352e" }}
            onClick={() => setDen(d)}>{d}×{d * 2}</button>
        ))}
        <span style={{ fontSize: 12, color: "#7a5a34", marginLeft: 6 }}>
          （网格只影响左边那一栏，GPU 那栏不受影响）
        </span>
      </div>
    </div>
  );
}

/* 直接从 rigWarp 的 skinPoint 拿位移，保证两栏用的是同一个骨架算法 */
import { skinPoint } from "@/lib/rigWarp";
function skinAt(px: number, py: number, pts: RigPoint[], R: number) {
  return skinPoint(px, py, pts, BONES, R);
}
