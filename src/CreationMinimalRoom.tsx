import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
type Bg = "white" | "lightGray" | "darkGray" | "blackWhite" | "contrast";
type FontId = "thinSong" | "modernSong" | "handwrite" | "brush" | "minimalHei" | "retro";
type BStyle = "fineArt" | "softInk" | "handDraw" | "crayon";
type BColor = "ink" | "charcoal" | "brown" | "umber";

type LineSeg = { id: string; kind: "line" | "arc"; x1: number; y1: number; x2: number; y2: number; cx?: number; cy?: number; };

type Template = {
  id: string; name: string; category: "留白" | "学术" | "创意" | "限字";
  background: Bg; layoutPreset: string; lines: LineSeg[];
  borderStyle: BStyle; borderWidth: number; borderOpacity: number; borderColor: BColor;
  font: FontId; writingMode: "normal" | "titleAbstract"; wordLimit: number | null;
};

type State = {
  templateId: string | null; background: Bg; layoutPreset: string; lines: LineSeg[];
  content: string; font: FontId; borderStyle: BStyle; borderWidth: number; borderOpacity: number; borderColor: BColor;
  cx: number; cy: number; scale: number; rotation: number;
  writingMode: "normal" | "titleAbstract"; wordLimit: number | null; updatedAt: number;
};

type DragState =
  | { mode: "move"; startX: number; startY: number; cx: number; cy: number; pointerId: number }
  | { mode: "scale"; startX: number; startY: number; scale: number; pointerId: number }
  | { mode: "rotate"; startAngle: number; startRotation: number; pointerId: number }
  | { mode: "endpoint"; lineId: string; end: "p1" | "p2" | "ctrl"; pointerId: number };

type Menu = null | "template" | "bg" | "layout" | "border" | "font" | "writing" | "count";

const STORAGE_KEY = "ranjing.creation.minimal.v4";

const PRESET_LINES: Record<string, LineSeg[]> = {
  triangle: [{ id: "l1", kind: "line", x1: 0.5, y1: 0.08, x2: 0.08, y2: 0.92 }, { id: "l2", kind: "line", x1: 0.5, y1: 0.08, x2: 0.92, y2: 0.92 }],
  inverted: [{ id: "l1", kind: "line", x1: 0.08, y1: 0.08, x2: 0.5, y2: 0.92 }, { id: "l2", kind: "line", x1: 0.92, y1: 0.08, x2: 0.5, y2: 0.92 }],
  vee: [{ id: "l1", kind: "line", x1: 0.1, y1: 0.12, x2: 0.5, y2: 0.88 }, { id: "l2", kind: "line", x1: 0.9, y1: 0.12, x2: 0.5, y2: 0.88 }],
  arc: [{ id: "l1", kind: "arc", x1: 0.06, y1: 0.88, x2: 0.94, y2: 0.88, cx: 0.5, cy: 0.12 }],
  a4: [{ id: "l1", kind: "line", x1: 0.18, y1: 0.06, x2: 0.18, y2: 0.94 }, { id: "l2", kind: "line", x1: 0.82, y1: 0.06, x2: 0.82, y2: 0.94 }, { id: "l3", kind: "line", x1: 0.18, y1: 0.06, x2: 0.82, y2: 0.06 }],
  window: [{ id: "l1", kind: "line", x1: 0.14, y1: 0.14, x2: 0.14, y2: 0.86 }, { id: "l2", kind: "line", x1: 0.86, y1: 0.14, x2: 0.86, y2: 0.86 }, { id: "l3", kind: "line", x1: 0.14, y1: 0.5, x2: 0.86, y2: 0.5 }],
  pins: [{ id: "l1", kind: "line", x1: 0.2, y1: 0.18, x2: 0.8, y2: 0.32 }, { id: "l2", kind: "line", x1: 0.15, y1: 0.72, x2: 0.85, y2: 0.82 }],
  beam: [{ id: "l1", kind: "line", x1: 0.36, y1: 0.06, x2: 0.4, y2: 0.94 }, { id: "l2", kind: "line", x1: 0.64, y1: 0.06, x2: 0.6, y2: 0.94 }],
  float: [{ id: "l1", kind: "arc", x1: 0.15, y1: 0.35, x2: 0.85, y2: 0.35, cx: 0.5, cy: 0.15 }, { id: "l2", kind: "arc", x1: 0.2, y1: 0.65, x2: 0.8, y2: 0.65, cx: 0.5, cy: 0.85 }],
};

function clonePreset(preset: string): LineSeg[] { return (PRESET_LINES[preset] || PRESET_LINES.inverted).map((l) => ({ ...l })); }

const TEMPLATES: Template[] = [
  { id: "t1", name: "纯白留白", category: "留白", background: "white", layoutPreset: "inverted", lines: clonePreset("inverted"), borderStyle: "softInk", borderWidth: 1.5, borderOpacity: 0.7, borderColor: "ink", font: "thinSong", writingMode: "normal", wordLimit: null },
  { id: "t2", name: "斜线空间", category: "留白", background: "white", layoutPreset: "triangle", lines: clonePreset("triangle"), borderStyle: "fineArt", borderWidth: 1, borderOpacity: 0.6, borderColor: "ink", font: "thinSong", writingMode: "normal", wordLimit: null },
  { id: "t3", name: "中央纸张", category: "留白", background: "white", layoutPreset: "a4", lines: clonePreset("a4"), borderStyle: "softInk", borderWidth: 1.5, borderOpacity: 0.5, borderColor: "charcoal", font: "modernSong", writingMode: "normal", wordLimit: null },
  { id: "t4", name: "窗口留白", category: "留白", background: "lightGray", layoutPreset: "window", lines: clonePreset("window"), borderStyle: "fineArt", borderWidth: 0.8, borderOpacity: 0.5, borderColor: "ink", font: "minimalHei", writingMode: "normal", wordLimit: null },
  { id: "t5", name: "题目+摘要+正文", category: "学术", background: "white", layoutPreset: "a4", lines: clonePreset("a4"), borderStyle: "softInk", borderWidth: 1, borderOpacity: 0.4, borderColor: "charcoal", font: "modernSong", writingMode: "titleAbstract", wordLimit: null },
  { id: "t6", name: "正文+灵感块", category: "创意", background: "white", layoutPreset: "pins", lines: clonePreset("pins"), borderStyle: "handDraw", borderWidth: 1.2, borderOpacity: 0.6, borderColor: "brown", font: "handwrite", writingMode: "normal", wordLimit: null },
  { id: "t7", name: "300字短文", category: "限字", background: "white", layoutPreset: "vee", lines: clonePreset("vee"), borderStyle: "softInk", borderWidth: 1.5, borderOpacity: 0.65, borderColor: "ink", font: "thinSong", writingMode: "normal", wordLimit: 300 },
  { id: "t8", name: "800字文章", category: "限字", background: "lightGray", layoutPreset: "beam", lines: clonePreset("beam"), borderStyle: "softInk", borderWidth: 1, borderOpacity: 0.5, borderColor: "charcoal", font: "modernSong", writingMode: "normal", wordLimit: 800 },
];

const TEMPLATE_CATS = ["全部", "留白", "学术", "创意", "限字", "我的模板"] as const;

const DEFAULT_STATE: State = {
  templateId: null, background: "white", layoutPreset: "inverted", lines: clonePreset("inverted"),
  content: "欢迎来到苒境。", font: "thinSong", borderStyle: "softInk", borderWidth: 1.5, borderOpacity: 0.7, borderColor: "ink",
  cx: 0.5, cy: 0.5, scale: 0.66, rotation: 0, writingMode: "normal", wordLimit: null, updatedAt: 0,
};

const BACKGROUNDS: { id: Bg; name: string }[] = [
  { id: "white", name: "白色背景" }, { id: "lightGray", name: "浅灰背景" }, { id: "darkGray", name: "深灰背景" },
  { id: "blackWhite", name: "黑底白字" }, { id: "contrast", name: "经典黑白对比" },
];

const LAYOUTS: { id: string; name: string }[] = [
  { id: "triangle", name: "三角空间" }, { id: "inverted", name: "倒三角空间" }, { id: "vee", name: "倒V型" },
  { id: "arc", name: "半弧" }, { id: "a4", name: "A4纸感" }, { id: "window", name: "窗口感" },
  { id: "pins", name: "线钉区域" }, { id: "beam", name: "光柱" }, { id: "float", name: "漂浮区域" },
];

const FONTS: { id: FontId; name: string; stack: string; weight: number; letterSpacing?: number }[] = [
  { id: "thinSong", name: "极细宋体", stack: '"Songti SC","STSong","Noto Serif SC",serif', weight: 200 },
  { id: "modernSong", name: "现代宋体", stack: '"Source Han Serif SC","Songti SC",serif', weight: 400 },
  { id: "handwrite", name: "手写感", stack: '"Kaiti SC","STKaiti","Baoli SC",cursive', weight: 400 },
  { id: "brush", name: "毛笔感", stack: '"Hannotate SC","STHannotate","Kaiti SC",cursive', weight: 500 },
  { id: "minimalHei", name: "极简黑体", stack: '"PingFang SC","Helvetica Neue",system-ui,sans-serif', weight: 300 },
  { id: "retro", name: "复古刊物", stack: '"Bodoni Moda","Bodoni 72","Songti SC",serif', weight: 400, letterSpacing: 0.08 },
];

const BORDER_STYLES: { id: BStyle; name: string; cap: "butt" | "round"; filter?: string }[] = [
  { id: "fineArt", name: "极细艺术线", cap: "butt" },
  { id: "softInk", name: "柔和墨线", cap: "round" },
  { id: "handDraw", name: "轻手绘线", cap: "round", filter: "url(#handDrawFilter)" },
  { id: "crayon", name: "蜡笔边线", cap: "round", filter: "url(#crayonFilter)" },
];

const BORDER_COLORS: { id: BColor; name: string; value: string }[] = [
  { id: "ink", name: "墨灰", value: "#3a352e" }, { id: "charcoal", name: "炭灰", value: "#4a4640" },
  { id: "brown", name: "棕灰", value: "#6b5d4a" }, { id: "umber", name: "深褐灰", value: "#5c4a3a" },
];

function bgStyle(bg: Bg): React.CSSProperties {
  switch (bg) {
    case "white": return { background: "#ffffff" };
    case "lightGray": return { background: "#f0ede7" };
    case "darkGray": return { background: "#6b665f" };
    case "blackWhite": return { background: "#1a1815" };
    case "contrast": return { background: "linear-gradient(90deg,#ffffff 50%,#1a1815 50%)" };
  }
}
function isDarkBgFn(bg: Bg): boolean { return bg === "darkGray" || bg === "blackWhite"; }

function computeClipPath(lines: LineSeg[]): string {
  const pts: [number, number][] = [];
  for (const l of lines) { pts.push([l.x1, l.y1]); pts.push([l.x2, l.y2]); if (l.cx !== undefined && l.cy !== undefined) pts.push([l.cx, l.cy]); }
  if (pts.length < 3) return "polygon(5% 5%, 95% 5%, 95% 95%, 5% 95%)";
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const pad = 0.1;
  const adjusted = sorted.map(([x, y]) => [cx + (x - cx) * (1 - pad), cy + (y - cy) * (1 - pad)]);
  return `polygon(${adjusted.map(([x, y]) => `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`).join(", ")})`;
}

function screenToLocal(clientX: number, clientY: number, bcx: number, bcy: number, bw: number, bh: number, rot: number): { x: number; y: number } {
  const rad = -rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const sdx = clientX - bcx, sdy = clientY - bcy;
  return { x: 0.5 + (sdx * cos - sdy * sin) / Math.max(bw, 1), y: 0.5 + (sdx * sin + sdy * cos) / Math.max(bh, 1) };
}

function Thumb({ presetId }: { presetId: string }) {
  const lines = PRESET_LINES[presetId] || PRESET_LINES.inverted;
  return (<svg viewBox="0 0 100 100" width={26} height={26} className="creation-thumb">{lines.map((l) => l.kind === "arc" && l.cx !== undefined && l.cy !== undefined ? <path key={l.id} d={`M ${l.x1*100} ${l.y1*100} Q ${l.cx*100} ${l.cy*100} ${l.x2*100} ${l.y2*100}`} fill="none" stroke="#7a7268" strokeWidth={2} strokeLinecap="round" /> : <line key={l.id} x1={l.x1*100} y1={l.y1*100} x2={l.x2*100} y2={l.y2*100} stroke="#7a7268" strokeWidth={2} strokeLinecap="round" />)}</svg>);
}

function TemplateThumb({ template }: { template: Template }) {
  const dark = isDarkBgFn(template.background);
  const stroke = dark ? "#d8d3c8" : (BORDER_COLORS.find((c) => c.id === template.borderColor)?.value || "#3a352e");
  return (<div className="cm-template-thumb" style={bgStyle(template.background)}><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="cm-template-thumb-svg">{template.lines.map((l) => l.kind === "arc" && l.cx !== undefined && l.cy !== undefined ? <path key={l.id} d={`M ${l.x1*100} ${l.y1*100} Q ${l.cx*100} ${l.cy*100} ${l.x2*100} ${l.y2*100}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={template.borderOpacity} /> : <line key={l.id} x1={l.x1*100} y1={l.y1*100} x2={l.x2*100} y2={l.y2*100} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={template.borderOpacity} />)}</svg></div>);
}

function CreationMinimalEditor({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<State>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const preset = saved.layoutPreset || "inverted";

        return {
          ...DEFAULT_STATE,
          ...saved,
          lines:
  Array.isArray(saved.lines)
    ? saved.lines
    : [],
        };
      }
    } catch {
      /* noop */
    }

    return DEFAULT_STATE;
  });

  const [activePanel, setActivePanel] =
    useState<"bg" | "layout" | "border" | "font" | null>(null);

  const [selected, setSelected] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const [canvasSize, setCanvasSize] = useState({
    w: 0,
    h: 0,
  });

  const dragRef = useRef<DragState | null>(null);
const editorRef = useRef<HTMLDivElement>(null);
const syncEditorContent = () => {
  const editor = editorRef.current;
  if (!editor) return;

  patch({
    content: editor.innerHTML,
  });
};

const runEditorCommand = (
  command: string,
  value?: string
) => {
  const editor = editorRef.current;
  if (!editor) return;

  editor.focus();

  try {
    document.execCommand(
      "styleWithCSS",
      false,
      "true"
    );

    document.execCommand(
      command,
      false,
      value
    );
  } catch {
    /* noop */
  }

  syncEditorContent();
};
  useLayoutEffect(() => {
    const el = canvasRef.current;

    if (!el) return;

    const update = () =>
      setCanvasSize({
        w: el.clientWidth,
        h: el.clientHeight,
      });

    update();

    const ro = new ResizeObserver(update);

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...state,
            updatedAt: Date.now(),
          })
        );
      } catch {
        /* noop */
      }
    }, 300);

    return () => window.clearTimeout(id);
  }, [state]);
useLayoutEffect(() => {
  const editor = editorRef.current;

  if (!editor) return;

  editor.innerHTML = state.content || "";
}, []);
  const patch = (p: Partial<State>) =>
    setState((s) => ({
      ...s,
      ...p,
    }));

  const fontDef = FONTS.find((f) => f.id === state.font)!;

  const bStyleDef = BORDER_STYLES.find(
    (b) => b.id === state.borderStyle
  )!;

  const strokeColor =
    BORDER_COLORS.find((c) => c.id === state.borderColor)!.value;

  const minSide =
    Math.min(canvasSize.w, canvasSize.h) || 1;

  const boxW = state.scale * minSide;
  const boxH = state.scale * minSide;

  const boxLeft =
    state.cx * canvasSize.w - boxW / 2;

  const boxTop =
    state.cy * canvasSize.h - boxH / 2;

  const bcx = boxLeft + boxW / 2;
  const bcy = boxTop + boxH / 2;

  const clipPath = computeClipPath(state.lines);

  const inkColor = isDarkBgFn(state.background)
    ? "#f0ebe0"
    : "#3a352e";

  const handDrawScale = Math.min(
    state.borderWidth * 0.6,
    2.5
  );

  const crayonScale = Math.min(
    state.borderWidth * 0.5,
    2
  );

  const crayonFreq =
    0.03 +
    0.1 /
      Math.max(state.borderWidth, 0.5);

  const onCanvasPointerDown = (
    e: React.PointerEvent
  ) => {
    if (e.target !== e.currentTarget) return;

    setSelected(false);
  };

  const onShapePointerDown = (
    e: React.PointerEvent
  ) => {
    e.stopPropagation();

    setSelected(true);

    const el = canvasRef.current;

    if (!el) return;

    dragRef.current = {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      cx: state.cx,
      cy: state.cy,
      pointerId: e.pointerId,
    };

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onScalePointerDown = (
    e: React.PointerEvent
  ) => {
    e.stopPropagation();

    const el = canvasRef.current;

    if (!el) return;

    dragRef.current = {
      mode: "scale",
      startX: e.clientX,
      startY: e.clientY,
      scale: state.scale,
      pointerId: e.pointerId,
    };

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onRotatePointerDown = (
    e: React.PointerEvent
  ) => {
    e.stopPropagation();

    const el = canvasRef.current;

    if (!el) return;

    const a =
      Math.atan2(
        e.clientY - bcy,
        e.clientX - bcx
      ) *
      180 /
      Math.PI;

    dragRef.current = {
      mode: "rotate",
      startAngle: a,
      startRotation: state.rotation,
      pointerId: e.pointerId,
    };

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onEndpointPointerDown = (
    e: React.PointerEvent,
    lineId: string,
    end: "p1" | "p2" | "ctrl"
  ) => {
    e.stopPropagation();

    const el = canvasRef.current;

    if (!el) return;

    dragRef.current = {
      mode: "endpoint",
      lineId,
      end,
      pointerId: e.pointerId,
    };

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onCanvasPointerMove = (
    e: React.PointerEvent
  ) => {
    const st = dragRef.current;

    if (!st) return;

    if (st.mode === "move") {
      patch({
        cx: Math.max(
          0.05,
          Math.min(
            0.95,
            st.cx +
              (e.clientX - st.startX) /
                canvasSize.w
          )
        ),

        cy: Math.max(
          0.05,
          Math.min(
            0.95,
            st.cy +
              (e.clientY - st.startY) /
                canvasSize.h
          )
        ),
      });
    } else if (st.mode === "scale") {
      patch({
        scale: Math.max(
          0.2,
          Math.min(
            0.95,
            st.scale -
              ((e.clientX - st.startX) /
                canvasSize.w +
                (e.clientY - st.startY) /
                  canvasSize.h) *
                0.6
          )
        ),
      });
    } else if (st.mode === "rotate") {
      patch({
        rotation:
          st.startRotation +
          (Math.atan2(
            e.clientY - bcy,
            e.clientX - bcx
          ) *
            180 /
            Math.PI -
            st.startAngle),
      });
    } else if (st.mode === "endpoint") {
      const l = screenToLocal(
        e.clientX,
        e.clientY,
        bcx,
        bcy,
        boxW,
        boxH,
        state.rotation
      );

      const x = Math.max(
        0,
        Math.min(1, l.x)
      );

      const y = Math.max(
        0,
        Math.min(1, l.y)
      );

      setState((s) => ({
        ...s,

        lines: s.lines.map((ll) => {
          if (ll.id !== st.lineId)
            return ll;

          if (st.end === "p1")
            return {
              ...ll,
              x1: x,
              y1: y,
            };

          if (st.end === "p2")
            return {
              ...ll,
              x2: x,
              y2: y,
            };

          return {
            ...ll,
            cx: x,
            cy: y,
          };
        }),
      }));
    }
  };

  const onCanvasPointerUp = () => {
    const st = dragRef.current;

    const el = canvasRef.current;

    if (st) {
      try {
        el?.releasePointerCapture(
          st.pointerId
        );
      } catch {
        /* noop */
      }
    }

    dragRef.current = null;
  };

  const onPresetChange = (
    preset: string
  ) => {
    patch({
      layoutPreset: preset,
      lines: clonePreset(preset),
    });

    setActivePanel(null);
  };

 

  return (
    <div className="creation-minimal flex-1 flex flex-col overflow-hidden">

      <header className="cm-header">
        <button
          onClick={onBack}
          aria-label="返回"
        >
          ←
        </button>

        <span>留白</span>
      </header>
{/* ===== 基础写作工具栏 ===== */}
<div className="cm-writing-toolbar">
  <button
    title="撤销"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand("undo");
    }}
  >
    ↶
  </button>

  <button
    title="重做"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand("redo");
    }}
  >
    ↷
  </button>

  <span className="cm-toolbar-divider" />

  <button
    title="正文"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "formatBlock",
        "p"
      );
    }}
  >
    正文
  </button>

  <button
    title="标题"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "formatBlock",
        "h2"
      );
    }}
  >
    标题
  </button>

  <span className="cm-toolbar-divider" />

  <button
    title="粗体"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand("bold");
    }}
  >
    <b>B</b>
  </button>

  <button
    title="斜体"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand("italic");
    }}
  >
    <i>I</i>
  </button>

  <button
    title="下划线"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand("underline");
    }}
  >
    <u>U</u>
  </button>

  <button
    title="高亮"
    onMouseDown={(e) => {
      e.preventDefault();

      try {
        document.execCommand(
          "hiliteColor",
          false,
          "#f3df8e"
        );
      } catch {
        document.execCommand(
          "backColor",
          false,
          "#f3df8e"
        );
      }

      syncEditorContent();
    }}
  >
    ▰
  </button>

  <span className="cm-toolbar-divider" />

  <button
    title="项目符号"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "insertUnorderedList"
      );
    }}
  >
    •≡
  </button>

  <button
    title="编号列表"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "insertOrderedList"
      );
    }}
  >
    1≡
  </button>

  <span className="cm-toolbar-divider" />

  <button
    title="左对齐"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "justifyLeft"
      );
    }}
  >
    ≡
  </button>

  <button
    title="居中"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "justifyCenter"
      );
    }}
  >
    ≣
  </button>

  <button
    title="右对齐"
    onMouseDown={(e) => {
      e.preventDefault();
      runEditorCommand(
        "justifyRight"
      );
    }}
  >
    ≡
  </button>
</div>
     

      <div
        className="cm-canvas-wrap flex-1 relative overflow-hidden"
        ref={canvasRef}
        style={bgStyle(
          state.background
        )}
        onPointerDown={
          onCanvasPointerDown
        }
        onPointerMove={
          onCanvasPointerMove
        }
        onPointerUp={
          onCanvasPointerUp
        }
        onPointerCancel={
          onCanvasPointerUp
        }
      >

        <svg
          className="cm-filters"
          aria-hidden
        >
          <defs>

            <filter id="handDrawFilter">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.015"
                numOctaves={2}
                seed={3}
              />

              <feDisplacementMap
                in="SourceGraphic"
                scale={handDrawScale}
              />
            </filter>

            <filter id="crayonFilter">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={
                  crayonFreq
                }
                numOctaves={2}
                seed={7}
              />

              <feDisplacementMap
                in="SourceGraphic"
                scale={crayonScale}
              />
            </filter>

          </defs>
        </svg>

        <div
          className={`cm-shape ${
            selected
              ? "is-selected"
              : ""
          }`}
          style={{
            left: boxLeft,
            top: boxTop,
            width: boxW,
            height: boxH,
            transform: `rotate(${state.rotation}deg)`,
          }}
          onPointerDown={
            onShapePointerDown
          }
        >

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="cm-shape-svg"
          >

            {state.lines.map((l) =>
              l.kind === "arc" &&
              l.cx !== undefined &&
              l.cy !== undefined ? (
                <path
                  key={l.id}
                  d={`M ${
                    l.x1 * 100
                  } ${
                    l.y1 * 100
                  } Q ${
                    l.cx * 100
                  } ${
                    l.cy * 100
                  } ${
                    l.x2 * 100
                  } ${
                    l.y2 * 100
                  }`}
                  fill="none"
                  stroke={
                    strokeColor
                  }
                  strokeWidth={
                    state.borderWidth
                  }
                  strokeLinecap={
                    bStyleDef.cap
                  }
                  opacity={
                    state.borderOpacity
                  }
                  filter={
                    bStyleDef.filter
                  }
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <line
                  key={l.id}
                  x1={l.x1 * 100}
                  y1={l.y1 * 100}
                  x2={l.x2 * 100}
                  y2={l.y2 * 100}
                  stroke={
                    strokeColor
                  }
                  strokeWidth={
                    state.borderWidth
                  }
                  strokeLinecap={
                    bStyleDef.cap
                  }
                  opacity={
                    state.borderOpacity
                  }
                  filter={
                    bStyleDef.filter
                  }
                  vectorEffect="non-scaling-stroke"
                />
              )
            )}

          </svg>

         <div
  ref={editorRef}
  className="cm-text"
  contentEditable
  suppressContentEditableWarning
  data-placeholder="开始写……"
  spellCheck={false}
  onInput={(e) => {
    patch({
      content: e.currentTarget.innerHTML,
    });
  }}
  style={{
    clipPath,
    WebkitClipPath: clipPath,
    fontFamily: fontDef.stack,
    fontWeight: fontDef.weight,
    letterSpacing:
      fontDef.letterSpacing ?? "normal",
    color: inkColor,
    whiteSpace: "pre-wrap",
    overflowY: "auto",
  }}
/>

          {selected && (
            <Fragment>

              {state.lines.map(
                (l) => (
                  <Fragment
                    key={`ep-${l.id}`}
                  >
                    <span
                      className="cm-endpoint"
                      style={{
                        left: `${
                          l.x1 * 100
                        }%`,
                        top: `${
                          l.y1 * 100
                        }%`,
                      }}
                      onPointerDown={(
                        e
                      ) =>
                        onEndpointPointerDown(
                          e,
                          l.id,
                          "p1"
                        )
                      }
                    />

                    <span
                      className="cm-endpoint"
                      style={{
                        left: `${
                          l.x2 * 100
                        }%`,
                        top: `${
                          l.y2 * 100
                        }%`,
                      }}
                      onPointerDown={(
                        e
                      ) =>
                        onEndpointPointerDown(
                          e,
                          l.id,
                          "p2"
                        )
                      }
                    />

                    {l.kind ===
                      "arc" &&
                      l.cx !==
                        undefined &&
                      l.cy !==
                        undefined && (
                        <span
                          className="cm-endpoint cm-endpoint-ctrl"
                          style={{
                            left: `${
                              l.cx *
                              100
                            }%`,
                            top: `${
                              l.cy *
                              100
                            }%`,
                          }}
                          onPointerDown={(
                            e
                          ) =>
                            onEndpointPointerDown(
                              e,
                              l.id,
                              "ctrl"
                            )
                          }
                        />
                      )}

                  </Fragment>
                )
              )}

              {(
                [
                  {
                    k: "tl",
                    x: 0,
                    y: 0,
                  },
                  {
                    k: "tr",
                    x: 1,
                    y: 0,
                  },
                  {
                    k: "br",
                    x: 1,
                    y: 1,
                  },
                  {
                    k: "bl",
                    x: 0,
                    y: 1,
                  },
                ] as const
              ).map((c) => (
                <span
                  key={c.k}
                  className="cm-handle"
                  style={{
                    left: `${
                      c.x * 100
                    }%`,
                    top: `${
                      c.y * 100
                    }%`,
                  }}
                  onPointerDown={
                    onScalePointerDown
                  }
                />
              ))}

              <span
                className="cm-rotate-handle"
                style={{
                  left: "50%",
                  top: "-22px",
                }}
                onPointerDown={
                  onRotatePointerDown
                }
              />

            </Fragment>
          )}

        </div>

      </div>

    </div>
  );
}


export default function CreationMinimalRoom({
  onBack,
}: {
  onBack: () => void;
}) {
  type NoteDoc = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    openedAt: number;
    state: State;
  };

  const LIBRARY_KEY = "ranjing.creation.minimal.docs.v1";

  const normalizeState = (saved: Partial<State>): State => {
    const preset = saved.layoutPreset || DEFAULT_STATE.layoutPreset;

    return {
      ...DEFAULT_STATE,
      ...saved,
      lines:
  Array.isArray(saved.lines)
    ? saved.lines
    : []
    };
  };

  const getTitle = (content: string) => {
    const firstLine =
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) || "未命名随笔";

    return firstLine.length > 26
      ? firstLine.slice(0, 26) + "…"
      : firstLine;
  };

  const loadInitialDocs = (): NoteDoc[] => {
    try {
      const libraryRaw = localStorage.getItem(LIBRARY_KEY);

      if (libraryRaw) {
        const parsed = JSON.parse(libraryRaw);

        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (doc) =>
                doc &&
                typeof doc.id === "string" &&
                doc.state
            )
            .map((doc) => ({
              id: doc.id,
              title:
                typeof doc.title === "string"
                  ? doc.title
                  : "未命名随笔",
              createdAt:
                typeof doc.createdAt === "number"
                  ? doc.createdAt
                  : Date.now(),
              updatedAt:
                typeof doc.updatedAt === "number"
                  ? doc.updatedAt
                  : Date.now(),
              openedAt:
                typeof doc.openedAt === "number"
                  ? doc.openedAt
                  : 0,
              state: normalizeState(doc.state),
            }));
        }
      }

      /*
       * 兼容你之前已经写过的旧随笔。
       * 只有真正存在内容时才迁移，
       * 不拿“欢迎来到苒境。”当假文件。
       */
      const oldRaw = localStorage.getItem(STORAGE_KEY);

      if (oldRaw) {
        const saved = normalizeState(JSON.parse(oldRaw));
        const content = saved.content?.trim() || "";

        if (
          content &&
          content !== "欢迎来到苒境。"
        ) {
          const now =
            typeof saved.updatedAt === "number" &&
            saved.updatedAt > 0
              ? saved.updatedAt
              : Date.now();

          const migrated: NoteDoc = {
            id: `note-${Date.now()}`,
            title: getTitle(content),
            createdAt: now,
            updatedAt: now,
            openedAt: now,
            state: saved,
          };

          localStorage.setItem(
            LIBRARY_KEY,
            JSON.stringify([migrated])
          );

          return [migrated];
        }
      }
    } catch {
      /* noop */
    }

    return [];
  };

 const [view, setView] =
  useState<
    "choose-storage" |
    "local-templates" |
    "cloud-home" |
    "editor"
  >("choose-storage");

  const [docs, setDocs] =
    useState<NoteDoc[]>(loadInitialDocs);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [cloudSection, setCloudSection] =
  useState<
    "recent" |
    "files" |
    "shared" |
    "favorite" |
    "trash" |
    "templates"
  >("recent");
  const [cloudTemplateCategory, setCloudTemplateCategory] =
  useState<
    | "hot"
    | "daily"
    | "idea"
    | "study"
    | "reading"
    | "meeting"
    | "novel"
    | "project"
  >("hot");
  const [cloudPreview, setCloudPreview] =
  useState<{
    name: string;
    desc: string;
    content?: string;
    vip: boolean;
  } | null>(null);
const [cloudWidth, setCloudWidth] =
  useState(390);

const cloudRef =
  useRef<HTMLDivElement>(null);

useLayoutEffect(() => {
  if (view !== "cloud-home") return;

  const el = cloudRef.current;
  if (!el) return;

  const update = () => {
    setCloudWidth(el.clientWidth);
  };

  update();

  const observer =
    new ResizeObserver(update);

  observer.observe(el);

  return () => observer.disconnect();
}, [view]);

const isMobile = cloudWidth < 680;
 

 

  const saveDocs = (nextDocs: NoteDoc[]) => {
    setDocs(nextDocs);

    try {
      localStorage.setItem(
        LIBRARY_KEY,
        JSON.stringify(nextDocs)
      );
    } catch {
      /* noop */
    }
  };

  const makeId = () => {
    try {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return crypto.randomUUID();
      }
    } catch {
      /* noop */
    }

    return `note-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  };

 const createLocalDoc = (
  template?: Template | null,
  starterContent = ""
) => {
  const now = Date.now();
  const id = makeId();

  const newState: State = template
    ? {
        ...DEFAULT_STATE,

        templateId: template.id,

        background: template.background,

        layoutPreset: template.layoutPreset,

        lines: template.lines.map((line) => ({
          ...line,
        })),

        content: starterContent,

        font: template.font,

        borderStyle: template.borderStyle,

        borderWidth: template.borderWidth,

        borderOpacity: template.borderOpacity,

        borderColor: template.borderColor,

        writingMode: template.writingMode,

        wordLimit: template.wordLimit,

        updatedAt: now,
      }
    : {
  ...DEFAULT_STATE,

  templateId: null,

  content: starterContent,

  lines: [],

  updatedAt: now,
};
const openCloudTemplate = (
  content = ""
) => {
  const now = Date.now();

  const cloudState: State = {
    ...DEFAULT_STATE,
    templateId: null,
    content,
    lines: [],
    updatedAt: now,
  };

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(cloudState)
    );
  } catch {
    /* noop */
  }

  setSelectedId(null);
  setView("editor");
};
  const newDoc: NoteDoc = {
    id,
    title: "未命名随笔",
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    state: newState,
  };

  const nextDocs = [
    newDoc,
    ...docs,
  ];

  saveDocs(nextDocs);

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(newState)
    );
  } catch {
    /* noop */
  }

  setSelectedId(id);

  setView("editor");
};

const createNew = () => {
  setView("choose-storage");
};
  const openDoc = (doc: NoteDoc) => {
    const now = Date.now();

    const nextDocs = docs.map((item) =>
      item.id === doc.id
        ? {
            ...item,
            openedAt: now,
          }
        : item
    );

    saveDocs(nextDocs);

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(doc.state)
      );
    } catch {
      /* noop */
    }

    setSelectedId(doc.id);
    setView("editor");
  };

  /*
   * 编辑器内部是 300ms 自动保存。
   * 所以返回时等 380ms，
   * 让最后几个字先真正写进 localStorage，
   * 再存回对应文件。
   */
  const backFromEditor = () => {
    if (!selectedId) {
      setView("local-templates")
      return;
    }

    window.setTimeout(() => {
      try {
        const raw =
          localStorage.getItem(STORAGE_KEY);

        if (raw) {
          const saved = normalizeState(
            JSON.parse(raw)
          );

          const now = Date.now();

          const nextDocs = docs.map((doc) => {
            if (doc.id !== selectedId) {
              return doc;
            }

            return {
              ...doc,
              title: getTitle(
                saved.content || ""
              ),
              updatedAt:
                saved.updatedAt &&
                saved.updatedAt > 0
                  ? saved.updatedAt
                  : now,
              state: {
                ...saved,
                updatedAt:
                  saved.updatedAt &&
                  saved.updatedAt > 0
                    ? saved.updatedAt
                    : now,
              },
            };
          });

          saveDocs(nextDocs);
        }
      } catch {
        /* noop */
      }

      setSelectedId(null);
      setView("local-templates")
    }, 380);
  };

  const formatTime = (time: number) => {
    if (!time) return "—";

    const date = new Date(time);
    const now = new Date();

    const sameDay =
      date.getFullYear() ===
        now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const isYesterday =
      date.getFullYear() ===
        yesterday.getFullYear() &&
      date.getMonth() ===
        yesterday.getMonth() &&
      date.getDate() ===
        yesterday.getDate();

    const hh = String(
      date.getHours()
    ).padStart(2, "0");

    const mm = String(
      date.getMinutes()
    ).padStart(2, "0");

    if (sameDay) {
      return `今天 ${hh}:${mm}`;
    }

    if (isYesterday) {
      return `昨天 ${hh}:${mm}`;
    }

    if (
      date.getFullYear() ===
      now.getFullYear()
    ) {
      return `${
        date.getMonth() + 1
      }月${date.getDate()}日`;
    }

    return `${date.getFullYear()}年${
      date.getMonth() + 1
    }月${date.getDate()}日`;
  };

 
if (view === "choose-storage") {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#fbfaf7",
        color: "#4a463f",
      }}
    >
      <header
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderBottom:
            "1px solid rgba(74,70,63,.08)",
        }}
      >
        <button
         onClick={onBack}
          style={{
            width: 36,
            height: 36,
            border: 0,
            background: "transparent",
            color: "#8f8880",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ←
        </button>

        <span
          style={{
            marginLeft: 8,
            fontFamily:
              '"Songti SC","STSong",serif',
            fontSize: 18,
          }}
        >
          新建随笔
        </span>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 560,
          }}
        >
          <div
            style={{
              marginBottom: 28,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily:
                  '"Songti SC","STSong",serif',
                fontSize: 22,
              }}
            >
              保存在哪里？
            </div>

            <div
              style={{
                marginTop: 8,
                color: "#aaa39b",
                fontSize: 11,
              }}
            >
              本地无需登录，云端可以跨设备同步
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(150px,1fr))",
              gap: 14,
            }}
          >
            <button
              onClick={() => setView("local-templates")}
              style={{
                minHeight: 150,
                padding: 22,
                border:
                  "1px solid rgba(128,107,92,.18)",
                borderRadius: 12,
                background: "#fffdfa",
                color: "#514b45",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 27,
                  marginBottom: 14,
                }}
              >
                ▣
              </div>

              <strong
                style={{
                  display: "block",
                  fontSize: 16,
                  fontWeight: 500,
                }}
              >
                本地创作
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  color: "#9d968f",
                  fontSize: 10,
                  lineHeight: 1.7,
                }}
              >
                无需登录
                <br />
                文件保存在当前设备
              </span>
            </button>

            <button
             onClick={() =>
  setView("cloud-home")
}
              style={{
                minHeight: 150,
                padding: 22,
                border:
                  "1px solid rgba(128,107,92,.18)",
                borderRadius: 12,
                background: "#fffdfa",
                color: "#514b45",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 27,
                  marginBottom: 14,
                }}
              >
                ☁
              </div>

              <strong
                style={{
                  display: "block",
                  fontSize: 16,
                  fontWeight: 500,
                }}
              >
                云端创作
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  color: "#9d968f",
                  fontSize: 10,
                  lineHeight: 1.7,
                }}
              >
                需要登录
                <br />
                支持跨设备同步
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
if (view === "local-templates") {
  const writingTemplates = [
    {
      id: "blank",
      name: "空白随笔",
      desc: "从空白开始",
      content: "",
    },
    {
      id: "daily",
      name: "日常随笔",
      desc: "记录今天想到的事",
      content: "今天想记录的是：\n\n",
    },
    {
      id: "diary",
      name: "日记",
      desc: "记录一天的经历和感受",
      content:
        "今天发生了什么：\n\n今天的感受：\n\n",
    },
    {
      id: "idea",
      name: "灵感记录",
      desc: "快速抓住突然出现的想法",
      content: "灵感：\n\n我想到：\n\n",
    },
    {
      id: "reading",
      name: "读书笔记",
      desc: "记录阅读重点与想法",
      content:
        "书名：\n\n摘记：\n\n我的想法：\n\n",
    },
    {
      id: "study",
      name: "学习笔记",
      desc: "整理知识和重点",
      content:
        "主题：\n\n重点：\n\n我的理解：\n\n",
    },
    {
      id: "meeting",
      name: "会议记录",
      desc: "简单整理讨论和决定",
      content:
        "主题：\n\n讨论内容：\n\n决定事项：\n\n",
    },
  ];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#fbfaf7",
        color: "#4a463f",
      }}
    >
      <header
        style={{
          height: 60,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom:
            "1px solid rgba(74,70,63,.08)",
        }}
      >
        <button
          onClick={() =>
            setView("choose-storage")
          }
          style={{
            width: 36,
            height: 36,
            border: 0,
            background: "transparent",
            color: "#8f8880",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ←
        </button>

        <span
          style={{
            marginLeft: 6,
            fontFamily:
              '"Songti SC","STSong",serif',
            fontSize: 18,
          }}
        >
          本地新建
        </span>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "24px 16px 40px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily:
              '"Songti SC","STSong",serif',
            fontSize: 21,
            fontWeight: 400,
          }}
        >
          新建随笔
        </h2>

        <div
          style={{
            marginTop: 6,
            color: "#aaa39b",
            fontSize: 10,
          }}
        >
          选择一种方式开始写
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2,minmax(0,1fr))",
            gap: 12,
            marginTop: 22,
          }}
        >
          {writingTemplates.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                createLocalDoc(
                  null,
                  item.content
                )
              }
              style={{
                minHeight: 132,
                padding: "18px 14px",
                border:
                  "1px solid rgba(128,107,92,.15)",
                borderRadius: 10,
                background: "#fffdfa",
                color: "#514b45",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 42,
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 15,
                  border:
                    "1px solid rgba(128,107,92,.14)",
                  borderRadius: 4,
                  background: "#fff",
                  color: "#9b806e",
                  fontFamily:
                    '"Songti SC","STSong",serif',
                  fontSize: 12,
                }}
              >
                文
              </div>

              <div
                style={{
                  fontFamily:
                    '"Songti SC","STSong",serif',
                  fontSize: 15,
                }}
              >
                {item.name}
              </div>

              <div
                style={{
                  marginTop: 6,
                  color: "#aaa39b",
                  fontSize: 9,
                  lineHeight: 1.6,
                }}
              >
                {item.desc}
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}


if (view === "cloud-home") {
  const cloudItems = [
  {
    id: "recent" as const,
    name: "最近文件",
  },
  {
    id: "templates" as const,
    name: "模板库",
  },
  {
    id: "files" as const,
    name: "我的文件",
  },
  {
    id: "shared" as const,
    name: "共享给我",
  },
  {
    id: "favorite" as const,
    name: "我的收藏",
  },
  {
    id: "trash" as const,
    name: "回收站",
  },
];
const cloudTemplateCategories = [
  { id: "hot" as const, name: "热门精选", vip: false },
  { id: "daily" as const, name: "日常记录", vip: false },
  { id: "idea" as const, name: "灵感创作", vip: false },
  { id: "study" as const, name: "学习笔记", vip: false },
  { id: "reading" as const, name: "读书笔记", vip: false },
  { id: "meeting" as const, name: "会议记录", vip: false },

  { id: "novel" as const, name: "小说创作", vip: true },
  { id: "project" as const, name: "项目管理", vip: true },
];
  const cloudTitle =
    cloudItems.find(
      (item) =>
        item.id === cloudSection
    )?.name || "最近文件";

  const emptyText =
    cloudSection === "recent"
      ? "还没有最近文件"
      : cloudSection === "files"
      ? "还没有云端文件"
      : cloudSection === "shared"
      ? "还没有收到共享文件"
      : cloudSection === "favorite"
      ? "还没有收藏文件"
      : cloudSection === "trash"
      ? "回收站是空的"
      : "";
const cloudFreeTemplates = [
  {
    id: "blank",
    name: "空白随笔",
    desc: "从空白开始",
    category: "hot",
    content: "",
  },
  {
    id: "daily",
    name: "日常随笔",
    desc: "记录每天的想法",
    category: "daily",
    content: "今天想记录的是：\n\n",
  },
  {
    id: "diary",
    name: "日记",
    desc: "记录经历和感受",
    category: "daily",
    content:
      "今天发生了什么：\n\n今天的感受：\n\n",
  },
  {
    id: "idea",
    name: "灵感记录",
    desc: "快速抓住灵感",
    category: "idea",
    content:
      "灵感：\n\n我想到：\n\n",
  },
  {
    id: "study",
    name: "学习笔记",
    desc: "整理知识重点",
    category: "study",
    content:
      "主题：\n\n重点：\n\n我的理解：\n\n",
  },
  {
    id: "reading",
    name: "读书笔记",
    desc: "记录阅读和思考",
    category: "reading",
    content:
      "书名：\n\n摘记：\n\n我的想法：\n\n",
  },
  {
    id: "meeting",
    name: "会议记录",
    desc: "整理讨论和决定",
    category: "meeting",
    content:
      "主题：\n\n讨论内容：\n\n决定事项：\n\n",
  },
];

const cloudVipTemplates = [
  {
    id: "novel",
    name: "小说创作",
    desc: "人物、大纲、章节管理",
    category: "novel",
  },
  {
    id: "novel-outline",
    name: "小说大纲",
    desc: "整理世界观与故事结构",
    category: "novel",
  },
  {
    id: "project",
    name: "项目记录",
    desc: "计划、进度、任务整理",
    category: "project",
  },
  {
    id: "project-plan",
    name: "项目计划",
    desc: "目标、节点与执行安排",
    category: "project",
  },
];
  return (
  <div
    ref={cloudRef}
    style={{
      position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#fbfaf7",
        color: "#4a463f",
      }}
    >
      <header
        style={{
          height: 60,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 15px",
          borderBottom:
            "1px solid rgba(74,70,63,.08)",
        }}
      >
        <button
          onClick={() =>
            setView("choose-storage")
          }
          style={{
            width: 34,
            height: 34,
            border: 0,
            background: "transparent",
            color: "#8f8880",
            fontSize: 19,
            cursor: "pointer",
          }}
        >
          ←
        </button>

        <strong
          style={{
            fontFamily:
              '"Songti SC","STSong",serif',
            fontSize: 18,
            fontWeight: 400,
          }}
        >
          云端随笔
        </strong>

        <div style={{ flex: 1 }} />
<button
  onClick={() => {
    alert(
      "会员可使用专业模板、多人实时协作、云端历史版本等功能。"
    );
  }}
  style={{
    height: 32,
    padding: "0 11px",
    border:
      "1px solid rgba(128,107,92,.22)",
    borderRadius: 7,
    background: "#5f554d",
    color: "#fff",
    fontSize: 10,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }}
>
  升级会员
</button>
       
      </header>

      {isMobile && (
        <nav
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 5,
            padding: "9px 10px",
            overflowX: "auto",
            borderBottom:
              "1px solid rgba(74,70,63,.07)",
          }}
        >
          {cloudItems.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                setCloudSection(item.id)
              }
              style={{
                flexShrink: 0,
                padding: "7px 10px",
                border: 0,
                borderRadius: 16,
                background:
                  cloudSection === item.id
                    ? "#e7e0d7"
                    : "transparent",
                color:
                  cloudSection === item.id
                    ? "#514b45"
                    : "#999189",
                fontSize: 10,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {item.name}
            </button>
          ))}
        </nav>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {!isMobile && (
          <aside
            style={{
              width: 170,
              flexShrink: 0,
              padding: "20px 12px",
              borderRight:
                "1px solid rgba(74,70,63,.07)",
              background: "#f6f2ec",
            }}
          >
            <button
              onClick={() =>
                setCloudSection("templates")
              }
              style={{
                width: "100%",
                height: 40,
                marginBottom: 15,
                border: 0,
                borderRadius: 7,
                background: "#5f5a54",
                color: "#fff",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              创建云端文件
            </button>

            {cloudItems.map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  setCloudSection(item.id)
                }
                style={{
                  width: "100%",
                  height: 38,
                  padding: "0 11px",
                  border: 0,
                  borderRadius: 7,
                  background:
                    cloudSection === item.id
                      ? "#e7e0d7"
                      : "transparent",
                  color:
                    cloudSection === item.id
                      ? "#514b45"
                      : "#827b74",
                  fontSize: 11,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {item.name}
              </button>
            ))}
          </aside>
        )}

        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            padding: isMobile
              ? "22px 16px 36px"
              : "27px 30px 40px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily:
                '"Songti SC","STSong",serif',
              fontSize: isMobile ? 19 : 21,
              fontWeight: 400,
            }}
          >
            {cloudTitle}
          </h2>

          {cloudSection !==
            "templates" && (
            <div
              style={{
                minHeight: 310,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "#aaa39b",
                  fontSize: 12,
                }}
              >
                {emptyText}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: "#c1bbb4",
                  fontSize: 9,
                  lineHeight: 1.8,
                }}
              >
                当前没有真实云端数据
              </div>
            </div>
          )}

          {cloudSection === "templates" && (
  <>
  <div
  style={{
    display: "flex",
    gap: 7,
    marginTop: 16,
    paddingBottom: 10,
    overflowX: "auto",
  }}
>
  {cloudTemplateCategories.map((item) => (
    <button
      key={item.id}
      onClick={() =>
        setCloudTemplateCategory(item.id)
      }
      style={{
        flexShrink: 0,
        height: 30,
        padding: "0 10px",
        border: 0,
        borderRadius: 15,
        background:
          cloudTemplateCategory === item.id
            ? "#e7e0d7"
            : "transparent",
        color:
          cloudTemplateCategory === item.id
            ? "#514b45"
            : "#948d85",
        fontSize: 10,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {item.name}

      {item.vip && (
        <span
          style={{
            marginLeft: 4,
            fontSize: 7,
            color: "#9b765f",
          }}
        >
          VIP
        </span>
      )}
    </button>
  ))}
</div>
    <div
      style={{
        marginTop: 8,
        color: "#aaa39b",
        fontSize: 10,
      }}
    >
      免费模板
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(2,minmax(0,1fr))",
        gap: 12,
        marginTop: 18,
      }}
    >
      {cloudFreeTemplates
  .filter(
    (item) =>
      cloudTemplateCategory === "hot" ||
      item.category === cloudTemplateCategory
  )
  .map((item) => (
        <div
  key={item.id}
          style={{
            minHeight: 126,
            padding: 14,
            border:
              "1px solid rgba(128,107,92,.15)",
            borderRadius: 9,
            background: "#fffdfa",
            color: "#514b45",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 32,
              height: 40,
              display: "grid",
              placeItems: "center",
              marginBottom: 13,
              border:
                "1px solid rgba(128,107,92,.14)",
              borderRadius: 4,
              background: "#fff",
              color: "#9b806e",
              fontFamily:
                '"Songti SC","STSong",serif',
              fontSize: 11,
            }}
          >
            文
          </div>

          <div
            style={{
              fontFamily:
                '"Songti SC","STSong",serif',
              fontSize: 14,
            }}
          >
            {item.name}
          </div>

          <div
            style={{
              marginTop: 5,
              color: "#aaa39b",
              fontSize: 9,
              lineHeight: 1.5,
            }}
          >
            {item.desc}
          </div>
          <div
  style={{
    display: "flex",
    gap: 8,
    marginTop: 14,
  }}
>
  <button
    onClick={(e) => {
      e.stopPropagation();

      setCloudPreview({
        name: item.name,
        desc: item.desc,
        content: item.content,
        vip: false,
      });
    }}
    style={{
      flex: 1,
      height: 30,
      border:
        "1px solid rgba(128,107,92,.18)",
      borderRadius: 5,
      background: "#fff",
      color: "#766e67",
      fontSize: 10,
      cursor: "pointer",
    }}
  >
    预览
  </button>

  <button
    onClick={(e) => {
      e.stopPropagation();
      const now = Date.now();

const cloudState: State = {
  ...DEFAULT_STATE,
  templateId: null,
  content: item.content || "",
  lines: [],
  updatedAt: now,
};

try {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(cloudState)
  );
} catch {
  /* noop */
}

setSelectedId(null);
setView("editor");
    }}
    style={{
      flex: 1,
      height: 30,
      border: 0,
      borderRadius: 5,
      background: "#5f5a54",
      color: "#fff",
      fontSize: 10,
      cursor: "pointer",
    }}
  >
    使用
  </button>
</div>
        </div>
      ))}
    </div>

    <div
      style={{
        marginTop: 30,
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          color: "#7c746d",
          fontSize: 11,
        }}
      >
        专业模板
      </span>

      <span
        style={{
          padding: "2px 6px",
          borderRadius: 10,
          background: "#5f554d",
          color: "#fff",
          fontSize: 8,
        }}
      >
        VIP
      </span>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(2,minmax(0,1fr))",
        gap: 12,
      }}
    >
      {cloudVipTemplates
  .filter(
    (item) =>
      cloudTemplateCategory === "hot" ||
      item.category === cloudTemplateCategory
  )
  .map((item) => (
        <button
          key={item.id}
          style={{
            position: "relative",
            minHeight: 126,
            padding: 14,
            border:
              "1px solid rgba(128,107,92,.15)",
            borderRadius: 9,
            background: "#fffdfa",
            color: "#514b45",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 9,
              right: 9,
              padding: "2px 6px",
              borderRadius: 10,
              background: "#5f554d",
              color: "#fff",
              fontSize: 8,
            }}
          >
            VIP
          </span>

          <div
            style={{
              width: 32,
              height: 40,
              display: "grid",
              placeItems: "center",
              marginBottom: 13,
              border:
                "1px solid rgba(128,107,92,.14)",
              borderRadius: 4,
              background: "#fff",
              color: "#9b806e",
              fontFamily:
                '"Songti SC","STSong",serif',
              fontSize: 11,
            }}
          >
            文
          </div>

          <div
            style={{
              fontFamily:
                '"Songti SC","STSong",serif',
              fontSize: 14,
            }}
          >
            {item.name}
          </div>

          <div
            style={{
              marginTop: 5,
              color: "#aaa39b",
              fontSize: 9,
              lineHeight: 1.5,
            }}
          >
            {item.desc}
          </div>
        </button>
      ))}
    </div>

    <div
      style={{
        marginTop: 30,
        padding: "15px 16px",
        border:
          "1px solid rgba(128,107,92,.14)",
        borderRadius: 9,
        background: "#f7f3ed",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong
          style={{
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          多人实时协作
        </strong>

        <span
          style={{
            padding: "2px 6px",
            borderRadius: 10,
            background: "#5f554d",
            color: "#fff",
            fontSize: 8,
          }}
        >
          VIP
        </span>
      </div>

      <div
        style={{
          marginTop: 7,
          color: "#aaa39b",
          fontSize: 9,
          lineHeight: 1.7,
        }}
      >
        支持多人同时在线编辑同一份文件
      </div>
    </div>
  </>
)}
        </main>
        {cloudPreview && (
  <div
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 100,
      display: "flex",
      flexDirection: "column",
      background: "#fbfaf7",
    }}
  >
    <header
      style={{
        height: 60,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        borderBottom:
          "1px solid rgba(74,70,63,.08)",
      }}
    >
      <button
        onClick={() =>
          setCloudPreview(null)
        }
        style={{
          width: 36,
          height: 36,
          border: 0,
          background: "transparent",
          color: "#8f8880",
          fontSize: 20,
          cursor: "pointer",
        }}
      >
        ←
      </button>

      <span
        style={{
          marginLeft: 6,
          fontFamily:
            '"Songti SC","STSong",serif',
          fontSize: 18,
        }}
      >
        模板预览
      </span>

      <div style={{ flex: 1 }} />

      {cloudPreview.vip && (
        <span
          style={{
            padding: "3px 7px",
            borderRadius: 10,
            background: "#5f554d",
            color: "#fff",
            fontSize: 8,
          }}
        >
          VIP
        </span>
      )}
    </header>

    <main
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "24px 18px 90px",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily:
            '"Songti SC","STSong",serif',
          fontSize: 21,
          fontWeight: 400,
        }}
      >
        {cloudPreview.name}
      </h2>

      <div
        style={{
          marginTop: 8,
          color: "#999189",
          fontSize: 10,
        }}
      >
        {cloudPreview.desc}
      </div>

      <div
        style={{
          minHeight: 360,
          marginTop: 24,
          padding: 22,
          border:
            "1px solid rgba(128,107,92,.14)",
          borderRadius: 8,
          background: "#fff",
          color: "#615b55",
          fontSize: 13,
          lineHeight: 2,
          whiteSpace: "pre-wrap",
        }}
      >
        {cloudPreview.content ||
          "这是模板的预览区域。"}
      </div>
    </main>

    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        gap: 10,
        padding: 12,
        borderTop:
          "1px solid rgba(74,70,63,.08)",
        background: "#fbfaf7",
      }}
    >
      <button
        onClick={() =>
          setCloudPreview(null)
        }
        style={{
          flex: 1,
          height: 38,
          border:
            "1px solid rgba(128,107,92,.18)",
          borderRadius: 6,
          background: "#fff",
          color: "#716a63",
          cursor: "pointer",
        }}
      >
        返回
      </button>

      <button
        onClick={() => {
          if (cloudPreview.vip) {
            alert(
              "此模板为 VIP 模板，请先升级会员。"
            );
            return;
          }

          const now = Date.now();

          const cloudState: State = {
            ...DEFAULT_STATE,
            templateId: null,
            content:
              cloudPreview.content || "",
            lines: [],
            updatedAt: now,
          };

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(cloudState)
          );

          setCloudPreview(null);
          setSelectedId(null);
          setView("editor");
        }}
        style={{
          flex: 1,
          height: 38,
          border: 0,
          borderRadius: 6,
          background: "#5f5a54",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {cloudPreview.vip
          ? "VIP · 使用"
          : "使用此模板"}
      </button>
    </div>
  </div>
)}
      </div>
    </div>
  );
}
  if (view === "editor") {
   
    return (
      <CreationMinimalEditor
        onBack={backFromEditor}
      />
    );
  }

 
}