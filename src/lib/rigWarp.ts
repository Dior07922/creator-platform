/* ════════════════════════════════════════════════════════════════════
   线条骨钉 · 骨架带动蒙皮（木偶关节）

   为什么不是「每个点各算位移」：
   那种做法下每个点各自拉扯，细线跨格就被扯断 —— 手臂会碎成几段。
   真实的人体不是这样动的：关节一转，整条肢体作为一根刚体跟着走。

   所以这里用骨架：
     · 6 个点是关节（肩/肘/手 × 2），两两成骨 —— 肩→肘、肘→手
     · 每根骨算一个【刚体变换】：骨头怎么转、怎么移，骨上的东西就整体跟着去
     · 画面上每个格子顶点，按「离哪根骨近」加权混合几根骨的刚体变换
       → 贴着骨头的局部几乎是刚性的，所以不会散
       → 只有关节交汇处才平滑过渡，所以会弯
     · 离所有骨都远的地方权重为 0 → 定死不动

   这就是「局部可以移动但不能拆散」在数学上的写法。
   ════════════════════════════════════════════════════════════════════ */

/** 一颗骨钉（一个关节）：钉在画面的 (sx, sy)，被拖到了 (x, y) */
export type RigPoint = {
  id: string;
  /** 钉住的位置（源图坐标）—— 钉子扎下去的那个点，永不改变 */
  sx: number;
  sy: number;
  /** 当前被拖到的位置（源图坐标） */
  x: number;
  y: number;
};

/** 一根骨：连接两个关节。a = 近端（靠身体），b = 远端（靠末端） */
export type RigBone = { id: string; a: string; b: string };

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** 点到线段的最短距离 */
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/**
 * 相对一根骨的「有效距离」——这是不散的关键。
 *
 * 用「到线段的距离」当权重，等于横向和纵向衰减一样快，会同时出两个毛病：
 *   · 横向：肩骨离身子中轴只有二十几像素，身子被一起拽走（拖出灰影）
 *   · 纵向：骨头到手腕就截止，手掌远半边只分到两成力，被压扁
 *
 * 真实肢体的影响范围应该是细长的一条：横向窄（不碰隔壁），
 * 纵向顺着头尾延伸（末端的手掌跟着走）。
 * 所以把偏移拆成【垂直分量】和【越过端点的分量】，分别定标：
 *   · 垂直：原样（窄）
 *   · 越过近端（靠身体那头）：提前衰减，别把上一级拽走
 *   · 越过远端（手那端）：衰减慢，让掌/脚这类末端整体跟着
 */
const ALONG_FAR = 0.34;   // 越过远端：衰减慢 3 倍
const ALONG_NEAR = 1.7;   // 越过近端：衰减快 1.7 倍
const CAP_R = 0.40;       // 末端球头半径 = R 的 0.40 倍

function boneDist(px: number, py: number, ax: number, ay: number, bx: number, by: number, R: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * vx + (py - ay) * vy) / len2;
  const cx = ax + vx * Math.max(0, Math.min(1, t));
  const cy = ay + vy * Math.max(0, Math.min(1, t));
  const perp = Math.hypot(px - cx, py - cy);
  if (t > 1) {
    /* ★ 末端球头。关节是「球关节」，球里头的东西整体跟着走。
       没有球头的话，手掌这类末端会出问题：钉在掌心时，
       靠身体那半边在骨头里侧、靠外那半边在骨头外侧，
       两边分到的权重不一样，圆就被挤扁成一道。
       球头把整个末端包进去，权重一样，掌/脚就整体跟着走。 */
    const dB = Math.hypot(px - bx, py - by);
    return Math.max(0, dB - R * CAP_R);
  }
  if (t < 0) {
    const beyond = Math.hypot(px - ax, py - ay);
    const over = Math.sqrt(Math.max(0, beyond * beyond - perp * perp));
    return Math.hypot(perp, over * ALONG_NEAR);
  }
  return perp;
}

/** 一根骨这一刻的刚体变换：把「静止时贴在骨上的东西」搬到「现在骨所在的位置」 */
type BoneXform = {
  /** 旋转角（弧度） */
  rot: number;
  cos: number;
  sin: number;
  /** 近端关节：静止位置 → 当前位置 */
  arx: number; ary: number; acx: number; acy: number;
  /** 骨长比：拉伸时按比例放缩，避免拉长骨头时把画撕开 */
  stretch: number;
};

function boneXform(j: Map<string, RigPoint>, bone: RigBone): BoneXform | null {
  const A = j.get(bone.a);
  const B = j.get(bone.b);
  if (!A || !B) return null;
  const rvx = B.sx - A.sx;
  const rvy = B.sy - A.sy;
  const cvx = B.x - A.x;
  const cvy = B.y - A.y;
  const rlen = Math.hypot(rvx, rvy);
  const clen = Math.hypot(cvx, cvy);
  return {
    rot: Math.atan2(cvy, cvx) - Math.atan2(rvy, rvx),
    cos: rlen > 1e-6 && clen > 1e-6
      ? (rvx * cvx + rvy * cvy) / (rlen * clen)
      : 1,
    sin: rlen > 1e-6 && clen > 1e-6
      ? (rvx * cvy - rvy * cvx) / (rlen * clen)
      : 0,
    arx: A.sx, ary: A.sy, acx: A.x, acy: A.y,
    stretch: rlen > 1e-6 ? clen / rlen : 1,
  };
}

/**
 * 蒙皮：画面上 (px, py) 这一点，被骨架带到了哪里。
 * 按「离哪根骨近」加权混合各骨的刚体变换。
 * R 之外 → 权重全 0 → 原地不动（定死）。
 */
export function skinPoint(
  px: number,
  py: number,
  joints: RigPoint[],
  bones: RigBone[],
  R: number,
): { x: number; y: number } {
  const jm = new Map(joints.map((p) => [p.id, p]));
  let sw = 0;
  let ox = 0;
  let oy = 0;
  for (const bone of bones) {
    const A = jm.get(bone.a);
    const B = jm.get(bone.b);
    if (!A || !B) continue;
    const d = boneDist(px, py, A.sx, A.sy, B.sx, B.sy, R);
    if (d >= R) continue;
    /* ★ 四次方衰减 —— 这是「聚拢」的关键。
       线性/smoothstep 衰减下，离骨头稍远的地方还留着不小的权重
       （肩关节离身体中轴只有二十几像素，身子会被一起拽走，拖出一道灰影）。
       四次方让权重贴着骨头才接近 1，稍微离开就迅速掉到接近 0：
       能动的地方紧紧聚在骨头上，骨头外面很快归零。 */
    const t = 1 - d / R;
    const w = t * t * t * t;
    if (w <= 0.001) continue;
    const xf = boneXform(jm, bone);
    if (!xf) continue;
    /* 把点相对「骨静止时的近端」的位置，旋转 + 按骨长比放缩，再搬到近端的当前位置 */
    const rx = (px - xf.arx) * xf.stretch;
    const ry = (py - xf.ary) * xf.stretch;
    ox += w * (xf.acx + rx * xf.cos - ry * xf.sin);
    oy += w * (xf.acy + rx * xf.sin + ry * xf.cos);
    sw += w;
  }
  if (sw <= 0) return { x: px, y: py };
  return { x: ox / sw, y: oy / sw };
}

/** 网格顶点：源坐标 + 目标坐标 */
export type MeshVert = { sx: number; sy: number; dx: number; dy: number };

export function buildMesh(
  srcW: number,
  srcH: number,
  cols: number,
  rows: number,
  joints: RigPoint[],
  bones: RigBone[],
  R: number,
): MeshVert[] {
  const out: MeshVert[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const sx = (i * srcW) / cols;
      const sy = (j * srcH) / rows;
      const p = skinPoint(sx, sy, joints, bones, R);
      out.push({ sx, sy, dx: p.x, dy: p.y });
    }
  }
  return out;
}

/* 单个三角形贴图：源三角形 (u,v) → 目标三角形 (x,y)。
   三角形会向外扩一点点再裁，让相邻三角互相压住对方的缝 ——
   细线跨格断开就是缝造成的，压住就看不见了。 */
const SEAM = 0.7;

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  u0: number, v0: number, u1: number, v1: number, u2: number, v2: number,
): void {
  /* 从重心往外扩 SEAM 像素 */
  const gx = (x0 + x1 + x2) / 3;
  const gy = (y0 + y1 + y2) / 3;
  const ex = (x: number, y: number) => {
    const dx = x - gx;
    const dy = y - gy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return [x, y] as const;
    return [x + (dx / d) * SEAM, y + (dy / d) * SEAM] as const;
  };
  const [ax, ay] = ex(x0, y0);
  const [bx, by] = ex(x1, y1);
  const [cx, cy] = ex(x2, y2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.clip();

  const denom = u0 * (v2 - v1) - u1 * v2 + u2 * v1 + (u1 - u2) * v0;
  if (denom === 0) { ctx.restore(); return; }

  const m11 = -(v0 * (x2 - x1) - v1 * x2 + v2 * x1 + (v1 - v2) * x0) / denom;
  const m12 = (v1 * y2 + v0 * (y1 - y2) - v2 * y1 + (v2 - v1) * y0) / denom;
  const m21 = (u0 * (x2 - x1) - u1 * x2 + u2 * x1 + (u1 - u2) * x0) / denom;
  const m22 = -(u1 * y2 + u0 * (y1 - y2) - u2 * y1 + (u2 - u1) * y0) / denom;
  const dx = (u0 * (v2 * x1 - v1 * x2) + v0 * (u1 * x2 - u2 * x1) + (u2 * v1 - u1 * v2) * x0) / denom;
  const dy = (u0 * (v2 * y1 - v1 * y2) + v0 * (u1 * y2 - u2 * y1) + (u2 * v1 - u1 * v2) * y0) / denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** 把 src 按骨架形变后画到 ctx 上（ctx 的坐标系 = 源图坐标系） */
export function warpTo(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  joints: RigPoint[],
  bones: RigBone[],
  R: number,
  cols = 16,
  rows = 32,
): void {
  const verts = buildMesh(srcW, srcH, cols, rows, joints, bones, R);
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = verts[j * stride + i];
      const b = verts[j * stride + i + 1];
      const c = verts[(j + 1) * stride + i + 1];
      const d = verts[(j + 1) * stride + i];
      drawTriangle(ctx, src, a.dx, a.dy, b.dx, b.dy, c.dx, c.dy, a.sx, a.sy, b.sx, b.sy, c.sx, c.sy);
      drawTriangle(ctx, src, a.dx, a.dy, c.dx, c.dy, d.dx, d.dy, a.sx, a.sy, c.sx, c.sy, d.sx, d.sy);
    }
  }
}

/** 骨钉的默认影响半径。
    要盖得住肢体本身的粗细，但【不能大到够着别的部位】——
    半径给大了，手骨的势力范围会一直伸到腿上，把腿也拽走；
    肩骨的范围会伸进身子，把身子拖出灰影。
    0.055 × 长边（390×844 的纸上约 46px）是「贴着骨头一条带」的宽度。
    实际产品里这个值由用户手里的滑杆微调，不同画作不一样。 */
export function defaultRadius(srcW: number, srcH: number): number {
  return Math.max(srcW, srcH) * 0.055;
}

/**
 * 按「双手各 3 个关节」造骨架：肩 → 肘 → 手。
 * 一边 3 个点，两边 6 个点，两两成骨，一共 4 根骨。
 */
export function makeArmBones(ids: { sh: string; el: string; hd: string }[]): RigBone[] {
  const out: RigBone[] = [];
  ids.forEach((g, i) => {
    out.push({ id: `upper-${i}`, a: g.sh, b: g.el });
    out.push({ id: `fore-${i}`, a: g.el, b: g.hd });
  });
  return out;
}
