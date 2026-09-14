// name=src/components/creation/Editor.tsx
import React, { useEffect, useRef, useState } from "react";
import type { Group, Page, TextNode } from "../../types/document";

type Props = {
  page: Page;
  allPages?: Page[];
  onUpdate: (patch: Partial<Page>) => void;
  onSelectPage?: (id: string) => void;
  onCopyPage?: () => void;
  onPastePage?: (x: number, y: number) => void;
  hasClipboard?: boolean;
  onRequestConnect?: () => void;
  onUpdatePageTransform?: (pageId: string, transform: { x: number; y: number; scale: number; rotate: number }) => void;
  onDeletePage?: () => void;
  paperColor: string;
  paperAlpha: number;
  stageColor: string;
  stageAlpha: number;
};

type Mode =
  | "idle"
  | "dragPaper"
  | "pinch"
  | "dragText"
  | "scaleText"
  | "boxSelect"
  | "dragBox"
  | "resizeBox";

type ResizeHandle = "nw" | "ne" | "se" | "sw";

type LongPressTarget =
  | { type: "text"; textId: string }
  | { type: "page" }
  | { type: "none" };

function normalizeAngleDiff(rad: number) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

type PaperState = { x: number; y: number; scale: number; rotate: number };
type BoxState = { x: number; y: number; w: number; h: number };

function screenToPaperLocal(sx: number, sy: number, stageEl: HTMLElement | null, p: PaperState) {
  const rect = stageEl?.getBoundingClientRect();
  if (!rect) return { x: sx, y: sy, inside: false };
  const W = rect.width;
  const H = rect.height;
  const paperCx = rect.left + rect.width / 2 + p.x;
  const paperCy = rect.top + rect.height / 2 + p.y;
  const dx = sx - paperCx;
  const dy = sy - paperCy;
  const rad = (-p.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = (dx * cos - dy * sin) / (p.scale || 1);
  const ry = (dx * sin + dy * cos) / (p.scale || 1);
  const lx = rx + W / 2;
  const ly = ry + H / 2;
  return { x: lx, y: ly, inside: lx >= 0 && lx <= W && ly >= 0 && ly <= H };
}

const HANDLE_HIT = 28;
const SELECT_BLUE = "rgba(59,130,246,.85)";
const SELECT_BLUE_BG = "rgba(59,130,246,.10)";
const LONG_PRESS_MS = 500;

export default function Editor({
  page,
  allPages,
  onUpdate,
  onSelectPage,
  onCopyPage,
  onPastePage,
  hasClipboard,
  onRequestConnect,
  onUpdatePageTransform,
  onDeletePage,
  paperColor,
  paperAlpha,
  stageColor,
  stageAlpha,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const editTaRef = useRef<HTMLTextAreaElement>(null);
  const editingIdRef = useRef<string | null>(null);
  const textsRef = useRef<TextNode[]>([]);
  const onUpdateRef = useRef(onUpdate);
  const pageRef = useRef(page);
  const allPagesRef = useRef<Page[]>([]);
  const onUpdatePageTransformRef = useRef(onUpdatePageTransform);

  const texts = page.texts || [];
  textsRef.current = texts;
  onUpdateRef.current = onUpdate;
  pageRef.current = page;
  allPagesRef.current = allPages || [];
  onUpdatePageTransformRef.current = onUpdatePageTransform;

  const [paper, setPaper] = useState<PaperState>(() => {
    const t = page.transform;
    return { x: t?.x ?? 0, y: t?.y ?? 0, scale: t?.scale ?? 1, rotate: t?.rotate ?? 0 };
  });
  const paperStateRef = useRef(paper);
  useEffect(() => { paperStateRef.current = paper; }, [paper]);

  useEffect(() => {
    const t = page.transform;
    setPaper({
      x: t?.x ?? 0,
      y: t?.y ?? 0,
      scale: t?.scale ?? 1,
      rotate: t?.rotate ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [connectButton, setConnectButton] = useState<{
    x: number; y: number; localX: number; localY: number;
    target: LongPressTarget;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [box, setBox] = useState<BoxState | null>(null);
  const boxRef = useRef<BoxState | null>(null);
  const [boxGroupId, setBoxGroupId] = useState<string | null>(null);
  const boxGroupIdRef = useRef<string | null>(null);
  useEffect(() => { boxRef.current = box; }, [box]);
  useEffect(() => { boxGroupIdRef.current = boxGroupId; }, [boxGroupId]);

  const gRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    mode: "idle" as Mode,
    startPoint: { x: 0, y: 0 },
    initial: {
      x: 0, y: 0, scale: 1, rotate: 0,
      dist: 0, angle: 0, midX: 0, midY: 0,
      textX: 0, textY: 0,
      fontSize: 16,
    },
    longPressTimer: 0 as any,
    moved: false,
    longPressed: false,
    dragTextId: null as string | null,
    pendingBox: false as boolean,
    boxSourceLayer: null as "background" | "paper" | null,
    boxIncludePaper: false as boolean,
    boxOriginalPaper: { x: 0, y: 0, scale: 1 },
    boxStartPoint: { x: 0, y: 0 },
    boxResizeHandle: "se" as ResizeHandle,
    boxOriginal: { x: 0, y: 0, w: 0, h: 0 },
    boxOriginalMembers: [] as { id: string; x: number; y: number; fontSize: number }[],
    boxOriginalOtherPages: [] as { id: string; x: number; y: number; scale: number }[],
    boxMoveStart: { x: 0, y: 0 },
    boxMoveOriginal: { x: 0, y: 0, w: 0, h: 0 },
    pendingSwitchPageId: null as string | null,
    pendingClearBoxOnUp: false as boolean,
    justCommittedEdit: false as boolean,
  });

  useEffect(() => {
    function resetGesture() {
      const g = gRef.current;
      g.pointers.clear();
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.pendingSwitchPageId = null;
      g.pendingClearBoxOnUp = false;
      g.justCommittedEdit = false;
      clearTimeout(g.longPressTimer);
    }
    window.addEventListener("resize", resetGesture);
    window.addEventListener("orientationchange", resetGesture);
    return () => {
      window.removeEventListener("resize", resetGesture);
      window.removeEventListener("orientationchange", resetGesture);
    };
  }, []);

  useEffect(() => {
    const t = page.transform;
    const same = !!t && t.x === paper.x && t.y === paper.y && t.scale === paper.scale && t.rotate === paper.rotate;
    if (!same) onUpdateRef.current({ transform: { ...paper } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  // ============== 浮动 textarea ==============
  function hideFloatingEditor() {
    const ta = editTaRef.current;
    if (!ta) return;
    try { ta.blur(); } catch { /* ignore */ }
    ta.style.left = "0px"; ta.style.top = "0px";
    ta.style.width = "0px"; ta.style.height = "0px";
    ta.style.opacity = "0"; ta.style.pointerEvents = "none";
    ta.value = "";
  }
  function showFloatingEditor(
    screenX: number, screenY: number,
    width: number, height: number,
    fontSize: number, color: string, initialValue: string
  ) {
    const ta = editTaRef.current;
    const stage = stageRef.current;
    if (!ta || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    ta.style.left = `${screenX - stageRect.left}px`;
    ta.style.top = `${screenY - stageRect.top}px`;
    ta.style.width = `${width}px`;
    ta.style.height = `${height}px`;
    ta.style.fontSize = `${fontSize}px`;
    ta.style.color = color;
    ta.style.opacity = "1";
    ta.style.pointerEvents = "auto";
    ta.value = initialValue;
    try { ta.setSelectionRange(initialValue.length, initialValue.length); } catch { /* ignore */ }
  }
  function focusFloatingEditor() {
    const ta = editTaRef.current;
    if (!ta) return;
    try { ta.focus({ preventScroll: true }); }
    catch { try { ta.focus(); } catch { /* ignore */ } }
  }
  function commitFloatingEditor() {
    const id = editingIdRef.current;
    if (!id) return;
    const ta = editTaRef.current;
    if (!ta) return;
    const v = ta.value;
    const list = textsRef.current;
    const t = list.find((x) => x.id === id);
    if (!t) {
      setEditingId(null); editingIdRef.current = null;
      hideFloatingEditor(); return;
    }
    const nowEmpty = !v.trim();
    if (nowEmpty) {
      const next = list.filter((x) => x.id !== id);
      textsRef.current = next;
      onUpdateRef.current({ texts: next });
    } else if (v !== (t.text || "")) {
      const next = list.map((x) => (x.id === id ? { ...x, text: v } : x));
      textsRef.current = next;
      onUpdateRef.current({ texts: next });
    }
    setEditingId(null); editingIdRef.current = null;
    hideFloatingEditor();
  }

  useEffect(() => {
    const ta = editTaRef.current;
    if (!ta) return;
    function handleInput() {
      const el = editTaRef.current; if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    function handleBlur() { commitFloatingEditor(); }
    function handleKeyDown(ev: KeyboardEvent) {
      if (ev.isComposing || (ev as any).keyCode === 229) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        commitFloatingEditor();
        editTaRef.current?.blur();
      }
    }
    ta.addEventListener("input", handleInput);
    ta.addEventListener("blur", handleBlur);
    ta.addEventListener("keydown", handleKeyDown);
    hideFloatingEditor();
    return () => {
      ta.removeEventListener("input", handleInput);
      ta.removeEventListener("blur", handleBlur);
      ta.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============== 编辑 / 建字 ==============
  function enterEditing(t: TextNode) {
    const el = stageRef.current?.querySelector(`[data-text-id="${t.id}"]`) as HTMLElement | null;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const stageRect = stageRef.current?.getBoundingClientRect();
    const fontSize = t.fontSize;
    const width = Math.max(rect.width + 8, 120);
    const height = Math.max(rect.height, fontSize * 1.6);
    const wideWidth = stageRect ? Math.min(stageRect.width - 20, Math.max(width, 400)) : width;
    showFloatingEditor(rect.left, rect.top, wideWidth, height, fontSize, t.color, t.text || "");
    focusFloatingEditor();
    setEditingId(t.id); editingIdRef.current = t.id;
  }
  function createTextAndEdit(screenX: number, screenY: number, layer: "background" | "paper") {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let localX: number, localY: number;
    if (layer === "paper") {
      const local = screenToPaperLocal(screenX, screenY, stageRef.current, paperStateRef.current);
      localX = local.x; localY = local.y;
    } else {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) return;
      localX = screenX - stageRect.left;
      localY = screenY - stageRect.top;
    }
    const fontSize = 16;
    const node: TextNode = {
      id, text: "", x: localX, y: localY, fontSize, color: "#3a352e", layer,
    };
    const next = [...textsRef.current, node];
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
    const stageRect = stageRef.current?.getBoundingClientRect();
    const width = stageRect ? Math.min(stageRect.width - 20, 400) : 400;
    const height = fontSize * 1.6;
    showFloatingEditor(screenX, screenY, width, height, fontSize, "#3a352e", "");
    focusFloatingEditor();
    setEditingId(id); editingIdRef.current = id;
  }
  function updateText(id: string, patch: Partial<TextNode>) {
    const next = textsRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t));
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
  }

  // ============== 命中 ==============
  function getTwoFingerSnapshot() {
    const g = gRef.current;
    const pts = Array.from(g.pointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return {
      dist: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
  }
  function hitText(sx: number, sy: number): TextNode | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const els = stage.querySelectorAll<HTMLElement>("[data-text-id]");
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      if (sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) {
        const id = el.dataset.textId;
        if (id) {
          const t = textsRef.current.find((x) => x.id === id);
          if (t && (t.text || "").trim().length > 0) return t;
        }
      }
    }
    return null;
  }
  function isInPaper(sx: number, sy: number): boolean {
    return screenToPaperLocal(sx, sy, stageRef.current, paperStateRef.current).inside;
  }
  function hitOtherPage(sx: number, sy: number): Page | null {
    if (!allPages || allPages.length <= 1) return null;
    const stageEl = stageRef.current;
    if (!stageEl) return null;
    for (const p of allPages) {
      if (p.id === page.id) continue;
      const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
      const r = screenToPaperLocal(sx, sy, stageEl, tr);
      if (r.inside) return p;
    }
    return null;
  }
  function boxContainsPaper(b: BoxState): boolean {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return false;
    const p = paperStateRef.current;
    const cx = sr.width / 2 + p.x;
    const cy = sr.height / 2 + p.y;
    const halfW = (sr.width * p.scale) / 2;
    const halfH = (sr.height * p.scale) / 2;
    const paperLeft = cx - halfW;
    const paperTop = cy - halfH;
    const paperRight = cx + halfW;
    const paperBottom = cy + halfH;
    const boxLeft = b.x;
    const boxTop = b.y;
    const boxRight = b.x + b.w;
    const boxBottom = b.y + b.h;
    const noOverlap =
      paperRight < boxLeft ||
      paperLeft > boxRight ||
      paperBottom < boxTop ||
      paperTop > boxBottom;
    return !noOverlap;
  }
  function computeOtherPagesInBox(b: BoxState): string[] {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return [];
    const ids: string[] = [];
    for (const p of allPagesRef.current) {
      if (p.id === page.id) continue;
      if (p.paperHidden === true) continue;
      const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
      const cx = sr.width / 2 + tr.x;
      const cy = sr.height / 2 + tr.y;
      const halfW = (sr.width * tr.scale) / 2;
      const halfH = (sr.height * tr.scale) / 2;
      const left = cx - halfW;
      const top = cy - halfH;
      const right = cx + halfW;
      const bottom = cy + halfH;
      const noOverlap =
        right < b.x ||
        left > b.x + b.w ||
        bottom < b.y ||
        top > b.y + b.h;
      if (!noOverlap) ids.push(p.id);
    }
    return ids;
  }

  // ============== 框选 / 组合 辅助 ==============
  function getStageLocal(sx: number, sy: number): { x: number; y: number } | null {
    const sr = stageRef.current?.getBoundingClientRect();
    if (!sr) return null;
    return { x: sx - sr.left, y: sy - sr.top };
  }
  function hitBoxHandle(sx: number, sy: number): ResizeHandle | null {
    const b = boxRef.current;
    if (!b) return null;
    const local = getStageLocal(sx, sy);
    if (!local) return null;
    const pts: { h: ResizeHandle; x: number; y: number }[] = [
      { h: "nw", x: b.x, y: b.y },
      { h: "ne", x: b.x + b.w, y: b.y },
      { h: "se", x: b.x + b.w, y: b.y + b.h },
      { h: "sw", x: b.x, y: b.y + b.h },
    ];
    for (const p of pts) {
      if (Math.abs(local.x - p.x) <= HANDLE_HIT && Math.abs(local.y - p.y) <= HANDLE_HIT) {
        return p.h;
      }
    }
    return null;
  }
  function isInsideBox(sx: number, sy: number): boolean {
    const b = boxRef.current;
    if (!b) return false;
    const local = getStageLocal(sx, sy);
    if (!local) return false;
    return local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h;
  }
  function computeMembersInBox(b: BoxState, restrictTo?: "paper" | "background"): string[] {
    const stage = stageRef.current;
    if (!stage) return [];
    const sr = stage.getBoundingClientRect();
    const bx1 = sr.left + b.x;
    const by1 = sr.top + b.y;
    const bx2 = bx1 + b.w;
    const by2 = by1 + b.h;
    const ids: string[] = [];
    const els = stage.querySelectorAll<HTMLElement>("[data-text-id]");
    els.forEach((el) => {
      const id = el.dataset.textId;
      if (!id) return;
      const t = textsRef.current.find((x) => x.id === id);
      if (!t || !(t.text || "").trim()) return;
      if (restrictTo && t.layer !== restrictTo) return;
      const r = el.getBoundingClientRect();
      const intersects = !(r.right < bx1 || r.left > bx2 || r.bottom < by1 || r.top > by2);
      if (intersects) ids.push(id);
    });
    return ids;
  }
  function currentGroupMemberIds(): string[] {
    const gid = boxGroupIdRef.current;
    if (!gid) return [];
    const grp = (pageRef.current.groups || []).find((gg) => gg.id === gid);
    return grp ? grp.memberIds : [];
  }
  function currentGroupPageIds(): string[] {
    const gid = boxGroupIdRef.current;
    if (!gid) return [];
    const grp = (pageRef.current.groups || []).find((gg) => gg.id === gid);
    return grp?.pageIds || [];
  }

  function commitBoxAsGroup() {
    const b = boxRef.current;
    if (!b) return;
    if (b.w < 4 || b.h < 4) {
      clearBox();
      return;
    }
    const g = gRef.current;
    const restrictTo = g.boxSourceLayer === "paper" ? "paper" : "background";
    const memberIds = computeMembersInBox(b, restrictTo);
    const pageIds = computeOtherPagesInBox(b);
    const includePaper = boxContainsPaper(b);
    const pg = pageRef.current;
    const groups = pg.groups || [];
    const gid = boxGroupIdRef.current;

    if (memberIds.length === 0 && pageIds.length === 0) {
      if (includePaper) return;
      clearBox();
      if (gid) {
        const nextGroups = groups.filter((gg) => gg.id !== gid);
        onUpdateRef.current({ groups: nextGroups });
      }
      return;
    }

    const now = Date.now();
    let nextGroups: Group[];
    if (gid) {
      nextGroups = groups.map((gg) => (gg.id === gid ? { ...gg, memberIds, pageIds } : gg));
    } else {
      const newId = `g-${now}-${Math.random().toString(36).slice(2, 6)}`;
      nextGroups = [...groups, { id: newId, memberIds, pageIds, createdAt: now }];
      setBoxGroupId(newId); boxGroupIdRef.current = newId;
    }
    onUpdateRef.current({ groups: nextGroups });
  }
  function clearBox() {
    setBox(null); boxRef.current = null;
    setBoxGroupId(null); boxGroupIdRef.current = null;
  }
  function deleteSelection() {
    const ids = currentGroupMemberIds();
    if (ids.length > 0) {
      const next = textsRef.current.filter((t) => !ids.includes(t.id));
      textsRef.current = next;
      onUpdateRef.current({ texts: next });
    }
    const gid = boxGroupIdRef.current;
    if (gid) {
      const groups = (pageRef.current.groups || []).filter((gg) => gg.id !== gid);
      onUpdateRef.current({ groups });
    }
    clearBox();
  }
  function deleteOneText(id: string) {
    const next = textsRef.current.filter((t) => t.id !== id);
    textsRef.current = next;
    onUpdateRef.current({ texts: next });
  }

  function startLongPress(screenX: number, screenY: number, onTimeout?: () => void) {
    const g = gRef.current;
    clearTimeout(g.longPressTimer);
    g.longPressTimer = window.setTimeout(() => {
      if (g.mode === "idle" && g.pointers.size === 1 && !g.moved) {
        g.longPressed = true;
        if (onTimeout) onTimeout();
        const ll = getStageLocal(screenX, screenY);
        if (!ll) return;
        let target: LongPressTarget = { type: "none" };
        const hit = hitText(screenX, screenY);
        if (hit) {
          target = { type: "text", textId: hit.id };
        } else if (isInPaper(screenX, screenY)) {
          target = { type: "page" };
        }
        setConnectButton({
          x: screenX, y: screenY,
          localX: ll.x, localY: ll.y,
          target,
        });
      }
    }, LONG_PRESS_MS);
  }

  function snapshotOriginalOtherPages(): { id: string; x: number; y: number; scale: number }[] {
    const ids = currentGroupPageIds();
    const out: { id: string; x: number; y: number; scale: number }[] = [];
    for (const p of allPagesRef.current) {
      if (ids.includes(p.id)) {
        const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        out.push({ id: p.id, x: tr.x, y: tr.y, scale: tr.scale });
      }
    }
    return out;
  }

  // ============== pointer ==============
  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target === editTaRef.current || target.tagName === "TEXTAREA") return;

    const g = gRef.current;

    if (editingIdRef.current) {
      commitFloatingEditor();
      g.pointers.delete(e.pointerId);
      g.justCommittedEdit = true;
      return;
    }

    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}

    // 无框时：点在次纸上 → 标记切换主
    if (g.pointers.size === 1 && !boxRef.current) {
      const inMain = isInPaper(e.clientX, e.clientY);
      const hitMainText = hitText(e.clientX, e.clientY);
      if (!inMain && !hitMainText) {
        const other = hitOtherPage(e.clientX, e.clientY);
        if (other) {
          g.startPoint = { x: e.clientX, y: e.clientY };
          g.moved = false;
          g.pendingSwitchPageId = other.id;
          g.pendingBox = false;
          return;
        }
      }
    }

    if (g.pointers.size === 1) {
      const cur = paperStateRef.current;
      g.startPoint = { x: e.clientX, y: e.clientY };
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.pendingClearBoxOnUp = false;
      g.boxIncludePaper = false;
      g.initial = {
        ...g.initial,
        x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
        dist: 0, angle: 0, midX: 0, midY: 0,
        textX: 0, textY: 0,
      };

      if (boxRef.current) {
        const h = hitBoxHandle(e.clientX, e.clientY);
        if (h) {
          g.mode = "resizeBox";
          g.boxResizeHandle = h;
          g.boxOriginal = { ...boxRef.current };
          g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
          g.boxIncludePaper = boxContainsPaper(boxRef.current);
          g.boxOriginalMembers = textsRef.current
            .filter((t) => currentGroupMemberIds().includes(t.id))
            .map((t) => ({ id: t.id, x: t.x, y: t.y, fontSize: t.fontSize }));
          g.boxOriginalOtherPages = snapshotOriginalOtherPages();
          return;
        }
        const hit = hitText(e.clientX, e.clientY);
        if (hit) {
          g.dragTextId = hit.id;
          g.initial.textX = hit.x;
          g.initial.textY = hit.y;
          g.initial.fontSize = hit.fontSize;
          startLongPress(e.clientX, e.clientY);
          return;
        }
        if (isInsideBox(e.clientX, e.clientY)) {
          g.mode = "dragBox";
          const local = getStageLocal(e.clientX, e.clientY);
          g.boxMoveStart = local || { x: 0, y: 0 };
          g.boxMoveOriginal = { ...boxRef.current };
          g.boxIncludePaper = boxContainsPaper(boxRef.current);
          g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
          g.boxOriginalMembers = textsRef.current
            .filter((t) => currentGroupMemberIds().includes(t.id))
            .map((t) => ({ id: t.id, x: t.x, y: t.y, fontSize: t.fontSize }));
          g.boxOriginalOtherPages = snapshotOriginalOtherPages();
          return;
        }
        g.pendingClearBoxOnUp = true;
        startLongPress(e.clientX, e.clientY, () => {
          g.pendingClearBoxOnUp = false;
          clearBox();
        });
        return;
      }

      const hit = hitText(e.clientX, e.clientY);
      if (hit) {
        g.dragTextId = hit.id;
        g.initial.textX = hit.x;
        g.initial.textY = hit.y;
        g.initial.fontSize = hit.fontSize;
        startLongPress(e.clientX, e.clientY);
        return;
      }

      // 空白
      const inPaper = isInPaper(e.clientX, e.clientY);
      if (inPaper) {
        g.pendingBox = false;
        g.boxSourceLayer = "paper";
        g.boxIncludePaper = false;
      } else {
        g.pendingBox = true;
        g.boxSourceLayer = "background";
        g.boxIncludePaper = false;
        g.boxOriginalPaper = { x: cur.x, y: cur.y, scale: cur.scale };
        const local = getStageLocal(e.clientX, e.clientY);
        if (local) g.boxStartPoint = local;
      }
      startLongPress(e.clientX, e.clientY, () => { g.pendingBox = false; });
    } else if (g.pointers.size === 2) {
      clearTimeout(g.longPressTimer);
      g.moved = true;
      g.longPressed = false;
      g.pendingBox = false;
      g.pendingSwitchPageId = null;
      const cur = paperStateRef.current;
      const snap = getTwoFingerSnapshot();

      if (g.dragTextId) {
        const t = textsRef.current.find((x) => x.id === g.dragTextId);
        if (t) {
          g.mode = "scaleText";
          g.initial = { ...g.initial, dist: snap.dist, fontSize: t.fontSize };
          return;
        }
      }
      g.dragTextId = null;
      g.initial = {
        ...g.initial,
        x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
        dist: snap.dist, angle: snap.angle, midX: snap.midX, midY: snap.midY,
      };
      g.mode = "pinch";
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gRef.current;
    if (g.justCommittedEdit) return;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.pendingSwitchPageId) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      if (Math.hypot(dx, dy) > 10) {
        g.pendingSwitchPageId = null;
        g.moved = true;
        g.mode = "boxSelect";
        const b0 = { x: g.boxStartPoint.x, y: g.boxStartPoint.y, w: 0, h: 0 };
        boxRef.current = b0;
        setBox(b0);
        setBoxGroupId(null); boxGroupIdRef.current = null;
        g.pendingBox = false;
      }
      return;
    }

    if (g.mode === "idle" && g.pointers.size === 1) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(g.longPressTimer);
        g.moved = true;
        g.pendingClearBoxOnUp = false;
        if (g.pendingBox) {
          g.mode = "boxSelect";
          const b0 = { x: g.boxStartPoint.x, y: g.boxStartPoint.y, w: 0, h: 0 };
          boxRef.current = b0;
          setBox(b0);
          setBoxGroupId(null); boxGroupIdRef.current = null;
          g.pendingBox = false;
        } else {
          g.mode = g.dragTextId ? "dragText" : "dragPaper";
          if (g.dragTextId) {
            const t = textsRef.current.find((x) => x.id === g.dragTextId);
            if (t) { setDraggingTextId(t.id); }
          }
        }
      }
    }

    if (g.mode === "dragPaper" && g.pointers.size === 1) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      setPaper((p) => ({ ...p, x: g.initial.x + dx, y: g.initial.y + dy }));
    }
    if (g.mode === "dragText" && g.pointers.size === 1 && g.dragTextId) {
      const dx = e.clientX - g.startPoint.x;
      const dy = e.clientY - g.startPoint.y;
      const t = textsRef.current.find((x) => x.id === g.dragTextId);
      if (!t) return;
      if (t.layer === "background") {
        updateText(t.id, { x: g.initial.textX + dx, y: g.initial.textY + dy });
      } else {
        const p = paperStateRef.current;
        const rad = (-p.rotate * Math.PI) / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        const rx = (dx * cos - dy * sin) / (p.scale || 1);
        const ry = (dx * sin + dy * cos) / (p.scale || 1);
        updateText(t.id, { x: g.initial.textX + rx, y: g.initial.textY + ry });
      }
    }
    if (g.mode === "pinch" && g.pointers.size === 2) {
      const snap = getTwoFingerSnapshot();
      const scale = Math.max(0.02, Math.min(30, g.initial.scale * (snap.dist / (g.initial.dist || 1))));
      const daRad = normalizeAngleDiff(snap.angle - g.initial.angle);
      const rotate = g.initial.rotate + (daRad * 180) / Math.PI;
      const x = g.initial.x + (snap.midX - g.initial.midX);
      const y = g.initial.y + (snap.midY - g.initial.midY);
      setPaper({ x, y, scale, rotate });
    }
    if (g.mode === "scaleText" && g.pointers.size === 2 && g.dragTextId) {
      const snap = getTwoFingerSnapshot();
      const ratio = snap.dist / (g.initial.dist || 1);
      const next = Math.max(8, Math.min(200, g.initial.fontSize * ratio));
      updateText(g.dragTextId, { fontSize: next });
    }

    if (g.mode === "boxSelect") {
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local) return;
      const x1 = Math.min(g.boxStartPoint.x, local.x);
      const y1 = Math.min(g.boxStartPoint.y, local.y);
      const w = Math.abs(local.x - g.boxStartPoint.x);
      const h = Math.abs(local.y - g.boxStartPoint.y);
      const b = { x: x1, y: y1, w, h };
      boxRef.current = b;
      setBox(b);
    }

    if (g.mode === "dragBox") {
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local || !boxRef.current) return;
      const dxStage = local.x - g.boxMoveStart.x;
      const dyStage = local.y - g.boxMoveStart.y;

      if (g.boxIncludePaper) {
        const nextTexts = textsRef.current.map((t) => {
          const om = g.boxOriginalMembers.find((m) => m.id === t.id);
          if (!om) return t;
          if (t.layer === "background") {
            return { ...t, x: om.x + dxStage, y: om.y + dyStage };
          }
          return t;
        });
        textsRef.current = nextTexts;
        onUpdateRef.current({ texts: nextTexts });

        setPaper((prev) => ({
          ...prev,
          x: g.boxOriginalPaper.x + dxStage,
          y: g.boxOriginalPaper.y + dyStage,
        }));
      } else {
        const p = paperStateRef.current;
        const rad = (-p.rotate * Math.PI) / 180;
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        const nextTexts = textsRef.current.map((t) => {
          const om = g.boxOriginalMembers.find((m) => m.id === t.id);
          if (!om) return t;
          if (t.layer === "background") {
            return { ...t, x: om.x + dxStage, y: om.y + dyStage };
          }
          const rx = (dxStage * cos - dyStage * sin) / (p.scale || 1);
          const ry = (dxStage * sin + dyStage * cos) / (p.scale || 1);
          return { ...t, x: om.x + rx, y: om.y + ry };
        });
        textsRef.current = nextTexts;
        onUpdateRef.current({ texts: nextTexts });
      }

      if (g.boxOriginalOtherPages.length > 0 && onUpdatePageTransformRef.current) {
        for (const op of g.boxOriginalOtherPages) {
          onUpdatePageTransformRef.current(op.id, {
            x: op.x + dxStage,
            y: op.y + dyStage,
            scale: op.scale,
            rotate: 0,
          });
        }
      }

      const b = {
        x: g.boxMoveOriginal.x + dxStage,
        y: g.boxMoveOriginal.y + dyStage,
        w: g.boxMoveOriginal.w,
        h: g.boxMoveOriginal.h,
      };
      boxRef.current = b;
      setBox(b);
    }

    if (g.mode === "resizeBox") {
      const local = getStageLocal(e.clientX, e.clientY);
      if (!local) return;
      const o = g.boxOriginal;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      switch (g.boxResizeHandle) {
        case "nw": x1 = local.x; y1 = local.y; break;
        case "ne": x2 = local.x; y1 = local.y; break;
        case "se": x2 = local.x; y2 = local.y; break;
        case "sw": x1 = local.x; y2 = local.y; break;
      }
      const nx = Math.min(x1, x2);
      const ny = Math.min(y1, y2);
      const nw = Math.abs(x2 - x1);
      const nh = Math.abs(y2 - y1);
      const b = { x: nx, y: ny, w: nw, h: nh };
      boxRef.current = b;
      setBox(b);

      if (o.w > 1 && o.h > 1) {
        const ratioX = nw / o.w;
        const ratioY = nh / o.h;
        const ratio = Math.max(0.05, Math.min(ratioX, ratioY));
        const ocx = o.x + o.w / 2;
        const ocy = o.y + o.h / 2;
        const ncx = nx + nw / 2;
        const ncy = ny + nh / 2;
        const sr = stageRef.current?.getBoundingClientRect();
        if (!sr) return;
        const p = paperStateRef.current;

        const nextTexts = textsRef.current.map((t) => {
          const om = g.boxOriginalMembers.find((m) => m.id === t.id);
          if (!om) return t;

          if (g.boxIncludePaper && t.layer === "paper") {
            return t;
          }

          let localX = 0, localY = 0;
          if (t.layer === "background") {
            localX = om.x; localY = om.y;
          } else {
            const px = om.x - sr.width / 2;
            const py = om.y - sr.height / 2;
            const rad = (p.rotate * Math.PI) / 180;
            const cos = Math.cos(rad); const sin = Math.sin(rad);
            localX = (px * cos - py * sin) * p.scale + sr.width / 2 + p.x;
            localY = (px * sin + py * cos) * p.scale + sr.height / 2 + p.y;
          }
          const nlx = ncx + (localX - ocx) * ratio;
          const nly = ncy + (localY - ocy) * ratio;
          const nextFontSize = Math.max(4, om.fontSize * ratio);
          if (t.layer === "background") {
            return { ...t, x: nlx, y: nly, fontSize: nextFontSize };
          } else {
            const rx0 = nlx - sr.width / 2 - p.x;
            const ry0 = nly - sr.height / 2 - p.y;
            const rad2 = (-p.rotate * Math.PI) / 180;
            const cos2 = Math.cos(rad2); const sin2 = Math.sin(rad2);
            const plx = (rx0 * cos2 - ry0 * sin2) / (p.scale || 1) + sr.width / 2;
            const ply = (rx0 * sin2 + ry0 * cos2) / (p.scale || 1) + sr.height / 2;
            return { ...t, x: plx, y: ply, fontSize: nextFontSize };
          }
        });
        textsRef.current = nextTexts;
        onUpdateRef.current({ texts: nextTexts });

        if (g.boxIncludePaper) {
          const stageW = sr.width;
          const stageH = sr.height;
          const opx = stageW / 2 + g.boxOriginalPaper.x;
          const opy = stageH / 2 + g.boxOriginalPaper.y;
          const npx = ncx + (opx - ocx) * ratio;
          const npy = ncy + (opy - ocy) * ratio;
          const newPaperX = npx - stageW / 2;
          const newPaperY = npy - stageH / 2;
          const newPaperScale = g.boxOriginalPaper.scale * ratio;
          setPaper((prev) => ({ ...prev, x: newPaperX, y: newPaperY, scale: newPaperScale }));
        }

        if (g.boxOriginalOtherPages.length > 0 && onUpdatePageTransformRef.current) {
          const stageW = sr.width;
          const stageH = sr.height;
          for (const op of g.boxOriginalOtherPages) {
            const ocxStage = stageW / 2 + op.x;
            const ocyStage = stageH / 2 + op.y;
            const npx = ncx + (ocxStage - ocx) * ratio;
            const npy = ncy + (ocyStage - ocy) * ratio;
            const newX = npx - stageW / 2;
            const newY = npy - stageH / 2;
            const newScale = op.scale * ratio;
            onUpdatePageTransformRef.current(op.id, {
              x: newX,
              y: newY,
              scale: newScale,
              rotate: 0,
            });
          }
        }
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gRef.current;
    if (g.justCommittedEdit) {
      g.justCommittedEdit = false;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      g.pointers.delete(e.pointerId);
      return;
    }
    const wasMode = g.mode;
    const wasMoved = g.moved;
    const wasLongPressed = g.longPressed;
    const dragTextId = g.dragTextId;
    const boxSourceLayer = g.boxSourceLayer;
    const pendingSwitch = g.pendingSwitchPageId;
    const pendingClearBoxOnUp = g.pendingClearBoxOnUp;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    g.pointers.delete(e.pointerId);
    clearTimeout(g.longPressTimer);

    if (pendingSwitch && !wasMoved) {
      g.pendingSwitchPageId = null;
      g.mode = "idle"; g.moved = false; g.longPressed = false;
      g.pendingClearBoxOnUp = false;
      onSelectPage?.(pendingSwitch);
      return;
    }
    g.pendingSwitchPageId = null;

    if (pendingClearBoxOnUp && wasMode === "idle" && !wasMoved && !wasLongPressed) {
      clearBox();
    }
    g.pendingClearBoxOnUp = false;

    if (wasMode === "boxSelect") {
      const b = boxRef.current;
      if (!b || b.w < 4 || b.h < 4) {
        clearBox();
        const layer = boxSourceLayer === "paper" ? "paper" : "background";
        createTextAndEdit(e.clientX, e.clientY, layer);
      } else {
        commitBoxAsGroup();
      }
      g.mode = "idle"; g.moved = false; g.dragTextId = null;
      g.pendingBox = false; g.boxIncludePaper = false;
      g.boxOriginalOtherPages = [];
      return;
    }
    if (wasMode === "dragBox" || wasMode === "resizeBox") {
      commitBoxAsGroup();
      g.mode = "idle"; g.moved = false; g.dragTextId = null;
      g.pendingBox = false; g.boxIncludePaper = false;
      g.boxOriginalOtherPages = [];
      return;
    }

    if (wasMode === "idle" && !wasMoved && !wasLongPressed) {
      const hit = hitText(e.clientX, e.clientY);
      if (hit) {
        // 单击元素：不做事（编辑走长按菜单）
      } else {
        if (isInPaper(e.clientX, e.clientY)) {
          createTextAndEdit(e.clientX, e.clientY, "paper");
        } else {
          createTextAndEdit(e.clientX, e.clientY, "background");
        }
      }
    }
    g.pendingBox = false;
    g.boxIncludePaper = false;
    g.boxOriginalOtherPages = [];

    if ((wasMode === "dragText" || wasMode === "scaleText") && dragTextId && wasMoved) {
      const t = textsRef.current.find((x) => x.id === dragTextId);
      if (t) {
        if (wasMode === "dragText") {
          const inPaper = isInPaper(e.clientX, e.clientY);
          const stageRect = stageRef.current?.getBoundingClientRect();
          if (t.layer === "background" && inPaper) {
            const local = screenToPaperLocal(e.clientX, e.clientY, stageRef.current, paperStateRef.current);
            updateText(t.id, { layer: "paper", x: local.x, y: local.y });
          } else if (t.layer === "paper" && !inPaper && stageRect) {
            updateText(t.id, {
              layer: "background",
              x: e.clientX - stageRect.left,
              y: e.clientY - stageRect.top,
            });
          }
        }
      }
      setDraggingTextId(null);
    }

    if (g.pointers.size === 0) {
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
    } else if (g.pointers.size === 1) {
      const rem = Array.from(g.pointers.entries())[0];
      const cur = paperStateRef.current;
      g.startPoint = { x: rem[1].x, y: rem[1].y };
      g.initial = {
        ...g.initial,
        x: cur.x, y: cur.y, scale: cur.scale, rotate: cur.rotate,
        dist: 0, angle: 0, midX: 0, midY: 0,
      };
      g.mode = "idle";
      g.moved = false;
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    const g = gRef.current;
    g.pointers.delete(e.pointerId);
    clearTimeout(g.longPressTimer);
    if (g.pointers.size === 0) {
      g.mode = "idle";
      g.moved = false;
      g.longPressed = false;
      g.dragTextId = null;
      g.pendingBox = false;
      g.boxIncludePaper = false;
      g.pendingSwitchPageId = null;
      g.pendingClearBoxOnUp = false;
      g.justCommittedEdit = false;
      g.boxOriginalOtherPages = [];
      setDraggingTextId(null);
    }
  }

  const mainT = page.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
  const otherPages = (allPages || []).filter((p) => {
    if (p.id === page.id) return false;
    const t = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
    if (
      t.x === mainT.x && t.y === mainT.y &&
      t.scale === mainT.scale && t.rotate === mainT.rotate
    ) return false;
    return true;
  });

  const selectedTextIds = new Set<string>();
  const selectedPageIds = new Set<string>();
  {
    const b = boxRef.current;
    if (b && b.w >= 4 && b.h >= 4) {
      const restrictTo = gRef.current.boxSourceLayer === "paper" ? "paper" : "background";
      computeMembersInBox(b, restrictTo).forEach((id) => selectedTextIds.add(id));
      computeOtherPagesInBox(b).forEach((id) => selectedPageIds.add(id));
    }
    currentGroupMemberIds().forEach((id) => selectedTextIds.add(id));
    currentGroupPageIds().forEach((id) => selectedPageIds.add(id));
  }
  const mainPaperSelected = boxContainsPaper(boxRef.current || { x: 0, y: 0, w: 0, h: 0 });

  const hasSelection = !!boxGroupId || (box != null && box.w >= 4 && box.h >= 4);

  return (
    <div
      ref={stageRef}
      data-stage
      style={{
        flex: 1, minHeight: 0, position: "relative", overflow: "hidden",
        background: toRgba(stageColor, stageAlpha),
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {otherPages.map((p) => {
        const tr = p.transform || { x: 0, y: 0, scale: 1, rotate: 0 };
        const pTexts = (p.texts || []).filter((t) => t.layer === "paper");
        const isSelected = selectedPageIds.has(p.id);
        return (
          <div key={p.id} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute", inset: 0,
                transform: `translate(${tr.x}px, ${tr.y}px) scale(${tr.scale}) rotate(${tr.rotate}deg)`,
                transformOrigin: "center center",
                background: toRgba(paperColor, paperAlpha),
                boxShadow: isSelected
                  ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
                  : "0 4px 24px rgba(0,0,0,.1)",
                opacity: isSelected ? 0.75 : 0.55,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              {pTexts.map((t) => (
                <div
                  key={t.id}
                  style={{
                    position: "absolute",
                    left: t.x, top: t.y,
                    fontSize: t.fontSize,
                    color: t.color,
                    lineHeight: 1.4,
                    whiteSpace: "pre",
                    width: "max-content",
                    pointerEvents: "none",
                    background: selectedTextIds.has(t.id) ? SELECT_BLUE_BG : "transparent",
                    outline: selectedTextIds.has(t.id) ? `1px solid ${SELECT_BLUE}` : "none",
                  }}
                >{t.text}</div>
              ))}
            </div>
          </div>
        );
      })}

      {texts.filter((t) => t.layer === "background").map((t) => (
        <TextElement
          key={t.id}
          t={t}
          isEditing={editingId === t.id}
          isDragging={draggingTextId === t.id}
          isSelected={selectedTextIds.has(t.id)}
        />
      ))}

      <div
        data-paper
        style={{
          position: "absolute", inset: 0,
          transform: `translate(${paper.x}px, ${paper.y}px) scale(${paper.scale}) rotate(${paper.rotate}deg)`,
          transformOrigin: "center center",
          background: toRgba(paperColor, paperAlpha),
          boxShadow: mainPaperSelected
            ? `0 0 0 3px ${SELECT_BLUE}, 0 4px 24px rgba(0,0,0,.1)`
            : "0 4px 24px rgba(0,0,0,.1)",
          overflow: "visible",
        }}
      >
        {texts.filter((t) => t.layer === "paper").map((t) => (
          <TextElement
            key={t.id}
            t={t}
            isEditing={editingId === t.id}
            isDragging={draggingTextId === t.id}
            isSelected={selectedTextIds.has(t.id)}
          />
        ))}
      </div>

      {box && box.w > 0 && box.h > 0 && (
        <>
          <div
            style={{
              position: "absolute",
              left: box.x, top: box.y, width: box.w, height: box.h,
              border: `1px dashed ${SELECT_BLUE}`,
              background: SELECT_BLUE_BG,
              pointerEvents: "none",
              zIndex: 150,
            }}
          />
          {(["nw", "ne", "se", "sw"] as ResizeHandle[]).map((h) => {
            const cx = h === "nw" || h === "sw" ? box.x : box.x + box.w;
            const cy = h === "nw" || h === "ne" ? box.y : box.y + box.h;
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  left: cx - 10, top: cy - 10, width: 20, height: 20,
                  borderRadius: 4,
                  background: "#5f554d",
                  border: "2px solid #fff",
                  pointerEvents: "none",
                  zIndex: 151,
                }}
              />
            );
          })}
        </>
      )}

      <textarea
        ref={editTaRef}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        wrap="off"
        style={{
          position: "absolute",
          left: 0, top: 0, width: 0, height: 0,
          opacity: 0, pointerEvents: "none",
          padding: 0, margin: 0,
          border: 0, outline: "none", boxShadow: "none",
          resize: "none", background: "transparent",
          fontFamily: "inherit", lineHeight: 1.4,
          whiteSpace: "pre",
          overflowX: "auto", overflowY: "hidden",
          boxSizing: "border-box",
          zIndex: 200,
          color: "#3a352e",
          touchAction: "auto",
          userSelect: "text", WebkitUserSelect: "text",
        }}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(95,85,77,.92)",
            color: "#fff",
            padding: "14px 24px",
            borderRadius: 10,
            fontSize: 14,
            letterSpacing: ".05em",
            zIndex: 500,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
          }}
        >{toast}</div>
      )}

      {connectButton && (
        <>
          <div
            style={{ position: "absolute", inset: 0, zIndex: 200 }}
            onPointerDown={(e) => { e.stopPropagation(); setConnectButton(null); }}
          />
          <div
            style={{
              position: "fixed",
              left: connectButton.x - 44,
              top: connectButton.y - 160,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              zIndex: 300,
            }}
          >
            {/* 长按文字 → 编辑 / 复制 / 删除 */}
            {connectButton.target.type === "text" && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                   
                    const hit = textsRef.current.find((x) => x.id === (connectButton.target as any).textId);
                    setConnectButton(null);
                    if (hit) enterEditing(hit);
                  }}
                  style={menuBtnStyle}
                >编辑</button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectButton(null);
                    setToast("复制单字：下一步做");
                    window.setTimeout(() => setToast(null), 1500);
                  }}
                  style={menuBtnStyle}
                >复制</button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const tid = (connectButton.target as any).textId as string;
                    setConnectButton(null);
                    deleteOneText(tid);
                    setToast("已删除");
                    window.setTimeout(() => setToast(null), 1500);
                  }}
                  style={menuBtnStyle}
                >删除</button>
              </>
            )}

            {/* 长按纸内 → 连接 / 复制整页 / 删除该页 / 粘贴 */}
            {connectButton.target.type === "page" && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectButton(null);
                    if (onRequestConnect) onRequestConnect();
                  }}
                  style={menuBtnStyle}
                >连接</button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectButton(null);
                    if (onCopyPage) onCopyPage();
                    setToast("已复制整页");
                    window.setTimeout(() => setToast(null), 1500);
                  }}
                  style={menuBtnStyle}
                >复制</button>
                <button
                  type="button"
                  disabled={!hasClipboard}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPastePage && connectButton) {
                      onPastePage(connectButton.localX, connectButton.localY);
                      setToast("已粘贴");
                      window.setTimeout(() => setToast(null), 1500);
                    }
                    setConnectButton(null);
                  }}
                  style={{ ...menuBtnStyle, opacity: hasClipboard ? 1 : 0.4, cursor: hasClipboard ? "pointer" : "not-allowed" }}
                >粘贴</button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectButton(null);
                    if (onDeletePage) onDeletePage();
                  }}
                  style={menuBtnStyle}
                >删除该页</button>
              </>
            )}

            {/* 长按空白 → 连接 / 粘贴 */}
            {connectButton.target.type === "none" && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectButton(null);
                    if (onRequestConnect) onRequestConnect();
                  }}
                  style={menuBtnStyle}
                >连接</button>
                <button
                  type="button"
                  disabled={!hasClipboard}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPastePage && connectButton) {
                      onPastePage(connectButton.localX, connectButton.localY);
                      setToast("已粘贴");
                      window.setTimeout(() => setToast(null), 1500);
                    }
                    setConnectButton(null);
                  }}
                  style={{ ...menuBtnStyle, opacity: hasClipboard ? 1 : 0.4, cursor: hasClipboard ? "pointer" : "not-allowed" }}
                >粘贴</button>
                {hasSelection && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectButton(null);
                      deleteSelection();
                      setToast("已删除框选");
                      window.setTimeout(() => setToast(null), 1500);
                    }}
                    style={menuBtnStyle}
                  >删除框选</button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const menuBtnStyle: React.CSSProperties = {
  width: 88, height: 40, borderRadius: 20, border: 0,
  background: "#5f554d", color: "#fff",
  boxShadow: "0 4px 16px rgba(0,0,0,.18)",
  fontSize: 13, cursor: "pointer",
};

function TextElement({
  t,
  isEditing,
  isDragging,
  isSelected,
}: {
  t: TextNode;
  isEditing: boolean;
  isDragging: boolean;
  isSelected: boolean;
}) {
  return (
    <div
      data-text-id={t.id}
      style={{
        position: "absolute",
        left: t.x, top: t.y,
        minWidth: 24,
        minHeight: t.fontSize * 1.6,
        fontSize: t.fontSize,
        color: t.color,
        lineHeight: 1.4,
        whiteSpace: "pre",
        width: "max-content",
        background: isSelected ? SELECT_BLUE_BG : "transparent",
        outline: isSelected
          ? `1px solid ${SELECT_BLUE}`
          : isDragging
            ? "1px dashed rgba(95,85,77,.7)"
            : "none",
        outlineOffset: 4,
        padding: 0,
        cursor: "move",
        visibility: isEditing ? "hidden" : "visible",
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {t.text}
    </div>
  );
}