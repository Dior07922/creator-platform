"use client";

/* 登录页：照搬原工程 src/App.tsx:102-151（结构与文案未改）。
   独立产品中只在「保存」被点击且未登录时出现。 */
import { useState, useEffect } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE } from "../lib/apiBase";
import BrandWord from "../components/BrandWord";

export default function LoginScreen({ onVerified }: { onVerified: (isNew: boolean) => void }) {
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
