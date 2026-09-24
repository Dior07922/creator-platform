/* ════════════════════════════════════════════════════════════════════
   线条骨钉 · 活页与继承

   一叠纸里，只有「活页」存自己的关节姿势；其他纸不存，
   它们用【往前找最近一张有姿势的纸】的结果。

   为什么用继承而不是复制：
   复制的话，改了第 3 张，第 4、5 张是拷贝品，以后想再改就得改三处，
   迟早对不上。继承的话第 4、5 张本来就在读第 3 张，
   改第 3 张 → 第 4、5 张自动跟着变 —— 这是算法天然的结果，不是同步逻辑。

   活页位置：每隔 2 张有 1 张（第 3、6、9 张）。
   改张数时重算，所以 10 变 11 或 9 都不会把节奏搞坏，不需要按 3 的倍数跳。
   ════════════════════════════════════════════════════════════════════ */

import type { Page, RigConfig, RigJoint } from "../types/document";

/** 每隔几张出一个活页。2 = 隔两张一张（第 3、6、9… 张） */
export const LOOSE_EVERY = 3;

/** 第 i 张（从 0 数）是不是活页。0,1 → 否；2 → 是；3,4 → 否；5 → 是… */
export function isLooseLeaf(i: number): boolean {
  return i >= 0 && i % LOOSE_EVERY === LOOSE_EVERY - 1;
}

/** 一叠纸里所有活页的下标 */
export function looseLeafIndices(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (isLooseLeaf(i)) out.push(i);
  return out;
}

/**
 * 第 i 张纸实际用的关节姿势。
 * 从它本身往前找，最近一张「自己存了姿势」的纸就是它的来源。
 * 找到的这张纸若就是它自己 → 它是活页；否则它是「保持」。
 */
export function resolveJoints(pages: Page[], i: number): RigJoint[] | null {
  if (i < 0 || i >= pages.length) return null;
  for (let k = i; k >= 0; k--) {
    const j = pages[k]?.rig?.joints;
    if (j && j.length) return j;
  }
  return null;
}

/** 第 i 张纸的姿势是从哪一张继承来的（-1 = 它前面没有任何人有姿势） */
export function inheritFrom(pages: Page[], i: number): number {
  for (let k = i; k >= 0; k--) {
    const j = pages[k]?.rig?.joints;
    if (j && j.length) return k;
  }
  return -1;
}

/** 这一张自己存了姿势吗（= 它是活页 / 起始页） */
export function hasOwnPose(p: Page | undefined): boolean {
  return !!(p?.rig?.joints && p.rig.joints.length);
}

/** 把姿势写到第 i 张纸上（把它变成活页）。
    后面那些「保持」的纸不用动 —— 它们本来就在读前面最近一个。 */
export function withJoints(pages: Page[], i: number, joints: RigJoint[]): Page[] {
  return pages.map((p, k) =>
    k === i ? { ...p, rig: { ...(p.rig || {}), joints }, updatedAt: Date.now() } : p,
  );
}

/** 清掉第 i 张纸自己的姿势，让它退回「保持上一张」 */
export function clearJoints(pages: Page[], i: number): Page[] {
  return pages.map((p, k) => {
    if (k !== i) return p;
    const next = { ...(p.rig || {}) } as RigConfig;
    delete next.joints;
    return { ...p, rig: next, updatedAt: Date.now() };
  });
}

/**
 * 造一摞纸：把 base 复制 count 份。
 * 第 1 张带上基础姿势（用户钉的那 6 个点），其余纸都不带 ——
 * 不带就是「保持上一张」，正好是活页继承模型想要的默认状态。
 */
export function makeStack(base: Page, count: number, baseJoints: RigJoint[]): Page[] {
  const out: Page[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      ...base,
      id: `${base.id}-f${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${base.title || "未命名"} · ${i + 1}`,
      /* 只有第 1 张存姿势，它就是整摞的根 */
      rig: i === 0
        ? { ...(base.rig || {}), joints: baseJoints.map((j) => ({ ...j })) }
        : (base.rig ? { radius: base.rig.radius } : undefined),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return out;
}

/** 一摞纸的「动作轨迹」概览：每张是活页 / 保持，来源是哪张 */
export function stackOutline(pages: Page[]): { index: number; loose: boolean; from: number }[] {
  return pages.map((_, i) => ({
    index: i,
    loose: hasOwnPose(pages[i]),
    from: inheritFrom(pages, i),
  }));
}

/**
 * A/B 判定用的尺子：这摞纸里【真正各不相同的姿势】有几个。
 * A 计划（隔 2 张 1 活页）只有 3 个；B 计划（全是活页）有 10 个。
 * 姿势数太少，放快了就是一跳一跳，形不成动态 —— 那就是该换 B 的信号。
 */
export function distinctPoseCount(pages: Page[]): number {
  let n = 0;
  for (let i = 0; i < pages.length; i++) if (hasOwnPose(pages[i])) n++;
  return n;
}
