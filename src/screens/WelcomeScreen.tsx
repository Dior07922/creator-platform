import { useEffect, useRef, useState } from "react";

/*
 * 苒境 · 极简镜面首页（V3 冻结版接线）
 * 来源：整体优化顺序/第一步：首页动画改！/00_首页镜面_V3_确定版.html
 * 冻结规则（照原型审定方向，不再另加）：
 *  1. 首页只有镜面和镜内「苒境」，不显示宣传文案与切换控件。
 *  2. 点镜中「苒境」→ 镜面发亮开门 → 直接复用 onEnter 进真画布，不加第二套转场。
 *     原型里的假画布演示块不接入（原型注明：正式接入必须用真实画布）。
 *  3. 主题 / 字体只读 localStorage 的 ranjing:ui-theme、ranjing:ui-font，默认跟随系统；
 *     写入口在后续「保存」菜单里接，首页本身不提供切换控件。
 *  4. 镜面用 WebGL；设备不支持时自动降级为静态 SVG 镜面（原型同款兜底）。
 */

const VERTEX_SHADER = `attribute vec2 aPos; varying vec2 vUv;void main(){vUv=(aPos+1.0)*0.5;gl_Position=vec4(aPos,0.,1.);}`;

const FRAGMENT_SHADER = `precision highp float;
varying vec2 vUv;
uniform float uTime;uniform vec2 uSize;uniform vec3 uTouch[4];uniform sampler2D uText;uniform float uTextOn;uniform float uMist;
float noise(vec2 p){return sin(p.x*8.1+sin(p.y*7.6))*sin(p.y*10.8+sin(p.x*6.6));}
void main(){
  float aspect=uSize.x/uSize.y;
  vec2 p=(vUv-vec2(.5))*vec2(aspect,1.);
  float t=uTime;
  float a=atan(p.y,p.x);
  // The mirror is a tall, slightly asymmetric organic sculpture; no rectangular plane.
  vec2 q=vec2((p.x+.015+.012*sin(p.y*11.+t*.16))/.260,(p.y+.012)/.394);
  float theta=atan(q.y,q.x);
  float morph=.029*sin(5.0*theta+.12*t)+.019*sin(8.0*theta-.19*t)+.013*sin(3.0*theta+.3*t);
  float edge=length(q)-(1.+morph);
  float aa=max(.0025,2.0/uSize.y);
  float mask=1.-smoothstep(-.004,aa*3.0,edge);
  if(mask<.002)discard;
  float warp=0.;vec2 disp=vec2(0.);
  for(int i=0;i<4;i++){
    vec3 r=uTouch[i];
    float age=r.z;
    if(age>=0. && age<1.55){
      vec2 tp=(r.xy-vec2(.5))*vec2(aspect,1.);
      vec2 delta=p-tp;float d=length(delta);
      float wave=sin(d*41.-age*25.)*exp(-d*8.)*exp(-age*2.6);
      warp+=wave;disp+=normalize(delta+vec2(.0001))*wave*.011;
    }
  }
  vec2 s=q+disp*vec2(4.,3.);
  // Animated, curved reflections: high-contrast chrome bands, soft steel and blue-white glints.
  float curve=s.x + .23*sin(s.y*4.8+t*.20)+.06*sin(s.y*12.-t*.28)+.08*noise(s*1.1);
  float band=sin(curve*20.2+1.8*sin(s.y*5.-t*.13));
  float ribbons=pow(max(0.,.5+.5*sin(curve*41.+2.*sin(s.y*7.1+t*.35))),14.);
  float ribbons2=pow(max(0.,.5+.5*sin((s.x-s.y*.22)*61.-1.1*sin(s.y*11.-t*.27))),19.);
  float metal=.43+.31*band+.16*sin(s.y*12.+s.x*8.-t*.22);
  float xShade=.56+.35*(1.-abs(s.x))-.24*max(s.x,0.);
  float v=clamp(metal*xShade+ribbons*.44+ribbons2*.31 + warp*.06,0.,1.);
  vec3 slate=vec3(.048,.079,.118);vec3 steel=vec3(.43,.57,.65);vec3 pearl=vec3(.90,.95,.97);
  vec3 color=mix(slate,steel,smoothstep(.04,.71,v));
  color=mix(color,pearl,smoothstep(.52,.98,v)*.88);
  float azure=max(0.,sin(s.y*9.+s.x*4.+t*.19))*.09;
  color+=vec3(azure*.24,azure*.52,azure*.81);
  float rim=1.-smoothstep(0.,.065,abs(edge));
  float key=(.5+.5*sin(theta*2.4+1.25));
  color+=rim*mix(vec3(.12,.19,.24),vec3(.71,.82,.87),key)*.57;
  color*=.83+.24*(.5+.5*sin(s.x*3.8-s.y*3.+t*.10));
  // Brand ink lives INSIDE the refractive field, not in an HTML layer above it.
  // Sampling along the same distorted q as the metallic ribbons makes touch ripples bend the letters.
  if(uTextOn>.5){
    vec2 coord=vec2(.5+.475*s.x, .5+.475*s.y);
    coord+=vec2(.013*sin(s.y*6.2+t*.44), .010*sin(s.x*4.8-t*.39));
    coord+=disp*vec2(4.7,4.3);
    float ink=texture2D(uText,coord).a;
    float glow=texture2D(uText,coord+vec2(.009,0.)).a+texture2D(uText,coord-vec2(.009,0.)).a
      +texture2D(uText,coord+vec2(0.,.009)).a+texture2D(uText,coord-vec2(0.,.009)).a;
    float vignette=exp(-pow(s.x*1.5,2.)-pow((s.y-.025)*2.8,2.));
    color=mix(color, color*vec3(.34,.43,.52),.62*vignette);
    color+=vec3(.07,.20,.26)*min(1.,glow*.15)*.65;
    vec3 brand=mix(vec3(.93,.99,1.),vec3(.98,1.,1.),uMist);
    color=mix(color,brand,ink*.91);
  }
  gl_FragColor=vec4(clamp(color,0.,1.),mask);
}`;

type Uniforms = {
  time: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  touch: WebGLUniformLocation | null;
  text: WebGLUniformLocation | null;
  textOn: WebGLUniformLocation | null;
  mist: WebGLUniformLocation | null;
};

export default function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const brandRef = useRef<HTMLButtonElement | null>(null);
  const fallbackMirrorRef = useRef<HTMLDivElement | null>(null);
  const fallbackBrandRef = useRef<HTMLDivElement | null>(null);
  /* 镜中字重画的句柄：字体就绪或用户改字体时让着色器重新采样 */
  const textDrawRef = useRef<(() => void) | null>(null);
  const onEnterRef = useRef(onEnter);

  const [theme, setTheme] = useState<"dark" | "mist">("dark");
  const [font, setFont] = useState<"serif" | "sans">("serif");

  /* 进画布的动作永远取最新一次，不被闭包卡死 */
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);

  /* 主题与字体：默认跟随系统；localStorage 里有用户设定就以设定为准（首页只读不写） */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const safeGet = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
    const savedTheme = safeGet("ranjing:ui-theme");
    const savedFont = safeGet("ranjing:ui-font");
    let auto = true;
    if (savedFont === "serif" || savedFont === "sans") setFont(savedFont);
    if (savedTheme === "dark" || savedTheme === "mist") auto = false;
    const apply = () => { setTheme(auto ? (mq.matches ? "dark" : "mist") : (savedTheme as "dark" | "mist")); };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* 字体变化时重画镜中「苒境」 */
  useEffect(() => { textDrawRef.current?.(); }, [font]);

  /* 镜面渲染：WebGL 液态镜面 + 触摸涟漪；不支持时保留静态 SVG 镜面 */
  useEffect(() => {
    if (!rootRef.current || !wrapRef.current || !canvasRef.current) return;
    const root = rootRef.current;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const brand = brandRef.current;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const textPaint = document.createElement("canvas");
    textPaint.width = 1024;
    textPaint.height = 1024;

    let gl: WebGLRenderingContext | null = null;
    let loc: Uniforms | null = null;
    let textTexture: WebGLTexture | null = null;
    let raf = 0;
    let stopped = false;
    let hasWebgl = false;
    let touches: { x: number; y: number; at: number }[] = [];
    let enterTimer: number | null = null;
    let entering = false;

    /* 「苒境」画进镜面纹理，由同一个着色器折射——不是盖在镜面上的字 */
    function updateTextTexture() {
      const g = gl;
      const ctx = textPaint.getContext("2d");
      if (!hasWebgl || !textTexture || !g || !ctx || !loc) return;
      ctx.clearRect(0, 0, 1024, 1024);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,1)";
      const cn = root.dataset.font === "sans"
        ? '"Noto Sans SC","Microsoft YaHei",sans-serif'
        : '"Noto Serif SC","Songti SC","STSong",serif';
      ctx.font = "500 217px " + cn;
      ctx.fillText("苒境", 512, 470);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, textTexture);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, textPaint);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.uniform1i(loc.text, 0);
    }
    textDrawRef.current = updateTextTexture;

    function compileShader(g: WebGLRenderingContext, kind: number, source: string): WebGLShader {
      const s = g.createShader(kind);
      if (!s) throw Error("createShader failed");
      g.shaderSource(s, source);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw Error(g.getShaderInfoLog(s) || "shader compile failed");
      return s;
    }

    function resize() {
      const g = gl;
      if (!hasWebgl || !g) return;
      const b = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      const w = Math.max(1, Math.round(b.width * dpr));
      const h = Math.max(1, Math.round(b.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        g.viewport(0, 0, w, h);
      }
    }

    function frame(now: number) {
      raf = 0;
      const g = gl;
      if (stopped || !hasWebgl || !g || !loc) return;
      resize();
      const seconds = now * 0.001;
      const uniform = new Float32Array(12).fill(-100);
      for (let i = 0; i < Math.min(4, touches.length); i++) {
        uniform[i * 3] = touches[i].x;
        uniform[i * 3 + 1] = touches[i].y;
        uniform[i * 3 + 2] = Math.max(-1, (now - touches[i].at) * 0.001);
      }
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.uniform1f(loc.time, reduced ? 0 : seconds);
      g.uniform2f(loc.size, canvas.width, canvas.height);
      g.uniform3fv(loc.touch, uniform);
      g.uniform1f(loc.textOn, root.dataset.text === "inside" ? 1 : 0);
      g.uniform1f(loc.mist, root.dataset.theme === "mist" ? 1 : 0);
      g.drawArrays(g.TRIANGLES, 0, 6);
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    function pause(on: boolean) {
      stopped = on || document.hidden;
      if (stopped) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && hasWebgl) {
        raf = requestAnimationFrame(frame);
      }
    }

    function touchAt(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = 1 - (clientY - rect.top) / rect.height;
      if (x < 0.22 || x > 0.78 || y < 0.06 || y > 0.92) return;
      touches.unshift({ x, y, at: performance.now() });
      touches = touches.slice(0, 4);
      const fbBrand = fallbackBrandRef.current;
      if (fbBrand) {
        fbBrand.classList.remove("touched");
        void fbBrand.offsetWidth;
        fbBrand.classList.add("touched");
        setTimeout(() => fbBrand.classList.remove("touched"), 850);
      }
      /* 没有 WebGL 时，在静态镜面上补一圈扩散的涟漪 */
      if (!hasWebgl && !reduced) {
        const el = fallbackMirrorRef.current;
        if (el) {
          const fb = el.getBoundingClientRect();
          if (clientX >= fb.left && clientX <= fb.right && clientY >= fb.top && clientY <= fb.bottom) {
            const ring = document.createElement("span");
            ring.className = "fallback-ring";
            ring.style.left = ((clientX - fb.left) / fb.width * 100) + "%";
            ring.style.top = ((clientY - fb.top) / fb.height * 100) + "%";
            el.append(ring);
            setTimeout(() => ring.remove(), 1250);
          }
        }
      }
      if (reduced && hasWebgl) frame(performance.now());
      if (!reduced) {
        const glyph = document.createElement("span");
        glyph.className = "glyph";
        const chars = ["◌ / ∿", "⟡  ⟐", "∴ · ∽", "∆ ◊ ∿"];
        glyph.textContent = chars[Math.floor(Math.random() * chars.length)];
        glyph.style.left = (x * 100) + "%";
        glyph.style.top = ((1 - y) * 100) + "%";
        wrap.append(glyph);
        setTimeout(() => glyph.remove(), 1120);
      }
    }

    function init(): boolean {
      try {
        gl = canvas.getContext("webgl", {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
          powerPreference: "low-power",
        });
        if (!gl) throw Error("WebGL unsupported");
        const g = gl;
        const vs = compileShader(g, g.VERTEX_SHADER, VERTEX_SHADER);
        const fs = compileShader(g, g.FRAGMENT_SHADER, FRAGMENT_SHADER);
        const program = g.createProgram();
        if (!program) throw Error("createProgram failed");
        g.attachShader(program, vs);
        g.attachShader(program, fs);
        g.linkProgram(program);
        if (!g.getProgramParameter(program, g.LINK_STATUS)) throw Error(g.getProgramInfoLog(program) || "program link failed");
        g.useProgram(program);
        g.deleteShader(vs);
        g.deleteShader(fs);
        g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
        g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), g.STATIC_DRAW);
        const atPos = g.getAttribLocation(program, "aPos");
        g.enableVertexAttribArray(atPos);
        g.vertexAttribPointer(atPos, 2, g.FLOAT, false, 0, 0);
        loc = {
          time: g.getUniformLocation(program, "uTime"),
          size: g.getUniformLocation(program, "uSize"),
          touch: g.getUniformLocation(program, "uTouch[0]"),
          text: g.getUniformLocation(program, "uText"),
          textOn: g.getUniformLocation(program, "uTextOn"),
          mist: g.getUniformLocation(program, "uMist"),
        };
        textTexture = g.createTexture();
        g.enable(g.BLEND);
        g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
        hasWebgl = true;
        updateTextTexture();
        wrap.classList.add("webgl-ready");
        wrap.classList.remove("no-webgl");
        resize();
        return true;
      } catch (e) {
        wrap.classList.add("no-webgl");
        console.warn("苒境镜面使用静态降级：", e instanceof Error ? e.message : e);
        return false;
      }
    }

    /* 进入画布：镜面发亮开门（冻结版动画）→ 到点直接复用 onEnter，不加第二套转场 */
    function enterWorkspace() {
      if (entering) return;
      entering = true;
      root.classList.add("mirror-activated");
      enterTimer = window.setTimeout(() => { onEnterRef.current(); }, reduced ? 20 : 720);
    }

    const onCanvasPointerDown = (e: PointerEvent) => touchAt(e.clientX, e.clientY);
    const onBrandPointerDown = (e: PointerEvent) => touchAt(e.clientX, e.clientY);
    const onBrandClick = (e: MouseEvent) => {
      /* 键盘回车（detail=0）没有指针位置，就在字形中央补一圈涟漪 */
      if (e.detail === 0) {
        const b = canvas.getBoundingClientRect();
        touchAt(b.left + b.width * 0.5, b.top + b.height * 0.53);
      }
      enterWorkspace();
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      hasWebgl = false;
      wrap.classList.remove("webgl-ready");
      wrap.classList.add("no-webgl");
      pause(true);
    };
    const onWindowResize = () => resize();
    const onVisibilityChange = () => pause(document.hidden);

    canvas.addEventListener("pointerdown", onCanvasPointerDown, { passive: true });
    brand?.addEventListener("pointerdown", onBrandPointerDown, { passive: true });
    brand?.addEventListener("click", onBrandClick);
    canvas.addEventListener("webglcontextlost", onContextLost);
    window.addEventListener("resize", onWindowResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (init()) raf = requestAnimationFrame(frame);
    /* 等字体就绪后重画一次镜中字，避免首帧落在替补字体上 */
    if (document.fonts) {
      document.fonts.ready.then(() => updateTextTexture()).catch(() => {});
    }

    return () => {
      if (enterTimer != null) window.clearTimeout(enterTimer);
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      brand?.removeEventListener("pointerdown", onBrandPointerDown);
      brand?.removeEventListener("click", onBrandClick);
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      textDrawRef.current = null;
      const g = gl;
      if (g) {
        try {
          const lose = g.getExtension("WEBGL_lose_context") as WEBGL_lose_context | null;
          lose?.loseContext();
        } catch { /* 释放失败不影响卸载 */ }
      }
    };
  }, []);

  return (
    <div
      className="ran-welcome-page"
      ref={rootRef}
      data-theme={theme}
      data-font={font}
      data-text="inside"
      aria-label="苒境简洁镜面首页：点击镜中品牌进入画布"
    >
      <div className="noise" aria-hidden="true" />
      <div className="stage">
        <div className="mirror-wrap" ref={wrapRef} aria-label="可触碰的液态镜面">
          <div className="ambient" aria-hidden="true" />
          <div className="mirror-border-light" aria-hidden="true" />
          <div className="fallback" ref={fallbackMirrorRef} aria-hidden="true">
            <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ranw-foil" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#e6fbff" />
                  <stop offset=".17" stopColor="#6d8eae" />
                  <stop offset=".4" stopColor="#e9fbff" />
                  <stop offset=".64" stopColor="#1e3046" />
                  <stop offset=".82" stopColor="#b3d0d9" />
                  <stop offset="1" stopColor="#f8ffff" />
                </linearGradient>
                <linearGradient id="ranw-darkfoil">
                  <stop stopColor="#b9dfeb" />
                  <stop offset=".3" stopColor="#192936" />
                  <stop offset=".64" stopColor="#3a5b71" />
                  <stop offset=".87" stopColor="#d4edf5" />
                </linearGradient>
                <radialGradient id="ranw-shimmer">
                  <stop stopColor="#fff" stopOpacity=".8" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
              </defs>
              <g className="fluid-one">
                <path d="M-50 90 C80 -17 189 21 174 121 C154 264 274 262 367 193 C464 119 454 41 482 -34 L455 314 C321 422 211 320 132 352 C37 389 8 489 -63 457Z" fill="url(#ranw-foil)" opacity=".93" />
                <path d="M-85 127 C76 -7 185 27 179 125 C171 239 279 282 372 203" fill="none" stroke="#efffff" strokeOpacity=".85" strokeWidth="9" />
              </g>
              <g className="fluid-two">
                <path d="M-49 517 C16 422 91 358 184 376 C294 398 265 490 367 398 C436 337 447 290 478 263 L468 666 L-36 666Z" fill="url(#ranw-darkfoil)" opacity=".94" />
                <path d="M-40 538 C63 388 146 390 198 399 C278 415 297 464 369 389" fill="none" stroke="#d9f5fc" strokeOpacity=".8" strokeWidth="11" />
              </g>
              <path d="M20 24 C122 5 140 39 113 160 C97 239 179 277 203 356 C228 447 129 520 55 599" stroke="url(#ranw-foil)" strokeWidth="24" strokeLinecap="round" opacity=".56" fill="none" />
              <ellipse cx="342" cy="144" rx="55" ry="210" fill="url(#ranw-shimmer)" opacity=".36" />
            </svg>
            <div className="fallback-brand" ref={fallbackBrandRef} aria-hidden="true"><strong>苒境</strong></div>
          </div>
          <canvas className="mirror-canvas" ref={canvasRef} aria-label="点击或触摸镜面，观察液态扭曲和涟漪" role="img" />
          <button
            className="brand-hotspot"
            ref={brandRef}
            type="button"
            aria-label="点击镜子中的苒境，进入创作空间"
            title="进入苒境"
          />
        </div>
      </div>
    </div>
  );
}
