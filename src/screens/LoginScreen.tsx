"use client";

/* 登录/注册页（第六步·照手稿重做）
   触发条件：只在点「导出分享」且未登录时出现（保存已改为纯本地，不再拦登录）。
   手稿流程：① 品牌页 → ② 登录（账号+密码 / 注册账号 / 微信·QQ·抖音 / 手机号）
             → ③ 注册（登录名 / 密码 / 确认密码 / 验证码 / 同意协议）
             → ④ 注册完成回登录 → ⑤ 登录完回当前页再导出分享。
   手机的短信验证码登录是已有的真实通道，保留；账号+密码是这次新增的真实通道。
   微信/QQ/抖音没有接入凭证，按「暂未开放」如实提示，不做假跳转。 */
import { useCallback, useEffect, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE } from "../lib/apiBase";
import BrandWord from "../components/BrandWord";

type View = "splash" | "login" | "register" | "phone";

export default function LoginScreen({ onVerified, onBack }: {
  onVerified: (isNew: boolean) => void;
  /** 返回当前页（未登录也能退出登录页） */
  onBack?: () => void;
}) {
  const [view, setView] = useState<View>("splash");

  /* ── ① 品牌页：短暂停留后进登录；点一下可跳过 ── */
  useEffect(() => {
    if (view !== "splash") return;
    const timer = window.setTimeout(() => setView("login"), 1300);
    return () => window.clearTimeout(timer);
  }, [view]);

  /* ── ② 登录（账号+密码） ── */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  /* ── ③ 注册 ── */
  const [rName, setRName] = useState("");
  const [rPwd, setRPwd] = useState("");
  const [rPwd2, setRPwd2] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [regBusy, setRegBusy] = useState(false);

  /* ── ④ 手机号（原有短信通道） ── */
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [smsStatus, setSmsStatus] = useState<"idle" | "sending" | "verifying">("idle");
  const [countdown, setCountdown] = useState(0);

  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await CapacitorHttp.get({ url: `${API_BASE}/api/auth/captcha` });
      const data = res.data;
      if (res.status >= 200 && res.status < 300 && data?.id && data?.svgText) {
        setCaptchaId(String(data.id));
        setCaptchaSvg(String(data.svgText));
      }
    } catch { /* 拉不到就留空，注册时会提示重新输入 */ }
  }, []);

  useEffect(() => { if (view === "register") void loadCaptcha(); }, [view, loadCaptcha]);

  function toRegister() {
    setMessage(""); setNotice("");
    setRName(username.trim());
    setView("register");
  }

  async function submitLogin() {
    if (loginBusy) return;
    if (!username.trim() || !password) { setMessage("请输入登录名和密码"); return; }
    setLoginBusy(true); setMessage(""); setNotice("");
    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE}/api/auth/login`,
        headers: { "Content-Type": "application/json" },
        data: { username: username.trim(), password },
      });
      if (res.status < 200 || res.status >= 300) { setMessage(res.data?.message || "登录服务暂时不可用，请稍后再试"); return; }
      onVerified(false);
    } catch { setMessage("登录服务暂时不可用，请稍后再试"); }
    finally { setLoginBusy(false); }
  }

  async function submitRegister() {
    if (regBusy) return;
    if (!rName.trim()) { setMessage("请输入登录名"); return; }
    if (rPwd.length < 6) { setMessage("密码至少 6 位"); return; }
    if (rPwd !== rPwd2) { setMessage("两次输入的密码不一致"); return; }
    if (!captchaText.trim()) { setMessage("请输入图形验证码"); return; }
    if (!agreed) { setMessage("请先阅读并同意用户协议和隐私政策"); return; }
    setRegBusy(true); setMessage(""); setNotice("");
    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE}/api/auth/register`,
        headers: { "Content-Type": "application/json" },
        data: { username: rName.trim(), password: rPwd, confirm: rPwd2, captchaId, captchaText, agreed },
      });
      /* 验证码一次性：无论成败都换一张，避免复用已消费的码 */
      void loadCaptcha(); setCaptchaText("");
      if (res.status < 200 || res.status >= 300) { setMessage(res.data?.message || "注册服务暂时不可用，请稍后再试"); return; }
      /* ④ 注册完成 → 回登录页，预填登录名 */
      setUsername(rName.trim()); setPassword(""); setView("login");
      setNotice("注册成功，请用新账号登录");
    } catch { setMessage("注册服务暂时不可用，请稍后再试"); }
    finally { setRegBusy(false); }
  }

  async function requestCode() {
    const phoneValid = /^1\d{10}$/.test(phone);
    if (!phone) { setMessage("请输入手机号"); return; }
    if (!phoneValid) { setMessage("请输入正确的手机号"); return; }
    setSmsStatus("sending"); setMessage("");
    try {
      const response = await CapacitorHttp.post({ url: `${API_BASE}/api/auth/sms/send`, headers: { "Content-Type": "application/json" }, data: { phone } });
      if (response.status < 200 || response.status >= 300) { setMessage(response.data?.message || "验证码暂时无法发送，请稍后再试"); return; }
      setCountdown(Number(response.data?.retryAfter) || 60);
    } catch { setMessage("验证码暂时无法发送，请稍后再试"); }
    finally { setSmsStatus("idle"); }
  }

  async function submitPhone() {
    const phoneValid = /^1\d{10}$/.test(phone);
    if (!phoneValid || !/^\d{6}$/.test(code) || smsStatus !== "idle") return;
    setSmsStatus("verifying"); setMessage("");
    try {
      const response = await CapacitorHttp.post({ url: `${API_BASE}/api/auth/sms/verify`, headers: { "Content-Type": "application/json" }, data: { phone, code } });
      if (response.status < 200 || response.status >= 300) { setMessage(response.data?.message || "登录服务暂时不可用，请稍后再试"); return; }
      onVerified(Boolean(response.data?.isNew));
    } catch { setMessage("登录服务暂时不可用，请稍后再试"); }
    finally { setSmsStatus("idle"); }
  }

  const socialStyle: React.CSSProperties = {
    flex: 1, height: 40, borderRadius: 8, border: "1px solid #dde3e6",
    background: "#f5f7f8", color: "#4c5f69", fontFamily: "inherit", fontSize: 12.5,
    letterSpacing: ".05em", cursor: "pointer",
  };
  const switchStyle: React.CSSProperties = {
    border: 0, background: "transparent", color: "#536571", fontFamily: "inherit",
    fontSize: 12, letterSpacing: ".05em", padding: "4px 2px", cursor: "pointer",
    textDecoration: "underline", textUnderlineOffset: 4,
  };
  const backStyle: React.CSSProperties = {
    position: "fixed", left: 14, top: "calc(env(safe-area-inset-top) + 12px)", zIndex: 5,
    border: 0, borderRadius: 10, background: "rgba(83,101,113,.06)", color: "#536571",
    fontFamily: "inherit", fontSize: 13, padding: "8px 13px", cursor: "pointer",
  };

  /* ── ① 品牌页 ── */
  if (view === "splash") {
    return (
      <div className="ran-auth-page" onClick={() => setView("login")}>
        <main className="ran-auth-main" style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 120 }}>
          <header className="ran-auth-brand" style={{ justifyContent: "center" }}>
            <h1 style={{ fontSize: 30, letterSpacing: ".3em", textIndent: ".3em" }}><BrandWord /></h1>
          </header>
          <p style={{ textAlign: "center", marginTop: 18, color: "#8898a2", fontSize: 11, letterSpacing: ".22em" }}>
            作品留在本地 · 账号用于导出与分享
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="ran-auth-page">
      {onBack && <button type="button" style={backStyle} onClick={onBack}>‹ 返回当前页</button>}
      <main className="ran-auth-main">
        <header className="ran-auth-brand">
          <h1><BrandWord /></h1>
        </header>

        {/* ── ② 登录 ── */}
        {view === "login" && (
          <section className="ran-auth-form" aria-label="账号登录">
            <label><span>账号</span>
              <input value={username} onChange={(e) => { setUsername(e.target.value); setMessage(""); }} placeholder="登录名或手机号" autoComplete="username" />
            </label>
            <label><span>密码</span>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setMessage(""); }} placeholder="请输入密码" autoComplete="current-password" />
            </label>
            {notice && <p className="ran-auth-hint" style={{ margin: "-14px 0 0", color: "#4c7a5f", fontSize: 11 }}>{notice}</p>}
            {message && <p className="ran-auth-message" role="status">{message}</p>}
            <button className="ran-auth-submit" type="button" disabled={loginBusy} onClick={submitLogin}>{loginBusy ? "正在登录…" : "登 录"}</button>

            <div style={{ display: "flex", justifyContent: "center", gap: 26, marginTop: -8 }}>
              <button type="button" style={switchStyle} onClick={toRegister}>注册账号</button>
              <button type="button" style={switchStyle} onClick={() => { setMessage(""); setNotice(""); setView("phone"); }}>手机号登录</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, color: "#aab8c0", fontSize: 10, letterSpacing: ".14em" }}>
              <span style={{ flex: 1, height: 1, background: "#e6eaec" }} />其他方式登录<span style={{ flex: 1, height: 1, background: "#e6eaec" }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: -10 }}>
              {["微信", "QQ", "抖音"].map((name) => (
                <button key={name} type="button" style={socialStyle}
                  onClick={() => setMessage(`${name}登录暂未开放，请先用账号或手机号登录`)}>{name}</button>
              ))}
            </div>
          </section>
        )}

        {/* ── ③ 注册 ── */}
        {view === "register" && (
          <section className="ran-auth-form" aria-label="注册账号">
            <label><span>登录名</span>
              <input value={rName} onChange={(e) => { setRName(e.target.value); setMessage(""); }} placeholder="3-20 位，中文 / 字母 / 数字 / 下划线" autoComplete="username" />
            </label>
            <label><span>密码</span>
              <input type="password" value={rPwd} onChange={(e) => { setRPwd(e.target.value); setMessage(""); }} placeholder="至少 6 位" autoComplete="new-password" />
            </label>
            <label><span>确认密码</span>
              <input type="password" value={rPwd2} onChange={(e) => { setRPwd2(e.target.value); setMessage(""); }} placeholder="再输一次密码" autoComplete="new-password" />
            </label>
            <label><span>验证码</span>
              <div className="ran-code-line">
                <input value={captchaText} maxLength={4} onChange={(e) => { setCaptchaText(e.target.value.toUpperCase()); setMessage(""); }} placeholder="输入右侧 4 位字符" />
                <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, paddingLeft: 8 }}>
                  <span aria-hidden style={{ display: "inline-flex" }} dangerouslySetInnerHTML={{ __html: captchaSvg }} />
                  <button type="button" style={{ border: 0, background: "transparent", color: "#68767e", fontSize: 11, fontFamily: "inherit", cursor: "pointer", padding: "6px 0" }} onClick={() => void loadCaptcha()}>换一张</button>
                </span>
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, fontSize: 11.5, color: "#68767e" }}>
              <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setMessage(""); }} style={{ width: 15, height: 15, accentColor: "#536571" }} />
              <span>我已阅读并同意《用户协议》和《隐私政策》</span>
            </label>
            {message && <p className="ran-auth-message" style={{ margin: "-10px 0 0" }} role="status">{message}</p>}
            <button className="ran-auth-submit" type="button" disabled={regBusy} onClick={submitRegister}>{regBusy ? "正在注册…" : "注 册"}</button>
            <div style={{ display: "flex", justifyContent: "center", marginTop: -8 }}>
              <button type="button" style={switchStyle} onClick={() => { setMessage(""); setView("login"); }}>已有账号，回登录</button>
            </div>
          </section>
        )}

        {/* ── ④ 手机号（原有短信通道） ── */}
        {view === "phone" && (
          <section className="ran-auth-form" aria-label="手机号登录">
            <label><span>手机号</span><input inputMode="numeric" maxLength={11} value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); setMessage(""); }} placeholder="请输入手机号" /></label>
            <label><span>验证码</span><div className="ran-code-line"><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setMessage(""); }} placeholder="请输入 6 位验证码" /><button type="button" onClick={requestCode} disabled={smsStatus !== "idle" || countdown > 0}>{smsStatus === "sending" ? "发送中…" : countdown > 0 ? `${countdown} 秒` : "获取验证码"}</button></div></label>
            <p className="ran-auth-hint">未注册手机号验证后将自动创建账号</p>
            {message && <p className="ran-auth-message" role="status">{message}</p>}
            <button className="ran-auth-submit" type="button" disabled={!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code) || smsStatus !== "idle"} onClick={submitPhone}>{smsStatus === "verifying" ? "正在进入…" : "进入苒境"}</button>
            <div style={{ display: "flex", justifyContent: "center", marginTop: -8 }}>
              <button type="button" style={{ ...switchStyle }} onClick={() => { setMessage(""); setView("login"); }}>‹ 回账号登录</button>
            </div>
          </section>
        )}
      </main>
      <footer className="ran-auth-footer">登录即表示你已阅读并同意<button type="button" onClick={() => setMessage("协议文本随正式上线版本提供")}>《用户协议》</button>和<button type="button" onClick={() => setMessage("协议文本随正式上线版本提供")}>《隐私政策》</button></footer>
    </div>
  );
}
