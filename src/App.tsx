"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import pageHome from "./assets/page-home.png";
import pageProduct from "./assets/page-product.png";
import pageCart from "./assets/page-cart.png";
import pageCheckout from "./assets/page-checkout.png";
import pageSuccess from "./assets/page-success.png";
import pageOrders from "./assets/page-orders.png";
import pageOrderDetail from "./assets/page-order-detail.png";
import pageLibrary from "./assets/page-library.png";
import CreationMinimalRoom from "./CreationMinimalRoom";
import pageProfile from "./assets/page-profile.png";
import pageAbout from "./assets/page-about.png";
import skillCreatorMascot from "./assets/skill-creator-mascot.png";
import splashCover from "./assets/splash-cover-original.png";
import adminPeekingLine from "./assets/admin-peeking-line-transparent.png";
import adminLoginTitleTangyuan from "./assets/admin-login-title-admin-channel.png";
import ranjingWelcomeInk from "./assets/ranjing-welcome-ink-v1.png";
import { Character, loadNovels, newCharacter, newNovel, Novel, saveNovels, totalWords } from "./novels";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "welcome" | "login" | "profile-setup" | "splash" | "home" | "resources" | "create" | "design" | "design-brief" | "works" | "writing" | "product" | "checkout" | "paying" | "success"
  | "cart" | "orders" | "order-detail" | "library" | "profile" | "about"
  | "support" | "help" | "settings" | "creator-register" | "wallet" | "membership"
  | "merchant-login" | "merchant-dashboard"
  | "admin-login" | "admin-dashboard" | "admin-products" | "admin-inventory" | "admin-orders" | "admin-merchants";

type Product = { id: number; name: string; desc: string; price: string; badge: string; icon: string; color: string; stock?: number };
type Order = { id: string; product: string; icon: string; qty: number; amount: string; status: string; time: string };
type CreatedOrder = { id: string; productId: number; product: string; icon: string; quantity: number; amount: string; paymentMethod: string; status: string; createdAt: string; deliveryEmail: string; saveDeliveryEmail: boolean; emailDeliveryStatus: "NotConfigured" | "Pending" | "Sent" | "Failed"; deliveredCode?: string; paidAt?: string };
type RedemptionCode = { code: string; productId: number; productName: string; status: "Available" | "Issued" | "Redeemed"; orderId?: string; createdAt: string; issuedAt?: string; redeemedAt?: string };
type TrendItem = { id: number | string; source: string; sourceLabel: string; rank: number; title: string; url: string | null; metricValue: number | null; metricLabel: string | null; publishedAt: string | null; fetchedAt: string };

const DESIGN_SERVICES: Product[] = [
  { id: 1001, name: "UI 设计", desc: "根据产品定位定制页面结构、视觉风格和交互方案", price: "定制报价", badge: "设计服务", icon: "UI", color: "#FFFFFF" },
  { id: 1002, name: "AI 个人工作台模式设计", desc: "梳理个人工作流程并设计专属 AI 工作台界面", price: "定制报价", badge: "工作台设计", icon: "AI", color: "#FFFFFF" },
  { id: 1003, name: "个人网站", desc: "定制个人品牌、作品展示或业务介绍网站", price: "定制报价", badge: "网站设计", icon: "网", color: "#FFFFFF" },
  { id: 1004, name: "个人 APP", desc: "从功能梳理、页面原型到移动端视觉设计", price: "定制报价", badge: "APP 设计", icon: "APP", color: "#FFFFFF" },
];

const STATUS_LABELS: Record<string, string> = {
  Pending: "待处理",
  Delivered: "已交付",
  Completed: "已完成",
  Refunded: "已退款",
  Paid: "已支付",
  Published: "已发布",
  Available: "可用",
  Sold: "已售出",
  Reserved: "已预留",
  Issued: "已发放",
  Redeemed: "已兑换",
  Unlimited: "不限量",
  "Low Stock": "库存紧张",
  Draft: "草稿",
  Failed: "失败",
};

// ─── Data ─────────────────────────────────────────────────────────────────────



// V7 legacy demo data - disabled from runtime
const ORDERS: Order[] = [
  { id: "202408271234", product: "高级会员", icon: "👑", qty: 1, amount: "¥10.00", status: "Delivered", time: "2024-08-27 12:34" },
  { id: "202408271235", product: "Windows 11 专业版密钥", icon: "🔑", qty: 1, amount: "¥19.90", status: "Delivered", time: "2024-08-27 12:20" },
  { id: "202408271236", product: "ChatGPT Plus 访问", icon: "🤖", qty: 1, amount: "¥20.00", status: "Pending", time: "2024-08-27 12:10" },
];

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
    try { const response=await fetch("/api/auth/sms/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})}); const result=await response.json(); if(!response.ok){setMessage(result.message||"验证码暂时无法发送，请稍后再试");return;} setCountdown(Number(result.retryAfter)||60); }
    catch { setMessage("验证码暂时无法发送，请稍后再试"); } finally { setStatus("idle"); }
  }

  async function enter() {
    if (!canEnter) return;
    setStatus("verifying"); setMessage("");
    try { const response=await fetch("/api/auth/sms/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone,code})}); const result=await response.json(); if(!response.ok){setMessage(result.message||"登录服务暂时不可用，请稍后再试");return;} onVerified(Boolean(result.isNew)); }
    catch { setMessage("登录服务暂时不可用，请稍后再试"); } finally { setStatus("idle"); }
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

function ProfileSetupScreen({ go }: { go: (screen: Screen) => void }) {
  const [nickname, setNickname] = useState("");
  const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  async function finish(skip=false){setSaving(true);setMessage("");try{if(!skip){const response=await fetch("/api/auth/me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname})});const result=await response.json();if(!response.ok){setMessage(result.message||"资料暂时无法保存");return;}}go("home");}catch{setMessage("资料暂时无法保存");}finally{setSaving(false);}}
  return <div className="ran-auth-page ran-profile-page"><main className="ran-profile-main"><div className="ran-profile-heading"><small>欢迎来到苒境</small><h1>留下一个称呼</h1><p>以后也可以在「我的」里面慢慢修改。</p></div><button className="ran-avatar" type="button" aria-label="选择头像"><span>＋</span><small>头像可跳过</small></button><label className="ran-nickname"><span>昵称</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} placeholder="想让大家怎么称呼你" /></label>{message&&<p className="ran-auth-message">{message}</p>}<button className="ran-auth-submit" type="button" disabled={!nickname.trim()||saving} onClick={() => finish(false)}>{saving?"正在保存…":"开始使用"}</button><button className="ran-skip" type="button" disabled={saving} onClick={() => finish(true)}>稍后再说</button></main></div>;
}

const REVENUE_DATA = [
  { day: "08-21", v: 320 }, { day: "08-22", v: 480 }, { day: "08-23", v: 390 },
  { day: "08-24", v: 610 }, { day: "08-25", v: 520 }, { day: "08-26", v: 780 }, { day: "08-27", v: 1234 },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Delivered: "bg-[var(--green-bg)] text-[var(--green)]",
    Pending: "bg-[var(--cream)] text-[var(--warning)]",
    Completed: "bg-[#EEF0EA] text-[var(--info)]",
    Refunded: "bg-[var(--pink-soft)] text-[var(--text2)]",
    Failed: "bg-[#F2E5E1] text-[var(--danger)]",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] || "bg-[var(--pink-soft)] text-[var(--text2)]"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function BadgePill({ text }: { text: string }) {
  const isLow = text === "库存紧张";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isLow ? "bg-[var(--cream)] text-[var(--warning)]" : "bg-[var(--pink-soft)] text-[var(--pink)]"}`}>
      {text}
    </span>
  );
}

function BottomNav({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const tabs = [
    { s: "home" as Screen, label: "首页" },
    { s: "resources" as Screen, label: "资源" },
    { s: "create" as Screen, label: "创作" },

    { s: "profile" as Screen, label: "我的" },
  ];
  return (
    <div className="editorial-bottom-nav flex min-h-[58px] items-stretch px-2">
      {tabs.map((t) => (
        <button key={t.s} onClick={() => go(t.s)}
          className={`editorial-nav-item flex flex-1 items-center justify-center py-3 ${screen === t.s ? "is-active" : ""}`}>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Girl Illustration (SVG) ──────────────────────────────────────────────────

function GirlIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <ellipse cx="60" cy="90" rx="28" ry="22" fill="var(--pink-mid)" />
      {/* Jacket */}
      <ellipse cx="60" cy="92" rx="22" ry="17" fill="var(--pink)" />
      {/* Collar / shirt */}
      <ellipse cx="60" cy="80" rx="10" ry="6" fill="var(--bg2)" />
      {/* Head */}
      <circle cx="60" cy="52" r="24" fill="#D9B59B" />
      {/* Hair top */}
      <ellipse cx="60" cy="32" rx="23" ry="12" fill="#5F5045" />
      {/* Hair bun */}
      <circle cx="84" cy="30" r="7" fill="#5F5045" />
      {/* Hair strand left */}
      <path d="M38 46 Q32 56 36 68" stroke="#5F5045" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* Eyes */}
      <ellipse cx="52" cy="53" rx="3" ry="3.5" fill="#3F352C" />
      <ellipse cx="68" cy="53" rx="3" ry="3.5" fill="#3F352C" />
      {/* Eye shine */}
      <circle cx="53.5" cy="51.5" r="1" fill="var(--bg2)" />
      <circle cx="69.5" cy="51.5" r="1" fill="var(--bg2)" />
      {/* Blush */}
      <ellipse cx="45" cy="58" rx="5" ry="3" fill="var(--pink)" opacity="0.35" />
      <ellipse cx="75" cy="58" rx="5" ry="3" fill="var(--pink)" opacity="0.35" />
      {/* Mouth */}
      <path d="M54 62 Q60 67 66 62" stroke="var(--pink)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Cup */}
      <rect x="68" y="76" width="14" height="12" rx="3" fill="var(--bg2)" stroke="var(--pink)" strokeWidth="1.5" />
      <path d="M82 80 Q86 80 86 84 Q86 88 82 88" stroke="var(--pink)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Steam */}
      <path d="M72 74 Q73 70 72 66" stroke="var(--pink)" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M76 73 Q77 69 76 65" stroke="var(--pink)" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
      {/* Stars */}
      <text x="10" y="35" fontSize="10" fill="#D4A84F">★</text>
      <text x="100" y="50" fontSize="8" fill="var(--pink)">♥</text>
      <text x="15" y="70" fontSize="7" fill="var(--pink)">✦</text>
    </svg>
  );
}

function SkillCreatorMascot({ size = 120 }: { size?: number }) {
  return <img src={skillCreatorMascot.src} alt="手绘技能创作者" style={{ width: size, height: size, objectFit: "contain" }} />;
}

function PeekingLineIllustration() {
  return (
    <div className="mx-auto h-[82px] w-[330px] max-w-full" aria-label="趴在线上往下看的手绘小人">
      <img
        src={adminPeekingLine.src}
        alt="趴在线上往下看的手绘小人"
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function AdminLoginTitleImage() {
  return (
    <div className="relative mx-auto h-[48px] w-[220px] overflow-hidden" aria-label="管理员通道">
      <img
        src={adminLoginTitleTangyuan.src}
        alt="管理员通道"
        className="absolute max-w-none"
        style={{ width: "235px", height: "417px", left: "-7px", top: "-190px" }}
      />
    </div>
  );
}

// ─── Screen 01: Splash ────────────────────────────────────────────────────────

function SplashScreen({ go }: { go: (s: Screen) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => go("home"), 1800);
    return () => clearTimeout(timer);
  }, [go]);

  return (
    <button
      type="button"
      onClick={() => go("home")}
      aria-label="进入技能商城"
      className="flex-1 w-full overflow-hidden bg-[#F8F3EB]"
    >
      <img
        src={splashCover.src}
        alt="每个人都有技能"
        className="h-full w-full object-cover"
      />
    </button>
  );
}

const TREND_SOURCES = ["百度", "腾讯", "今日头条", "知乎", "哔哩哔哩", "36氪", "少数派"];

function TrendsScreen({ go, initialScrollTop, onScrollPositionChange }: { go: (s: Screen) => void; initialScrollTop: number; onScrollPositionChange: (value: number) => void }) {
  const [source, setSource] = useState("全部");
  const [items, setItems] = useState<TrendItem[]>([]);
  const [liveStatus, setLiveStatus] = useState("正在更新实时热点…");
  const tabsRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScrollLeft: number; pointerId: number; moved: boolean; captured: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const isFirstSourceRef = useRef(true);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);

  useEffect(() => {
    const isFirst = isFirstSourceRef.current;
    if (isFirst) isFirstSourceRef.current = false;
    setLiveStatus(`正在更新${source === "全部" ? "全网" : source}热点…`);
    fetch(`/api/hotspots?source=${encodeURIComponent(source)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.items) || result.items.length === 0) throw new Error(result.message || "暂无实时热点");
        setItems(result.items as TrendItem[]);
        setLiveStatus(`${source === "全部" ? "全网" : source}已更新 ${result.items.length} 条实时热点`);
        if (!isFirst) {
          requestAnimationFrame(() => {
            if (feedRef.current) feedRef.current.scrollTop = 0;
          });
        }
      })
      .catch((error) => {
        setItems([]);
        setLiveStatus(error instanceof Error ? error.message : `${source}实时接口暂不可用`);
      });
  }, [source]);
  return (
    <div className="trends-home flex-1 flex flex-col overflow-hidden">
      <div className="trends-masthead px-5 pt-[54px] pb-[30px] text-center">
        <div className="trends-title">全网热点</div>
        <div className="trends-date">今日正在发生</div>
      </div>
      <div className="trends-categories px-5">
        <div
          ref={tabsRef}
          className={`hotspot-tabs-scroll flex flex-nowrap flex-row gap-7 overflow-x-auto whitespace-nowrap select-none ${dragging ? "cursor-grabbing" : ""}`}
          onPointerDown={(e) => {
            const el = tabsRef.current;
            if (!el) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            dragRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft, pointerId: e.pointerId, moved: false, captured: false };
          }}
          onPointerMove={(e) => {
            const st = dragRef.current;
            const el = tabsRef.current;
            if (!st || !el) return;
            const dx = e.clientX - st.startX;
            if (!st.moved && Math.abs(dx) <= 5) return;
            if (!st.moved) {
              st.moved = true;
              setDragging(true);
              try { el.setPointerCapture(st.pointerId); st.captured = true; } catch { /* noop */ }
            }
            el.scrollLeft = st.startScrollLeft - dx;
          }}
          onPointerUp={() => {
            const st = dragRef.current;
            const el = tabsRef.current;
            if (!st) return;
            if (st.moved) {
              suppressClickRef.current = true;
              if (st.captured) { try { el?.releasePointerCapture(st.pointerId); } catch { /* noop */ } }
            }
            dragRef.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            const st = dragRef.current;
            const el = tabsRef.current;
            if (st?.captured) { try { el?.releasePointerCapture(st.pointerId); } catch { /* noop */ } }
            dragRef.current = null;
            setDragging(false);
          }}
        >
          {["全部", ...TREND_SOURCES].map((item) => <button key={item} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } setSource(item); }} className={`trend-category shrink-0 ${dragging ? "cursor-grabbing" : "cursor-pointer"} ${source === item ? "is-active" : ""}`}>{item}</button>)}
        </div>
      </div>
      <div ref={feedRef} onScroll={(event) => onScrollPositionChange(event.currentTarget.scrollTop)} className="trends-feed flex-1 overflow-y-auto px-5 pt-2">
        <div className="trends-status">{liveStatus}{source !== "全部" ? ` · 当前查看：${source}` : ""}</div>
        {items.length === 0 && <div className="py-12 text-center text-sm text-[var(--text2)]">当前平台暂时没有可显示的实时热点</div>}
        {items.map((item, index) => {
          const metricText = item.metricValue != null && item.metricLabel
            ? ` · ${item.metricValue.toLocaleString("zh-CN")} ${item.metricLabel}`
            : "";
          return (
          <button
            key={item.id}
            onClick={() => {
              if (!item.url) return;
              onScrollPositionChange(feedRef.current?.scrollTop ?? 0);
              window.open(item.url, "_blank", "noopener,noreferrer");
            }}
            disabled={!item.url}
            className={`trend-row w-full text-left ${!item.url ? "is-disabled" : ""}`}
          >
            <span className="trend-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="trend-item-title">{item.title}</div>
              <div className="trend-meta">{item.sourceLabel}{metricText}</div>
            </div>
          </button>
        )})}
      </div>
      <BottomNav screen="home" go={go} />
    </div>
  );
}


type CreationRoomType = "minimal";
const CREATION_ROOMS: { type: CreationRoomType; name: string; sub: string }[] = [
  { type: "minimal", name: "随笔", sub: "" },
];

function CreateScreen({ go }: { go: (s: Screen) => void }) {
  const [stage, setStage] = useState<"closed" | "open" | "room">("closed");
  const [selectedRoom, setSelectedRoom] = useState<CreationRoomType>("minimal");

  // 点击房间后直接进入创作页面
  if (stage === "room") {
    return <CreationMinimalRoom onBack={() => setStage("open")} />;
  }

  return (
    <div className="create-page flex-1 flex flex-col overflow-hidden">
      <main className="create-portal flex-1 flex items-center justify-center">
        <div className="create-door-stage">
          <div
            className={`create-door ${stage === "open" ? "is-open" : ""}`}
            onClick={() => { if (stage === "closed") setStage("open"); }}
          >
            <div className="create-door-leaf create-door-leaf--left" />
            <div className="create-door-leaf create-door-leaf--right" />
          </div>

          <div className={`create-rooms ${stage === "open" ? "is-visible" : ""}`}>
            {CREATION_ROOMS.map((room) => (
              <button
                key={room.type}
                className="create-room-item"
                onClick={() => {
                  setSelectedRoom(room.type);
                  setStage("room");
                }}
              >
                <span className="create-room-name">{room.name}</span>
                {room.sub ? <span className="create-room-sub">{room.sub}</span> : null}
              </button>
            ))}
          </div>

          {stage === "open" && (
            <button className="create-rooms-back" onClick={() => setStage("closed")} aria-label="返回">
              ←
            </button>
          )}
        </div>
      </main>
      <BottomNav screen="create" go={go} />
    </div>
  );
}
function NovelLibraryScreen({ go, openNovel }: { go: (s: Screen) => void; openNovel: (id: string) => void }) {
  const [novels, setNovels] = useState<Novel[]>(() => loadNovels());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  function createNovel() {
    const novel = newNovel(newTitle.trim() || "未命名小说");
    saveNovels([novel, ...novels]);
    setNovels([novel, ...novels]);
    openNovel(novel.id);
  }
  return <div className="novel-library flex-1 flex flex-col overflow-hidden">
    <header className="novel-library-header"><button onClick={() => go("create")}>←&nbsp; 创作</button><span>小说</span><i /></header>
    <main className="novel-library-content flex-1 overflow-y-auto scrollbar-hide">
      <div className="novel-library-intro"><h1>我的作品</h1><p>每次回来，都从上次停下的地方继续。</p></div>
      <div className="novel-list">
        {novels.map((novel) => { const current = novel.chapters.find((item) => item.id === novel.activeChapterId) || novel.chapters[0]; return <button key={novel.id} onClick={() => openNovel(novel.id)} className="novel-row text-left"><small>继续写</small><strong>《{novel.title}》</strong><span>{current?.title || "尚未创建章节"} · {totalWords(novel)} 字</span><time>{new Date(novel.updatedAt).toLocaleDateString("zh-CN")}&nbsp; →</time></button>; })}
        <button className="novel-new" onClick={() => setCreating(true)}>＋ 新建小说</button>
      </div>
    </main>
    {creating && <div className="novel-dialog-backdrop" onClick={() => setCreating(false)}><section className="novel-dialog" onClick={(event) => event.stopPropagation()}><button className="novel-dialog-close" onClick={() => setCreating(false)}>×</button><h2>新建小说</h2><label>作品名<input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createNovel()} placeholder="给故事起个名字……" /></label><p>暂时没想好也没关系，之后可以修改。</p><button className="novel-start" onClick={createNovel}>开始写作&nbsp; →</button></section></div>}
  </div>;
}

type WorkbenchPanel = "章节" | "人物" | "大纲";
const outlineFields = [["core", "故事核心"], ["mainline", "主线"], ["beginning", "开端"], ["development", "发展"], ["climax", "高潮"], ["ending", "结局"], ["foreshadowing", "关键伏笔"]] as const;
const characterFields: Array<[keyof Character, string]> = [["name", "姓名"], ["role", "角色身份"], ["personality", "性格"], ["motivation", "动机"], ["past", "过去"], ["relationships", "关系"], ["habits", "习惯"], ["abilities", "能力"], ["appearance", "外貌"], ["notes", "备注"]];

function WritingScreen({ go, creationType, novelId }: { go: (s: Screen) => void; creationType: string; novelId: string | null }) {
  const isNovel = creationType === "小说";
  const storageKey = `jiantu-creation-${creationType}`;
  const [novel, setNovel] = useState<Novel | null>(null);
  const [generic, setGeneric] = useState({ title: "", text: "" });
  const [panel, setPanel] = useState<WorkbenchPanel | null>(null);
  const [saved, setSaved] = useState("已保存");
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  useEffect(() => {
    if (isNovel) {
      const found = loadNovels().find((item) => item.id === novelId) || null;
      setNovel(found);
      setSelectedCharacterId(found?.characters[0]?.id || null);
    } else {
      try { setGeneric(JSON.parse(localStorage.getItem(storageKey) || '{"title":"","text":""}')); } catch { setGeneric({ title: "", text: "" }); }
    }
  }, [isNovel, novelId, storageKey]);

  useEffect(() => {
    if (isNovel && !novel) return;
    setSaved("保存中…");
    const timer = window.setTimeout(() => {
      if (isNovel && novel) {
        const all = loadNovels();
        const updated = { ...novel, updatedAt: Date.now() };
        saveNovels(all.map((item) => item.id === novel.id ? updated : item));
      } else if (!isNovel) localStorage.setItem(storageKey, JSON.stringify(generic));
      setSaved("已保存");
    }, 700);
    return () => clearTimeout(timer);
  }, [generic, isNovel, novel, storageKey]);

  const active = novel?.chapters.find((item) => item.id === novel.activeChapterId) || novel?.chapters[0];
  const title = isNovel ? active?.title || "" : generic.title;
  const text = isNovel ? active?.text || "" : generic.text;
  const count = text.replace(/\s/g, "").length;
  const selectedCharacter = novel?.characters.find((item) => item.id === selectedCharacterId) || null;
  if (isNovel && (!novel || !active)) return <div className="shared-workbench-loading">正在打开作品…</div>;

  function patchNovel(patch: Partial<Novel>) { if (novel) setNovel({ ...novel, ...patch }); }
  function updateChapter(id: string, patch: Partial<Novel["chapters"][number]>) { if (novel) patchNovel({ chapters: novel.chapters.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function addChapter() { if (!novel) return; const chapter = { id: crypto.randomUUID(), title: `第${novel.chapters.length + 1}章 · 未命名章节`, text: "" }; patchNovel({ chapters: [...novel.chapters, chapter], activeChapterId: chapter.id }); setEditingChapterId(chapter.id); }
  function deleteChapter(id: string) { if (!novel || novel.chapters.length === 1) return; const chapters = novel.chapters.filter((item) => item.id !== id); patchNovel({ chapters, activeChapterId: id === novel.activeChapterId ? chapters[0].id : novel.activeChapterId }); }
  function addPerson() { if (!novel) return; const person = newCharacter(); patchNovel({ characters: [...novel.characters, person] }); setSelectedCharacterId(person.id); }
  function updatePerson(field: keyof Character, value: string) { if (!novel || !selectedCharacter) return; patchNovel({ characters: novel.characters.map((item) => item.id === selectedCharacter.id ? { ...item, [field]: value } : item) }); }
  function deletePerson() { if (!novel || !selectedCharacter) return; const characters = novel.characters.filter((item) => item.id !== selectedCharacter.id); patchNovel({ characters }); setSelectedCharacterId(characters[0]?.id || null); }
  function updateTitle(value: string) { if (isNovel && active) updateChapter(active.id, { title: value }); else setGeneric({ ...generic, title: value }); }
  function updateText(value: string) { if (isNovel && active) updateChapter(active.id, { text: value }); else setGeneric({ ...generic, text: value }); }
  function saveNow() {
    if (isNovel && novel) { const all = loadNovels(); saveNovels(all.map((item) => item.id === novel.id ? { ...novel, updatedAt: Date.now() } : item)); }
    else localStorage.setItem(storageKey, JSON.stringify(generic));
    setSaved("已保存");
  }

  return <div className="shared-workbench flex-1 flex flex-col overflow-hidden">
    <header className="shared-workbench-header">
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); go("create"); }}>←&nbsp; 创作</button>
      <div><strong>{isNovel ? `《${novel?.title}》` : `${creationType}创作区`}</strong><small>{creationType}</small></div>
      <span>{saved}</span>
    </header>
    <div className="shared-workbench-body flex-1 overflow-hidden">
      {isNovel && <aside className="novel-tools">{(["章节", "人物", "大纲"] as const).map((item) => <button key={item} className={panel === item ? "is-active" : ""} onClick={() => setPanel(panel === item ? null : item)}><b>{item[0]}</b><span>{item}</span></button>)}</aside>}
      {isNovel && panel && novel && <aside className="novel-panel">
        <header><strong>{panel}</strong><button onClick={() => setPanel(null)}>×</button></header>
        {panel === "章节" && <div className="chapter-manager">{novel.chapters.map((chapter) => <div className={chapter.id === novel.activeChapterId ? "chapter-row is-active" : "chapter-row"} key={chapter.id}>{editingChapterId === chapter.id ? <input value={chapter.title} onChange={(event) => updateChapter(chapter.id, { title: event.target.value })} onBlur={() => setEditingChapterId(null)} /> : <button onClick={() => patchNovel({ activeChapterId: chapter.id })}>{chapter.title}</button>}<button onClick={() => setEditingChapterId(chapter.id)}>改</button><button disabled={novel.chapters.length === 1} onClick={() => deleteChapter(chapter.id)}>删</button></div>)}<button className="panel-add" onClick={addChapter}>＋ 新建章节</button></div>}
        {panel === "人物" && <div className="character-manager"><div className="character-list">{novel.characters.map((person) => <button className={person.id === selectedCharacterId ? "is-active" : ""} onClick={() => setSelectedCharacterId(person.id)} key={person.id}>{person.name || "未命名人物"}</button>)}<button className="panel-add" onClick={addPerson}>＋ 新建人物</button></div>{selectedCharacter ? <div className="character-form">{characterFields.map(([field, label]) => <label key={field}><span>{label}</span>{field === "name" || field === "role" ? <input value={selectedCharacter[field]} onChange={(event) => updatePerson(field, event.target.value)} /> : <textarea value={selectedCharacter[field]} onChange={(event) => updatePerson(field, event.target.value)} />}</label>)}<button className="danger-text" onClick={deletePerson}>删除这个人物</button></div> : <p>还没有人物。先新建一个人物。</p>}</div>}
        {panel === "大纲" && <div className="outline-editor">{outlineFields.map(([field, label]) => <label key={field}><span>{label}</span><textarea value={novel.outline[field]} onChange={(event) => patchNovel({ outline: { ...novel.outline, [field]: event.target.value } })} placeholder={`写下${label}……`} /></label>)}</div>}
      </aside>}
      <article className={`shared-writing-paper ${isNovel ? "is-novel" : ""}`}>
        {isNovel && <input className="workbench-book-title" aria-label="作品名称" value={novel?.title || ""} onChange={(event) => patchNovel({ title: event.target.value })} />}
        <div className="workbench-type-label">{creationType}创作区</div>
        <input className="workbench-title" aria-label={isNovel ? "章节标题" : "内容标题"} value={title} onChange={(event) => updateTitle(event.target.value)} placeholder={isNovel ? "章节标题" : "给这篇内容起个标题"} />
        <textarea aria-label="正文编辑区" value={text} onChange={(event) => updateText(event.target.value)} placeholder="从这里开始写……" />
        <footer><span>{count.toLocaleString("zh-CN")} 字</span><span>{saved}</span><button onClick={saveNow}>保存</button></footer>
      </article>
    </div>
  </div>;
}

function DesignScreen({ go, onSelectProduct }: { go: (s: Screen) => void; onSelectProduct: (product: Product) => void }) {
  function openService(product: Product) {
    onSelectProduct(product);
    const url = new URL(window.location.href);
    url.searchParams.set("product", String(product.id));
    window.history.pushState({}, "", url);
    go("product");
  }
  const entries = [
    { product: DESIGN_SERVICES[0], number: "01", title: "UI 设计", desc: "界面 · 页面 · 产品" },
    { product: DESIGN_SERVICES[1], number: "02", title: "AI 工作台", desc: "把自己的工作方式做成工具" },
    { product: DESIGN_SERVICES[2], number: "03", title: "个人网站", desc: "作品 · 品牌 · 内容" },
    { product: DESIGN_SERVICES[3], number: "04", title: "个人 APP", desc: "从想法开始搭一个应用" },
  ];
  return (
    <div className="design-page flex-1 flex flex-col overflow-hidden">
      <div className="design-header">
        <div className="design-title">设计</div>
        <div className="design-subtitle">把一个想法，慢慢变成看得见的东西</div>
      </div>
      <div className="design-content flex-1 overflow-y-auto scrollbar-hide">
        <div className="design-question">今天，你想把什么做出来？</div>
        <div className="design-entry-grid">
          {entries.map((entry) => <button key={entry.number} onClick={() => openService(entry.product)} className="design-entry text-left">
            <span className="design-entry-number">{entry.number}</span>
            <strong>{entry.title}</strong>
            <small>{entry.desc}</small>
          </button>)}
        </div>
        <div className="design-signature">
          <strong>审美 + 故事</strong>
          <span>才是你的 IP</span>
        </div>
      </div>
      <BottomNav screen="design" go={go} />
    </div>
  );
}

// ─── Screen 02: Home ─────────────────────────────────────────────────────────

const CATEGORIES = ["推荐", "正常类目", "小众", "奇怪"];

function HomeScreen({ go, onSelectProduct, products }: {
  go: (s: Screen) => void;
  onSelectProduct: (p: Product) => void;
  products: Product[];
}) {
  function selectProduct(p: Product) {
    onSelectProduct(p);
    go("product");
  }

  const resourcePresentation: Record<number, { mark: string; line: string }> = {
    1: { mark: "AI", line: "第一次用 AI，也能一步步做出来" },
    2: { mark: "会", line: "把常用权益留在一个更省心的位置" },
    3: { mark: "W", line: "需要激活时，少走一点弯路" },
    4: { mark: "GPT", line: "更轻松地体验完整的 AI 对话能力" },
    5: { mark: "1:1", line: "有人陪你把问题真正做完" },
    6: { mark: "N", line: "把一整年的好内容慢慢看完" },
    7: { mark: "网", line: "先把稳定这件小事认真解决" },
  };
  const featured = products[0];
  const moreResources = products.slice(1);

  return (
    <div className="resources-page flex-1 flex flex-col overflow-hidden">
      <div className="resources-header px-5 pt-[54px] pb-[30px] text-center">
        <div className="resources-title">技能资源</div>
        <div className="resources-subtitle">一些真正能派上用场的东西</div>
      </div>

      {/* Curated resources */}
      <div className="resources-content flex-1 overflow-y-auto scrollbar-hide">
        {featured && <>
          <div className="resources-section-label">本周值得看看</div>
          <button onClick={() => selectProduct(featured)} className="featured-resource text-left">
            <div className="resource-mark featured-mark">{resourcePresentation[featured.id]?.mark || featured.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="featured-resource-name">{featured.name}</div>
              <div className="featured-resource-line">{resourcePresentation[featured.id]?.line || featured.desc}</div>
              <div className="featured-resource-price">{featured.price}</div>
            </div>
          </button>
        </>}

        <div className="resources-section-label more-label">更多资源</div>
        <div className="resources-grid grid grid-cols-2 content-start">
        {moreResources.map((p) => (
          <button key={p.id} onClick={() => selectProduct(p)}
            className="resource-item text-left">
            <div className="resource-mark">{resourcePresentation[p.id]?.mark || p.icon}</div>
            <div className="resource-copy">
              <div className="resource-name">{p.name}</div>
              <div className="resource-desc line-clamp-2">{resourcePresentation[p.id]?.line || p.desc}</div>
              <div className="resource-price">{p.price}</div>
            </div>
          </button>
        ))}
        </div>

        <div className="resources-section-label design-label">设计服务</div>
        <div className="design-entry-grid">
          <button onClick={() => selectProduct(DESIGN_SERVICES[0])} className="design-entry text-left"><span className="design-entry-number">01</span><strong>UI 设计</strong><small>界面 · 页面 · 产品</small></button>
          <button onClick={() => selectProduct(DESIGN_SERVICES[1])} className="design-entry text-left"><span className="design-entry-number">02</span><strong>AI 工作台</strong><small>把工作方式做成工具</small></button>
          <button onClick={() => selectProduct(DESIGN_SERVICES[2])} className="design-entry text-left"><span className="design-entry-number">03</span><strong>个人网站</strong><small>作品 · 品牌 · 内容</small></button>
          <button onClick={() => selectProduct(DESIGN_SERVICES[3])} className="design-entry text-left"><span className="design-entry-number">04</span><strong>个人 APP</strong><small>从想法开始搭应用</small></button>
        </div>
      </div>

      {/* Bottom nav */}
      <BottomNav screen="resources" go={go} />
    </div>
  );
}

// ─── Screen 03: Product Detail ────────────────────────────────────────────────

const DESIGN_SERVICE_CONTENT: Record<number, {
  tagline: string;
  fit: string[];
  steps: string[];
  deliverables: string[];
}> = {
  1001: {
    tagline: "让界面不只好看，也真正顺手好用",
    fit: ["已有产品，但界面显得混乱或不统一", "正在做新页面，需要先把信息与操作理顺", "希望现有产品更专业、更有自己的气质"],
    steps: ["理解产品与用户", "梳理页面结构", "建立视觉与交互方向", "完成关键页面设计"],
    deliverables: ["页面结构与关键流程", "核心界面视觉稿", "交互说明与设计规范", "可继续开发的交付文件"],
  },
  1002: {
    tagline: "把你每天重复的工作，做成自己的工具",
    fit: ["工作里有很多重复步骤，想交给 AI", "工具很多，却没有一套真正适合自己的流程", "已经在用 AI，但结果总是不稳定"],
    steps: ["拆解真实工作流程", "找到适合 AI 的环节", "设计工作台与操作方式", "搭建可运行版本"],
    deliverables: ["个人工作流地图", "AI 功能与提示策略", "工作台界面方案", "可试用的工作台版本"],
  },
  1003: {
    tagline: "让作品、品牌与内容拥有自己的地址",
    fit: ["想认真展示自己的作品与经历", "需要一个比社交主页更完整的个人空间", "已经有内容，但不知道怎样组织成网站"],
    steps: ["确定网站要讲的故事", "整理内容与访问路径", "完成页面与视觉设计", "搭建并准备上线"],
    deliverables: ["网站内容结构", "核心页面设计", "响应式可运行网站", "上线与后续维护说明"],
  },
  1004: {
    tagline: "把一个想法，做成真正可以使用的产品",
    fit: ["有一个产品想法，但不知道怎么落地", "已经用 AI 搭了一半，却越来越乱", "想做自己的工具、小程序或 APP"],
    steps: ["梳理想法", "确定核心功能", "页面与交互设计", "搭建可运行版本"],
    deliverables: ["清晰的产品范围", "核心流程与页面设计", "可以实际体验的版本", "后续迭代与上线建议"],
  },
};

function DesignServiceScreen({ product, go }: { product: Product; go: (s: Screen) => void }) {
  const content = DESIGN_SERVICE_CONTENT[product.id];
  return (
    <div className="service-page flex-1 flex flex-col overflow-hidden">
      <div className="purchase-header">
        <button onClick={() => go("design")} className="purchase-back">←</button>
        <span>定制设计</span>
        <div className="w-9" />
      </div>
      <div className="service-scroll flex-1 overflow-y-auto scrollbar-hide">
        <div className="service-intro">
          <div className="service-index">{String(product.id - 1000).padStart(2, "0")}</div>
          <h1>{product.name}</h1>
          <p>{content.tagline}</p>
        </div>
        <section className="service-section">
          <h2>适合你，如果你正在……</h2>
          {content.fit.map((item) => <div key={item} className="service-fit-item">{item}</div>)}
        </section>
        <section className="service-section">
          <h2>我们会一起完成</h2>
          <div className="service-steps">{content.steps.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b></div>)}</div>
        </section>
        <section className="service-section">
          <h2>你最终会拿到什么</h2>
          {content.deliverables.map((item) => <div key={item} className="service-deliverable"><span>✓</span>{item}</div>)}
        </section>
      </div>
      <div className="service-action">
        <div><span>定制服务</span><strong>先确认需求，再提供报价</strong></div>
        <button onClick={() => go("design-brief")}>聊聊你的想法 →</button>
      </div>
    </div>
  );
}

function DesignBriefScreen({ product, go }: { product: Product; go: (s: Screen) => void }) {
  const [step, setStep] = useState(0);
  const [idea, setIdea] = useState("");
  const [details, setDetails] = useState({ use: "", code: "", timeline: "", budget: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [inquiryId, setInquiryId] = useState("");
  const [error, setError] = useState("");

  async function submitBrief() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/design-inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId: product.id, service: product.name, idea, ...details }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "提交失败");
      setInquiryId(String(result.id));
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败，请稍后重试");
    } finally { setSubmitting(false); }
  }

  if (submitted) return <div className="brief-page flex-1 flex flex-col"><div className="brief-success"><div className="success-check">✓</div><div className="brief-success-kicker">已收到需求 · 等待确认</div><h1>你的想法已经有了一个开始</h1><div className="brief-inquiry-id">需求编号：{inquiryId}</div><p>我们会先阅读需求、确认范围，再与你沟通方案和报价。在确认之前不会产生费用。</p><button onClick={() => go("design")}>返回设计页</button></div></div>;

  return <div className="brief-page flex-1 flex flex-col overflow-hidden">
    <div className="purchase-header"><button onClick={() => step === 0 ? go("product") : setStep(0)} className="purchase-back">←</button><span>聊聊你的想法</span><div className="brief-progress">{step + 1}/2</div></div>
    <div className="brief-content flex-1 overflow-y-auto scrollbar-hide">
      {step === 0 ? <>
        <div className="brief-kicker">{product.name}</div><h1>你想做什么？</h1><p>不用写成正式需求。像聊天一样，把脑子里的想法告诉我们就好。</p>
        <textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="例如：我想做一个帮助自己管理小说人物和章节的 APP……" autoFocus />
      </> : <>
        <div className="brief-kicker">再了解一点</div><h1>这个想法现在走到哪里了？</h1><p>这些信息帮助我们判断范围，不需要一次回答得很完整。</p>
        <label>它主要给谁使用？<input value={details.use} onChange={(event) => setDetails({...details,use:event.target.value})} placeholder="自己、客户、读者，或其他人" /></label>
        <label>现在有现成内容或代码吗？<input value={details.code} onChange={(event) => setDetails({...details,code:event.target.value})} placeholder="没有 / 有设计稿 / 已经搭了一部分" /></label>
        <label>希望什么时候看到第一版？<input value={details.timeline} onChange={(event) => setDetails({...details,timeline:event.target.value})} placeholder="例如：两周内、下个月、不着急" /></label>
        <label>预算大概在什么范围？<input value={details.budget} onChange={(event) => setDetails({...details,budget:event.target.value})} placeholder="暂不确定也可以" /></label>
      </>}
      {error && <div className="brief-error">{error}</div>}
    </div>
    <div className="brief-action"><button disabled={step === 0 ? idea.trim().length < 6 : submitting} onClick={() => step === 0 ? setStep(1) : submitBrief()}>{step === 0 ? "继续说说 →" : submitting ? "正在提交…" : "提交需求"}</button><p>提交需求不代表下单，也不会产生费用</p></div>
  </div>;
}

function ProductScreen({ product, go }: { product: Product; go: (s: Screen) => void }) {
  if (product.id >= 1000) return <DesignServiceScreen product={product} go={go} />;
  return <ResourceProductScreen product={product} go={go} />;
}

function ResourceProductScreen({ product, go }: { product: Product; go: (s: Screen) => void }) {
  const [qty, setQty] = useState(1);
  const [linkCopied, setLinkCopied] = useState(false);
  const [availableCodes, setAvailableCodes] = useState<number | null>(null);
  const needsCode = product.id < 1000 && product.badge !== "需预约";

  useEffect(() => {
    if (!needsCode) return;
    fetch(`/api/codes?productId=${product.id}`)
      .then((response) => response.json())
      .then((result) => setAvailableCodes(Number(result.available ?? 0)))
      .catch(() => setAvailableCodes(null));
  }, [needsCode, product.id]);

  const unavailable = needsCode && availableCodes === 0;

  function copyOrderLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("product", String(product.id));
    window.history.replaceState({}, "", url);
    navigator.clipboard.writeText(url.toString()).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  }

  return (
    <div className="purchase-page flex-1 flex flex-col overflow-hidden">
      {/* Nav */}
      <div className="purchase-header">
        <button onClick={() => go(product.id >= 1000 ? "design" : "resources")} className="purchase-back">←</button>
        <span>商品详情</span>
        <button onClick={copyOrderLink} className="purchase-share">{linkCopied ? "已复制" : "分享"}</button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-28">
        <div className="purchase-intro">
          <div className="purchase-product-mark">{product.name.includes("AI") ? "AI" : product.name.slice(0, 1)}</div>
          <div className="purchase-kicker">{product.badge}</div>
          <h1>{product.name}</h1>
          <p>{product.desc}</p>
        </div>

        <div className="purchase-body">

          {/* Benefits */}
          <div className="purchase-section">
            <div className="purchase-section-title">你将获得</div>
            {["完整的分步学习指南", "可重复使用的配套模板", "真实场景实操案例", "后续内容免费更新"].map((b) => (
              <div key={b} className="purchase-benefit">
                <span>✓</span><div>{b}</div>
              </div>
            ))}
          </div>

          <div className="purchase-delivery">
            <span>交付方式</span>
            <div>{product.badge === "需预约" ? "购买后进入预约服务流程" : "支付成功后立即获得数字内容"}</div>
          </div>

          {/* Quantity */}
          <div className="purchase-quantity">
            <span>购买数量</span>
            <div>
              <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span>{qty}</span>
              <button onClick={() => setQty(qty + 1)}>＋</button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="purchase-cta">
        <div><span>价格</span><strong>{product.price}</strong></div>
        <button onClick={() => go("checkout")} disabled={unavailable || (needsCode && availableCodes === null)}>
          {availableCodes === null && needsCode ? "正在确认库存" : unavailable ? "暂时无法购买" : "继续购买"}
        </button>
        {unavailable && <p>当前数字内容暂时缺货，补充后即可购买，不会产生扣款。</p>}
      </div>
    </div>
  );
}

// ─── Screen 04: Checkout ──────────────────────────────────────────────────────

function CheckoutScreen({ product, go, onOrderCreated }: { product: Product; go: (s: Screen) => void; onOrderCreated: (order: CreatedOrder) => void }) {
  const [method, setMethod] = useState("alipay");
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [saveDeliveryEmail, setSaveDeliveryEmail] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [orderError, setOrderError] = useState("");

  async function createOrder() {
    const normalizedEmail = deliveryEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setOrderError("请输入正确的接收邮箱。");
      return;
    }
    setIsCreating(true);
    setOrderError("");

    try {
      if (product.id < 1000 && product.badge !== "需预约") {
        const availabilityResponse = await fetch(`/api/codes?productId=${product.id}`);
        const availability = await availabilityResponse.json();
        if (!availability.canPurchase) {
          setOrderError("该资源刚刚售罄，本次没有扣款。补充后即可继续购买。");
          return;
        }
      }
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          product: product.name,
          icon: product.icon,
          amount: product.price,
          paymentMethod: method,
          deliveryEmail: normalizedEmail,
          saveDeliveryEmail,
        }),
      });

      if (!response.ok) throw new Error("创建订单失败");

      const order = await response.json() as CreatedOrder;
      onOrderCreated(order);
      go("paying");
    } catch {
      // V7 disabled: fake local order fallback
      // const localOrder: CreatedOrder = {
      //   id: `ORDER-${Date.now()}`,
      //   productId: product.id,
      //   product: product.name,
      //   icon: product.icon,
      //   quantity: 1,
      //   amount: product.price,
      //   paymentMethod: method,
      //   status: "Pending",
      //   createdAt: new Date().toISOString(),
      //   deliveryEmail: normalizedEmail,
      //   saveDeliveryEmail,
      //   emailDeliveryStatus: "NotConfigured",
      // };
      // localStorage.setItem("latestOrder", JSON.stringify(localOrder));
      // onOrderCreated(localOrder);
      // setOrderError("订单已保存；支付能力审核中，暂未扣款。可在订单详情申请帮助。");
      // setTimeout(() => go("order-detail"), 900);
      setOrderError("订单创建失败，请重试");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="purchase-page flex-1 flex flex-col overflow-hidden">
      <div className="purchase-header">
        <button onClick={() => go("product")} className="purchase-back">←</button>
        <span>确认订单</span>
        <div className="w-9" />
      </div>

      <div className="checkout-content flex-1 overflow-y-auto scrollbar-hide">
        <div className="checkout-section">
          <div className="checkout-label">确认商品</div>
          <div className="checkout-product">
            <div className="checkout-mark">{product.name.includes("AI") ? "AI" : product.name.slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <div className="checkout-product-name">{product.name}</div>
              <div className="checkout-product-note">1 件 · {product.badge === "需预约" ? "购买后预约" : "支付后立即交付"}</div>
            </div>
            <div className="checkout-product-price">{product.price}</div>
          </div>
        </div>

        <div className="checkout-section payment-section">
          <div className="checkout-label">接收邮箱 *</div>
          <input type="email" value={deliveryEmail} onChange={(event) => setDeliveryEmail(event.target.value)} placeholder="请输入接收邮箱" className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg2)] px-3 text-sm" />
          <div className="mt-2 text-xs leading-5 text-[var(--text2)]">用于接收卡密、兑换码或数字商品，请确认邮箱填写正确。</div>
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text2)]"><input type="checkbox" checked={saveDeliveryEmail} onChange={(event) => setSaveDeliveryEmail(event.target.checked)} />保存此邮箱，下次购买自动填写</label>
          <div className="mt-2 text-[10px] leading-4 text-[var(--muted)]">商城账号接入后保存到你的收货资料；当前不会保存为公共浏览器默认值。</div>
        </div>

        <div className="checkout-section payment-section">
          <div className="checkout-label">选择支付方式</div>
          {[{ id: "alipay", label: "支付宝", mark: "支" }, { id: "wechat", label: "微信支付", mark: "微" }].map((m) => (
            <label key={m.id} className={`payment-option ${method === m.id ? "is-selected" : ""}`}>
              <span className="payment-mark">{m.mark}</span>
              <span>{m.label}</span>
              <div className="payment-radio">
                {method === m.id && <i />}
              </div>
              <input type="radio" name="pay" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="hidden" />
            </label>
          ))}
        </div>

        <div className="checkout-total">
          <div><span>商品金额</span><b>{product.price}</b></div>
          <div><span>交付费用</span><b>免费</b></div>
          <div className="final-total"><span>最终金额</span><strong>{product.price}</strong></div>
        </div>
      </div>

      <div className="checkout-action">
        <button onClick={createOrder} disabled={isCreating}
          className="checkout-pay-button">
          {isCreating ? "正在确认订单…" : `支付 ${product.price}`}
        </button>
        {orderError && <div className="text-center text-xs text-[var(--danger)] mt-2">{orderError}</div>}
        <div className="checkout-safe-note">支付前会再次确认库存 · 全程加密</div>
      </div>
    </div>
  );
}

// ─── Screen 05: Payment Processing ───────────────────────────────────────────

function PayingScreen({ product, go, order, onCodeAssigned }: { product: Product; go: (s: Screen) => void; order: CreatedOrder; onCodeAssigned: (code: string) => void }) {
  const [deliveryError, setDeliveryError] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      if (product.badge === "需预约") {
        go("success");
        return;
      }
      try {
        const response = await fetch("/api/codes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "assign", productId: order.productId, orderId: order.id }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "兑换码发放失败");
        onCodeAssigned(result.code);
        go("success");
      } catch (error) {
        setDeliveryError(error instanceof Error ? error.message : "兑换码发放失败");
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [go, onCodeAssigned, order.id, product.id]);

  return (
    <div className="payment-status-page flex-1 flex flex-col">
      <div className="payment-status-main">
        <div className={`status-symbol ${deliveryError ? "is-error" : ""}`}>{deliveryError ? "!" : <i />}</div>
        <div className="payment-status-kicker">{deliveryError ? "交付未完成" : "正在处理"}</div>
        <div className="payment-status-title">{deliveryError ? "本次没有完成交付" : "正在确认支付结果"}</div>
        <div className="payment-status-amount">{product.price}</div>
        <div className="payment-status-copy">
          {deliveryError ? "订单已被安全保留，请返回订单查看处理状态或联系帮助。" : "确认完成后，内容会自动放入你的账户。请暂时不要关闭页面。"}
        </div>
        {deliveryError && <button onClick={() => go("order-detail")} className="status-recovery-button">查看订单状态</button>}
      </div>
      <div className="payment-security">安全支付 · 状态会自动更新</div>
    </div>
  );
}

// ─── Screen 06: Payment Success ───────────────────────────────────────────────

function SuccessScreen({ go, order }: { go: (s: Screen) => void; order: CreatedOrder }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState("");

  function copy(code: string, key: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function redeemCode() {
    if (!order.deliveredCode) return;
    const response = await fetch("/api/codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", code: order.deliveredCode }),
    });
    const result = await response.json();
    if (!response.ok) {
      setRedeemMessage(result.message || "兑换失败");
      return;
    }
    setRedeemed(true);
    setRedeemMessage("兑换成功，权益已开通");
  }

  return (
    <div className="success-page flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide success-content animate-fade-in">
        <div className="success-header">
          <div className="success-check">✓</div>
          <div className="success-kicker">购买成功</div>
          <div className="success-title">你的内容已经准备好了</div>
          <div className="success-subtitle">{order.product} 已放入本次订单</div>
        </div>

        <div className="success-order-info">
          {[
            ["商品", order.product],
            ["订单号", order.id],
            ["支付时间", order.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN") : "刚刚"],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span><b>{v}</b>
            </div>
          ))}
        </div>

        <div className="delivery-result">
          <div className="delivery-result-label">你的领取凭证</div>
          {order.deliveredCode ? (
            <div className="delivery-code-row">
              <div>
                <div className="delivery-code">{order.deliveredCode}</div>
                <small>请妥善保存，不要转发给其他人</small>
              </div>
              <button onClick={() => copy(order.deliveredCode!, order.deliveredCode!)}
                className="copy-code-button">
                {copied === order.deliveredCode ? "已复制" : "复制"}
              </button>
            </div>
          ) : <div className="delivery-service-note">该资源将从订单页面继续交付。</div>}
          {order.deliveredCode && (
            <button onClick={redeemCode} disabled={redeemed} className="redeem-button">
              {redeemed ? "已兑换" : "立即兑换"}
            </button>
          )}
          {redeemMessage && <div className="redeem-message">{redeemMessage}</div>}
        </div>
      </div>

      <div className="success-actions">
        <button onClick={() => go("order-detail")}
          className="success-primary-action">
          查看订单
        </button>
        <button onClick={() => go("resources")} className="success-secondary-action">
          返回资源页
        </button>
      </div>
    </div>
  );
}

// ─── Screen 07: Orders ───────────────────────────────────────────────────────

const ORDER_TABS = ["All", "Pending", "Delivered", "Completed", "Refunded"];

function OrdersScreen({ go, currentOrder, onContinuePay }: { go: (s: Screen) => void; currentOrder?: CreatedOrder | null; onContinuePay: (orderId: string) => void }) {
  const [tab, setTab] = useState("All");

  const orderRows: Order[] = currentOrder ? [{
    id: currentOrder.id,
    product: currentOrder.product,
    icon: currentOrder.icon,
    qty: currentOrder.quantity,
    amount: currentOrder.amount,
    status: currentOrder.status,
    time: new Date(currentOrder.createdAt).toLocaleString("zh-CN"),
  }] : [];
  const filtered = tab === "All" ? orderRows : orderRows.filter((o) => o.status === tab);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center px-4 py-3 bg-[var(--bg2)] border-b border-[var(--border)]">
        <span className="flex-1 text-center font-extrabold text-[var(--text)] text-lg">我的订单</span>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-hide bg-[var(--bg2)] border-b border-[var(--border)] px-2">
        {ORDER_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap text-sm font-semibold px-4 py-3 border-b-2 transition-colors ${tab === t ? "border-[var(--pink)] text-[var(--pink)]" : "border-transparent text-[var(--text2)]"}`}>
            {t === "All" ? "全部" : STATUS_LABELS[t] || t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="text-3xl text-[var(--border)] select-none">—</div>
            <div className="text-sm text-[var(--text2)]">暂无订单</div>
          </div>
        )}
        {filtered.map((o) => (
          <div key={o.id} className="bg-[var(--bg2)] rounded-2xl p-4 border border-[var(--border)]">
            <div className="flex justify-between items-start mb-3">
              <div className="text-xs text-[var(--text2)]">订单号：{o.id}</div>
              <StatusBadge status={o.status} />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[var(--pink-soft)] flex items-center justify-center text-2xl">{o.icon}</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-[var(--text)]">{o.product}</div>
                <div className="text-xs text-[var(--text2)]">数量：{o.qty} · {o.time}</div>
              </div>
              <div className="text-base font-extrabold text-[var(--text)]">{o.amount}</div>
            </div>
            <div className="mt-3 flex gap-2">
              {o.status === "Pending" && (
                <button onClick={() => onContinuePay(o.id)}
                  className="flex-1 h-9 rounded-xl bg-[var(--pink)] text-[var(--bg2)] text-xs font-bold">
                  继续支付
                </button>
              )}
              {o.status === "Delivered" && (
                <button onClick={() => go("order-detail")}
                  className="flex-1 h-9 rounded-xl border border-[var(--pink)] text-[var(--pink)] text-xs font-bold">
                  查看详情
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <BottomNav screen="orders" go={go} />
    </div>
  );
}

// ─── Screen 08: Order Detail ──────────────────────────────────────────────────

function OrderDetailScreen({ go, order }: { go: (s: Screen) => void; order: CreatedOrder | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(code: string, key: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center px-4 py-3 bg-[var(--bg2)] border-b border-[var(--border)]">
        <button onClick={() => go("orders")} className="w-9 h-9 rounded-full bg-[var(--bg)] flex items-center justify-center">←</button>
        <span className="flex-1 text-center font-bold text-[var(--text)]">订单详情</span>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-5 flex flex-col gap-4">
        {/* Order info */}
        <div className="bg-[var(--bg2)] rounded-2xl p-4 border border-[var(--border)]">
          <div className="text-sm font-bold text-[var(--text)] mb-3 flex justify-between">
            <span>订单信息</span>
            <StatusBadge status={order?.status ?? "Pending"} />
          </div>
          {[
            ["订单号", order?.id ?? "—"],
            ["创建时间", order ? new Date(order.createdAt).toLocaleString("zh-CN") : "—"],
            ["支付方式", order?.paymentMethod === "wechat" ? "微信支付" : "支付宝"],
            ["支付时间", order?.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN") : "—"],
            ["接收邮箱", order?.deliveryEmail ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-1.5 border-b border-[var(--bg2)] last:border-0">
              <span className="text-[var(--text2)]">{k}</span>
              <span className="font-semibold text-[var(--text)]">{v}</span>
            </div>
          ))}
        </div>

        {/* Product */}
        <div className="bg-[var(--bg2)] rounded-2xl p-4 border border-[var(--border)]">
          <div className="text-sm font-bold text-[var(--text)] mb-3">商品</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--cream)] flex items-center justify-center text-sm font-semibold text-[var(--text2)]" style={{ fontFamily: "Arial, sans-serif", letterSpacing: 0 }}>{(order?.product ?? "—").slice(0, 2)}</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-[var(--text)]">{order?.product ?? "—"}</div>
              <div className="text-xs text-[var(--text2)]">数量：{order?.quantity ?? 1}</div>
            </div>
            <div className="text-base font-extrabold text-[var(--pink)]">{order?.amount ?? "—"}</div>
          </div>
        </div>

        {/* Digital delivery */}
        <div className="bg-[var(--bg2)] rounded-2xl p-4 border border-[var(--border)]">
          <div className="text-sm font-bold text-[var(--text)] mb-3">数字交付</div>
          {order?.deliveredCode ? (
            <div className="flex items-center justify-between bg-[var(--pink-soft)] rounded-xl px-3 py-2.5 mb-2">
              <div>
                <div className="text-[10px] text-[var(--text2)]">兑换码</div>
                <div className="font-mono text-sm font-bold text-[var(--text)]">{order.deliveredCode}</div>
              </div>
              <button onClick={() => copy(order.deliveredCode!, order.deliveredCode!)}
                className="text-xs font-semibold text-[var(--pink)] bg-[var(--bg2)] border border-[var(--pink)] px-3 py-1 rounded-lg">
                {copied === order.deliveredCode ? "已复制" : "复制"}
              </button>
            </div>
          ) : <div className="text-sm text-[var(--muted)]">当前订单还没有发放兑换码。</div>}
          <div className="mt-3 text-xs text-[var(--text2)]">邮件状态：{order?.emailDeliveryStatus === "Sent" ? "已发送" : order?.emailDeliveryStatus === "Failed" ? "发送失败" : order?.emailDeliveryStatus === "Pending" ? "等待发送" : "邮件服务尚未接入"}</div>
        </div>

        {/* Support */}
        <div className="flex gap-3">
          <button onClick={() => go("support")} className="flex-1 h-11 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text2)]">
            申请退款
          </button>
          <button onClick={() => go("support")} className="flex-1 h-11 rounded-xl border border-[var(--pink)] text-sm font-semibold text-[var(--pink)]">
            联系客服
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 09: Profile ───────────────────────────────────────────────────────

function LegacyProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [profile, setProfile] = useState({
    name: "好技友",
    bio: "",
    gender: "",
    ip: "",
    industry: "",
  });
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg2)] border-b border-[var(--border)]">
        <span className="font-hand text-2xl text-[var(--text)]">我的</span>
        <button onClick={() => go("admin-login")} className="text-xs font-bold text-[var(--pink)]">管理员通道</button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-5 flex flex-col gap-4">
        {/* Header card */}
        <div className="card-journal p-4 flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[15px_11px_16px_10px] bg-[#F8F3EB]">
            <img
              src={splashCover.src}
              alt="用户原创手绘头像"
              className="absolute max-w-none"
              style={{ width: "181px", height: "320px", left: "-51px", top: "-116px" }}
            />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-[var(--muted)]">昵称</div>
                <span className="font-bold text-[var(--text)] text-base">{profile.name}</span>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="shrink-0 text-xs font-bold text-[var(--pink)]">
                编辑资料
              </button>
            </div>
            <div className="mt-2 text-[11px] font-bold text-[var(--muted)]">简介</div>
            <div className="text-xs leading-5 text-[var(--text2)]">
              {profile.bio || "这个人很懒，还没有简介"}
            </div>
          </div>
        </div>

        {/* Edit profile form */}
        {isEditing && (
          <div className="bg-[var(--bg2)] rounded-2xl p-4 border border-[var(--border)] flex flex-col gap-3">
            <div className="text-sm font-bold text-[var(--text)]">
              编辑资料
            </div>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text2)]">
              名字
              <input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--pink)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text2)]">
              简介
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                rows={2}
                className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--pink)] resize-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text2)]">
              性别
              <select
                value={profile.gender}
                onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--pink)]">
                <option value="">不透露</option>
                <option value="男">男</option>
                <option value="女">女</option>
                <option value="其他">其他</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text2)]">
              IP 属地
              <input
                value={profile.ip}
                onChange={(e) => setProfile({ ...profile, ip: e.target.value })}
                placeholder="例如：上海"
                className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--pink)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text2)]">
              行业
              <input
                value={profile.industry}
                onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                placeholder="例如：设计 / 开发 / 运营"
                className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--pink)]"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-[var(--pink-soft)] text-[var(--text)]">
                取消
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold bg-[var(--pink)] text-[var(--bg2)]">
                保存
              </button>
            </div>
          </div>
        )}

        {/* Order shortcuts */}
        <div className="bg-[var(--bg2)] rounded-2xl p-4 border border-[var(--border)]">
          <div className="text-sm font-bold text-[var(--text)] mb-3">我的订单</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "待处理", icon: "⏳", screen: "orders" as Screen },
              { label: "已交付", icon: "📦", screen: "orders" as Screen },
              { label: "全部订单", icon: "📋", screen: "orders" as Screen },
            ].map((item) => (
              <button key={item.label} onClick={() => go(item.screen)}
                className="flex flex-col items-center gap-1.5 py-3 bg-[var(--bg)] rounded-xl hover:bg-[var(--pink-soft)] transition-colors">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs font-semibold text-[var(--text2)]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Utilities */}
        <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden">
          {[
            { icon: "✦", label: "技能入驻", screen: "creator-register" as Screen },
            { icon: "▣", label: "我的钱包", screen: "wallet" as Screen },
            { icon: "❓", label: "帮助中心", screen: "help" as Screen },
            { icon: "◇", label: "订阅会员", screen: "membership" as Screen },
            { icon: "✎", label: "投诉建议", screen: "support" as Screen },
            { icon: "⚙", label: "系统设置", screen: "settings" as Screen },
          ].map((item, i, arr) => (
            <button key={item.label}
              onClick={() => go(item.screen)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg2)] transition-colors ${i < arr.length - 1 ? "border-b border-[var(--pink-soft)]" : ""}`}>
              <span className="text-xl">{item.icon}</span>
              <span className="flex-1 text-left text-sm font-semibold text-[var(--text)]">{item.label}</span>
              <span className="text-[var(--muted)] text-sm">›</span>
            </button>
          ))}
        </div>
      </div>

      <BottomNav screen="profile" go={go} />
    </div>
  );
}

function ProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [profile, setProfile] = useState({ name: "好技友", bio: "", gender: "", ip: "", industry: "" });
  const [isEditing, setIsEditing] = useState(false);
  const accountItems: { label: string; screen: Screen }[] = [
    { label: "我的订单", screen: "orders" },
    { label: "我的钱包", screen: "wallet" },
    { label: "订阅会员", screen: "membership" },
  ];
  const supportItems: { label: string; screen: Screen }[] = [
    { label: "帮助中心", screen: "help" },
    { label: "投诉建议", screen: "support" },
    { label: "系统设置", screen: "settings" },
  ];

  const renderDirectory = (items: { label: string; screen: Screen }[]) => (
    <div className="profile-directory">
      {items.map((item) => (
        <button key={item.label} onClick={() => go(item.screen)} className="profile-directory-item">
          <span>{item.label}</span>
          <span className="profile-directory-arrow">›</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="profile-page flex-1 flex flex-col overflow-hidden">
      <div className="profile-scroll flex-1 overflow-y-auto scrollbar-hide">
        <header className="profile-header">
          <h1>我的</h1>
        </header>

        <section className="profile-identity">
          <div className="profile-avatar">
            <img
              src={splashCover.src}
              alt="用户原创手绘头像"
              className="absolute max-w-none"
              style={{ width: "162px", height: "286px", left: "-45px", top: "-104px" }}
            />
          </div>
          <div className="profile-copy">
            <div className="profile-name">{profile.name}</div>
            <div className="profile-bio">{profile.bio || "还没有简介"}</div>
            <button onClick={() => setIsEditing((current) => !current)} className="profile-edit">编辑资料&nbsp; →</button>
          </div>
        </section>

        {isEditing && (
          <div className="profile-editor">
            <label>昵称<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
            <label>简介<textarea value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
            <div className="profile-editor-actions">
              <button onClick={() => setIsEditing(false)} className="profile-save">保存资料</button>
              <button onClick={() => go("admin-login")} className="profile-admin">管理频道</button>
            </div>
          </div>
        )}

        <button onClick={() => go("creator-register")} className="profile-featured-entry">
          <span className="profile-featured-copy">
            <strong>技能入驻</strong>
            <small>把你的经验、能力与作品，变成可以出售的技能。</small>
          </span>
          <span className="profile-featured-arrow">→</span>
        </button>

        {renderDirectory(accountItems)}
        {renderDirectory(supportItems)}
      </div>

      <BottomNav screen="profile" go={go} />
    </div>
  );
}

function SimpleHeader({ title, go }: { title: string; go: (s: Screen) => void }) {
  return <div className="flex items-center px-4 py-3 bg-[var(--bg2)] border-b border-[var(--border)]"><button onClick={() => go("profile")} className="w-9 h-9 rounded-full bg-[var(--bg)]">←</button><div className="flex-1 text-center font-bold text-[var(--text)]">{title}</div><div className="w-9" /></div>;
}

function SupportScreen({ go }: { go: (s: Screen) => void }) {
  const [content, setContent] = useState("");
  const [sent, setSent] = useState(false);
  function submitSupport() {
    if (!content.trim()) return;
    const tickets = JSON.parse(localStorage.getItem("supportTickets") || "[]") as Array<Record<string, string>>;
    tickets.push({ id: `TICKET-${Date.now()}`, content: content.trim(), createdAt: new Date().toISOString() });
    localStorage.setItem("supportTickets", JSON.stringify(tickets));
    setSent(true);
    setContent("");
  }
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="投诉建议" go={go} /><div className="p-4 flex flex-col gap-4"><div className="card-journal p-4"><div className="font-bold">需要我们帮什么？</div><div className="text-xs text-[var(--text2)] mt-1">订单、退款、兑换码或创作者入驻问题都可以提交。</div><textarea value={content} onChange={(event) => { setContent(event.target.value); setSent(false); }} className="mt-3 w-full h-28 rounded-xl border border-[var(--border)] p-3 text-sm" placeholder="请描述遇到的问题" /><button onClick={submitSupport} disabled={!content.trim()} className="mt-3 w-full h-10 rounded-xl bg-[var(--pink)] text-white font-bold text-sm disabled:opacity-50">提交问题</button>{sent && <div className="text-sm text-[var(--green)] mt-2">已提交并保存在本机，正式客服数据库接入后会同步到处理后台。</div>}</div><div className="card-journal p-4 text-xs leading-6 text-[var(--text2)]"><div className="font-bold text-sm text-[var(--text)]">虚拟商品说明</div>兑换码或卡密一经成功激活，通常不支持无理由退换；未激活、无法使用或商品描述不符的情况可以提交售后审核。</div></div></div>;
}

function HelpScreen({ go }: { go: (s: Screen) => void }) {
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="帮助中心" go={go} /><div className="p-4 flex flex-col gap-3">{[["如何购买？","选择商品后确认订单，支付成功会自动发放兑换码。"],["兑换码在哪里？","支付成功页和订单详情页都可以查看。"],["如何成为创作者？","进入个人技能入驻通道，填写擅长技能并等待审核。"],["如何售卖自己的技能？","先提交技能入驻申请，审核通过后进入商家后台上传商品、定价并提交审核。"],["如何退款？","在订单详情或投诉建议中提交退款申请。"]].map(([q,a]) => <div key={q} className="card-journal p-4"><div className="font-bold text-sm">{q}</div><div className="text-xs text-[var(--text2)] mt-2">{a}</div></div>)}</div></div>;
}

function WalletScreen({ go }: { go: (s: Screen) => void }) {
  const [bindings, setBindings] = useState<Record<string, boolean>>({});
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="我的钱包" go={go} /><div className="p-4"><div className="card-journal p-4"><div className="font-bold text-sm">支付方式</div>{[{ name:"支付宝", icon:"▣" },{ name:"微信支付", icon:"♥" }].map((item,index) => <div key={item.name} className={`flex items-center justify-between py-4 ${index === 0 ? "border-b border-[var(--border)]" : ""}`}><div className="flex items-center gap-3"><span className="text-xl text-[var(--pink)]">{item.icon}</span><span className="font-bold text-sm">{item.name}</span></div><button onClick={() => setBindings((current) => ({...current,[item.name]:!current[item.name]}))} className={`rounded-full border px-4 py-1 text-xs font-bold ${bindings[item.name] ? "border-[var(--pink)] bg-[var(--pink)] text-white" : "border-[var(--pink)] text-[var(--pink)]"}`}>{bindings[item.name] ? "已绑定" : "绑定"}</button></div>)}</div><div className="mt-4 text-xs leading-5 text-[var(--text2)]">当前只保存前端绑定状态。正式支付账户绑定需要服务端身份验证和支付平台授权。</div></div></div>;
}

function MembershipScreen({ go }: { go: (s: Screen) => void }) {
  const [message, setMessage] = useState("");
  const [shared, setShared] = useState(false);
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="订阅会员" go={go} /><div className="p-4 flex flex-col gap-4"><div className="card-journal p-4"><div className="font-bold text-sm">会员充值</div><div className="mt-3 grid grid-cols-3 gap-2">{["月卡 ¥19","季卡 ¥49","年卡 ¥168"].map((item) => <button key={item} onClick={() => setMessage(`已选择${item}`)} className="rounded-xl border border-[var(--border)] px-2 py-3 text-xs font-bold">{item}</button>)}</div>{message && <div className="mt-3 text-xs text-[var(--pink)]">{message}，支付接入后可完成充值。</div>}</div><div className="card-journal p-4"><div className="font-bold text-sm">分享 APP 可返现</div><div className="mt-2 text-xs leading-5 text-[var(--text2)]">分享你的专属邀请信息。真实返现需要邀请关系、订单结算和防刷机制。</div><button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setShared(true); } catch { setShared(true); } }} className="mt-3 h-10 w-full rounded-xl bg-[var(--pink)] text-sm font-bold text-white">{shared ? "分享信息已准备" : "分享 APP"}</button></div></div></div>;
}

function SettingsScreen({ go, brightness, setBrightness, dark, setDark }: { go: (s: Screen) => void; brightness: number; setBrightness: (value: number) => void; dark: boolean; setDark: (value: boolean) => void }) {
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("appFontSize") || 100));
  const [anonymous, setAnonymous] = useState(() => localStorage.getItem("anonymousTrade") !== "false");
  function updateFontSize(value: number) { setFontSize(value); localStorage.setItem("appFontSize", String(value)); document.documentElement.style.fontSize = `${value}%`; }
  function updateAnonymous(value: boolean) { setAnonymous(value); localStorage.setItem("anonymousTrade", String(value)); }
  return <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden"><SimpleHeader title="设置" go={go} /><div className="p-4 overflow-y-auto flex flex-col gap-4">
    <div className="card-journal p-4"><div className="font-bold text-sm">显示设置</div><label className="mt-3 flex justify-between text-sm">深色模式<input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /></label><label className="block mt-4 text-sm">APP 亮度：{brightness}%<input className="w-full mt-2" type="range" min="70" max="120" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label><label className="block mt-4 text-sm">字体大小：{fontSize}%<input className="w-full mt-2" type="range" min="85" max="120" value={fontSize} onChange={(e) => updateFontSize(Number(e.target.value))} /></label></div>
    <div className="card-journal p-4"><div className="font-bold text-sm">交易隐私</div><label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={anonymous} onChange={(e) => updateAnonymous(e.target.checked)} /><span><span className="font-bold">匿名交易</span><span className="mt-1 block text-xs leading-5 text-[var(--text2)]">对外隐藏真实昵称和联系方式，仅订单双方及平台审核人员按权限查看必要信息。</span></span></label></div>
    <div className="card-journal p-4"><div className="font-bold text-sm">切换商家账号</div><div className="mt-2 text-xs leading-5 text-[var(--text2)]">审核通过的创作者可以进入独立商家后台；尚未入驻请先提交技能申请。</div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => go("creator-register")} className="h-10 rounded-xl border border-[var(--pink)] text-[var(--pink)] font-bold text-sm">申请入驻</button><button onClick={() => go("merchant-login")} className="h-10 rounded-xl bg-[var(--pink)] text-white font-bold text-sm">商家登录</button></div></div>
  </div></div>;
}

function CreatorRegisterScreen({ go }: { go: (s: Screen) => void }) {
  const [form, setForm] = useState({ name:"", contact:"", skill:"", description:"", category:CATEGORIES[0], portfolio:"", agreed:false });
  const [message, setMessage] = useState("");
  async function submit() { const response = await fetch("/api/creators", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) }); const result = await response.json(); setMessage(response.ok ? `提交成功，申请编号：${result.id}` : result.message); }
  return <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden"><SimpleHeader title="个人技能入驻" go={go} /><div className="p-4 overflow-y-auto"><div className="card-journal p-4 flex flex-col gap-3"><div className="text-sm font-bold">告诉我们你会什么技能</div>{[["姓名或昵称","name","例如：小林"],["联系方式","contact","微信、邮箱或手机号"],["擅长技能","skill","例如：小说写作、绘画、剪辑"],["作品链接","portfolio","可选：作品集或主页地址"]].map(([label,key,placeholder]) => <label key={key} className="text-xs font-semibold text-[var(--text2)]">{label}<input value={String(form[key as keyof typeof form])} onChange={(e) => setForm({...form,[key]:e.target.value})} placeholder={placeholder} className="mt-1 w-full h-10 rounded-xl border border-[var(--border)] px-3 text-sm" /></label>)}<label className="text-xs font-semibold text-[var(--text2)]">技能说明<textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})} className="mt-1 w-full h-24 rounded-xl border border-[var(--border)] p-3 text-sm" placeholder="说明你能教什么、适合谁、如何交付" /></label><label className="text-xs font-semibold text-[var(--text2)]">发布分类<select value={form.category} onChange={(e) => setForm({...form,category:e.target.value})} className="mt-1 w-full h-10 rounded-xl border border-[var(--border)] px-3 text-sm">{CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select></label><label className="text-xs text-[var(--text2)] flex gap-2"><input type="checkbox" checked={form.agreed} onChange={(e)=>setForm({...form,agreed:e.target.checked})} />我承诺不发布色情、赌博、毒品、诈骗、侵权或其他违法内容，并接受平台审核。</label><button onClick={submit} className="h-11 rounded-xl bg-[var(--pink)] text-white font-bold text-sm">提交入驻申请</button>{message && <div className="text-sm text-[var(--text2)]">{message}</div>}</div></div></div>;
}

function MerchantLoginScreen({ go }: { go: (s: Screen) => void }) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  function login() {
    if (!account || !password) { setMessage("请输入商家账号和密码"); return; }
    setMessage("当前为界面预览，正式登录需等待商家账号审核与身份接口接入。");
  }
  return <div className="flex-1 flex flex-col bg-white overflow-hidden"><div className="flex-1 overflow-y-auto px-8 pt-16"><div className="text-center"><div className="font-admin-title text-3xl">商家登录</div><PeekingLineIllustration /></div><div className="mt-7"><label className="block text-xs font-bold text-[var(--text2)]">商家账号<input value={account} onChange={(event) => setAccount(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm" placeholder="请输入审核通过的账号" /></label><label className="mt-4 block text-xs font-bold text-[var(--text2)]">密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm" placeholder="请输入密码" /></label><button onClick={login} className="mt-6 h-11 w-full rounded-xl bg-[var(--pink)] text-sm font-bold text-white">登录</button>{message && <div className="mt-3 text-xs leading-5 text-[var(--text2)]">{message}</div>}<button onClick={() => go("merchant-dashboard")} className="mt-4 w-full text-xs font-bold text-[var(--pink)]">进入商家后台</button></div></div><BottomNav screen="profile" go={go} /></div>;
}

function MerchantDashboard({ go }: { go: (s: Screen) => void }) {
  const [notice, setNotice] = useState("");
  const actions = ["上传技能商品", "编辑商品与定价", "提交平台审核", "查看我的订单", "查看卡密库存", "及时补充卡密"];
  return <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg2)] px-4 py-4"><div><div className="font-hand text-2xl">商家后台</div><div className="text-[11px] text-[var(--text2)]">只显示当前商家自己的经营数据</div></div><button onClick={() => go("profile")} className="text-xs font-bold text-[var(--pink)]">退出</button></div><div className="flex-1 overflow-y-auto p-4"><div className="grid grid-cols-3 gap-2">{[["我的商品","0"],["我的订单","0"],["卡密库存","0"]].map(([label,value]) => <div key={label} className="card-journal p-3 text-center"><div className="text-xl font-extrabold text-[var(--pink)]">{value}</div><div className="mt-1 text-[10px] text-[var(--text2)]">{label}</div></div>)}</div><div className="mt-4 card-journal overflow-hidden">{actions.map((item,index) => <button key={item} onClick={() => setNotice(`“${item}”将在商家身份接口和数据隔离完成后接通。`)} className={`flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-bold ${index < actions.length - 1 ? "border-b border-[var(--border)]" : ""}`}><span>{item}</span><span className="text-[var(--muted)]">›</span></button>)}</div><div className="mt-4 card-journal p-4"><div className="font-bold text-sm">商家权益</div><div className="mt-2 text-xs leading-6 text-[var(--text2)]">审核通过后成为终身商家会员；可申请批量兑换码、管理自己的交付库存，并承接平台审核通过的网站或 APP 项目。</div></div>{notice && <div className="mt-4 rounded-xl bg-[var(--cream)] p-3 text-xs leading-5 text-[var(--text2)]">{notice}</div>}</div></div>;
}

// ─── Admin: Sidebar ───────────────────────────────────────────────────────────

const ADMIN_NAVS: { label: string; icon: string; screen: Screen }[] = [
  { label: "经营看板", icon: "📊", screen: "admin-dashboard" },
  { label: "商品管理", icon: "📦", screen: "admin-products" },
  { label: "兑换码管理", icon: "🔑", screen: "admin-inventory" },
  { label: "订单管理", icon: "📋", screen: "admin-orders" },
  { label: "客户管理", icon: "👥", screen: "admin-dashboard" },
  { label: "商家管理", icon: "◇", screen: "admin-merchants" },
  { label: "系统设置", icon: "⚙️", screen: "admin-dashboard" },
];

function AdminSidebar({ current, go }: { current: Screen; go: (s: Screen) => void }) {
  return (
    <div className="w-56 flex-shrink-0 bg-[var(--text)] flex flex-col">
      <div className="px-5 py-6">
        <div className="text-[var(--pink)] font-extrabold text-base">技能商城</div>
        <div className="text-[var(--muted)] text-xs mt-0.5">管理后台</div>
      </div>
      <nav className="flex-1 px-3">
        {ADMIN_NAVS.map((n) => (
          <button key={n.label} onClick={() => go(n.screen)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-semibold transition-colors ${current === n.screen ? "bg-[var(--pink)] text-[var(--bg2)]" : "text-[var(--muted)] hover:bg-[#403830] hover:text-[var(--bg2)]"}`}>
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-[#403830]">
        <button onClick={() => go("home")} className="text-xs text-[var(--text2)] hover:text-[var(--muted)]">← 返回商城</button>
      </div>
    </div>
  );
}

// ─── Admin: Login ─────────────────────────────────────────────────────────────

function AdminLogin({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto px-8 pt-14">
        <div className="text-center">
          <AdminLoginTitleImage />
          <PeekingLineIllustration />
        </div>
        <div className="mt-[76px]">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text2)] mb-1 block">用户名</label>
              <input className="w-full h-12 border border-[var(--border)] rounded-xl px-4 text-sm focus:outline-none focus:border-[var(--pink)]" placeholder="请输入用户名" defaultValue="admin" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text2)] mb-1 block">密码</label>
              <input type="password" className="w-full h-12 border border-[var(--border)] rounded-xl px-4 text-sm focus:outline-none focus:border-[var(--pink)]" placeholder="请输入密码" defaultValue="••••••••" />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
              <input type="checkbox" className="rounded" defaultChecked /> 记住我
            </label>
            <button onClick={() => go("admin-dashboard")}
              className="w-full h-12 rounded-xl bg-[var(--pink)] text-[var(--bg2)] font-bold text-base shadow-md hover:bg-[#927454] transition-colors">
              登录
            </button>
          </div>
        </div>
      </div>
      <BottomNav screen="profile" go={go} />
    </div>
  );
}

function AdminMerchants() {
  return <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-8"><div className="text-2xl font-extrabold">商家管理</div><div className="mt-1 text-sm text-[var(--text2)]">审核入驻申请、控制商家状态和查看平台范围内的商家经营风险。</div><div className="mt-6 grid grid-cols-3 gap-4">{[["待审核申请","0"],["已通过商家","0"],["风险复核","0"]].map(([label,value]) => <div key={label} className="rounded-2xl border border-[var(--border)] bg-white p-5"><div className="text-xs text-[var(--text2)]">{label}</div><div className="mt-2 text-3xl font-extrabold text-[var(--pink)]">{value}</div></div>)}</div><div className="mt-5 rounded-2xl border border-[var(--border)] bg-white p-6"><div className="font-bold">安全接入说明</div><div className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text2)]">这里不会直接读取并展示申请人的联系方式，因为当前项目还没有安全的管理员会话。下一步先建立管理员身份验证，再开放入驻申请列表、通过、拒绝和冻结操作，避免任何普通访问者调用接口看到商家隐私。</div></div></div>;
}

// ─── Admin: Revenue Chart (SVG) ───────────────────────────────────────────────

function RevenueChart() {
  const W = 560; const H = 140; const pad = { l: 40, r: 20, t: 10, b: 30 };
  const vals = REVENUE_DATA.map((d) => d.v);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const scaleY = (v: number) => pad.t + ((max - v) / (max - min || 1)) * (H - pad.t - pad.b);
  const scaleX = (i: number) => pad.l + (i / (vals.length - 1)) * (W - pad.l - pad.r);
  const pts = vals.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(" ");
  const area = `M ${scaleX(0)},${scaleY(vals[0])} ` + vals.slice(1).map((v, i) => `L ${scaleX(i + 1)},${scaleY(v)}`).join(" ") + ` L ${scaleX(vals.length - 1)},${H - pad.b} L ${scaleX(0)},${H - pad.b} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pink)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--pink)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chartGrad)" />
      <polyline points={pts} fill="none" stroke="var(--pink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => (
        <g key={i}>
          <circle cx={scaleX(i)} cy={scaleY(v)} r="4" fill="var(--bg2)" stroke="var(--pink)" strokeWidth="2" />
          <text x={scaleX(i)} y={H - pad.b + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">{REVENUE_DATA[i].day.slice(3)}</text>
        </g>
      ))}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--border)" strokeWidth="1" />
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--border)" strokeWidth="1" />
    </svg>
  );
}

// ─── Admin: Dashboard ─────────────────────────────────────────────────────────

function AdminDashboard({ go }: { go: (s: Screen) => void }) {
  const kpis = [
    { label: "今日收入", value: "¥1,234.56", sub: "较昨日增长 12.5%", color: "var(--pink)" },
    { label: "今日订单", value: "56", sub: "较昨日增加 8 笔", color: "var(--info)" },
    { label: "卡密库存", value: "248", sub: "可用卡密", color: "var(--green)" },
    { label: "库存预警", value: "3", sub: "商品需要补货", color: "var(--warning)" },
  ];

  const recentOrders = [
    { id: "202408271234", customer: "用户 #1241", product: "高级会员", amount: "¥10.00", payment: "Paid", delivery: "Delivered", time: "08-27 12:34" },
    { id: "202408271235", customer: "用户 #1240", product: "Windows 11 专业版", amount: "¥19.90", payment: "Paid", delivery: "Delivered", time: "08-27 12:20" },
    { id: "202408271236", customer: "用户 #1239", product: "ChatGPT Plus 访问", amount: "¥20.00", payment: "Pending", delivery: "Pending", time: "08-27 12:10" },
    { id: "202408271237", customer: "用户 #1238", product: "Netflix 年度会员", amount: "¥49.99", payment: "Paid", delivery: "Delivered", time: "08-27 11:50" },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-8">
      <div className="text-2xl font-extrabold text-[var(--text)] mb-1">经营看板</div>
      <div className="text-sm text-[var(--text2)] mb-6">欢迎回来！这是今天的经营概况。</div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[var(--bg2)] rounded-2xl p-5 border border-[var(--border)]">
            <div className="text-xs font-semibold text-[var(--text2)] mb-1">{k.label}</div>
            <div className="text-3xl font-extrabold" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[var(--bg2)] rounded-2xl p-6 border border-[var(--border)] mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="font-bold text-[var(--text)]">最近 7 天收入</div>
          <div className="text-xs text-[var(--text2)]">8 月 21 日至 27 日</div>
        </div>
        <RevenueChart />
      </div>

      {/* Recent orders table */}
      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center">
          <div className="font-bold text-[var(--text)]">最近订单</div>
          <button onClick={() => go("admin-orders")} className="text-sm text-[var(--pink)] font-semibold">查看全部 →</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg2)]">
              {["订单号", "客户", "商品", "金额", "支付状态", "交付状态", "时间"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((o, i) => (
              <tr key={o.id} className={i % 2 === 0 ? "bg-[var(--bg2)]" : "bg-[var(--bg2)]"}>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text2)]">{o.id}</td>
                <td className="px-5 py-3 text-[var(--text)]">{o.customer}</td>
                <td className="px-5 py-3 font-medium text-[var(--text)]">{o.product}</td>
                <td className="px-5 py-3 font-bold text-[var(--pink)]">{o.amount}</td>
                <td className="px-5 py-3"><StatusBadge status={o.payment === "Paid" ? "Delivered" : "Pending"} /></td>
                <td className="px-5 py-3"><StatusBadge status={o.delivery === "Delivered" ? "Delivered" : "Pending"} /></td>
                <td className="px-5 py-3 text-xs text-[var(--text2)]">{o.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Admin: Products ──────────────────────────────────────────────────────────

function AdminProducts({ products, onProductSaved, onProductDeleted }: { products: Product[]; onProductSaved: (product: Product) => void; onProductDeleted: (id: number) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", desc: "", price: "", badge: "自有商品", icon: "🎁", stock: "0" });

  function startAdd() {
    setEditingId(null);
    setDraft({ name: "", desc: "", price: "", badge: "自有商品", icon: "🎁", stock: "0" });
    setMessage("");
    setShowForm(true);
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setDraft({
      name: product.name,
      desc: product.desc,
      price: product.price.replace(/^[¥$]/, ""),
      badge: product.badge,
      icon: product.icon,
      stock: String(product.stock ?? 0),
    });
    setMessage("");
    setShowForm(true);
  }

  async function saveProduct() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/products", {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, id: editingId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存失败");
      onProductSaved(result as Product);
      setDraft({ name: "", desc: "", price: "", badge: "自有商品", icon: "🎁", stock: "0" });
      setShowForm(false);
      setMessage(editingId === null ? "商品已保存，并已加入商城首页" : "商品修改成功，商城首页已同步");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "商品保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`确定删除“${product.name}”吗？删除后无法恢复。`)) return;
    setMessage("");
    const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.message || "删除失败");
      return;
    }
    onProductDeleted(product.id);
    setMessage("商品已删除");
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="text-2xl font-extrabold text-[var(--text)]">商品管理</div>
          <div className="text-sm text-[var(--text2)]">添加你自己的课程、资料、咨询或会员商品</div>
        </div>
        <button onClick={showForm ? () => setShowForm(false) : startAdd} className="h-10 px-5 bg-[var(--pink)] text-[var(--bg2)] text-sm font-bold rounded-xl shadow hover:bg-[#927454] transition-colors">
          {showForm ? "收起" : "+ 添加商品"}
        </button>
      </div>

      {showForm && (
        <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] p-5 mb-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-[var(--text2)]">商品名称
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" placeholder="例如：AI 写作入门课" />
            </label>
            <label className="text-xs font-semibold text-[var(--text2)]">价格
              <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" placeholder="例如：19.90" />
            </label>
            <label className="text-xs font-semibold text-[var(--text2)]">商品介绍
              <input value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" placeholder="顾客会获得什么" />
            </label>
            <label className="text-xs font-semibold text-[var(--text2)]">商品标签
              <input value={draft.badge} onChange={(e) => setDraft({ ...draft, badge: e.target.value })} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" placeholder="课程 / 资料包 / 咨询" />
            </label>
            <label className="text-xs font-semibold text-[var(--text2)]">图标
              <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" placeholder="🎁" />
            </label>
            <label className="text-xs font-semibold text-[var(--text2)]">初始库存
              <input type="number" min="0" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" />
            </label>
          </div>
          <button onClick={saveProduct} disabled={saving} className="mt-4 h-10 px-6 bg-[var(--pink)] text-white rounded-xl text-sm font-bold disabled:opacity-60">
            {saving ? "正在保存…" : editingId === null ? "保存商品" : "保存修改"}
          </button>
        </div>
      )}

      {message && <div className="mb-4 text-sm font-semibold text-[var(--text2)]">{message}</div>}

      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex gap-3">
          <div className="text-sm text-[var(--text2)]">当前共有 {products.length} 个商品</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg2)]">
              {["编号", "商品", "介绍", "价格", "库存", "标签", "操作"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "bg-[var(--bg2)]" : "bg-[var(--bg2)]"}>
                <td className="px-5 py-3 text-[var(--muted)] text-xs">{r.id}</td>
                <td className="px-5 py-3 font-semibold text-[var(--text)]">{r.name}</td>
                <td className="px-5 py-3 text-[var(--text2)]">{r.desc}</td>
                <td className="px-5 py-3 font-bold text-[var(--pink)]">{r.price}</td>
                <td className={`px-5 py-3 font-semibold ${(r.stock ?? 0) <= 5 ? "text-[var(--warning)]" : "text-[var(--text)]"}`}>
                  {(r.stock ?? 0) === 0 ? "∞" : r.stock}
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs bg-[var(--cream)] text-[var(--text2)] px-2 py-1 rounded-full font-semibold">{r.badge}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(r)} className="text-xs font-semibold text-[var(--info)] hover:underline">修改</button>
                    <button onClick={() => deleteProduct(r)} className="text-xs font-semibold text-[var(--danger)] hover:underline">删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Admin: Code Inventory ────────────────────────────────────────────────────

const INV_CODES = [
  { code: "ABCD-EFGH-IJKL", status: "Sold", order: "202408271234", created: "08-20", sold: "08-27" },
  { code: "MNOP-QRST-UVWX", status: "Sold", order: "202408271234", created: "08-20", sold: "08-27" },
  { code: "WXYZ-1234-5678", status: "Available", order: "-", created: "08-20", sold: "-" },
  { code: "AAAA-BBBB-CCCC", status: "Reserved", order: "202408271236", created: "08-21", sold: "-" },
  { code: "DDDD-EEEE-FFFF", status: "Available", order: "-", created: "08-21", sold: "-" },
];

function LegacyAdminInventory() {
  const [filter, setFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [importText, setImportText] = useState("");

  const pools = [
    { name: "高级会员兑换码池", total: 100, avail: 80, sold: 20, reserved: 0 },
    { name: "Windows 11 兑换码池", total: 50, avail: 30, sold: 20, reserved: 0 },
  ];

  const filtered = filter === "All" ? INV_CODES : INV_CODES.filter((c) => c.status === filter);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-8">
      <div className="text-2xl font-extrabold text-[var(--text)] mb-1">兑换码库存</div>
      <div className="text-sm text-[var(--text2)] mb-6">管理商品兑换码池</div>

      {/* Pools */}
      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between">
          <div className="font-bold text-[var(--text)]">兑换码池</div>
          <button onClick={() => setShowModal(true)} className="h-8 px-4 bg-[var(--pink)] text-[var(--bg2)] text-xs font-bold rounded-lg">+ 添加码池</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg2)]">
              {["卡池名称", "总数", "可用", "已售出", "已预留", "操作"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pools.map((p, i) => (
              <tr key={p.name} className={i % 2 === 0 ? "bg-[var(--bg2)]" : "bg-[var(--bg2)]"}>
                <td className="px-5 py-3 font-semibold text-[var(--text)]">{p.name}</td>
                <td className="px-5 py-3 text-[var(--text2)]">{p.total}</td>
                <td className="px-5 py-3 text-[var(--green)] font-semibold">{p.avail}</td>
                <td className="px-5 py-3 text-[var(--text2)]">{p.sold}</td>
                <td className="px-5 py-3 text-[var(--warning)]">{p.reserved}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setShowModal(true)} className="text-xs text-[var(--info)] hover:underline">导入</button>
                    <button className="text-xs text-[var(--text2)] hover:underline">导出</button>
                    <button className="text-xs text-[var(--danger)] hover:underline">清理已售卡密</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Code list */}
      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex gap-2">
          {["All", "Available", "Reserved", "Sold"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${filter === f ? "bg-[var(--pink)] text-[var(--bg2)]" : "bg-[var(--pink-soft)] text-[var(--text2)]"}`}>
              {f === "All" ? "全部" : STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg2)]">
              {["卡密", "状态", "关联订单", "创建时间", "售出时间"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.code} className={i % 2 === 0 ? "bg-[var(--bg2)]" : "bg-[var(--bg2)]"}>
                <td className="px-5 py-3 font-mono text-sm text-[var(--text)]">{c.code}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.status === "Available" ? "bg-[var(--green-bg)] text-[var(--green)]" : c.status === "Sold" ? "bg-[var(--pink-soft)] text-[var(--text2)]" : "bg-[var(--cream)] text-[var(--warning)]"}`}>
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text2)]">{c.order}</td>
                <td className="px-5 py-3 text-xs text-[var(--text2)]">{c.created}</td>
                <td className="px-5 py-3 text-xs text-[var(--text2)]">{c.sold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[#3F352C]/40 flex items-center justify-center z-50">
          <div className="bg-[var(--bg2)] rounded-2xl shadow-2xl p-8 w-[480px]">
            <div className="flex justify-between items-center mb-5">
              <div className="font-extrabold text-xl text-[var(--text)]">导入兑换码</div>
              <button onClick={() => setShowModal(false)} className="text-[var(--muted)] hover:text-[var(--text)] text-xl">✕</button>
            </div>
            <div className="text-xs text-[var(--text2)] mb-2">每行填写一个兑换码</div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full h-40 border border-[var(--border)] rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-[var(--pink)] resize-none"
              placeholder={"兑换码一\n兑换码二\n兑换码三"} />
            <div className="mt-3 border-2 border-dashed border-[var(--border)] rounded-xl p-4 text-center text-sm text-[var(--muted)] cursor-pointer hover:border-[var(--pink)] transition-colors">
              📁 也可以把文本文件拖到这里
            </div>
            {importText && (
              <div className="mt-3 flex gap-3 text-xs">
                <span className="bg-[var(--green-bg)] text-[var(--green)] px-2 py-1 rounded-lg font-semibold">✓ 已准备 {importText.trim().split("\n").filter(Boolean).length} 个兑换码</span>
                <span className="bg-[var(--pink-soft)] text-[var(--text2)] px-2 py-1 rounded-lg font-semibold">0 个重复</span>
                <span className="bg-[var(--pink-soft)] text-[var(--text2)] px-2 py-1 rounded-lg font-semibold">0 个无效</span>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 h-11 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text2)]">取消</button>
              <button onClick={() => setShowModal(false)} className="flex-1 h-11 rounded-xl bg-[var(--pink)] text-[var(--bg2)] text-sm font-bold">导入兑换码</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminInventory({ products }: { products: Product[] }) {
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [productId, setProductId] = useState("");
  const [count, setCount] = useState("10");
  const [prefix, setPrefix] = useState("SKILL");
  const [filter, setFilter] = useState("All");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/codes")
      .then((response) => response.json())
      .then((data) => setCodes(data))
      .catch(() => setMessage("兑换码读取失败"));
  }, []);

  async function generateCodes() {
    if (!productId) {
      setMessage("请先选择商品");
      return;
    }
    setGenerating(true);
    setMessage("");
    try {
      const response = await fetch("/api/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: Number(productId), count: Number(count), prefix }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "生成失败");
      setCodes((current) => [...current, ...result]);
      setMessage(`成功生成 ${result.length} 个兑换码`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  const visibleCodes = filter === "All" ? codes : codes.filter((item) => item.status === filter);
  const available = codes.filter((item) => item.status === "Available").length;
  const issued = codes.filter((item) => item.status === "Issued").length;
  const redeemed = codes.filter((item) => item.status === "Redeemed").length;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-8">
      <div className="text-2xl font-extrabold text-[var(--text)] mb-1">兑换码管理</div>
      <div className="text-sm text-[var(--text2)] mb-6">为你自己的课程、资料、咨询或会员生成领取凭证</div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          ["全部", codes.length], ["未售出", available], ["已发放", issued], ["已兑换", redeemed],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--text2)]">{label}</div>
            <div className="text-2xl font-extrabold text-[var(--pink)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] p-5 mb-6">
        <div className="font-bold text-[var(--text)] mb-4">批量生成兑换码</div>
        <div className="grid grid-cols-3 gap-4">
          <label className="text-xs font-semibold text-[var(--text2)]">对应商品
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm">
              <option value="">请选择商品</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text2)]">生成数量
            <input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-[var(--text2)]">兑换码前缀
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="mt-1 w-full h-10 border border-[var(--border)] rounded-lg px-3 text-sm uppercase" placeholder="SKILL" />
          </label>
        </div>
        <button onClick={generateCodes} disabled={generating} className="mt-4 h-10 px-6 bg-[var(--pink)] text-white rounded-xl text-sm font-bold disabled:opacity-60">
          {generating ? "正在生成…" : "生成兑换码"}
        </button>
        {message && <span className="ml-4 text-sm text-[var(--text2)]">{message}</span>}
      </div>

      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex gap-2">
          {["All", "Available", "Issued", "Redeemed"].map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${filter === item ? "bg-[var(--pink)] text-white" : "bg-[var(--pink-soft)] text-[var(--text2)]"}`}>
              {item === "All" ? "全部" : item === "Available" ? "未售出" : STATUS_LABELS[item]}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead><tr>{["兑换码", "商品", "状态", "关联订单", "创建时间"].map((title) => <th key={title} className="text-left px-5 py-3 text-xs text-[var(--text2)]">{title}</th>)}</tr></thead>
          <tbody>
            {visibleCodes.map((item) => (
              <tr key={item.code} className="border-t border-[var(--border)]">
                <td className="px-5 py-3 font-mono font-semibold text-[var(--text)]">{item.code}</td>
                <td className="px-5 py-3 text-[var(--text2)]">{item.productName}</td>
                <td className="px-5 py-3"><span className="text-xs bg-[var(--pink-soft)] px-2 py-1 rounded-full">{item.status === "Available" ? "未售出" : STATUS_LABELS[item.status]}</span></td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text2)]">{item.orderId || "—"}</td>
                <td className="px-5 py-3 text-xs text-[var(--text2)]">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
              </tr>
            ))}
            {visibleCodes.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-[var(--muted)]">还没有兑换码</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Admin: Orders ────────────────────────────────────────────────────────────

function AdminOrders() {
  const [rows, setRows] = useState([
    { id: "202408271234", customer: "用户 #1241", product: "高级会员", qty: 1, amount: "¥10.00", payment: "Paid", delivery: "Delivered", time: "08-27 12:34" },
    { id: "202408271235", customer: "用户 #1240", product: "Windows 11 专业版密钥", qty: 1, amount: "¥19.90", payment: "Paid", delivery: "Delivered", time: "08-27 12:20" },
    { id: "202408271236", customer: "用户 #1239", product: "ChatGPT Plus 访问", qty: 1, amount: "¥20.00", payment: "Pending", delivery: "Pending", time: "08-27 12:10" },
    { id: "202408271237", customer: "用户 #1238", product: "Netflix 年度会员", qty: 1, amount: "¥49.99", payment: "Paid", delivery: "Delivered", time: "08-27 11:50" },
  ]);
  const [notice, setNotice] = useState("");

  function refundOrder(id: string) {
    setRows((current) => current.map((item) => item.id === id ? { ...item, payment: "Refunded", delivery: "Refunded" } : item));
    setNotice(`订单 ${id} 已标记为退款。真实退款需接入支付平台后执行。`);
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide p-8">
      <div className="text-2xl font-extrabold text-[var(--text)] mb-1">订单管理</div>
      <div className="text-sm text-[var(--text2)] mb-6">查看和管理所有客户订单</div>
      {notice && <div className="mb-4 rounded-xl bg-[var(--pink-soft)] px-4 py-3 text-sm text-[var(--text2)]">{notice}</div>}

      {/* Filters */}
      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] p-4 mb-5 flex gap-3 flex-wrap">
        <input className="h-9 border border-[var(--border)] rounded-lg px-3 text-sm w-52 focus:outline-none focus:border-[var(--pink)]" placeholder="🔍 搜索订单号…" />
        <select className="h-9 border border-[var(--border)] rounded-lg px-3 text-sm focus:outline-none">
          <option value="All Status">全部状态</option>
          <option value="Paid">已支付</option>
          <option value="Pending">待处理</option>
        </select>
        <select className="h-9 border border-[var(--border)] rounded-lg px-3 text-sm focus:outline-none"><option>全部商品</option></select>
        <input type="date" className="h-9 border border-[var(--border)] rounded-lg px-3 text-sm focus:outline-none" />
        <input type="date" className="h-9 border border-[var(--border)] rounded-lg px-3 text-sm focus:outline-none" />
      </div>

      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg2)]">
              {["订单号", "客户", "商品", "数量", "金额", "支付状态", "交付状态", "时间", "操作"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "bg-[var(--bg2)]" : "bg-[var(--bg2)]"}>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text2)]">{r.id}</td>
                <td className="px-4 py-3 text-[var(--text)]">{r.customer}</td>
                <td className="px-4 py-3 font-medium text-[var(--text)]">{r.product}</td>
                <td className="px-4 py-3 text-[var(--text2)]">{r.qty}</td>
                <td className="px-4 py-3 font-bold text-[var(--pink)]">{r.amount}</td>
                <td className="px-4 py-3"><StatusBadge status={r.payment === "Paid" ? "Delivered" : "Pending"} /></td>
                <td className="px-4 py-3"><StatusBadge status={r.delivery === "Delivered" ? "Delivered" : "Pending"} /></td>
                <td className="px-4 py-3 text-xs text-[var(--text2)]">{r.time}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setNotice(`订单 ${r.id}：${r.product}，金额 ${r.amount}，当前状态 ${STATUS_LABELS[r.payment] || r.payment}。`)} className="text-xs text-[var(--info)] hover:underline">详情</button>
                    <button onClick={() => setNotice(`订单 ${r.id} 的兑换码已重新发送到用户订单详情。`)} className="text-xs text-[var(--green)] hover:underline">重新发送</button>
                    <button onClick={() => refundOrder(r.id)} className="text-xs text-[var(--danger)] hover:underline">退款</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text2)]">
          <span>共 56 笔订单，当前显示 4 笔</span>
          <div className="flex gap-1">
            {[1, 2, 3, "..."].map((p) => (
              <button key={p} className={`w-7 h-7 rounded-lg text-xs font-semibold ${p === 1 ? "bg-[var(--pink)] text-[var(--bg2)]" : "bg-[var(--pink-soft)] text-[var(--text2)]"}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hand-drawn visual pages ──────────────────────────────────────────────────

type VisualHotspot = {
  label: string;
  target: Screen;
  left: string;
  top: string;
  width: string;
  height: string;
};

const VISUAL_PAGES: Partial<Record<Screen, string>> = {
  splash: pageHome.src,
  home: pageHome.src,
  product: pageProduct.src,
  cart: pageCart.src,
  checkout: pageCheckout.src,
  paying: pageCheckout.src,
  success: pageSuccess.src,
  orders: pageOrders.src,
  "order-detail": pageOrderDetail.src,
  library: pageLibrary.src,
  profile: pageProfile.src,
  about: pageAbout.src,
};

const VISUAL_HOTSPOTS: Partial<Record<Screen, VisualHotspot[]>> = {
  splash: [
    { label: "进入首页", target: "home", left: "0%", top: "0%", width: "100%", height: "100%" },
  ],
  home: [
    { label: "查看商品", target: "product", left: "4%", top: "53%", width: "92%", height: "36%" },
    { label: "我的订单", target: "orders", left: "34%", top: "91%", width: "31%", height: "9%" },
    { label: "我的页面", target: "profile", left: "66%", top: "91%", width: "34%", height: "9%" },
  ],
  product: [
    { label: "返回首页", target: "home", left: "0%", top: "0%", width: "18%", height: "10%" },
    { label: "加入购物车", target: "cart", left: "27%", top: "89%", width: "35%", height: "11%" },
    { label: "立即购买", target: "checkout", left: "62%", top: "89%", width: "38%", height: "11%" },
  ],
  cart: [
    { label: "返回首页", target: "home", left: "0%", top: "0%", width: "18%", height: "10%" },
    { label: "去结算", target: "checkout", left: "4%", top: "84%", width: "92%", height: "9%" },
    { label: "首页", target: "home", left: "0%", top: "92%", width: "33%", height: "8%" },
    { label: "订单", target: "orders", left: "33%", top: "92%", width: "34%", height: "8%" },
    { label: "我的", target: "profile", left: "67%", top: "92%", width: "33%", height: "8%" },
  ],
  checkout: [
    { label: "返回购物车", target: "cart", left: "0%", top: "0%", width: "18%", height: "10%" },
    { label: "立即支付", target: "success", left: "5%", top: "79%", width: "90%", height: "10%" },
  ],
  paying: [
    { label: "完成支付", target: "success", left: "0%", top: "0%", width: "100%", height: "100%" },
  ],
  success: [
    { label: "查看订单", target: "order-detail", left: "23%", top: "39%", width: "54%", height: "10%" },
    { label: "返回首页", target: "home", left: "25%", top: "49%", width: "50%", height: "8%" },
  ],
  orders: [
    { label: "查看订单详情", target: "order-detail", left: "3%", top: "13%", width: "94%", height: "48%" },
    { label: "首页", target: "home", left: "0%", top: "91%", width: "33%", height: "9%" },
    { label: "产品库", target: "library", left: "33%", top: "91%", width: "34%", height: "9%" },
    { label: "我的", target: "profile", left: "67%", top: "91%", width: "33%", height: "9%" },
  ],
  "order-detail": [
    { label: "返回订单", target: "orders", left: "0%", top: "0%", width: "18%", height: "10%" },
    { label: "产品库", target: "library", left: "0%", top: "75%", width: "100%", height: "12%" },
  ],
  library: [
    { label: "返回我的页面", target: "profile", left: "0%", top: "0%", width: "18%", height: "10%" },
    { label: "查看订单", target: "orders", left: "0%", top: "10%", width: "100%", height: "72%" },
  ],
  profile: [
    { label: "关于我", target: "about", left: "0%", top: "0%", width: "100%", height: "18%" },
    { label: "我的产品库", target: "library", left: "0%", top: "18%", width: "100%", height: "30%" },
    { label: "首页", target: "home", left: "0%", top: "92%", width: "33%", height: "8%" },
    { label: "订单", target: "orders", left: "33%", top: "92%", width: "34%", height: "8%" },
  ],
  about: [
    { label: "返回我的页面", target: "profile", left: "0%", top: "0%", width: "20%", height: "10%" },
  ],
};

function HandbookVisualScreen({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const image = VISUAL_PAGES[screen] || pageHome.src;
  const hotspots = VISUAL_HOTSPOTS[screen] || [];

  return (
    <div className="relative size-full overflow-hidden bg-[var(--bg2)]">
      <img
        src={image}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full select-none"
        style={{ objectFit: "fill" }}
      />
      {hotspots.map((spot) => (
        <button
          key={`${spot.label}-${spot.target}`}
          type="button"
          aria-label={spot.label}
          title={spot.label}
          onClick={() => go(spot.target)}
          className="absolute cursor-pointer rounded-xl bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--pink)]"
          style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }}
        />
      ))}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [authReady,setAuthReady]=useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  const [trendScrollTop, setTrendScrollTop] = useState(0);
  const [creationType, setCreationType] = useState("小说");
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [dark, setDark] = useState(false);
const [products, setProducts] = useState<Product[]>([]);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("authPreview") === "login") { setScreen("login"); setAuthReady(true); return; }
  if (params.get("authPreview") === "profile") { setScreen("profile-setup"); setAuthReady(true); return; }
  fetch("/api/auth/me").then((response)=>response.json()).then((result)=>{if(result.user)setScreen("home");else setScreen(localStorage.getItem("ranjingWelcomeSeen")==="true"?"login":"welcome");}).catch(()=>setScreen(localStorage.getItem("ranjingWelcomeSeen")==="true"?"login":"welcome")).finally(()=>setAuthReady(true));
  const requestedCreation = params.get("creation");
  const requestedNovelId = params.get("novel");
  if (requestedCreation) {
    setCreationType(requestedCreation);
    setSelectedNovelId(requestedNovelId);
    setScreen(requestedCreation === "小说" && !requestedNovelId ? "works" : "writing");
  }
  const requestedId = Number(params.get("product"));
  const designService = DESIGN_SERVICES.find((item) => item.id === requestedId);
  if (designService) {
    setSelectedProduct(designService);
    setScreen("product");
  }
  // V7: 刷新恢复 — 统一走 loadOrderById，不自动跳转 paying
  const savedOrderId = localStorage.getItem("ranjing.currentOrderId");
  if (savedOrderId) {
    setCurrentOrderId(savedOrderId);
    void loadOrderById(savedOrderId);
  }
  // V7 disabled: do not hydrate createdOrder from localStorage.latestOrder
  // const storedOrder = localStorage.getItem("latestOrder");
  // if (storedOrder) {
  //   try { setCreatedOrder(JSON.parse(storedOrder) as CreatedOrder); } catch { localStorage.removeItem("latestOrder"); }
  // }
}, []);

useEffect(() => {
  fetch("/api/products")
    .then((res) => res.json())
    .then((data) => {
      setProducts(data);
    })
    .catch((err) => console.error("获取商品失败", err));
}, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const handleCodeAssigned = useCallback((code: string) => {
    setCreatedOrder((current) => current ? { ...current, status: "Paid", deliveredCode: code, paidAt: new Date().toISOString() } : current);
  }, []);

  // V7-1B: 统一订单读取入口
  async function loadOrderById(orderId: string): Promise<CreatedOrder | null> {
    try {
      const res = await fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`);
      if (res.status === 404) {
        setCreatedOrder(null);
        setCurrentOrderId(null);
        localStorage.removeItem("ranjing.currentOrderId");
        return null;
      }
      if (!res.ok) {
        // 网络/500：不制造假订单，不清 ID
        return null;
      }
      const order = await res.json() as CreatedOrder;
      setCreatedOrder(order);
      setCurrentOrderId(order.id);
      localStorage.setItem("ranjing.currentOrderId", order.id);
      return order;
    } catch {
      // 网络异常：不清 ID，不伪造订单
      return null;
    }
  }

  // V7-1B: 创建订单成功后的统一处理
  function handleOrderCreated(order: CreatedOrder) {
    setCreatedOrder(order);
    setCurrentOrderId(order.id);
    localStorage.setItem("ranjing.currentOrderId", order.id);
  }

  // V7-1B: 继续支付——禁止重新下单，必须读取原订单
  async function continuePay(orderId: string) {
    const order = await loadOrderById(orderId);
    if (!order) return; // 404/网络错误：保持当前页面，不进入 paying

    const matchedProduct =
      products.find((p) => p.id === order.productId) ??
      DESIGN_SERVICES.find((p) => p.id === order.productId) ??
      null;

    if (!matchedProduct) {
      // 找不到正确商品：不进入 paying，防串单
      // products 可能尚未加载完成，保持当前页面
      return;
    }
    setSelectedProduct(matchedProduct);
    setScreen("paying");
  }

  function go(s: Screen) {
    if (s === "create" || s === "works") {
      const url = new URL(window.location.href);
      if (s === "create") {
        url.searchParams.delete("creation");
        url.searchParams.delete("novel");
      } else {
        url.searchParams.set("creation", "小说");
        url.searchParams.delete("novel");
      }
      window.history.replaceState({}, "", url);
    }
    setScreen(s);
  }

  function openCreation(type: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("product");
    url.searchParams.set("creation", type);
    url.searchParams.delete("novel");
    window.history.replaceState({}, "", url);
    setCreationType(type);
    setSelectedNovelId(null);
    setScreen(type === "小说" ? "works" : "writing");
  }

  function openNovel(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("product");
    url.searchParams.set("creation", "小说");
    url.searchParams.set("novel", id);
    window.history.replaceState({}, "", url);
    setCreationType("小说");
    setSelectedNovelId(id);
    setScreen("writing");
  }
  function enterFromWelcome(){localStorage.setItem("ranjingWelcomeSeen","true");setScreen("login");}

  const isAdmin = screen.startsWith("admin-") && screen !== "admin-login";

  if (isAdmin) {
    return (
      <div className="size-full flex bg-[var(--bg)]" style={{ fontFamily: "'Nunito', sans-serif" }}>
        <AdminSidebar current={screen} go={go} />
        <div className="flex-1 flex flex-col overflow-hidden">
          {screen === "admin-dashboard" && <AdminDashboard go={go} />}
          {screen === "admin-products" && <AdminProducts products={products} onProductSaved={(product) => setProducts((current) => current.some((item) => item.id === product.id) ? current.map((item) => item.id === product.id ? product : item) : [...current, product])} onProductDeleted={(id) => setProducts((current) => current.filter((item) => item.id !== id))} />}
          {screen === "admin-inventory" && <AdminInventory products={products} />}
          {screen === "admin-orders" && <AdminOrders />}
          {screen === "admin-merchants" && <AdminMerchants />}
        </div>
      </div>
    );
  }

  return (
    <div className="size-full flex items-center justify-center bg-[#F2EEE7]" style={{ fontFamily: "'Nunito', sans-serif", filter: `brightness(${brightness}%)` }}>
      <div className="handbook-app relative flex flex-col bg-[var(--bg)] overflow-hidden"
        style={{ width: "390px", height: "844px", borderRadius: "34px", border: "1px solid rgba(112, 103, 94, 0.24)", boxSizing: "border-box", boxShadow: "0 28px 72px rgba(65, 57, 49, 0.13)" }}>
        {!authReady && <div className="ran-auth-page" />}
        {authReady && screen === "welcome" && <WelcomeScreen onEnter={enterFromWelcome} />}
        {authReady && screen === "login" && <LoginScreen onVerified={(isNew)=>setScreen(isNew?"profile-setup":"home")} />}
        {screen === "profile-setup" && <ProfileSetupScreen go={go} />}
        {screen === "splash" && <SplashScreen go={go} />}
        {screen === "home" && <TrendsScreen go={go} initialScrollTop={trendScrollTop} onScrollPositionChange={setTrendScrollTop} />}
        {screen === "resources" && <HomeScreen go={go} onSelectProduct={setSelectedProduct} products={products} />}
        {screen === "create" && <CreateScreen go={go} />}
        {screen === "works" && <NovelLibraryScreen go={go} openNovel={openNovel} />}
        {screen === "writing" && <WritingScreen go={go} creationType={creationType} novelId={selectedNovelId} />}
        {screen === "design" && <DesignScreen go={go} onSelectProduct={setSelectedProduct} />}
        {screen === "design-brief" && selectedProduct && <DesignBriefScreen product={selectedProduct} go={go} />}
        {screen === "product" && selectedProduct && <ProductScreen product={selectedProduct} go={go} />}
        {screen === "cart" && selectedProduct && <CheckoutScreen product={selectedProduct} go={go} onOrderCreated={handleOrderCreated} />}
        {screen === "checkout" && selectedProduct && <CheckoutScreen product={selectedProduct} go={go} onOrderCreated={handleOrderCreated} />}
        {screen === "paying" && selectedProduct && createdOrder && <PayingScreen product={selectedProduct} go={go} order={createdOrder} onCodeAssigned={handleCodeAssigned} />}
        {screen === "success" && createdOrder && <SuccessScreen go={go} order={createdOrder} />}
        {screen === "orders" && <OrdersScreen go={go} currentOrder={createdOrder} onContinuePay={continuePay} />}
        {screen === "order-detail" && <OrderDetailScreen go={go} order={createdOrder} />}
        {screen === "library" && <OrdersScreen go={go} currentOrder={createdOrder} onContinuePay={continuePay} />}
        {screen === "profile" && <ProfileScreen go={go} />}
        {screen === "about" && <ProfileScreen go={go} />}
        {screen === "support" && <SupportScreen go={go} />}
        {screen === "help" && <HelpScreen go={go} />}
        {screen === "wallet" && <WalletScreen go={go} />}
        {screen === "membership" && <MembershipScreen go={go} />}
        {screen === "settings" && <SettingsScreen go={go} brightness={brightness} setBrightness={setBrightness} dark={dark} setDark={setDark} />}
        {screen === "creator-register" && <CreatorRegisterScreen go={go} />}
        {screen === "merchant-login" && <MerchantLoginScreen go={go} />}
        {screen === "merchant-dashboard" && <MerchantDashboard go={go} />}
        {screen === "admin-login" && <AdminLogin go={go} />}
      </div>
    </div>
  );
}
