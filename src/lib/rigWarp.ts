/* ════════════════════════════════════════════════════════════════════
   线条骨钉 · 骨架带动画面（人怎么动，画就怎么动）

   这一版是照【人体骨架的运动规律】写的，三条铁律：

     一、动一个关节，只有它的【下游】跟着走，上游纹丝不动。
         转肩 → 上臂、前臂、手全动，躯干一点不动（躯干是肩的上游）。
     二、运动的起点在最上游的关节。胳膊动的起点永远是肩。
     三、关节只转不拉长，骨长不变 —— 所以是【刚体搬运】，不是拉伸。

   ★ 关键：一个像素要么【属于】某根骨（权重 1，被那根骨整体搬走），
     要么【不属于】（权重 0，定死）。**没有中间值。**

   为什么不能按「离骨头多近」加权（上一版的做法）：
     那种做法数学里根本没有「上游/下游」这个概念 —— 躯干离肩骨很近，
     于是被算进了肩骨的势力范围，一抬胳膊整条裙子跟着糊走。
     衰减再快也不是 0，所以那套写法做不到手稿上那句
     「6 点以外全部定死不能动」。
     而且平滑混合本质上是【拉伸 + 压扁 + 互相糊】—— 那是把用户的作品
     改得面目全非。用户要的是作品【活过来】，不是被变形。

   所以这里的判定是【归属】，界线按人体关节切：
     · 近端以外（越过肩那一侧）→ 不属于，硬切，权重恒 0
     · 骨身上（两关节之间）    → 横向在半宽 W 以内就属于
     · 远端以外（越过手）      → 只管手那一小团，再往外不属于
   切面垂直于骨 —— 这是关节的分界方向，不是球状扩散。
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

/** 末端那一小团（手）的半径 = 半宽的倍数。手比骨头粗一点，但也不能没边。 */
const CAP_R = 1.0;

/**
 * 这根骨【管不管】这个像素。只有管 / 不管两种结果，没有中间值。
 * 管的返回它到骨的距离（多根骨都管时，谁近归谁）；不管的返回 null。
 *
 * 界线按人体关节的切法：
 *   t < 0  近端以外 —— 越过肩那一侧。**硬切，不属于。** 躯干不归胳膊管。
 *   t ∈[0,1] 骨身上 —— 横向在半宽 W 以内就属于。
 *   t > 1  远端以外 —— 只管手那一小团（半径 CAP_R×W），再往外不属于。
 */
function boneClaim(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
  W: number,
): number | null {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) {
    const d = Math.hypot(px - ax, py - ay);
    return d <= W ? d : null;
  }
  const t = ((px - ax) * vx + (py - ay) * vy) / len2;
  if (t < 0) return null;                       // ★ 近端硬切
  if (t <= 1) {
    const cx = ax + vx * t;
    const cy = ay + vy * t;
    const perp = Math.hypot(px - cx, py - cy);
    return perp <= W ? perp : null;
  }
  const dB = Math.hypot(px - bx, py - by);      // ★ 末端：手那一小团
  return dB <= W * CAP_R ? dB : null;
}

/** 一根骨这一刻的刚体变换：把「静止时贴在骨上的东西」整体搬到「现在骨所在的位置」。
    只有旋转 + 平移，**没有缩放** —— 缩放就是把作品拉长压扁，那叫变形，不叫动。 */
type BoneXform = {
  cos: number;
  sin: number;
  /** 近端关节：静止位置 → 当前位置 */
  arx: number; ary: number; acx: number; acy: number;
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
  /* 骨静止时的朝向 → 骨现在的朝向。只取这个角，不管长度变了多少：
     骨被拖动时长度会变，但画面只跟着【转】，不跟着【拉】。 */
  if (rlen < 1e-6 || clen < 1e-6) {
    return { cos: 1, sin: 0, arx: A.sx, ary: A.sy, acx: A.x, acy: A.y };
  }
  return {
    cos: (rvx * cvx + rvy * cvy) / (rlen * clen),
    sin: (rvx * cvy - rvy * cvx) / (rlen * clen),
    arx: A.sx, ary: A.sy, acx: A.x, acy: A.y,
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
  /* 找出「谁管这个点」。都管就归最近的那根；都不管就定死。 */
  let best: BoneXform | null = null;
  let bestD = Infinity;
  for (const bone of bones) {
    const A = jm.get(bone.a);
    const B = jm.get(bone.b);
    if (!A || !B) continue;
    const d = boneClaim(px, py, A.sx, A.sy, B.sx, B.sy, R);
    if (d === null || d >= bestD) continue;
    const xf = boneXform(jm, bone);
    if (!xf) continue;
    best = xf;
    bestD = d;
  }
  /* ★ 没有骨管它 → 原地不动。这就是手稿上那句「6 点以外全部定死不能动」。 */
  if (!best) return { x: px, y: py };
  /* 整体搬走：相对「骨静止时的近端」的位置 → 转一下 → 摆到近端的当前位置。
     不缩放，所以属于这根骨的笔画一根都不走样。 */
  const rx = px - best.arx;
  const ry = py - best.ary;
  return {
    x: best.acx + rx * best.cos - ry * best.sin,
    y: best.acy + rx * best.sin + ry * best.cos,
  };
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

/** 骨的默认半宽 —— 这条骨横着能管多宽。
    要盖得住肢体本身的粗细，但【不能宽到够着别的部位】：
    宽了，手骨会一直伸到裙子上把裙子带走；窄了，胳膊自己的笔画会掉在界线外。
    这是「贴着骨头一条带」的宽度，实际产品里由用户手里的滑杆调，不同画作不一样。
    ★ 注意语义变了：以前这是「影响半径」（向外平滑衰减），
      现在是「半宽」（界线硬切，超出即不属于）。同一个数，行为完全不同。 */
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
