"use client";
/* 临时验证页：证明「骨架带动蒙皮」的线条骨钉是对的。
   验证完就删。import 的是真模块 src/lib/rigWarp.ts，不是抄一份进来。 */
import { useEffect, useRef, useState } from "react";
import { type RigPoint, type RigBone, warpTo, defaultRadius, makeArmBones } from "@/lib/rigWarp";

const W = 390;
const H = 844;
/* 一公分：画面高 844px。按 A4 竖放（29.7cm 高）算，1cm ≈ 28px。
   之前按手机屏 15cm 算成 56px，抬手变成了 108 度的大甩臂，不叫「轻轻抬高」。 */
const ONE_CM = 28;

/* 画一个双手的小人：头 + 身子 + 两条手臂（肩→肘→手），手是圆 */
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
    const hy = shoulderY + 140;
    ctx.beginPath();
    ctx.moveTo(sx, shoulderY);
    ctx.lineTo(ex, shoulderY + 70);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.stroke();
  }
}

/* 6 颗骨钉：左边 3 个（肩/肘/手）+ 右边 3 个。
   lift = 抬手量。★ 用【关节转角度】实现，不是把点直接往上挪。
   真手臂是骨头长度不变、关节转角度，手沿一条弧线上去；
   直接挪点会把骨头压短，骨头一缩，骨头上的东西跟着缩，手掌圆就被挤扁。
   这里同样绕肩旋转整条臂（骨长恒定），手自然走弧线。 */
/* 解出「把整条臂绕肩转多少角度，手正好升高 lift」。
   ★ 求解式必须和下面 rot() 的旋转式严格一致：
     rot(): y' = sy + dx·sinθ + dy·cosθ
     要求 y' = sy + dy - lift  →  dx·sinθ + dy·cosθ = dy - lift
   左臂 dx 为负，把 dx 写成 -|dx| 代入就得：
     dy·cosθ - |dx|·sinθ = dy - lift
   之前这里写的是 -dx·sinθ，符号和 rot() 对不上，
   结果左臂取到 108° 的错根（手甩到头上去）、右臂取到反向根（手往下走）。
   只解一次「角度大小」，左右各取正负号，保证两边都朝上、且左右对称。 */
function armAngle(lift: number): number {
  const adx = 92;   // |dx|
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
    /* 整条臂绕肩刚体旋转 θ —— 骨长恒定，手走弧线 */
    const th = armAngle(lift) * -side;   /* 左臂 +θ，右臂 -θ，两边都朝上且对称 */
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
/* 谁跟着谁走：拖上游，下游跟着 —— 关节带动肢体的轨迹 */
const CHAIN: Record<string, string[]> = {
  "sh-L": ["el-L", "hd-L"], "el-L": ["hd-L"],
  "sh-R": ["el-R", "hd-R"], "el-R": ["hd-R"],
};

export default function RigProof() {
  const srcRef = useRef<HTMLCanvasElement | null>(null);
  const outRef = useRef<HTMLCanvasElement | null>(null);
  const [lift, setLift] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [drag, setDrag] = useState<string | null>(null);
  const [den, setDen] = useState(16);
  const [rMul, setRMul] = useState(10);
  const [ms, setMs] = useState(0);
  const ptsRef = useRef<RigPoint[]>(makePoints(0));
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: Map<string, { x: number; y: number }> } | null>(null);

  useEffect(() => {
    const c = srcRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawFigure(ctx);
  }, []);

  ptsRef.current = makePoints(lift);
  const points = ptsRef.current;
  /* 把手的位置暴露出去，测试要按真实落点量，不能猜。
     SSR 阶段没有 window，必须守卫，否则预渲染直接崩。 */
  if (typeof window !== "undefined") {
    (window as unknown as { __rigPoints?: RigPoint[] }).__rigPoints = points;
  }

  function render() {
    const src = srcRef.current;
    const out = outRef.current;
    const ctx = out?.getContext("2d");
    if (!src || !out || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t0 = performance.now();
    warpTo(ctx, src, W, H, ptsRef.current, BONES, defaultRadius(W, H) * (rMul / 10), den, den * 2);
    setMs(performance.now() - t0);
  }

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift, den, rMul]);

  useEffect(() => {
    if (!playing) return;
    const seq = [0, 24, 24 + ONE_CM];
    const t = window.setInterval(() => {
      setFrame((f) => {
        const n = (f + 1) % seq.length;
        setLift(seq[n]);
        return n;
      });
    }, 260);
    return () => window.clearInterval(t);
  }, [playing]);

  function toLocal(e: React.PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function onDown(e: React.PointerEvent) {
    const p0 = toLocal(e);
    let best: string | null = null;
    let bd = 34;
    for (const p of ptsRef.current) {
      const d = Math.hypot(p0.x - p.x, p0.y - p.y);
      if (d < bd) { bd = d; best = p.id; }
    }
    setDrag(best);
    if (!best) return;
    setPlaying(false);
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
    const p0 = toLocal(e);
    const dx = p0.x - d.startX;
    const dy = p0.y - d.startY;
    /* 关节带动：拖上游，下游按同样的位移跟着走 —— 肢体不会被拽断 */
    ptsRef.current = ptsRef.current.map((p) => {
      const o = d.origin.get(p.id);
      if (!o) return p;
      return { ...p, x: o.x + dx, y: o.y + dy };
    });
    render();
  }

  const btn: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(74,70,63,.18)",
    background: "#fffdfa", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", background: "#f8f5ef", minHeight: "100vh" }}>
      <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 600 }}>
        线条骨钉 · 骨架带动蒙皮 验证
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#8a8178", marginBottom: 4 }}>源图（钉住不动）</div>
          <canvas ref={srcRef} width={W} height={H}
            style={{ width: 195, height: 422, border: "1px solid #ddd6ca", background: "#fff", display: "block" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#8a8178", marginBottom: 4 }}>
            形变结果 · 拖 6 个关节（当前抬手 {Math.round(lift)}px）
          </div>
          <div style={{ position: "relative", width: 195, height: 422 }}>
            <canvas ref={outRef} width={W} height={H}
              style={{ width: 195, height: 422, border: "1px solid #ddd6ca", background: "#fff", display: "block" }} />
            <svg viewBox={`0 0 ${W} ${H}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
              onPointerDown={onDown} onPointerMove={onMove}
              onPointerUp={() => { dragRef.current = null; setDrag(null); }}>
              {/* 骨架：4 根骨画成线，让人看清「这是一副骨架」 */}
              {BONES.map((b) => {
                const A = points.find((p) => p.id === b.a);
                const B = points.find((p) => p.id === b.b);
                if (!A || !B) return null;
                return <line key={b.id} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                  stroke="rgba(122,90,52,.30)" strokeWidth={7} strokeLinecap="round" />;
              })}
              {points.map((p) => (
                <g key={p.id}>
                  <circle cx={p.sx} cy={p.sy} r={4} fill="none" stroke="rgba(122,90,52,.35)" strokeWidth={2} />
                  <circle cx={p.x} cy={p.y} r={9}
                    fill={drag === p.id ? "#7a5a34" : "rgba(122,90,52,.85)"}
                    stroke="#fffdfa" strokeWidth={3} />
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btn} onClick={() => { setPlaying(false); setLift(0); }}>原图（不动）</button>
        <button style={btn} onClick={() => { setPlaying(false); setLift(24); }}>第一张 · 轻轻抬高一点</button>
        <button style={btn} onClick={() => { setPlaying(false); setLift(24 + ONE_CM); }}>第二张 · 再抬一公分</button>
        <button style={{ ...btn, background: playing ? "#3a352e" : "#fffdfa", color: playing ? "#fffdfa" : "#3a352e" }}
          onClick={() => setPlaying((v) => !v)}>{playing ? "■ 停" : "▶ 快速播放"}</button>
        <span style={{ fontSize: 12, color: "#8a8178", marginLeft: 6 }}>网格</span>
        {[12, 16, 24, 32].map((d) => (
          <button key={d} style={{ ...btn, background: den === d ? "#3a352e" : "#fffdfa", color: den === d ? "#fffdfa" : "#3a352e" }}
            onClick={() => setDen(d)}>{d}×{d * 2}</button>
        ))}
        <span style={{ fontSize: 12, color: "#8a8178", marginLeft: 6 }}>影响半径 ×{(rMul / 10).toFixed(1)}</span>
        <input type="range" min={4} max={40} value={rMul} onChange={(e) => setRMul(Number(e.target.value))} style={{ width: 130 }} />
        <span style={{ fontSize: 12, color: "#7a5a34", marginLeft: 6 }}>一帧 {ms.toFixed(1)} ms</span>
      </div>
    </div>
  );
}
