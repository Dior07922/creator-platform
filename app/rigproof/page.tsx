"use client";
/* 临时验证页：GPU 位移图形变 vs Canvas 2D 切格子。
   同一个骨架、同一组关节，并排看画质差多少。验证完就删。
   import 的是真模块 src/lib/rigWarp.ts。 */
import { useEffect, useRef, useState } from "react";
import { type RigPoint, type RigBone, warpTo, defaultRadius, makeArmBones } from "@/lib/rigWarp";

const W = 320;
const H = 480;
function drawFigure(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const im = new Image();
  im.onload = () => { ctx.drawImage(im, 0, 0, W, H); };
  im.src = '/rigtest/figure.png';
}

/* 手臂张开的角度（度）。肩不动，整条手臂绕肩转这个角 ——
   肘和手一起画弧。只把「手」往上挪的话上臂不动、前臂被拉长，
   看起来像橡皮筋，不像抬手。左右符号相反，所以是「两臂张开」。 */
const LIFT_DEG = [0, 12, 22];

/* 手稿里那个人（320×480）的臂线，坐标是照着画里手臂描出来的
   （见 _测试证据/z3-关节对比.png 的绿圈）。 */
const REST_ARMS = [
  /* 左臂被行李箱和包压着，逐行量出来的最暗列是跳的（79/102/88/90/96/76/99…），
     这几个人工坐标只是「大致压在左臂那条线上」，没有右臂那样的实测支撑。 */
  { side: "L", sgn: 1, sh: [78, 128], el: [73, 190], hd: [80, 232] },
  /* 右臂这条是逐行量出来的，很干净：y=120 时 x=145，到 y=250 时 x=162，
     几乎是一条直线，所以肩不是 131 而是 145。 */
  { side: "R", sgn: -1, sh: [145, 120], el: [153, 186], hd: [162, 250] },
];

function makePoints(deg: number): RigPoint[] {
  const th = (deg * Math.PI) / 180;
  return REST_ARMS.flatMap((a) => {
    const [ox, oy] = a.sh;
    const t = th * a.sgn;
    const c = Math.cos(t);
    const s = Math.sin(t);
    /* 肩不动，肘和手绕肩转同一个角 → 两段骨头长度不变，整条臂刚体旋转 */
    const rot = (px: number, py: number): [number, number] => {
      const dx = px - ox;
      const dy = py - oy;
      return [ox + dx * c - dy * s, oy + dx * s + dy * c];
    };
    const [ex, ey] = rot(a.el[0], a.el[1]);
    const [hx, hy] = rot(a.hd[0], a.hd[1]);
    return [
      /* ★ id 由 "sh-" + side 拼出来。side 只能写 "L" / "R" ——
         写成 "sh-L" 会拼成 sh-sh-L，骨架一根骨都找不到，
         画面就一个像素都不动（v1.0.7 挂的就是这个）。 */
      { id: "sh-" + a.side, sx: ox, sy: oy, x: ox, y: oy },
      { id: "el-" + a.side, sx: a.el[0], sy: a.el[1], x: ex, y: ey },
      { id: "hd-" + a.side, sx: a.hd[0], sy: a.hd[1], x: hx, y: hy },
    ];
  });
}

/**
 * 形变量：源图和结果图逐像素比亮度。
 * 原图（不动）状态下必须是 0 —— 所以这个数只要不是 0，就说明画面真被扯动了。
 *
 * ★ 不要用「亮度 < 某个阈值算作墨迹」那种判定。这张手稿照片最亮只有 145，
 *   全图没有任何一个像素 ≥150，于是「<150 变没变」对每个像素都恒为真，
 *   无论把画面拖成什么样，差值都是 0 —— v1.0.7 就是被这把尺骗了。
 */
function measureDisp(src: HTMLCanvasElement, out: HTMLCanvasElement) {
  const a = src.getContext("2d")?.getImageData(0, 0, W, H).data;
  const b = out.getContext("2d")?.getImageData(0, 0, W, H).data;
  if (!a || !b) return null;
  let sum = 0;
  let moved = 0;
  let max = 0;
  let cnt = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 200 || b[i + 3] < 200) continue; // 只比两边都实心的像素
    const la = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const lb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    const d = Math.abs(la - lb);
    sum += d;
    if (d > max) max = d;
    if (d > 8) moved++;
    cnt++;
  }
  if (!cnt) return null;
  return { mean: sum / cnt, pct: (moved / cnt) * 100, max };
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
  const [deg, setDeg] = useState(0);
  const [den, setDen] = useState(16);
  /* 影响半径：骨头能管多宽。给大了，手骨会伸到裙子上把裙子一起拽走；
     给小了，手臂自己的笔画跟不上。产品里这个值本来就要有滑杆微调。 */
  /* ★ 初值给 10，不是 defaultRadius(320,480)=26。
     语义变了：26 现在是「半宽」= 一条 53px 宽的带，比手臂到裙子的距离还宽，
     一拖就把裙子带走。10 是「贴着这条臂线一条带」。
     产品里的默认值（390×844 → 46）在新语义下同样偏宽，那是产品决定，我没动。 */
  const [rad, setRad] = useState(10);
  const [mv, setMv] = useState<{ mean: number; pct: number; max: number } | null>(null);
  const [ms2d, setMs2d] = useState(0);
  const [msMap, setMsMap] = useState(0);
  const [srcUrl, setSrcUrl] = useState("");
  /* 源图是异步加载的。加载完必须触发一次重算，
     否则形变在图片到位之前就跑完了，之后再也不动 —— 实测「变化像素 0」。 */
  const [srcReady, setSrcReady] = useState(0);
  const [mapUrl, setMapUrl] = useState("");
  const [dispScale, setDispScale] = useState(200);
  /* ★ 关节必须是 state，不能是 ref。
     写成 ref、再在组件体里 `ptsRef.current = makePoints(deg)` 的话，
     每次渲染都会把关节重置回原处 —— 拖完关节一 setState（刷新形变量读数）
     关节就弹回去了，而且 window.__rigPoints 指向的是旧数组，量到的是过期数据。 */
  const [pts, setPts] = useState<RigPoint[]>(() => makePoints(LIFT_DEG[0]));
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: Map<string, { x: number; y: number }> } | null>(null);

  useEffect(() => {
    const c = srcRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawFigure(ctx);
    /* drawFigure 里是异步 onload，这里等一拍再采，并且通知外面重算 */
    const t = window.setTimeout(() => {
      setSrcUrl(c.toDataURL("image/png"));
      setSrcReady((v) => v + 1);
    }, 600);
    return () => window.clearTimeout(t);
  }, []);

  const points = pts;
  if (typeof window !== "undefined") {
    (window as unknown as { __rigPoints?: RigPoint[] }).__rigPoints = points;
  }

  /* 角度变了 → 重算关节（拖动改的是 pts 本身，不走这里） */
  useEffect(() => {
    setPts(makePoints(deg));
  }, [deg]);

  /* ── 1. Canvas 2D 切格子。关节一变（按钮或拖动）就重画 ── */
  useEffect(() => {
    const src = srcRef.current;
    const out = out2dRef.current;
    const ctx = out?.getContext("2d");
    if (!src || !out || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t0 = performance.now();
    warpTo(ctx, src, W, H, pts, BONES, rad, den, den * 2);
    setMs2d(performance.now() - t0);
    setMv(measureDisp(src, out));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, den, rad, srcReady]);

  /* ── 2. GPU：把骨架位移场烘成一张位移贴图，交给 feDisplacementMap ── */
  useEffect(() => {
    const t0 = performance.now();
    const mc = document.createElement("canvas");
    mc.width = MW;
    mc.height = MH;
    const mctx = mc.getContext("2d");
    if (!mctx) return;
    const img = mctx.createImageData(MW, MH);
    const R = rad;
    /* 先扫一遍找最大位移，好定 feDisplacementMap 的 scale */
    let dmax = 0.001;
    const disp = new Float32Array(MW * MH * 2);
    for (let j = 0; j < MH; j++) {
      for (let i = 0; i < MW; i++) {
        const sx = ((i + 0.5) / MW) * W;
        const sy = ((j + 0.5) / MH) * H;
        const p = skinAt(sx, sy, pts, R);
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
  }, [pts, rad]);

  function toLocal(e: React.PointerEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function onDown(e: React.PointerEvent) {
    const p0 = toLocal(e, e.currentTarget as HTMLElement);
    let best: string | null = null;
    let bd = 34;
    for (const p of pts) {
      const d = Math.hypot(p0.x - p.x, p0.y - p.y);
      if (d < bd) { bd = d; best = p.id; }
    }
    if (!best) return;
    const follow = [best, ...(CHAIN[best] || [])];
    const origin = new Map<string, { x: number; y: number }>();
    for (const id of follow) {
      const p = pts.find((q) => q.id === id);
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
    /* 只挪关节，重画交给上面那个 effect —— 免得每次移动这里重画一遍、
       React 那边又重画一遍。 */
    setPts((prev) =>
      prev.map((p) => {
        const o = d.origin.get(p.id);
        return o ? { ...p, x: o.x + dx, y: o.y + dy } : p;
      }),
    );
  }

  const btn: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(74,70,63,.18)",
    background: "#fffdfa", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  };
  const panel: React.CSSProperties = { position: "relative", width: 240, height: 360 };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", background: "#f8f5ef", minHeight: "100vh" }}>
      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
        画质对比 · Canvas 2D 切格子（左） vs GPU 位移图（右）
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#8a8178", marginBottom: 3 }}>源图</div>
          <canvas ref={srcRef} width={W} height={H}
            style={{ width: 240, height: 360, border: "1px solid #ddd6ca", background: "#fff", display: "block" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8a8178", marginBottom: 3 }}>
            Canvas 2D 切格子 · {den}×{den * 2} · {ms2d.toFixed(1)}ms
            {mv && (
              <span style={{ color: mv.mean < 0.01 ? "#8a8178" : "#1a7f37", fontWeight: 600 }}>
                {`  ·  形变量 平均Δ${mv.mean.toFixed(2)} / 变过8级 ${mv.pct.toFixed(1)}% / 最大Δ${mv.max.toFixed(0)}`}
                {mv.mean < 0.01 ? "（没动）" : ""}
              </span>
            )}
          </div>
          <div style={panel}>
            <canvas ref={out2dRef} width={W} height={H}
              style={{ width: 240, height: 360, border: "1px solid #ddd6ca", background: "#fff", display: "block" }} />
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
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 240, height: 360, display: "block", border: "1px solid #ddd6ca", background: "#fff" }}>
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
        <button style={btn} onClick={() => setDeg(LIFT_DEG[0])}>原图（不动）</button>
        <button style={btn} onClick={() => setDeg(LIFT_DEG[1])}>两臂张开 12°</button>
        <button style={btn} onClick={() => setDeg(LIFT_DEG[2])}>再张开 22°</button>
        <span style={{ fontSize: 12, color: "#8a8178", marginLeft: 6 }}>影响半径 {rad}px</span>
        <input type="range" min={8} max={48} step={1} value={rad}
          onChange={(e) => setRad(Number(e.target.value))}
          style={{ width: 130, accentColor: "#7a5a34" }} />
        <span style={{ fontSize: 12, color: "#8a8178", marginLeft: 6 }}>网格</span>
        {[12, 16, 24, 32, 48, 64].map((d) => (
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
