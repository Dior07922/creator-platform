"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import CreationMinimalRoom from "./CreationMinimalRoom";
import splashCover from "./assets/splash-cover-original.png";
import ranjingWelcomeInk from "./assets/ranjing-welcome-ink-v1.png";
import { Character, loadNovels, newCharacter, newNovel, Novel, saveNovels, totalWords } from "./novels";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "welcome" | "login" | "profile-setup" | "splash" | "home" | "create" | "works" | "writing"
  | "profile" | "about" | "support" | "help" | "settings" | "wallet" | "membership"
  | "personal-profile" | "payment-settings" | "message-settings" | "privacy-settings" | "membership-settings" | "account-security";

type CreatedOrder = { id: string; productId: number; product: string; icon: string; quantity: number; amount: string; paymentMethod: string; status: string; createdAt: string; deliveryEmail: string; saveDeliveryEmail: boolean; emailDeliveryStatus: "NotConfigured" | "Pending" | "Sent" | "Failed"; deliveredCode?: string; paidAt?: string };
type TrendItem = { id: number | string; source: string; sourceLabel: string; rank: number; title: string; url: string | null; metricValue: number | null; metricLabel: string | null; publishedAt: string | null; fetchedAt: string };

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



// ─── Shared helpers ───────────────────────────────────────────────────────────


function BottomNav({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const tabs = [
  { s: "home" as Screen, label: "首页" },
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
// ─── Screen 01: Splash ────────────────────────────────────────────────────────

function SplashScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <button
      type="button"
      onClick={() => go("home")}
      aria-label="进入首页"
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

  if (stage === "room") {
    return <CreationMinimalRoom onBack={() => setStage("open")} />;
  }

  return (
    <div className="create-page flex-1 flex flex-col overflow-hidden">
      <main className="create-portal flex-1 flex items-center justify-center">
        <div className="create-door-stage">
          <button
            type="button"
            className={`create-door ${stage === "open" ? "is-open" : ""}`}
            onClick={() => {
              if (stage === "closed") setStage("open");
            }}
            aria-label="打开创作入口"
          >
            <span className="create-door-leaf create-door-leaf--left" />
            <span className="create-door-leaf create-door-leaf--right" />
          </button>

          {stage === "open" && (
            <>
              <div className="create-rooms is-visible">
                {CREATION_ROOMS.map((room) => (
                  <button
                    key={room.type}
                    type="button"
                    className="create-room-item"
                    onClick={() => setStage("room")}
                  >
                    <span className="create-room-name">{room.name}</span>
                    {room.sub ? <span className="create-room-sub">{room.sub}</span> : null}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="create-rooms-back"
                onClick={() => setStage("closed")}
                aria-label="返回"
              >
                ←
              </button>
            </>
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
type PersonalProfile = { name: string; bio: string; gender: string; birthday: string; wish: string };
const DEFAULT_PERSONAL_PROFILE: PersonalProfile = { name: "好技友", bio: "", gender: "", birthday: "", wish: "" };

function loadPersonalProfile(): PersonalProfile {
  if (typeof window === "undefined") return DEFAULT_PERSONAL_PROFILE;
  try { return { ...DEFAULT_PERSONAL_PROFILE, ...JSON.parse(localStorage.getItem("ranjingPersonalProfile") || "{}") }; }
  catch { return DEFAULT_PERSONAL_PROFILE; }
}

function ProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState<PersonalProfile>(loadPersonalProfile);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  useEffect(() => {
    setProfile(loadPersonalProfile());
    try { setAvatarUrl(localStorage.getItem("ranjingUserAvatar") || ""); } catch { setAvatarUrl(""); }
  }, [refreshKey]);
  useEffect(() => { function handleFocus() { setRefreshKey((k) => k + 1); } window.addEventListener("focus", handleFocus); return () => window.removeEventListener("focus", handleFocus); }, []);
  const accountItems: { label: string; screen: Screen }[] = [
    { label: "个人资料", screen: "personal-profile" },
    { label: "支付方式", screen: "payment-settings" },
    { label: "消息通知", screen: "message-settings" },
    { label: "隐私设置", screen: "privacy-settings" },
    { label: "会员设置", screen: "membership-settings" },
    { label: "账号与安全", screen: "account-security" },
  ];
  const renderDirectory = (items: { label: string; screen: Screen }[]) => (
    <div className="profile-directory">
      {items.map((item) => (
        <button key={item.label} onClick={() => { go(item.screen); setRefreshKey((k) => k + 1); }} className="profile-directory-item">
          <span>{item.label}</span>
          <span className="profile-directory-arrow">›</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="profile-page flex-1 flex flex-col overflow-hidden">
      <div className="profile-scroll flex-1 overflow-y-auto scrollbar-hide">
        <section className="profile-identity">
          <div className="profile-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="用户头像" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <img src={splashCover.src} alt="用户原创手绘头像" className="absolute max-w-none" style={{ width: "162px", height: "286px", left: "-45px", top: "-104px" }} />
            )}
          </div>
          <div className="profile-copy">
            <div className="profile-name">{profile.name}</div>
            <div className="profile-bio">{profile.bio || "还没有简介"}</div>
          </div>
        </section>
        {renderDirectory(accountItems)}
      </div>
      <BottomNav screen="profile" go={go} />
    </div>
  );
}

function AccountPageHeader({ title, go }: { title: string; go: (s: Screen) => void }) {
  return <header className="account-page-header"><button type="button" onClick={() => go("profile")} aria-label="返回我的">‹</button><h1>{title}</h1><span /></header>;
}

function PersonalProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [profile, setProfile] = useState<PersonalProfile>(loadPersonalProfile);
  const [saved, setSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>(() => {
    try { return localStorage.getItem("ranjingUserAvatar") || ""; } catch { return ""; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  function handleAvatarPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setAvatarUrl(url);
      try { localStorage.setItem("ranjingUserAvatar", url); } catch { /* noop */ }
    };
    reader.readAsDataURL(file);
  }
  function save() {
    localStorage.setItem("ranjingPersonalProfile", JSON.stringify(profile));
    setSaved(true);
  }
  return (
    <div className="account-page">
      <AccountPageHeader title="编辑资料" go={go} />
      <main className="personal-profile-form">
        <div className="pp-avatar-block">
          <button type="button" className="pp-avatar-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} aria-label="更换头像">
            <img src={avatarUrl || splashCover.src} alt="用户头像" />
          </button>
          <span className="pp-avatar-label">头像</span>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarPick} />
        </div>
        <div className="pp-field-list">
          <div className="pp-field-row">
            <span className="pp-field-label">昵称</span>
            <input className="pp-field-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>
          <div className="pp-field-row">
            <span className="pp-field-label">简介</span>
            <input className="pp-field-input" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
          </div>
          <div className="pp-field-row">
            <span className="pp-field-label">性别</span>
            <select className="pp-field-input" value={profile.gender} onChange={(e) => setProfile({ ...profile, gender: e.target.value })}>
              <option value="">不透露</option><option>女</option><option>男</option><option>其他</option>
            </select>
          </div>
          <div className="pp-field-row">
            <span className="pp-field-label">生日</span>
            <input type="date" className="pp-field-input" value={profile.birthday} onChange={(e) => setProfile({ ...profile, birthday: e.target.value })} />
          </div>
        </div>
        <div className="pp-wish-block">
          <span className="pp-field-label">写给自己的祝愿</span>
          <textarea className="pp-wish-textarea" value={profile.wish} onChange={(e) => setProfile({ ...profile, wish: e.target.value })} />
        </div>
        <button type="button" className="account-primary-action" onClick={save}>{saved ? "已保存" : "保存资料"}</button>
      </main>
    </div>
  );
}

function PaymentSettingsScreen({ go }: { go: (s: Screen) => void }) {
  const methods = ["支付宝", "微信付款", "银行卡", "其他支付方式"];
  const [bindings, setBindings] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("ranjingPaymentBindings") || "{}"); } catch { return {}; }
  });
  function toggle(method: string) {
    const next = { ...bindings, [method]: !bindings[method] };
    setBindings(next); localStorage.setItem("ranjingPaymentBindings", JSON.stringify(next));
  }
  return <div className="account-page"><AccountPageHeader title="支付设置" go={go} /><main className="account-list account-list-spaced">{methods.map((method) => <button type="button" key={method} onClick={() => toggle(method)}><span>{method}</span><small>{bindings[method] ? "已绑定" : "未绑定"}</small><b>›</b></button>)}</main></div>;
}

type SettingItem = { label: string; kind?: "toggle" | "action"; value?: string };

function PreferenceSettingsScreen({ title, items, storageKey, go }: { title: string; items: SettingItem[]; storageKey: string; go: (s: Screen) => void }) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
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
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user?.phone) setPhone(d.user.phone); }).catch(() => {}); }, []);
  const displayPhone = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "未绑定";
  const items = [
    { label: "手机号", value: displayPhone, action: "phone" },
    { label: "修改昵称", action: "nickname" },
    { label: "授权管理", action: "auth" },
    { label: "实名认证", value: "未认证", action: "verify" },
    { label: "注销苒境账号", danger: true, action: "delete" },
  ];
  function handleAction(action: string, label: string) {
    if (action === "phone") { setNotice("当前登录手机号：" + (phone || "未获取")); return; }
    if (action === "nickname") { go("personal-profile"); return; }
    if (action === "delete") { setConfirmAction(label); return; }
    setNotice(`${label}：功能开发中`);
  }
  return <div className="account-page"><AccountPageHeader title="账号设置" go={go} /><main className="account-list account-list-spaced">{items.map((item) => <button type="button" className={item.danger ? "is-danger" : ""} key={item.label} onClick={() => handleAction(item.action!, item.label)}><span>{item.label}</span>{item.value && <small>{item.value}</small>}<b>›</b></button>)}{notice && <p className="account-notice">{notice}</p>}{confirmAction && <div className="account-notice" style={{ background: "#fde8e8", color: "#c0392b" }}><div>确认{confirmAction}？此操作不可恢复。</div><div style={{ marginTop: 8, display: "flex", gap: 8 }}><button onClick={() => { localStorage.clear(); setConfirmAction(""); setNotice("已清除本地数据"); }} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #c0392b", background: "#c0392b", color: "#fff", fontSize: 12 }}>确认清除</button><button onClick={() => setConfirmAction("")} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", fontSize: 12 }}>取消</button></div></div>}</main></div>;
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
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="帮助中心" go={go} /><div className="p-4 flex flex-col gap-3">{[["如何购买？","选择商品后确认订单，支付成功会自动发放兑换码。"],["兑换码在哪里？","支付成功页和订单详情页都可以查看。"],["如何退款？","在订单详情或投诉建议中提交退款申请。"]].map(([q,a]) => <div key={q} className="card-journal p-4"><div className="font-bold text-sm">{q}</div><div className="text-xs text-[var(--text2)] mt-2">{a}</div></div>)}</div></div>;
}

function WalletScreen({ go }: { go: (s: Screen) => void }) {
  const [bindings, setBindings] = useState<Record<string, boolean>>({});
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="我的钱包" go={go} /><div className="p-4"><div className="card-journal p-4"><div className="font-bold text-sm">支付方式</div>{[{ name:"支付宝", icon:"▣" },{ name:"微信支付", icon:"♥" }].map((item,index) => <div key={item.name} className={`flex items-center justify-between py-4 ${index === 0 ? "border-b border-[var(--border)]" : ""}`}><div className="flex items-center gap-3"><span className="text-xl text-[var(--pink)]">{item.icon}</span><span className="font-bold text-sm">{item.name}</span></div><button onClick={() => setBindings((current) => ({...current,[item.name]:!current[item.name]}))} className={`rounded-full border px-4 py-1 text-xs font-bold ${bindings[item.name] ? "border-[var(--pink)] bg-[var(--pink)] text-white" : "border-[var(--pink)] text-[var(--pink)]"}`}>{bindings[item.name] ? "已绑定" : "绑定"}</button></div>)}</div><div className="mt-4 text-xs leading-5 text-[var(--text2)]">当前只保存前端绑定状态。正式支付账户绑定需要服务端身份验证和支付平台授权。</div></div></div>;
}

function MembershipScreen({ go }: { go: (s: Screen) => void }) {
  const [plan, setPlan] = useState<"monthly" | "yearly" | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [shared, setShared] = useState(false);
  const plans = [
    { key: "monthly" as const, label: "月卡", price: "¥19.90/月" },
    { key: "yearly" as const, label: "年卡", price: "¥168/年" },
  ];
  async function handlePay() {
    if (!plan) return;
    setLoading(true); setMessage("");
    try {
      const orderRes = await fetch("/api/membership/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const orderData = await orderRes.json();
      if (!orderRes.ok) { setMessage(orderData.message || "创建订单失败"); setLoading(false); return; }
      const payRes = await fetch("/api/payments/alipay/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: orderData.order.id }) });
      const payData = await payRes.json();
      if (!payRes.ok) { setMessage(payData.message || "支付通道暂时不可用"); setLoading(false); return; }
      if (payData.paymentUrl) { window.open(payData.paymentUrl, "_blank"); setMessage("已打开支付宝支付页面，完成后会员自动开通。"); }
    } catch { setMessage("支付请求失败，请检查网络后重试"); }
    setLoading(false);
  }
  return <div className="flex-1 flex flex-col bg-[var(--bg)]"><SimpleHeader title="订阅会员" go={go} /><div className="p-4 flex flex-col gap-4"><div className="card-journal p-4"><div className="font-bold text-sm">选择会员方案</div><div className="mt-3 flex flex-col gap-2">{plans.map((p) => <button key={p.key} onClick={() => { setPlan(p.key); setMessage(""); }} style={{ padding: "14px 16px", borderRadius: 10, border: plan === p.key ? "1px solid #75655a" : "1px solid rgba(128,107,92,.15)", background: plan === p.key ? "#f3eee8" : "#fffdfa", textAlign: "left" }}><strong style={{ fontSize: 14, fontWeight: 500 }}>{p.label}</strong><div style={{ marginTop: 4, color: "#918981", fontSize: 11 }}>{p.price}</div></button>)}</div><button type="button" disabled={!plan || loading} onClick={handlePay} style={{ width: "100%", height: 42, marginTop: 12, border: 0, borderRadius: 8, background: "#5f554d", color: "#fff", fontSize: 13, cursor: plan ? "pointer" : "default", opacity: plan && !loading ? 1 : 0.5 }}>{loading ? "处理中…" : "立即开通"}</button>{message && <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 8, background: "#f1ece5", color: "#716a63", fontSize: 11, lineHeight: 1.7 }}>{message}</div>}</div><div className="card-journal p-4"><div className="font-bold text-sm">分享 APP 可返现</div><div className="mt-2 text-xs leading-5 text-[var(--text2)]">分享你的专属邀请链接，好友注册后双方获得奖励。</div><button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setShared(true); } catch { setShared(true); } }} className="mt-3 h-10 w-full rounded-xl bg-[var(--pink)] text-sm font-bold text-white">{shared ? "链接已复制" : "分享 APP"}</button></div></div></div>;
}

function SettingsScreen({ go, brightness, setBrightness, dark, setDark }: { go: (s: Screen) => void; brightness: number; setBrightness: (value: number) => void; dark: boolean; setDark: (value: boolean) => void }) {
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("appFontSize") || 100));
  const [anonymous, setAnonymous] = useState(() => localStorage.getItem("anonymousTrade") !== "false");
  function updateFontSize(value: number) { setFontSize(value); localStorage.setItem("appFontSize", String(value)); document.documentElement.style.fontSize = `${value}%`; }
  function updateAnonymous(value: boolean) { setAnonymous(value); localStorage.setItem("anonymousTrade", String(value)); }
  return <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden"><SimpleHeader title="设置" go={go} /><div className="p-4 overflow-y-auto flex flex-col gap-4">
    <div className="card-journal p-4"><div className="font-bold text-sm">显示设置</div><label className="mt-3 flex justify-between text-sm">深色模式<input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /></label><label className="block mt-4 text-sm">APP 亮度：{brightness}%<input className="w-full mt-2" type="range" min="70" max="120" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label><label className="block mt-4 text-sm">字体大小：{fontSize}%<input className="w-full mt-2" type="range" min="85" max="120" value={fontSize} onChange={(e) => updateFontSize(Number(e.target.value))} /></label></div>
    <div className="card-journal p-4"><div className="font-bold text-sm">交易隐私</div><label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={anonymous} onChange={(e) => updateAnonymous(e.target.checked)} /><span><span className="font-bold">匿名交易</span><span className="mt-1 block text-xs leading-5 text-[var(--text2)]">对外隐藏真实昵称和联系方式，仅订单双方及平台审核人员按权限查看必要信息。</span></span></label></div>
  </div></div>;
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [authReady,setAuthReady]=useState(false);
  const [user, setUser] = useState<{ id: string; phone: string; nickname: string; avatar: string; defaultDeliveryEmail?: string } | null>(null);
  const screenFromUrlRef = useRef<boolean>(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  const [trendScrollTop, setTrendScrollTop] = useState(0);
  const [creationType, setCreationType] = useState("小说");
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [dark, setDark] = useState(false);

  const splashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("authPreview") === "login") { setScreen("login"); setAuthReady(true); return; }
  if (params.get("authPreview") === "profile") { setScreen("profile-setup"); setAuthReady(true); return; }
  const alipayReturnOrderId = params.get("payment") === "alipay" ? params.get("orderId") : null;
  if (alipayReturnOrderId) {
    setAuthReady(true);
    void resumeAlipayReturn(alipayReturnOrderId);
    return;
  }
  const doAuthCheck = () => { fetch("/api/auth/me").then((response)=>response.json()).then((result)=>{if(result.user){setUser(result.user);if(!screenFromUrlRef.current)setScreen("home");}else if(!screenFromUrlRef.current)setScreen(localStorage.getItem("ranjingWelcomeSeen")==="true"?"login":"welcome");}).catch(()=>{if(!screenFromUrlRef.current)setScreen(localStorage.getItem("ranjingWelcomeSeen")==="true"?"login":"welcome");}).finally(()=>setAuthReady(true)); };
  splashTimerRef.current = setTimeout(doAuthCheck, 1800);
  const requestedCreation = params.get("creation");
  const requestedNovelId = params.get("novel");
  if (requestedCreation) {
    screenFromUrlRef.current = true;
    setCreationType(requestedCreation);
    setSelectedNovelId(requestedNovelId);
    setScreen(requestedCreation === "小说" && !requestedNovelId ? "works" : "writing");
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
  return () => { if (splashTimerRef.current) clearTimeout(splashTimerRef.current); };
}, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

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

   async function resumeAlipayReturn(orderId: string) {
    const order = await loadOrderById(orderId);

    if (!order) {
      setScreen("create");
      return;
    }

    const membershipOrder = order as CreatedOrder & {
      orderKind?: string;
      membershipPlan?: "monthly" | "yearly";
    };

    /*
     * VIP 会员订单单独处理。
     * 不进入普通商品支付页面。
     */
    if (
      membershipOrder.orderKind === "membership" ||
      order.id.startsWith("VIP-")
    ) {
      localStorage.setItem(
        "ranjing.pending.membership.orderId",
        order.id
      );

      try {
        const response = await fetch(
          `/api/payments/alipay/status?orderId=${encodeURIComponent(
            order.id
          )}`,
          {
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (
          response.ok &&
          result.status === "Paid"
        ) {
          localStorage.setItem(
            "ranjing.membership.returnPaid",
            "true"
          );
        }
      } catch {
        /*
         * 查询失败也不乱跳普通订单。
         * 进入创作区后再继续确认。
         */
      }

      const cleanUrl = new URL(window.location.href);

      cleanUrl.searchParams.delete("payment");
      cleanUrl.searchParams.delete("orderId");

      window.history.replaceState(
        {},
        "",
        cleanUrl.pathname +
          cleanUrl.search +
          cleanUrl.hash
      );

      setScreen("create");
      return;
    }
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
        {screen === "create" && <CreateScreen go={go} />}
        {screen === "works" && <NovelLibraryScreen go={go} openNovel={openNovel} />}
        {screen === "writing" && <WritingScreen go={go} creationType={creationType} novelId={selectedNovelId} />}
        {screen === "profile" && <ProfileScreen go={go} />}
        {screen === "personal-profile" && <PersonalProfileScreen go={go} />}
        {screen === "payment-settings" && <PaymentSettingsScreen go={go} />}
        {screen === "message-settings" && <PreferenceSettingsScreen title="消息设置" storageKey="ranjingMessageSettings" go={go} items={[{label:"通知消息"},{label:"上新消息"},{label:"系统消息"},{label:"团队信息"}]} />}
        {screen === "privacy-settings" && <PreferenceSettingsScreen title="隐私权限" storageKey="ranjingPrivacySettings" go={go} items={[{label:"我有疑问",kind:"action"},{label:"系统权限管理",kind:"action"},{label:"允许采集云端"},{label:"团队信息"}]} />}
        {screen === "membership-settings" && <PreferenceSettingsScreen title="会员设置" storageKey="ranjingMembershipSettings" go={go} items={[{label:"续费提醒"},{label:"订阅消息"},{label:"设置偏好",kind:"action"},{label:"团队默认模板",kind:"action"}]} />}
        {screen === "account-security" && <AccountSecurityScreen go={go} />}
        {screen === "about" && <ProfileScreen go={go} />}
        {screen === "support" && <SupportScreen go={go} />}
        {screen === "help" && <HelpScreen go={go} />}
        {screen === "wallet" && <WalletScreen go={go} />}
        {screen === "membership" && <MembershipScreen go={go} />}
        {screen === "settings" && <SettingsScreen go={go} brightness={brightness} setBrightness={setBrightness} dark={dark} setDark={setDark} />}
      </div>
    </div>
 )}
