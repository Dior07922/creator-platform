"use client";
import { useEffect, useState, type ReactNode } from "react";

async function request(url: string, body?: object) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败，请重试");
  return data;
}

function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="settings-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label={title} className="settings-dialog"><header><strong>{title}</strong><button type="button" onClick={close} aria-label="关闭">×</button></header>{children}</section></div>;
}

export function FeedbackDialog({ close }: { close: () => void }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send() {
    setBusy(true); setMessage("");
    try { await request("https://helloranjing.com/api/feedback", { content }); setContent(""); setMessage("已发送并保存"); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog title="意见反馈" close={close}><textarea aria-label="反馈内容" maxLength={2000} value={content} onChange={e=>setContent(e.target.value)} placeholder="请输入你的疑问" /><button disabled={busy || !content.trim()} onClick={send}>{busy ? "发送中…" : "发送"}</button><p role="status">{message}</p></Dialog>;
}

export function AccountSettingsForm({ action, close, onPhone }: { action: string; close: () => void; onPhone: (value: string) => void }) {
  const [phone,setPhone] = useState(""); const [code,setCode] = useState("");
  const [name,setName] = useState(""); const [identity,setIdentity] = useState("");
  const [masked,setMasked] = useState(""); const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState(""); const [countdown,setCountdown] = useState(0);
  useEffect(()=>{ if(action === "verify") request("https://helloranjing.com/api/account/settings").then(d=>setMasked(d.identityMasked)).catch(e=>setMessage(e.message)); },[action]);
  useEffect(()=>{ if(!countdown) return; const timer=setTimeout(()=>setCountdown(countdown-1),1000); return()=>clearTimeout(timer); },[countdown]);
  async function run(sending = false) {
    setBusy(true); setMessage("");
    try {
      if(action === "phone") {
        if(sending) { const data=await request("https://helloranjing.com/api/auth/sms/send",{phone}); setCountdown(data.retryAfter || 60); setMessage("验证码已发送"); }
        else { const data=await request("https://helloranjing.com/api/auth/sms/verify",{phone,code,action:"bind-phone"}); onPhone(data.phone); setCode(""); setMessage("手机号已更新"); }
      } else {
        const data=await request("https://helloranjing.com/api/account/settings",{action:"identity",name,identity});
        setMasked(data.identityMasked); setName(""); setIdentity(""); setMessage(data.message);
      }
    } catch(error) {setMessage((error as Error).message);} finally {setBusy(false);}
  }
  const title = action === "phone" ? "绑定/更换手机号" : action === "verify" ? "实名认证" : action === "password" ? "修改登录密码" : "授权管理";
  return <Dialog title={title} close={close}>
    {action === "phone" && <><input aria-label="新手机号" inputMode="tel" maxLength={11} placeholder="新手机号" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))}/><button disabled={busy || countdown>0 || !/^1[3-9]\d{9}$/.test(phone)} onClick={()=>run(true)}>{countdown ? `${countdown}秒后重试` : "获取验证码"}</button><input aria-label="短信验证码" inputMode="numeric" maxLength={6} placeholder="短信验证码" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/><button disabled={busy || !/^\d{6}$/.test(code)} onClick={()=>run()}>确认更换</button></>}
    {action === "verify" && <><p>仅登记实名信息，不代表已通过身份核验。</p>{masked && <p>已登记：{masked}</p>}<input aria-label="姓名" maxLength={50} autoComplete="off" placeholder="姓名" value={name} onChange={e=>setName(e.target.value)}/><input aria-label="身份证号" type="password" maxLength={18} autoComplete="off" placeholder="身份证号（输入隐藏）" value={identity} onChange={e=>setIdentity(e.target.value)}/><button disabled={busy || !name.trim() || identity.length!==18} onClick={()=>run()}>提交</button></>}
    {action === "password" && <p>当前账号使用短信验证码登录，尚未接入密码登录与修改能力。</p>}
    {action === "auth" && <p>当前未接入可查询的支付授权记录。</p>}
    <p role="status">{busy ? "处理中…" : message}</p>
  </Dialog>;
}

export function MembershipPreferences() {
  const [open,setOpen] = useState(false); const [type,setType] = useState(""); const [style,setStyle] = useState("");
  const [message,setMessage] = useState(""); const [busy,setBusy] = useState(false); const [loaded,setLoaded] = useState(false);
  useEffect(()=>{if(!open)return; setLoaded(false); setMessage(""); request("https://helloranjing.com/api/account/settings").then(d=>{setType(d.templateType);setStyle(d.templateStyle);setLoaded(true);}).catch(e=>setMessage(e.message));},[open]);
  async function save() {setBusy(true);setMessage("");try{await request("https://helloranjing.com/api/account/settings",{action:"preferences",templateType:type,templateStyle:style});setMessage("已保存");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  return <><button onClick={()=>setOpen(true)}><span>设置偏好</span><b>›</b></button>{open && <Dialog title="设置偏好" close={()=>setOpen(false)}><label>喜欢的模板类型<select value={type} onChange={e=>setType(e.target.value)}><option value="">请选择</option>{["日常记录","小说","工作","设计"].map(v=><option key={v}>{v}</option>)}</select></label><label>喜欢的模板风格<select value={style} onChange={e=>setStyle(e.target.value)}><option value="">请选择</option>{["简约","可爱","搞怪","清新"].map(v=><option key={v}>{v}</option>)}</select></label><button disabled={busy || !loaded || !type || !style} onClick={save}>保存</button><p role="status">{message}</p></Dialog>}</>;
}
