"use client";

import { runTopBackHandler } from "./lib/globalBack";
import { useState, useEffect, useRef } from "react";
import { CapacitorHttp, Capacitor } from "@capacitor/core";
import CreationLocalRoom from "./components/creation/CreationLocalRoom";
import CreationCloudRoom from "./components/creation/CreationCloudRoom";
import TemplateLibrary from "./TemplateLibrary";
import splashCover from "./assets/splash-cover-original.png";
import ranjingWelcomeInk from "./assets/ranjing-welcome-ink-v1.png";
import { App as CapApp } from "@capacitor/app";
// ✅ 修复：引入真实的图片源接口
import { searchPexels, trendingPexels, searchUnsplash, trendingUnsplash } from "./lib/assetSources";

// ─── 智能 HTTP：原生 App 用 CapacitorHttp，浏览器用 fetch ──────────────
// 这样同一份代码在 iOS 原生（走 WKWebView 原生请求，不受 CORS 限制）
// 和网页/局域网调试（走 fetch）两种环境下都能正常工作。
const USE_NATIVE_HTTP = Capacitor.isNativePlatform();

// API 基址：本地调试走相对路径（同源），生产走 helloranjing.com。
// 具体判断逻辑见 src/lib/apiBase.ts
import { API_BASE } from "./lib/apiBase";

async function apiGet(url: string) {
  if (USE_NATIVE_HTTP) {
    const r = await CapacitorHttp.get({ url });
    return { status: r.status, data: r.data };
  }
  const r = await fetch(url);
  const data = await r.json();
  return { status: r.status, data };
}

async function apiPost(url: string, payload?: any) {
  if (USE_NATIVE_HTTP) {
    const r = await CapacitorHttp.post({
      url, headers: { "Content-Type": "application/json" }, data: payload,
    });
    return { status: r.status, data: r.data };
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await r.json();
  return { status: r.status, data };
}

async function apiDelete(url: string, payload?: any) {
  if (USE_NATIVE_HTTP) {
    const r = await CapacitorHttp.request({
      method: "DELETE", url, headers: { "Content-Type": "application/json" }, data: payload,
    });
    return { status: r.status, data: r.data };
  }
  const r = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await r.json();
  return { status: r.status, data };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "welcome" | "login" | "canvas" | "home" | "create"
  | "profile" | "personal-profile" | "payment-settings" 
  | "message-settings" | "privacy-settings" | "membership-settings" 
  | "account-security" | "membership"
  | "space" | "publish" | "community" | "gallery" 
  | "group" | "house"; // 新增：组局、我的房子

type CreatedOrder = { id: string; productId: number; product: string; icon: string; quantity: number; amount: string; paymentMethod: string; status: string; createdAt: string; deliveryEmail: string; saveDeliveryEmail: boolean; emailDeliveryStatus: "NotConfigured" | "Pending" | "Sent" | "Failed"; deliveredCode?: string; paidAt?: string };

// ✅ 修复：给灵感瀑布图片定义类型，解决 any 报错
type RemoteAsset = {
  id: string;
  src: string;
  thumb: string;
  w: number;
  h: number;
  name: string;
  author?: string;
  url?: string;
};

function BrandWord({ className = "" }: { className?: string }) {
  return <span className={`ran-brand-word ${className}`}>苒境</span>;
}

function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return <div className="ran-welcome-page">
    <img src={ranjingWelcomeInk.src} alt="" aria-hidden="true" className="ran-welcome-ink" />
    <div className="ran-welcome-copy"><h1><BrandWord /></h1><p>山外，还有山。</p></div>
    <button type="button" className="ran-welcome-enter" onClick={onEnter}>进入苒境&nbsp; →</button>
  </div>;
}

function LoginScreen({ onVerified }: { onVerified: (isNew: boolean) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "verifying">("idle");
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState(0);
  const phoneValid = /^1\d{10}$/.test(phone);
  const canEnter = phoneValid && /^\d{6}$/.test(code) && status === "idle";

  useEffect(() => { if (countdown <= 0) return; const timer=window.setInterval(()=>setCountdown((value)=>value-1),1000); return()=>clearInterval(timer); }, [countdown]);

  async function requestCode() {
    if (!phone) { setMessage("请输入手机号"); return; }
    if (!phoneValid) { setMessage("请输入正确的手机号"); return; }
    setStatus("sending"); setMessage("");
    try {
      const response = await CapacitorHttp.post({ url: `${API_BASE}/api/auth/sms/send`, headers: { "Content-Type": "application/json" }, data: { phone } });
      const result = response.data;
      if (response.status < 200 || response.status >= 300) { setMessage(result?.message || "验证码暂时无法发送，请稍后再试"); return; }
      setCountdown(Number(result?.retryAfter) || 60);
    } catch { setMessage("验证码暂时无法发送，请稍后再试"); }
    finally { setStatus("idle"); }
  }

  async function enter() {
    if (!canEnter) return;
    setStatus("verifying"); setMessage("");
    try {
      const response = await CapacitorHttp.post({ url: `${API_BASE}/api/auth/sms/verify`, headers: { "Content-Type": "application/json" }, data: { phone, code } });
      const result = response.data;
      if (response.status < 200 || response.status >= 300) { setMessage(result?.message || "登录服务暂时不可用，请稍后再试"); return; }
      onVerified(Boolean(result?.isNew));
    } catch { setMessage("登录服务暂时不可用，请稍后再试"); }
    finally { setStatus("idle"); }
  }

  return <div className="ran-auth-page">
    <main className="ran-auth-main">
      <header className="ran-auth-brand"><h1><BrandWord /></h1></header>
      <section className="ran-auth-form" aria-label="手机号登录">
        <label><span>手机号</span><input inputMode="numeric" maxLength={11} value={phone} onChange={(event) => { setPhone(event.target.value.replace(/\D/g, "")); setMessage(""); }} placeholder="请输入手机号" /></label>
        <label><span>验证码</span><div className="ran-code-line"><input inputMode="numeric" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setMessage(""); }} placeholder="请输入 6 位验证码" /><button type="button" onClick={requestCode} disabled={status !== "idle" || countdown>0}>{status === "sending" ? "发送中…" : countdown>0 ? `${countdown} 秒` : "获取验证码"}</button></div></label>
        <p className="ran-auth-hint">未注册手机号验证后将自动创建账号</p>
        {message && <p className="ran-auth-message" role="status">{message}</p>}
        <button className="ran-auth-submit" type="button" disabled={!canEnter} onClick={enter}>{status === "verifying" ? "正在进入…" : "进入苒境"}</button>
      </section>
    </main>
    <footer className="ran-auth-footer">登录即表示你已阅读并同意<button type="button">《用户协议》</button>和<button type="button">《隐私政策》</button></footer>
  </div>;
}

function BottomNav({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const tabs = [ { s: "home" as Screen, label: "首页" }, { s: "create" as Screen, label: "创作" }, { s: "profile" as Screen, label: "我的" } ];
  return (
    <nav className="editorial-bottom-nav absolute left-0 right-0 bottom-0 z-[1200] bg-[var(--bg2)] border-t border-[var(--border)]" style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex h-full items-stretch px-2">
        {tabs.map((t) => (
          <button key={t.s} type="button" onClick={() => go(t.s)} className={`editorial-nav-item flex flex-1 items-center justify-center py-3 ${screen === t.s ? "is-active" : ""}`}>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── 空间底部悬浮导航栏（替代侧边栏，释放画面空间） ────────────────────────
function SpaceSidebar({ active, go }: { active: Screen; go: (s: Screen) => void }) {
  const ITEMS: { id: Screen; label: string; icon: string }[] = [
    { id: "space", label: "灵感", icon: "✦" },
    { id: "community", label: "智慧", icon: "🧠" },
    { id: "group", label: "命运", icon: "🎲" },
    { id: "house", label: "房子", icon: "🏠" },
    { id: "canvas", label: "画布", icon: "🎨" },
  ];

  return (
    <div style={{
      position: "fixed", bottom: "calc(20px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)",
      zIndex: 2000, display: "flex", gap: 8, padding: "8px 16px",
      background: "rgba(255, 255, 255, 0.85)", backdropFilter: "blur(12px)",
      borderRadius: 30, boxShadow: "0 8px 32px rgba(74,70,63,.12)", border: "1px solid rgba(74,70,63,.08)"
    }}>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => go(item.id)}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            width: 56, height: 44, border: 0, borderRadius: 22, background: active === item.id ? "#3a352e" : "transparent",
            color: active === item.id ? "#fff" : "#756f68", cursor: "pointer", transition: "all 0.2s"
          }}
        >
          <span style={{ fontSize: 14, marginBottom: 2 }}>{item.icon}</span>
          <span style={{ fontSize: 10, fontWeight: active === item.id ? 600 : 400 }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── 空间首页（灵感瀑布） ──────────────────────────────────────────────────

function SpaceHome({ go, user, onUpgradeVip }: { go: (s: Screen) => void; user: any; onUpgradeVip: () => void }) {
  const isVip = !!user?.isVip;
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [images, setImages] = useState<RemoteAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"pexels" | "unsplash">("pexels");

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 加载推荐或搜索结果
  useEffect(() => {
    let active = true;
    setLoading(true);
    const loader = query.trim() 
      ? (source === "pexels" ? () => searchPexels(query, 24) : () => searchUnsplash(query, 24))
      : (source === "pexels" ? () => trendingPexels(24) : () => trendingUnsplash(24));

    loader()
      .then((list: RemoteAsset[]) => { if (active) setImages(list); })
      .catch(() => { if (active) setImages([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, source]);

  return (
    <div className="trends-home flex-1 flex flex-col overflow-hidden" style={{ background: "#fbfaf7", position: "relative" }}>

      {/* 顶部：灵感瀑布 + 搜索框 */}
      <div className="px-5 pt-[54px] pb-4" style={{ flexShrink: 0, zIndex: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "#3a352e", letterSpacing: "0.2em", textIndent: "0.2em", textAlign: "center", marginBottom: 20, marginTop: 4 }}>
          灵感瀑布
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 20, padding: "10px 16px", border: "1px solid rgba(74,70,63,.08)", boxShadow: "0 2px 8px rgba(74,70,63,.04)" }}>
          <span style={{ fontSize: 14, color: "#a49a8f" }}>🔍</span>
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索你喜欢的图片、颜色或风格" style={{ flex: 1, border: 0, background: "transparent", outline: "none", fontSize: 13, color: "#3a352e" }} />
          {searchInput && <button onClick={() => setSearchInput("")} style={{ border: 0, background: "transparent", color: "#a49a8f", fontSize: 16, padding: 0 }}>×</button>}
        </div>

        <div className="flex gap-3 overflow-x-auto scrollbar-hide pt-4" style={{ flexShrink: 0 }}>
          {[{ id: "pexels", label: "Pexels" }, { id: "unsplash", label: "Unsplash" }].map((s) => (
            <button key={s.id} onClick={() => setSource(s.id as any)} style={{ padding: "6px 14px", borderRadius: 14, border: 0, background: source === s.id ? "#3a352e" : "#f0ede6", color: source === s.id ? "#fff" : "#756f68", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{s.label}</button>
          ))}
          {["治愈", "风景", "静物", "暖色"].map((tag) => (
            <button key={tag} onClick={() => setSearchInput(tag)} style={{ padding: "6px 14px", borderRadius: 14, border: "1px solid rgba(74,70,63,.1)", background: "#fff", color: "#756f68", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{tag}</button>
          ))}
        </div>
      </div>

      {/* 全屏图片瀑布流（左侧留白由最外层 paddingLeft 统一处理） */}
      <div className="trends-feed flex-1 overflow-y-auto px-4 pb-10">
        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#a49a8f", fontSize: 13 }}>正在寻找美的图片…</div>}
        
        {!loading && images.length > 0 && (
          <div style={{ columnCount: 2, columnGap: 10 }}>
            {images.map((img: RemoteAsset) => (
              <div 
                key={img.id} 
                onClick={() => { 
                  if (!isVip) { 
                    if (confirm("使用「灵感瀑布」中的图片属于会员专属特权，是否前往开通？")) onUpgradeVip(); 
                  } else { 
                    alert("已选中该图片，后续将自动插入到您的创作区或房子装修中！"); 
                  } 
                }}
                style={{ display: "block", width: "100%", marginBottom: 10, borderRadius: 14, overflow: "hidden", background: "#f0ede6", position: "relative", cursor: "pointer" }}>
                <img src={img.thumb || img.src} alt={img.name} loading="lazy" style={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ))}
          </div>
        )}
        {!loading && images.length === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: "#a49a8f", fontSize: 13 }}>没有找到相关图片，换个词试试吧</div>}
      </div>
    </div>
  );
}

// ─── 空间里的子页面 ──────────────────────────────────────────────────────────

function SpaceHeader({ title, go }: { title: string; go: (s: Screen) => void }) {
  return (
    <header className="account-page-header">
      <button type="button" onClick={() => go("space")} aria-label="返回空间">‹</button>
      <h1>{title}</h1>
      <span style={{ width: 36 }} />
    </header>
  );
}

function PublishScreen({ go }: { go: (s: Screen) => void }) {
  const [text, setText] = useState("");
  const [posts, setPosts] = useState<{ id: string; text: string; at: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem("ranjing.posts") || "[]"); } catch { return []; }
  });
  function publish() {
    const t = text.trim(); if (!t) return;
    const next = [{ id: `p-${Date.now()}`, text: t, at: Date.now() }, ...posts];
    setPosts(next); try { localStorage.setItem("ranjing.posts", JSON.stringify(next)); } catch {}
    setText("");
  }
  return (
    <div className="account-page" style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}>
      <SpaceHeader title="发布动态" go={go} />
      <main className="personal-profile-form">
        <textarea className="pp-wish-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="记录此刻……" />
        <button type="button" className="account-primary-action" disabled={!text.trim()} onClick={publish}>发布</button>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {posts.map((p) => ( <div key={p.id} style={{ padding: "12px 14px", borderRadius: 10, background: "#fffdfa", border: "1px solid rgba(74,70,63,.1)", fontSize: 13, color: "#4a463f", lineHeight: 1.7 }}>{p.text}</div> ))}
          {posts.length === 0 && <div style={{ fontSize: 12, color: "#b4ada5", textAlign: "center", padding: "24px 0" }}>还没有动态</div>}
        </div>
      </main>
</div>
  );
}

// ─── 人类的智慧（作品最大化 + 头像跟随 + 互动区） ───────────────────────

// 交作业用的原生相册/相机调用。
// 说明：@capacitor/camera 目前不是本工程的依赖（package.json 里没有），
// 因此这里用「动态加载」而不是顶部 import —— 插件装好后无需改代码即自动启用，
// 未安装时优雅降级到网页版 <input type="file">，不会让构建或运行时报错。
type PickedImage = { base64String: string; format: string } | null;

async function pickHomeworkImage(): Promise<PickedImage> {
  try {
    const mod: any = await import(/* webpackIgnore: true */ "@capacitor/camera");
    const image = await mod.Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: mod.CameraResultType.Base64,
      source: mod.CameraSource.Prompt,
      promptLabelHeader: "提交作业",
      promptLabelPhoto: "从相册选择",
      promptLabelPicture: "拍一张",
    });
    return { base64String: image.base64String, format: image.format || "jpeg" };
  } catch (e: any) {
    // 插件未安装 / 原生层不可用 → 回退到网页选图
    if (e?.message === "User cancelled photos app") return null;
    if (e?.code === "UNIMPLEMENTED" || e?.message?.includes("Cannot find module") || e?.message?.includes("not implemented")) {
      return await pickHomeworkImageWeb();
    }
    throw e;
  }
}

function pickHomeworkImageWeb(): Promise<PickedImage> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        resolve({ base64String: raw.split(",")[1] || "", format: "jpeg" });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function CommunityScreen({ go }: { go: (s: Screen) => void }) {
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 拉取真实作品列表
  const fetchWorks = async () => {
    setLoading(true);
    try {
      const response = await apiGet(`${API_BASE}/api/space/works`);
      if (response.status < 200 || response.status >= 300) throw new Error(`服务器返回 ${response.status}`);
      setWorks(response.data?.items || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWorks(); }, []);

  // 2. 真实的关注
  const toggleFollow = async (workId: string, authorId: string, isFollowing: boolean) => {
    setWorks(prev => prev.map(w => w.id === workId ? { ...w, isFollowing: !isFollowing, followers: isFollowing ? w.followers - 1 : w.followers + 1 } : w));
    try {
      const response = isFollowing
        ? await apiDelete(`${API_BASE}/api/space/follow`, { targetUserId: authorId })
        : await apiPost(`${API_BASE}/api/space/follow`, { targetUserId: authorId });
      if (response.status < 200 || response.status >= 300) fetchWorks();
    } catch { fetchWorks(); }
  };

  // 3. 真实的点赞
  const handleLike = async (workId: string) => {
    setWorks(prev => prev.map(w => w.id === workId ? { ...w, likes: w.likes + 1, isLiked: true } : w));
    try {
      const response = await apiPost(`${API_BASE}/api/space/like`, { workId });
      if (response.status < 200 || response.status >= 300) fetchWorks();
    } catch { fetchWorks(); }
  };

  // 4. 真实的临摹（后端返回画布数据，跳入创作区）
  const handleCopyWork = async (workId: string) => {
    try {
      const response = await apiPost(`${API_BASE}/api/space/copy`, { workId });
      if (response.status === 403) {
        alert(response.data?.message || "无法临摹，请先满足条件");
        return;
      }
      if (response.status >= 200 && response.status < 300 && response.data?.docData) {
        localStorage.setItem("ranjing.pendingCopyDoc", JSON.stringify(response.data.docData));
        alert("已获取作品数据，正在进入创作区跟随临摹...");
        go("canvas");
      }
    } catch { alert("网络异常，临摹失败"); }
  };

  // 5. 真实的交作业（Capacitor 相机 + Base64 上传）
  const handleHomework = async (workId: string) => {
    try {
      const image = await pickHomeworkImage();
      if (!image) return; // 用户取消
      const base64Data = `data:image/jpeg;base64,${image.base64String}`;
      const response = await apiPost(`${API_BASE}/api/space/homework`, { workId, image: base64Data, content: "这是我的作业" });
      if (response.status >= 200 && response.status < 300) {
        alert("作业提交成功，等待作者批改！");
        fetchWorks();
      } else { alert(response.data?.message || "提交失败"); }
    } catch (e: any) {
      if (e?.message !== "User cancelled photos app") alert("获取图片失败或提交失败");
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#a49a8f" }}>正在加载作品...</div>;
  if (error) return (
    <div style={{ padding: 40, textAlign: "center", color: "#b76e61" }}>
      <div style={{ marginBottom: 16 }}>{error}</div>
      <button type="button" onClick={fetchWorks} style={{ height: 36, padding: "0 18px", borderRadius: 10, border: "1px solid rgba(74,70,63,.15)", background: "#fff", color: "#756f68", fontSize: 13 }}>重试</button>
    </div>
  );

  return (
    <div className="account-page" style={{ background: "#fbfaf7", paddingBottom: "calc(100px + env(safe-area-inset-bottom))" }}>

      <header className="account-page-header" style={{ position: "sticky", top: 0, background: "rgba(251,250,247,0.95)", backdropFilter: "blur(8px)", zIndex: 10 }}>
        <button type="button" onClick={() => go("space")} aria-label="返回空间">‹</button>
        <h1>人类的智慧</h1>
        <span style={{ width: 36 }} />
      </header>

      <main style={{ padding: "12px 16px" }}>
        {/* 发布入口（保留，但要精致一点） */}
        <button onClick={() => go("publish")} style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid rgba(74,70,63,.1)", background: "#fff", color: "#5f554d", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 2px 8px rgba(0,0,0,.02)" }}>
          ✏️ 发布作品 / 分享智慧
        </button>

        {works.map((work) => (
          <div key={work.id} style={{ marginBottom: 40 }}>

            {/* 1. 作品最大化呈现 + 悬浮作者信息 */}
            <div style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", background: "#f0ede6" }}>
              <img src={work.image} alt={work.title} style={{ width: "100%", height: "auto", display: "block" }} />

              {/* 底部渐变遮罩，确保文字清晰可见 */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }} />

              {/* 右下角悬浮：作者信息与跟随 */}
              <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <img src={work.authorAvatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #fff" }} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{work.authorName}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)" }}>{work.followers} 粉丝</span>
                  </div>
                </div>

                <button
                  onClick={() => toggleFollow(work.id, work.authorId, !!work.isFollowing)}
                  style={{ padding: "6px 14px", borderRadius: 16, border: "none", background: work.isFollowing ? "rgba(255,255,255,0.3)" : "#fff", color: work.isFollowing ? "#fff" : "#3a352e", fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(4px)" }}
                >
                  {work.isFollowing ? "已跟随" : "+ 跟随"}
                </button>
              </div>
            </div>

            {/* 2. 作品信息与临摹状态 */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#3a352e" }}>{work.title}</div>
              {/* 后端返回的临摹规则可能是空值，这里做安全兜底 */}
              <button
                onClick={() => handleCopyWork(work.id)}
                style={{ fontSize: 11, color: (work.copyRule || "").includes("粉丝") ? "#7a9e7e" : "#b76e61", background: (work.copyRule || "").includes("粉丝") ? "#eef3ee" : "#fdf0ee", padding: "3px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,.05)", cursor: "pointer" }}
              >
                {(work.copyRule || "").includes("粉丝") ? "🟢" : "🔒"} {work.copyRule || "暂不可临摹"}
              </button>
            </div>

            {/* 3. 互动按钮组 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingBottom: 12, borderBottom: "1px solid rgba(74,70,63,.06)", color: "#756f68", fontSize: 12 }}>
              <button onClick={() => handleLike(work.id)} style={{ border: 0, background: "transparent", color: work.isLiked ? "#c96a5e" : "inherit", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                {work.isLiked ? "❤️" : "🤍"} {work.likes}
              </button>
              <button style={{ border: 0, background: "transparent", color: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                💬 {work.comments ?? 0}
              </button>
              <button style={{ border: 0, background: "transparent", color: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                🗣️ {work.discussing ?? 0}
              </button>
              <button style={{ border: 0, background: "transparent", color: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                🔔 催更
              </button>
              <button style={{ border: 0, background: "transparent", color: "#5f554d", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                📝 交作业 {work.homeworkCount ?? 0}
              </button>
            </div>

            {/* 4. 评论区（交作业与作者批改）—— 数据来自后端，不再写死 */}
            <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(74,70,63,.06)" }}>
              <div style={{ fontSize: 12, color: "#a49a8f", marginBottom: 8 }}>正在讨论 · {work.discussing ?? 0} 人参与</div>

              {(work.homeworkList || []).length === 0 && (
                <div style={{ fontSize: 12, color: "#c4bdb4", padding: "8px 0" }}>还没有人交作业，来做第一个吧</div>
              )}

              {(work.homeworkList || []).map((hw: any, index: number) => (
                <div key={hw.id || index} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <img src={hw.userAvatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#4a463f" }}><span style={{ fontWeight: 600 }}>{hw.userName}</span> 交作业：{hw.content}</div>
                    <img src={hw.image} alt="作业" style={{ marginTop: 6, height: 60, width: 80, objectFit: "cover", borderRadius: 6 }} />
                    {hw.authorReply && (
                      <div style={{ marginTop: 6, padding: "6px 8px", background: "#fbfaf7", borderRadius: 8, border: "1px solid rgba(74,70,63,.08)", fontSize: 11, color: "#5f554d" }}>
                        <span style={{ fontWeight: 600 }}>作者回复：</span>{hw.authorReply}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* 交作业按钮 */}
              <button
                onClick={() => handleHomework(work.id)}
                style={{ width: "100%", height: 32, borderRadius: 8, border: "1px dashed rgba(74,70,63,.2)", background: "transparent", color: "#756f68", fontSize: 12, marginTop: 4 }}
              >
                + 我也要交作业
              </button>
            </div>

          </div>
        ))}
      </main>
    </div>
  );
}

// ─── 虚拟形象定义（软糯果冻风） ───────────────────────────────────────

const AVATAR_OPTIONS = [
  { id: "biped_peach", label: "软糯桃桃", type: "biped", color: "#F4C2A8" },
  { id: "biped_mint", label: "薄荷奶糖", type: "biped", color: "#A8D8C2" },
  { id: "biped_lavender", label: "香芋啵啵", type: "biped", color: "#C2B8E0" },
  { id: "quad_caramel", label: "焦糖跑跑", type: "quadruped", color: "#D4A373" },
  { id: "quad_cloud", label: "云朵滚滚", type: "quadruped", color: "#E0E0E0" },
];

// 遥控器模式的中文名（后端返回的 mode 是英文 key）
const MODE_LABELS: Record<string, string> = {
  movie: "电影播放",
  entertainment: "娱乐联欢",
  meeting: "会议白板",
  teaching: "教学课堂",
  demo: "作品演示",
};

// ─── 软糯 Q 版小人组件 ──────────────────────────────────────────

function ChibiAvatar({ user, isSpeaking }: { user: any; isSpeaking: boolean }) {
  const bounceAnim = isSpeaking ? "chibiSpeak 0.5s infinite alternate ease-in-out" : "none";
  const walkAnim = isSpeaking ? "chibiWalk 0.6s infinite linear" : "none";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 64 }}>
      <div style={{ position: "relative", height: 56, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: bounceAnim, transformOrigin: "bottom center" }}>
        
        {user.avatarType === "biped" && (
          <div style={{ position: "relative", width: 36, height: 48 }}>
            <div style={{ position: "absolute", bottom: 0, left: 6, width: 8, height: 14, borderRadius: 4, background: user.avatarColor, animation: walkAnim }} />
            <div style={{ position: "absolute", bottom: 0, right: 6, width: 8, height: 14, borderRadius: 4, background: user.avatarColor, animation: walkAnim }} />
            <div style={{ position: "absolute", bottom: 10, left: 2, width: 32, height: 28, borderRadius: "40% 40% 50% 50%", background: user.avatarColor, boxShadow: "inset -4px -4px 8px rgba(0,0,0,0.05)" }} />
            <div style={{ position: "absolute", bottom: 22, left: -4, width: 8, height: 18, borderRadius: 4, background: user.avatarColor, transform: "rotate(15deg)" }} />
            <div style={{ position: "absolute", bottom: 22, right: -4, width: 8, height: 18, borderRadius: 4, background: user.avatarColor, transform: "rotate(-15deg)" }} />

            {/* 镂空头部（放置头像） */}
            <div style={{ position: "absolute", top: 0, left: 4, width: 28, height: 28, borderRadius: "50%", border: `3px solid ${user.avatarColor}`, background: "#fbfaf7", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "#a49a8f" }}>{user.nickname[0]}</span>}
            </div>
          </div>
        )}

        {user.avatarType === "quadruped" && (
          <div style={{ position: "relative", width: 48, height: 36 }}>
            <div style={{ position: "absolute", bottom: 8, left: 4, width: 36, height: 20, borderRadius: "20px 20px 10px 10px", background: user.avatarColor }} />
            <div style={{ position: "absolute", bottom: 0, left: 8, width: 6, height: 12, borderRadius: 3, background: user.avatarColor, animation: walkAnim }} />
            <div style={{ position: "absolute", bottom: 0, left: 18, width: 6, height: 12, borderRadius: 3, background: user.avatarColor, animation: walkAnim, animationDelay: "0.15s" }} />
            <div style={{ position: "absolute", bottom: 0, right: 18, width: 6, height: 12, borderRadius: 3, background: user.avatarColor, animation: walkAnim, animationDelay: "0.3s" }} />
            <div style={{ position: "absolute", bottom: 0, right: 8, width: 6, height: 12, borderRadius: 3, background: user.avatarColor, animation: walkAnim, animationDelay: "0.45s" }} />
            <div style={{ position: "absolute", top: -2, right: 2, width: 24, height: 24, borderRadius: "50%", border: `3px solid ${user.avatarColor}`, background: "#fbfaf7", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, color: "#a49a8f" }}>{user.nickname[0]}</span>}
            </div>
            <div style={{ position: "absolute", top: 10, left: -2, width: 8, height: 8, borderRadius: "50%", background: user.avatarColor }} />
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: "#756f68", whiteSpace: "nowrap" }}>{user.nickname}</span>
    </div>
  );
}

// ─── 命运的随机性（房间 + 遥控器 + 模式选择） ──────────────────────

function GroupSessionScreen({ go }: { go: (s: Screen) => void }) {
  const [stage, setStage] = useState<"lobby" | "room" | "select-avatar">("lobby");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<string | null>(null);
  const [hasRemote, setHasRemote] = useState(false);
  const [isScreenUp, setIsScreenUp] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [maxUsers, setMaxUsers] = useState(4);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
  const [busy, setBusy] = useState(false);

  // 1. 创建房间（真实接口：随机匹配或开房）
  const enterRoom = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await apiPost(`${API_BASE}/api/room/match`, { maxUsers });
      if (response.status >= 200 && response.status < 300 && response.data?.roomId) {
        setRoomId(response.data.roomId);
        setStage("select-avatar");
      } else { alert(response.data?.message || "匹配失败"); }
    } catch { alert("网络异常，匹配失败"); }
    finally { setBusy(false); }
  };

  // 2. 加入房间（真实接口）
  const confirmAvatar = async () => {
    if (!roomId || busy) return;
    setBusy(true);
    try {
      const response = await apiPost(`${API_BASE}/api/room/join`, { roomId, avatarType: selectedAvatar.type, avatarColor: selectedAvatar.color });
      if (response.status >= 200 && response.status < 300) {
        setUsers(response.data.room?.users || []);
        setStage("room");
      } else { alert(response.data?.message || "加入房间失败"); }
    } catch { alert("网络异常，加入房间失败"); }
    finally { setBusy(false); }
  };

  // 3. 遥控器模式切换（真实接口）
  const handleSelectMode = async (mode: string) => {
    setSessionMode(mode);
    setIsScreenUp(true);
    setHasRemote(true);
    try {
      await apiPost(`${API_BASE}/api/room/mode`, { roomId, mode });
    } catch { /* 广播失败不阻塞本地交互 */ }
  };

  // 4. 轮询拉取房间状态（每 3 秒同步一次，替代 WebSocket）
  useEffect(() => {
    if (stage !== "room" || !roomId) return;
    const sync = async () => {
      try {
        const response = await apiGet(`${API_BASE}/api/room/status?roomId=${roomId}`);
        if (response.status === 200 && response.data?.room) {
          setUsers(response.data.room.users || []);
          if (response.data.room.mode) { setSessionMode(response.data.room.mode); setHasRemote(true); }
          if (response.data.room.isScreenUp !== undefined) setIsScreenUp(response.data.room.isScreenUp);
        }
      } catch { /* 单次轮询失败忽略，下个周期重试 */ }
    };
    const timer = setInterval(sync, 3000);
    return () => clearInterval(timer);
  }, [stage, roomId]);

  const leaveRoom = () => { setStage("lobby"); setUsers([]); setSessionMode(null); setIsScreenUp(false); setRoomId(null); setHasRemote(false); setIsLandscape(false); };

  return (
    <div className="account-page" style={{ background: "#fbfaf7", paddingBottom: "calc(100px + env(safe-area-inset-bottom))" }}>
      
      <header className="account-page-header" style={{ position: "sticky", top: 0, background: "rgba(251,250,247,0.95)", backdropFilter: "blur(8px)", zIndex: 10 }}>
        <button type="button" onClick={() => { leaveRoom(); go("space"); }} aria-label="返回空间">‹</button>
        <h1>命运的随机性</h1>
        <span style={{ width: 36 }} />
      </header>

      {/* 1. 大厅：随机匹配 & 人数设置 */}
      {stage === "lobby" && (
        <main className="personal-profile-form">
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: "1px solid rgba(74,70,63,.08)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎲</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#3a352e", marginBottom: 8 }}>命运的骰子</div>
            <div style={{ fontSize: 13, color: "#a49a8f", lineHeight: 1.6, marginBottom: 20 }}>随机匹配陌生人，或邀请好友。一起看电影、开会、画画。</div>
            
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: "#756f68" }}>房间人数上限：</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setMaxUsers(Math.max(2, maxUsers - 1))} style={{ width: 28, height: 28, borderRadius: 14, border: "1px solid #ddd", background: "#fff" }}>-</button>
                <span style={{ fontSize: 16, fontWeight: 600, color: "#3a352e", width: 20, textAlign: "center" }}>{maxUsers}</span>
                <button onClick={() => setMaxUsers(Math.min(10, maxUsers + 1))} style={{ width: 28, height: 28, borderRadius: 14, border: "1px solid #ddd", background: "#fff" }}>+</button>
              </div>
            </div>

            <button onClick={enterRoom} disabled={busy} style={{ width: "100%", height: 48, borderRadius: 12, border: 0, background: busy ? "#c4bdb4" : "#5f554d", color: "#fff", fontSize: 15, marginBottom: 10, cursor: busy ? "default" : "pointer" }}>
              {busy ? "匹配中..." : "随机匹配"}
            </button>
            <button onClick={enterRoom} disabled={busy} style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid #5f554d", background: "transparent", color: "#5f554d", fontSize: 15, cursor: busy ? "default" : "pointer" }}>
              邀请好友（创建房间）
            </button>
          </div>
        </main>
      )}

      {/* 2. 选择形象 */}
      {stage === "select-avatar" && (
        <main className="personal-profile-form">
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#3a352e", marginBottom: 8 }}>挑选你的虚拟形象</div>
            <div style={{ fontSize: 12, color: "#a49a8f" }}>进入房间后，你的头像会显示在小人的脸上</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {AVATAR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedAvatar(opt)}
                style={{
                  padding: "16px 8px", borderRadius: 16, border: selectedAvatar.id === opt.id ? "2px solid #5f554d" : "1px solid rgba(74,70,63,.1)",
                  background: selectedAvatar.id === opt.id ? "#f1ece4" : "#fff", 
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  transition: "all 0.2s"
                }}
              >
                {/* 预览小人 */}
                <div style={{ height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <ChibiAvatar 
                    user={{ avatarType: opt.type, avatarColor: opt.color, nickname: "我", avatarUrl: "" }} 
                    isSpeaking={false} 
                  />
                </div>
                <span style={{ fontSize: 12, color: "#4a463f", fontWeight: selectedAvatar.id === opt.id ? 600 : 400 }}>{opt.label}</span>
              </button>
            ))}
          </div>
          <button onClick={confirmAvatar} disabled={busy} style={{ width: "100%", height: 48, borderRadius: 12, border: 0, background: busy ? "#c4bdb4" : "#5f554d", color: "#fff", fontSize: 15, cursor: busy ? "default" : "pointer" }}>
            {busy ? "进入中..." : "确认进入房间"}
          </button>
        </main>
      )}

      {/* 3. 房间 */}
      {stage === "room" && (
        <main className="personal-profile-form" style={{ position: "relative" }}>
          
          {/* 房间头部：在线人数 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#756f68" }}>在线人数：{users.length} / {maxUsers}</div>
            <button onClick={leaveRoom} style={{ fontSize: 12, color: "#b76e61", background: "transparent", border: 0 }}>退出房间</button>
          </div>

          {/* 房间舞台（白板/投影区） */}
          <div style={{
            height: isLandscape ? 200 : 320,
            borderRadius: 16, background: "#ece6dd", marginBottom: 20,
            position: "relative", overflow: "hidden", border: "1px solid rgba(74,70,63,.08)",
            transition: "height 0.5s ease"
          }}>
            
            {/* 屏幕升起动画 */}
            {isScreenUp && (
              <div style={{
                position: "absolute", bottom: "10%", left: "50%", transform: "translateX(-50%)",
                width: isLandscape ? "90%" : "80%", height: "70%",
                background: sessionMode === "meeting" ? "rgba(255,255,255,0.9)" : "#fff",
                borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,.2)",
                animation: "screenRise 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                color: "#5f554d", fontSize: 12, overflow: "hidden"
              }}>
                {sessionMode === "meeting" && (
                  /* 会议模式：白板网格 */
                  <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #ccc 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                )}
                <span style={{ zIndex: 1 }}>{sessionMode === "meeting" ? "会议白板" : "视频同步播放中..."}</span>
              </div>
            )}

            {!isScreenUp && !hasRemote && (
              <div style={{ position: "absolute", top: "40%", left: 0, right: 0, textAlign: "center", color: "#a49a8f", fontSize: 13 }}>
                房间里空荡荡的，你发现桌上有一个遥控器。
                <div style={{ marginTop: 12, fontSize: 24 }}>🎮</div>
              </div>
            )}
            {!isScreenUp && hasRemote && (
              <div style={{ position: "absolute", top: "40%", left: 0, right: 0, textAlign: "center", color: "#a49a8f", fontSize: 13 }}>请在遥控器上选择模式...</div>
            )}
          </div>

          {/* Q版小人（数据来自 /api/room/status 轮询） */}
          <div style={{ display: "flex", gap: 16, overflowX: "auto", padding: "10px 0", marginBottom: 20, minHeight: 80 }}>
            {users.length === 0 && (
              <div style={{ fontSize: 13, color: "#c4bdb4", padding: "20px 0" }}>正在同步房间成员...</div>
            )}
            {users.map(u => (
              <ChibiAvatar
                key={u.id}
                user={{
                  avatarType: u.avatarType || "biped",
                  avatarColor: u.avatarColor || "#A8D8C2",
                  nickname: u.nickname || "朋友",
                  avatarUrl: u.avatarUrl || "",
                }}
                isSpeaking={!!u.isSpeaking}
              />
            ))}
          </div>

          {/* 🚨 关键点：让遥控器显眼地出现 */}
          {!hasRemote && (
            <button onClick={() => setHasRemote(true)} style={{ width: "100%", height: 60, borderRadius: 12, border: "2px dashed rgba(74,70,63,.2)", background: "#fff", color: "#756f68", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
              🎮 拿起桌上的遥控器
            </button>
          )}

          {/* 遥控器面板（选择模式） */}
          {hasRemote && !isScreenUp && (
            <div style={{ padding: 20, background: "#fff", borderRadius: 16, border: "1px solid rgba(74,70,63,.08)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#3a352e", textAlign: "center" }}>🎮 遥控器 · 选择模式</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { id: "movie", label: "电影", icon: "🎬" },
                  { id: "entertainment", label: "娱乐", icon: "🎤" },
                  { id: "meeting", label: "会议", icon: "📋" },
                  { id: "teaching", label: "教学", icon: "📖" },
                  { id: "demo", label: "演示", icon: "🖥️" },
                ].map((mode) => (
                  <button key={mode.id} onClick={() => handleSelectMode(mode.id)} style={{ padding: "16px 0", borderRadius: 10, border: sessionMode === mode.id ? "2px solid #5f554d" : "1px solid rgba(74,70,63,.1)", background: sessionMode === mode.id ? "#f1ece4" : "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <span style={{ fontSize: 20 }}>{mode.icon}</span>
                    <span style={{ fontSize: 12, color: "#4a463f" }}>{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 屏幕升起后的控制面板 */}
          {hasRemote && isScreenUp && (
            <div style={{ padding: 20, background: "#fff", borderRadius: 16, border: "1px solid rgba(74,70,63,.08)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#3a352e", textAlign: "center" }}>🎮 遥控器 · {MODE_LABELS[sessionMode || ""] || "已连接"}</div>
              <button onClick={() => setIsLandscape(!isLandscape)} style={{ height: 44, borderRadius: 10, border: 0, background: "#C9A87C", color: "#fff", fontSize: 14 }}>{isLandscape ? "切换竖屏" : "切换横屏"}</button>
              <button onClick={() => { setIsScreenUp(false); setSessionMode(null); }} style={{ height: 44, borderRadius: 10, border: "1px solid rgba(74,70,63,.15)", background: "#fff", color: "#756f68", fontSize: 14 }}>收起屏幕</button>
            </div>
          )}
        </main>
      )}

      <style>{`
        @keyframes screenRise { 0% { transform: translateX(-50%) translateY(200px); opacity: 0; } 100% { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @keyframes chibiSpeak { 0% { transform: scaleY(1) scaleX(1); } 50% { transform: scaleY(0.95) scaleX(1.05); } 100% { transform: scaleY(1.05) scaleX(0.95); } }
        @keyframes chibiWalk { 0% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(5deg); } 100% { transform: translateY(0) rotate(0deg); } }
      `}</style>
    </div>
  );
}

// ─── 我的房子（3D 个人空间） ────────────────────────────────────────────────────

function MyHouseScreen({ go, user }: { go: (s: Screen) => void, user: any }) {
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const movedRef = useRef(false);

  const [wallpaper, setWallpaper] = useState<string>("");
  const [frameImage, setFrameImage] = useState<string>("");
  const [doorImage, setDoorImage] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ranjing.house");
      if (raw) {
        const h = JSON.parse(raw);
        setWallpaper(h.wallpaper || "");
        setFrameImage(h.frameImage || "");
        setDoorImage(h.doorImage || "");
      }
    } catch {}
  }, []);

  const saveHouse = (patch: { wallpaper?: string; frameImage?: string; doorImage?: string }) => {
    const next = { wallpaper, frameImage, doorImage, ...patch };
    try { localStorage.setItem("ranjing.house", JSON.stringify(next)); } catch {}
  };

  const W = 380;
  const H = 480;
  const D = 780;

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(ellipse at 50% 50%, #221c15 0%, #0e0b08 100%)",
        overflow: "hidden", touchAction: "none",
        userSelect: "none", WebkitUserSelect: "none",
        perspective: "700px", perspectiveOrigin: "50% 44%",
        cursor: dragging ? "grabbing" : "grab",
      }}
      onPointerDown={(e) => {
        dragRef.current = { x: e.clientX, y: e.clientY, sx: rotate.x, sy: rotate.y };
        movedRef.current = false;
        setDragging(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        if (Math.hypot(dx, dy) > 6) movedRef.current = true;
        setRotate({
          x: Math.max(-12, Math.min(12, dragRef.current.sx - dy * 0.07)),
          y: Math.max(-22, Math.min(22, dragRef.current.sy + dx * 0.13)),
        });
      }}
      onPointerUp={() => { setDragging(false); setRotate({ x: 0, y: 0 }); }}
      onPointerCancel={() => { setDragging(false); setRotate({ x: 0, y: 0 }); }}
    >
      <div
        style={{
          position: "absolute", left: "50%", top: "50%",
          width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2,
          transformStyle: "preserve-3d",
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
          transition: dragging ? "none" : "transform 0.7s cubic-bezier(0.34, 1.2, 0.36, 1)",
        }}
      >
        {/* 后墙 */}
        <div
          style={{
            position: "absolute", left: "50%", top: "50%", width: W, height: H,
            marginLeft: -W / 2, marginTop: -H / 2, transform: `translateZ(-310px)`,
            background: "radial-gradient(ellipse at 50% 45%, #f3ecdc 0%, #ded2b8 70%, #c9b89a 100%)",
            boxShadow: "inset 0 0 140px rgba(120,95,70,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (movedRef.current) return;
              // 长按换门，短按进社区
              if (e.type === "contextmenu") return;
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = () => {
                const f = input.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const url = r.result as string;
                  setDoorImage(url);
                  saveHouse({ doorImage: url });
                };
                r.readAsDataURL(f);
              };
              input.click();
            }}
            style={{
              width: 96, height: 190, border: 0, padding: 0,
              borderRadius: "48px 48px 0 0",
              background: doorImage
                ? `url(${doorImage}) center/cover no-repeat`
                : "linear-gradient(180deg, #8b6b46 0%, #5a3f26 60%, #3d2a17 100%)",
              boxShadow: "0 12px 30px rgba(40,25,12,0.5), inset 0 0 0 3px #3d2a17, inset 0 0 40px rgba(0,0,0,0.35)",
              cursor: "pointer", position: "relative",
            }}
          >
            {!doorImage && (
              <span style={{
                position: "absolute", right: 14, top: "52%", width: 8, height: 8, borderRadius: "50%",
                background: "radial-gradient(circle at 30% 30%, #f5d9a4 0%, #a47c46 70%)",
                boxShadow: "0 0 6px rgba(240,201,137,0.6)",
              }} />
            )}
          </button>
        </div>

        {/* 左墙 */}
        <div
          style={{
            position: "absolute", left: "50%", top: "50%", width: D, height: H,
            marginLeft: -D / 2, marginTop: -H / 2,
            transform: `translateX(${-W / 2}px) rotateY(90deg)`,
            background: "linear-gradient(90deg, #c9b89a 0%, #d8cbb0 70%, #e0d4bc 100%)",
            boxShadow: "inset 0 0 80px rgba(90,70,50,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); if (movedRef.current) return; go("space"); }}
            style={{
              width: 130, height: 170, border: 0, padding: 0, borderRadius: 8,
              background: "linear-gradient(180deg, #bcd7e8 0%, #e8d9b8 100%)",
              boxShadow: "inset 0 0 0 6px #8b6b46, inset 0 0 0 8px #5a3f26, 0 4px 16px rgba(40,25,12,0.35)",
              cursor: "pointer", position: "relative",
            }}
          >
            <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#5a3f26", transform: "translateX(-50%)" }} />
            <span style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "#5a3f26", transform: "translateY(-50%)" }} />
          </button>
        </div>

        {/* 右墙 - 画框 */}
        <div
          style={{
            position: "absolute", left: "50%", top: "50%", width: D, height: H,
            marginLeft: -D / 2, marginTop: -H / 2,
            transform: `translateX(${W / 2}px) rotateY(-90deg)`,
            background: "linear-gradient(270deg, #c9b89a 0%, #d8cbb0 70%, #e0d4bc 100%)",
            boxShadow: "inset 0 0 80px rgba(90,70,50,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (movedRef.current) return;
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = () => {
                const f = input.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const url = r.result as string;
                  setFrameImage(url);
                  saveHouse({ frameImage: url });
                };
                r.readAsDataURL(f);
              };
              input.click();
            }}
            style={{
              width: 150, height: 110, border: 0, padding: 0, borderRadius: 4,
              background: frameImage
                ? `url(${frameImage}) center/cover no-repeat`
                : "linear-gradient(135deg, #e8d9b8 0%, #c9a87c 100%)",
              boxShadow: "inset 0 0 0 5px #8b6b46, inset 0 0 0 7px #3d2a17, 0 4px 16px rgba(40,25,12,0.35)",
              cursor: "pointer",
            }}
          />
        </div>

        {/* 地板 */}
        <div
          style={{
            position: "absolute", left: "50%", top: "50%", width: W, height: D,
            marginLeft: -W / 2, marginTop: -D / 2,
            transform: `translateY(${H / 2}px) rotateX(90deg)`,
            background: "linear-gradient(180deg, #a18166 0%, #7d6247 60%, #5f4a34 100%)",
            boxShadow: "inset 0 0 120px rgba(20,12,6,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); if (movedRef.current) return; go("group"); }}
            style={{
              width: 200, height: 240, border: 0, padding: 0, borderRadius: "50%",
              background: "radial-gradient(circle at center, #b8543e 0%, #8a3a28 70%, #5a2418 100%)",
              boxShadow: "inset 0 0 0 8px #3d2a17, inset 0 0 60px rgba(0,0,0,0.35), 0 0 40px rgba(0,0,0,0.3)",
              cursor: "pointer",
            }}
          />
        </div>

        {/* 天花板 */}
        <div
          style={{
            position: "absolute", left: "50%", top: "50%", width: W, height: D,
            marginLeft: -W / 2, marginTop: -D / 2,
            transform: `translateY(${-H / 2}px) rotateX(-90deg)`,
            background: "linear-gradient(180deg, #f6f0e0 0%, #ece0c6 100%)",
            boxShadow: "inset 0 0 80px rgba(120,95,70,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            width: 70, height: 70, borderRadius: "50%",
            background: "radial-gradient(circle at center, #fff2cc 0%, #d4a96a 60%, #8b6b46 100%)",
            boxShadow: "0 0 60px 20px rgba(255,235,180,0.45), inset 0 0 20px rgba(255,240,200,0.6)",
          }} />
        </div>
      </div>

      <div
        style={{
          position: "absolute", left: 0, right: 0,
          bottom: "calc(env(safe-area-inset-bottom) + 26px)",
          textAlign: "center",
          color: "rgba(240,228,208,0.55)",
          fontSize: 11, letterSpacing: "0.32em", textIndent: "0.32em",
          fontFamily: '"Songti SC", "STSong", "Noto Serif SC", serif',
          pointerEvents: "none",
        }}
      >
        拖动屏幕 · 环顾四周
      </div>
    </div>
  );
}

function GalleryScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="account-page" style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}>
      <SpaceHeader title="作品展示" go={go} />
      <main className="personal-profile-form"><div style={{ fontSize: 12, color: "#b4ada5", textAlign: "center", padding: "40px 0" }}>作品陈列区</div></main>
</div>
  );
}

function SaveTargetScreen({ go }: { go: (s: Screen) => void }) {
  const [stage, setStage] = useState<"target" | "templates" | "room">("target");
  const [saveTarget, setSaveTarget] = useState<"local" | "cloud" | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  if (stage === "room" && selectedTemplate) {
    const sharedProps = { initialText: selectedTemplate.initialText, docKey: `template-${selectedTemplate.id}`, onBack: () => setStage("templates"), onEnterSpace: () => go("space") };
    return saveTarget === "cloud" ? <CreationCloudRoom {...sharedProps} /> : <CreationLocalRoom {...sharedProps} />;
  }
  if (stage === "templates" && saveTarget) {
    return <TemplateLibrary mode={saveTarget} isVip={false} onBack={() => setStage("target")} onUseTemplate={(t: any) => { setSelectedTemplate(t); setStage("room"); }} onUpgradeVip={() => go("membership")} />;
  }
  return (
    <div className="create-page flex-1 flex flex-col overflow-hidden">
      <header className="account-page-header"><button type="button" onClick={() => go("space")} aria-label="返回空间">‹</button><h1>保存在哪里？</h1><span style={{ width: 36 }} /></header>
      <main className="create-save-target">
        <div className="create-save-heading"><h1>保存在哪里？</h1><p>本地无需登录，云端可以跨设备同步</p></div>
        <div className="create-save-cards">
          <button type="button" className="create-save-card" onClick={() => { setSaveTarget("local"); setStage("templates"); }}><span className="create-save-icon">▣</span><strong>本地创作</strong><small>文件保存在当前设备</small></button>
          <button type="button" className="create-save-card" onClick={() => { setSaveTarget("cloud"); setStage("templates"); }}><span className="create-save-icon">☁</span><strong>云端创作</strong><small>支持跨设备同步</small></button>
        </div>
      </main>
</div>
  );
}

// ─── 个人中心相关页面（保持原样） ────────────────────────────────────────────────

type PersonalProfile = { name: string; bio: string; gender: string; birthday: string; wish: string };
const DEFAULT_PERSONAL_PROFILE: PersonalProfile = { name: "好技友", bio: "", gender: "", birthday: "", wish: "" };
function loadPersonalProfile(): PersonalProfile {
  if (typeof window === "undefined") return DEFAULT_PERSONAL_PROFILE;
  try { return { ...DEFAULT_PERSONAL_PROFILE, ...JSON.parse(localStorage.getItem("ranjingPersonalProfile") || "{}") }; } catch { return DEFAULT_PERSONAL_PROFILE; }
}

function ProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState<PersonalProfile>(loadPersonalProfile);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  useEffect(() => { setProfile(loadPersonalProfile()); try { setAvatarUrl(localStorage.getItem("ranjingUserAvatar") || ""); } catch { setAvatarUrl(""); } }, [refreshKey]);
  useEffect(() => { function handleFocus() { setRefreshKey((k) => k + 1); } window.addEventListener("focus", handleFocus); return () => window.removeEventListener("focus", handleFocus); }, []);
  const accountItems: { label: string; screen: Screen }[] = [
    { label: "个人资料", screen: "personal-profile" }, { label: "支付方式", screen: "payment-settings" }, { label: "消息通知", screen: "message-settings" }, { label: "隐私设置", screen: "privacy-settings" }, { label: "会员设置", screen: "membership-settings" }, { label: "账号与安全", screen: "account-security" },
  ];
  return (
    <div className="profile-page flex-1 flex flex-col overflow-hidden">
      <div className="profile-scroll flex-1 overflow-y-auto scrollbar-hide">
        <section className="profile-identity">
          <div className="profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="用户头像" className="absolute inset-0 w-full h-full object-cover" /> : <img src={splashCover.src} alt="用户原创手绘头像" className="absolute inset-0 w-full h-full object-cover" />}</div>
          <div className="profile-copy"><div className="profile-name">{profile.name}</div><div className="profile-bio">{profile.bio || "还没有简介"}</div></div>
        </section>
        <div className="profile-directory">
          {accountItems.map((item) => (
            <button key={item.label} onClick={() => { go(item.screen); setRefreshKey((k) => k + 1); }} className="profile-directory-item"><span>{item.label}</span><span className="profile-directory-arrow">›</span></button>
          ))}
        </div>
      </div>
</div>
  );
}

function AccountPageHeader({ title, go }: { title: string; go: (s: Screen) => void }) {
  return <header className="account-page-header"><button type="button" onClick={() => go("profile")} aria-label="返回我的">‹</button><h1>{title}</h1><span /></header>;
}

function PersonalProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [profile, setProfile] = useState<PersonalProfile>(loadPersonalProfile);
  const [showSaved, setShowSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>(() => { try { return localStorage.getItem("ranjingUserAvatar") || ""; } catch { return ""; } });
  const fileInputRef = useRef<HTMLInputElement>(null);
  function handleAvatarPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const url = reader.result as string; setAvatarUrl(url); try { localStorage.setItem("ranjingUserAvatar", url); } catch {} };
    reader.readAsDataURL(file);
  }
  function save() { localStorage.setItem("ranjingPersonalProfile", JSON.stringify(profile)); setShowSaved(true); setTimeout(() => setShowSaved(false), 2000); }
  return (
    <div className="account-page">
      <AccountPageHeader title="编辑资料" go={go} />
      <main className="personal-profile-form">
        <div className="pp-avatar-block">
          <button type="button" className="pp-avatar-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} aria-label="更换头像"><img src={avatarUrl || splashCover.src} alt="用户头像" /></button>
          <span className="pp-avatar-label">头像</span>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarPick} />
        </div>
        <div className="pp-field-list">
          <div className="pp-field-row"><span className="pp-field-label">昵称</span><input className="pp-field-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
          <div className="pp-field-row"><span className="pp-field-label">简介</span><input className="pp-field-input" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} /></div>
          <div className="pp-field-row"><span className="pp-field-label">性别</span><select className="pp-field-input" value={profile.gender} onChange={(e) => setProfile({ ...profile, gender: e.target.value })}><option value="">不透露</option><option>女</option><option>男</option><option>其他</option></select></div>
          <div className="pp-field-row"><span className="pp-field-label">生日</span><input type="date" className="pp-field-input" value={profile.birthday} onChange={(e) => setProfile({ ...profile, birthday: e.target.value })} /></div>
        </div>
        <div className="pp-wish-block"><span className="pp-field-label">写给自己的祝愿</span><textarea className="pp-wish-textarea" value={profile.wish} onChange={(e) => setProfile({ ...profile, wish: e.target.value })} /></div>
        <button type="button" className="account-primary-action" onClick={save}>保存资料</button>
      </main>
      {showSaved && <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, background: "rgba(0,0,0,.25)" }}><div style={{ background: "#fff", borderRadius: 14, padding: "32px 40px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}><div style={{ fontSize: 36, marginBottom: 12 }}>✅</div><div style={{ fontSize: 16, fontWeight: 600, color: "#333" }}>保存成功</div><div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>个人资料已更新</div></div></div>}
    </div>
  );
}

function PaymentSettingsScreen({ go }: { go: (s: Screen) => void }) {
  const [bindings, setBindings] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("ranjingPaymentBindings") || "{}"); } catch { return {}; } });
  const [bankForm, setBankForm] = useState(false);
  const [bankCard, setBankCard] = useState("");
  const [bankName, setBankName] = useState("");
  function bind(method: string) {
    if (method === "支付宝") { window.open("https://auth.alipay.com/login/index.htm", "_blank"); return; }
    if (method === "微信付款") { window.open("https://login.weixin.qq.com/", "_blank"); return; }
    if (method === "银行卡") { setBankForm(true); return; }
    setNotice(method);
  }
  function saveBank() { if (!bankCard.trim() || !bankName.trim()) return; const next = { ...bindings, "银行卡": true }; setBindings(next); localStorage.setItem("ranjingPaymentBindings", JSON.stringify(next)); setBankForm(false); setBankCard(""); setBankName(""); }
  function toggle(method: string) { const next = { ...bindings, [method]: !bindings[method] }; setBindings(next); localStorage.setItem("ranjingPaymentBindings", JSON.stringify(next)); }
  const [notice, setNotice] = useState("");
  const otherMethods = ["信用卡", "花呗", "HK支付宝"];
  return <div className="account-page"><AccountPageHeader title="支付设置" go={go} /><main className="account-list account-list-spaced">
    {["支付宝", "微信付款", "银行卡"].map((method) => <button type="button" key={method} onClick={() => bind(method)}><span>{method}</span><small>{bindings[method] ? "已绑定" : "未绑定"}</small><b>›</b></button>)}
    {otherMethods.map((method) => <button type="button" key={method} onClick={() => toggle(method)}><span>{method}</span><small>{bindings[method] ? "已绑定" : "未绑定"}</small><i className={bindings[method] ? "is-on" : ""}><em /></i></button>)}
    {bankForm && <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, background: "rgba(0,0,0,.25)" }}><div style={{ background: "#fff", borderRadius: 14, padding: "24px 20px", width: 280, boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>绑定银行卡</div><input placeholder="持卡人姓名" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} /><input placeholder="银行卡号" value={bankCard} onChange={(e) => setBankCard(e.target.value.replace(/\D/g, ""))} maxLength={19} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }} /><div style={{ display: "flex", gap: 10 }}><button onClick={() => setBankForm(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 13 }}>取消</button><button onClick={saveBank} style={{ flex: 1, padding: 10, borderRadius: 8, border: 0, background: "#5f554d", color: "#fff", fontSize: 13 }}>确认绑定</button></div></div></div>}
    {notice && <p className="account-notice">{notice} 绑定状态已更新</p>}
  </main></div>;
}

type SettingItem = { label: string; kind?: "toggle" | "action"; value?: string };
function PreferenceSettingsScreen({ title, items, storageKey, go }: { title: string; items: SettingItem[]; storageKey: string; go: (s: Screen) => void }) {
  const [values, setValues] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; } });
  const [notice, setNotice] = useState("");
  function activate(item: SettingItem) {
    if (item.kind === "action") { setNotice(`${item.label}已打开`); return; }
    const next = { ...values, [item.label]: values[item.label] === undefined ? false : !values[item.label] };
    setValues(next); localStorage.setItem(storageKey, JSON.stringify(next));
  }
  return <div className="account-page"><AccountPageHeader title={title} go={go} /><main className="account-list account-list-spaced">{items.map((item) => {
    const enabled = values[item.label] === undefined ? true : values[item.label];
    return <button type="button" key={item.label} onClick={() => activate(item)}><span>{item.label}</span>{item.value && <small>{item.value}</small>}{item.kind === "action" ? <b>›</b> : <i className={enabled ? "is-on" : ""}><em /></i>}</button>;
  })}{notice && <p className="account-notice">{notice}</p>}</main></div>;
}

function AccountSecurityScreen({ go }: { go: (s: Screen) => void }) {
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState("");
  useEffect(() => { fetch(`${API_BASE}/api/auth/me`).then((r) => r.json()).then((d) => { if (d.user?.phone) setPhone(d.user.phone); }).catch(() => {}); }, []);
  const displayPhone = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "未绑定";
  const items = [ { label: "手机号", value: displayPhone, action: "phone" }, { label: "修改昵称", action: "nickname" }, { label: "授权管理", action: "auth" }, { label: "实名认证", value: "未认证", action: "verify" }, { label: "注销苒境账号", danger: true, action: "delete" } ];
  function handleAction(action: string, label: string) {
    if (action === "phone") { setNotice("当前登录手机号：" + (phone || "未获取")); return; }
    if (action === "nickname") { go("personal-profile"); return; }
    if (action === "delete") { setConfirmAction(label); return; }
    setNotice(`${label}：功能开发中`);
  }
  return <div className="account-page"><AccountPageHeader title="账号设置" go={go} /><main className="account-list account-list-spaced">{items.map((item) => <button type="button" className={item.danger ? "is-danger" : ""} key={item.label} onClick={() => handleAction(item.action!, item.label)}><span>{item.label}</span>{item.value && <small>{item.value}</small>}<b>›</b></button>)}{notice && <p className="account-notice">{notice}</p>}{confirmAction && <div className="account-notice" style={{ background: "#fde8e8", color: "#c0392b" }}><div>确认{confirmAction}？此操作不可恢复。</div><div style={{ marginTop: 8, display: "flex", gap: 8 }}><button onClick={() => { localStorage.clear(); setConfirmAction(""); setNotice("已清除本地数据"); }} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #c0392b", background: "#c0392b", color: "#fff", fontSize: 12 }}>确认清除</button><button onClick={() => setConfirmAction("")} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", fontSize: 12 }}>取消</button></div></div>}</main></div>;
}

function SimpleHeader({ title, go }: { title: string; go: (s: Screen) => void }) {
  return (
    <div className="sticky top-0 z-[1600] flex items-center px-3 bg-[var(--bg2)] border-b border-[var(--border)]" style={{ minHeight: "calc(56px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}>
      <button type="button" onClick={() => go("profile")} className="flex items-center justify-center rounded-full bg-[var(--bg)]" style={{ width: 44, height: 44, minWidth: 44, fontSize: 22, lineHeight: 1 }} aria-label="返回">←</button>
      <div className="flex-1 text-center font-bold text-[var(--text)]">{title}</div>
      <div style={{ width: 44, minWidth: 44 }} />
    </div>
  );
}

function MembershipScreen({ go }: { go: (s: Screen) => void }) {
  const [plan, setPlan] = useState<"monthly" | "yearly" | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const plans = [ { key: "monthly" as const, label: "月度会员", sub: "按月使用，随时续订", price: "¥19.90/月" }, { key: "yearly" as const, label: "年度会员", sub: "全年使用，更适合长期创作", price: "¥168/年" } ];
  async function handlePay() {
    if (!plan) return; setLoading(true); setMessage("");
    try {
      const orderRes = await CapacitorHttp.post({ url: `${API_BASE}/api/membership/orders`, headers: { "Content-Type": "application/json" }, data: { plan } });
      const orderData = orderRes.data;
      if (orderRes.status < 200 || orderRes.status >= 300) { setMessage(orderData?.message || "创建订单失败"); return; }
      const payRes = await CapacitorHttp.post({ url: `${API_BASE}/api/payments/alipay/create`, headers: { "Content-Type": "application/json" }, data: { orderId: orderData.order.id } });
      const payData = payRes.data;
      if (payRes.status < 200 || payRes.status >= 300) { setMessage(payData?.message || "支付通道暂时不可用"); return; }
      if (payData.paymentUrl) { window.open(payData.paymentUrl, "_blank"); setMessage("支付订单已创建"); }
    } catch { setMessage("支付请求失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="订阅会员" go={go} /><div className="p-4 flex flex-col gap-4"><div className="card-journal p-4"><div className="font-bold text-sm" style={{ fontSize: 18, marginBottom: 6 }}>解锁完整云端创作</div><div style={{ fontSize: 12, color: "#918981", marginBottom: 16, lineHeight: 1.7 }}>专业模板、多人协作与历史版本均包含在会员方案中。</div><div className="mt-3 flex flex-col gap-2">{plans.map((p) => <button key={p.key} onClick={() => { setPlan(p.key); setMessage(""); }} style={{ padding: "18px 16px", borderRadius: 12, border: plan === p.key ? "1.5px solid #75655a" : "1px solid rgba(128,107,92,.15)", background: plan === p.key ? "#f3eee8" : "#fffdfa", textAlign: "left" }}><strong style={{ fontSize: 16, fontWeight: 500 }}>{p.label}</strong><div style={{ marginTop: 6, color: "#918981", fontSize: 12 }}>{p.sub}</div></button>)}</div><button type="button" disabled={!plan || loading} onClick={handlePay} style={{ width: "100%", height: 48, marginTop: 14, border: 0, borderRadius: 10, background: "#5f554d", color: "#fff", fontSize: 14, cursor: plan ? "pointer" : "default", opacity: plan && !loading ? 1 : 0.5 }}>{loading ? "处理中…" : "继续"}</button>{message && <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 8, background: "#f1ece5", color: "#716a63", fontSize: 11, lineHeight: 1.7 }}>{message}</div>}</div></div></div>;
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [authReady, setAuthReady] = useState(false);
  // 全屏「开门」过渡动画状态
  const [isOpeningDoor, setIsOpeningDoor] = useState(false);
  const [user, setUser] = useState<{ id: string; phone: string; nickname: string; avatar: string; defaultDeliveryEmail?: string; isVip?: boolean } | null>(null);
  const screenFromUrlRef = useRef<boolean>(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [trendScrollTop, setTrendScrollTop] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [dark, setDark] = useState(false);
  const splashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ 修复：将 handleUpgradeVip 移到 user 和 go 之后，解决 TS 作用域报错
  const handleUpgradeVip = () => {
    if (!user) setScreen("login");
    else setScreen("membership");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("authPreview") === "login") { setScreen("login"); setAuthReady(true); return; }
    const alipayReturnOrderId = params.get("payment") === "alipay" ? params.get("orderId") : null;
    if (alipayReturnOrderId) { setAuthReady(true); void resumeAlipayReturn(alipayReturnOrderId); return; }
    const doAuthCheck = () => { fetch(`${API_BASE}/api/auth/me`).then((response)=>response.json()).then((result)=>{if(result.user){setUser(result.user);}if(!screenFromUrlRef.current)setScreen("welcome");}).catch(()=>{if(!screenFromUrlRef.current)setScreen("welcome");}).finally(()=>setAuthReady(true)); };
    splashTimerRef.current = setTimeout(doAuthCheck, 1800);
    const savedOrderId = localStorage.getItem("ranjing.currentOrderId");
    if (savedOrderId) { setCurrentOrderId(savedOrderId); void loadOrderById(savedOrderId); }
    return () => { if (splashTimerRef.current) clearTimeout(splashTimerRef.current); };
  }, []);

  useEffect(() => {
    let listener: any = null;
    CapApp.addListener("backButton", () => {
      if (runTopBackHandler()) return;
      setScreen((cur) => {
        if (cur === "canvas") return "welcome";
        if (cur === "welcome" || cur === "home") return "home";
        // ❌ 删掉这里导致冲突的 if (cur === "create") return "home";
        if (cur === "profile") return "home";
        if (cur === "login") return "welcome";
        if (cur === "membership" || cur === "personal-profile" || cur === "payment-settings" || cur === "message-settings" || cur === "privacy-settings" || cur === "membership-settings" || cur === "account-security") return "profile";
        // ✅ 修复：让 create 回归 space
        if (cur === "publish" || cur === "community" || cur === "gallery" || cur === "create") return "space";
        if (cur === "space") return "canvas";
        return "home";
      });
    }).then((l) => { listener = l; });
    return () => { if (listener) listener.remove(); };
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  async function loadOrderById(orderId: string): Promise<CreatedOrder | null> {
    try {
      const res = await fetch(`${API_BASE}/api/orders?orderId=${encodeURIComponent(orderId)}`);
      if (res.status === 404) { setCreatedOrder(null); setCurrentOrderId(null); localStorage.removeItem("ranjing.currentOrderId"); return null; }
      if (!res.ok) return null;
      const order = await res.json() as CreatedOrder;
      setCreatedOrder(order); setCurrentOrderId(order.id); localStorage.setItem("ranjing.currentOrderId", order.id);
      return order;
    } catch { return null; }
  }

  async function resumeAlipayReturn(orderId: string) {
    const order = await loadOrderById(orderId);
    if (!order) { setScreen("create"); return; }
    const membershipOrder = order as CreatedOrder & { orderKind?: string; membershipPlan?: "monthly" | "yearly"; };
    if (membershipOrder.orderKind === "membership" || order.id.startsWith("VIP-")) {
      localStorage.setItem("ranjing.pending.membership.orderId", order.id);
      try {
        const response = await fetch(`${API_BASE}/api/payments/alipay/status?orderId=${encodeURIComponent(order.id)}`, { cache: "no-store" });
        const result = await response.json();
        if (response.ok && result.status === "Paid") { localStorage.setItem("ranjing.membership.returnPaid", "true"); }
      } catch {}
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("payment"); cleanUrl.searchParams.delete("orderId");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      setScreen("create");
      return;
    }
  }

  function go(s: Screen) {
    if (s === "create") {
      const url = new URL(window.location.href);
      url.searchParams.delete("creation"); url.searchParams.delete("novel");
      window.history.replaceState({}, "", url);
    }
    setScreen(s);
  }

  function enterFromWelcome() { setScreen("canvas"); }

  const isSpaceContext = screen === "space" || screen === "community" || screen === "group" || screen === "house";

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", background: "#F7F3EC", fontFamily: "'Nunito', sans-serif" }}>
      <div className="handbook-app relative flex flex-col bg-[var(--bg)] overflow-hidden" style={{ width: "100%", height: "100%", borderRadius: 0, border: 0, boxSizing: "border-box", boxShadow: "none" }}>
        
        {!authReady && <div className="ran-auth-page" />}
        {authReady && screen === "welcome" && <WelcomeScreen onEnter={enterFromWelcome} />}
        {authReady && screen === "login" && <LoginScreen onVerified={()=>setScreen("canvas")} />}
        
        {/* 1. 画布创作区：始终挂载 */}
        {authReady && (
          <div
            style={{
              display: screen === "canvas" ? "flex" : "none",
              position: "absolute",
              inset: 0,
              zIndex: 10,
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <CreationLocalRoom 
              onBack={() => setScreen("welcome")} 
              onEnterSpace={() => setIsOpeningDoor(true)} 
              isVip={!!user?.isVip}              
              onUpgradeVip={handleUpgradeVip}    
            />
          </div>
        )}

        {/* 2. 空间全局侧边栏（只要在空间语境里就一直显示） */}
        {authReady && isSpaceContext && <SpaceSidebar active={screen} go={go} />}

        {/* 3. 空间主框架：让内容全屏，不再被侧边栏挤占（底部悬浮导航靠 paddingBottom 让位） */}
        {authReady && (
          <div style={{ display: screen === "space" ? "block" : "none", position: "absolute", inset: 0, zIndex: 20, background: "#fbfaf7" }}>
            <SpaceHome go={go} user={user} onUpgradeVip={handleUpgradeVip} />
          </div>
        )}
        {authReady && (
          <div style={{ display: screen === "community" ? "block" : "none", position: "absolute", inset: 0, zIndex: 20, background: "#fbfaf7" }}>
            <CommunityScreen go={go} />
          </div>
        )}
        {authReady && (
          <div style={{ display: screen === "group" ? "block" : "none", position: "absolute", inset: 0, zIndex: 20, background: "#fbfaf7" }}>
            <GroupSessionScreen go={go} />
          </div>
        )}
        {authReady && (
          <div style={{ display: screen === "house" ? "block" : "none", position: "absolute", inset: 0, zIndex: 20, background: "#fbfaf7" }}>
            <MyHouseScreen go={go} user={user} />
          </div>
        )}

        {screen === "publish" && <PublishScreen go={go} />}
        {screen === "gallery" && <GalleryScreen go={go} />}
        
        {/* 图4/图5：本地/云端选择与模板库 */}
        {screen === "create" && <SaveTargetScreen go={go} />}

        {screen === "profile" && <ProfileScreen go={go} />}
        {screen === "personal-profile" && <PersonalProfileScreen go={go} />}
        {screen === "payment-settings" && <PaymentSettingsScreen go={go} />}
        {screen === "message-settings" && <PreferenceSettingsScreen title="消息设置" storageKey="ranjingMessageSettings" go={go} items={[{label:"通知消息"},{label:"上新消息"},{label:"系统消息"},{label:"团队信息"}]} />}
        {screen === "privacy-settings" && <PreferenceSettingsScreen title="隐私权限" storageKey="ranjingPrivacySettings" go={go} items={[{label:"我有疑问",kind:"action"},{label:"系统权限管理",kind:"action"},{label:"允许采集云端"},{label:"团队信息"}]} />}
        {screen === "membership-settings" && <PreferenceSettingsScreen title="会员设置" storageKey="ranjingMembershipSettings" go={go} items={[{label:"续费提醒"},{label:"订阅消息"},{label:"设置偏好",kind:"action"},{label:"团队默认模板",kind:"action"}]} />}
        {screen === "account-security" && <AccountSecurityScreen go={go} />}
        {screen === "membership" && <MembershipScreen go={go} />}

        {/* 全屏「开门」过渡动画：推开门 -> 光透进来 -> 进入空间 */}
        {isOpeningDoor && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#121214", // 暗色背景
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", perspective: "1200px"
          }}>
            {/* 左门 */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: "50%",
              background: "linear-gradient(to right, #2a2a2a, #1a1a1a)",
              borderRight: "1px solid rgba(201,168,124,.3)",
              transformOrigin: "left center",
              animation: "doorOpenLeft 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
              zIndex: 1
            }} />
            {/* 右门 */}
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: "50%",
              background: "linear-gradient(to left, #2a2a2a, #1a1a1a)",
              borderLeft: "1px solid rgba(201,168,124,.3)",
              transformOrigin: "right center",
              animation: "doorOpenRight 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
              zIndex: 1
            }} />

            {/* 门缝透出的光 */}
            <div style={{
              position: "absolute", left: "50%", top: "20%", bottom: "20%", width: "2px",
              background: "#C9A87C",
              boxShadow: "0 0 60px 30px rgba(201,168,124,.6)",
              animation: "doorLight 1.2s ease-out forwards",
              zIndex: 2,
              pointerEvents: "none"
            }} />

            {/* 动画结束后的文字提示（可选） */}
            <div style={{
              color: "#C9A87C", fontSize: 14, letterSpacing: "0.3em",
              position: "absolute", bottom: "15%", zIndex: 3,
              animation: "fadeIn 1.5s ease-out forwards"
            }}>正在进入空间...</div>

            {/* 动画关键帧 */}
            <style>{`
              @keyframes doorOpenLeft {
                0% { transform: translateX(0) rotateY(0deg); }
                100% { transform: translateX(-100%) rotateY(-30deg); opacity: 0; }
              }
              @keyframes doorOpenRight {
                0% { transform: translateX(0) rotateY(0deg); }
                100% { transform: translateX(100%) rotateY(30deg); opacity: 0; }
              }
              @keyframes doorLight {
                0% { opacity: 0; width: 2px; box-shadow: none; }
                40% { opacity: 1; width: 4px; box-shadow: 0 0 120px 60px rgba(201,168,124,.8); }
                100% { opacity: 0; width: 200px; box-shadow: 0 0 200px 100px rgba(201,168,124,0); }
              }
              @keyframes fadeIn {
                0% { opacity: 0; }
                70% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>

            {/* 动画结束，进入空间 */}
            <div
              style={{ position: "absolute", inset: 0, zIndex: 0, animation: "doorOpenLeft 1.2s linear forwards" }}
              onAnimationEnd={() => {
                setIsOpeningDoor(false);
                setScreen("space");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
