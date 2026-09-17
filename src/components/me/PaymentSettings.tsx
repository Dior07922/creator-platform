// name=src/components/me/PaymentSettings.tsx

import React, { useState } from "react";
import AccountPageHeader from "./AccountPageHeader";

type Props = {
  go: (s: string) => void;
};

export default function PaymentSettings({ go }: Props) {
  const [bindings, setBindings] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ranjingPaymentBindings") || "{}");
    } catch {
      return {};
    }
  });
  const [bankForm, setBankForm] = useState(false);
  const [bankCard, setBankCard] = useState("");
  const [bankName, setBankName] = useState("");
  const [notice, setNotice] = useState("");

  function bind(method: string) {
    if (method === "支付宝") {
      window.open("https://auth.alipay.com/login/index.htm", "_blank");
      return;
    }
    if (method === "微信付款") {
      window.open("https://login.weixin.qq.com/", "_blank");
      return;
    }
    if (method === "银行卡") {
      setBankForm(true);
      return;
    }
    setNotice(method);
  }

  function saveBank() {
    if (!bankCard.trim() || !bankName.trim()) return;
    const next = { ...bindings, 银行卡: true };
    setBindings(next);
    localStorage.setItem("ranjingPaymentBindings", JSON.stringify(next));
    setBankForm(false);
    setBankCard("");
    setBankName("");
  }

  function toggle(method: string) {
    const next = { ...bindings, [method]: !bindings[method] };
    setBindings(next);
    localStorage.setItem("ranjingPaymentBindings", JSON.stringify(next));
  }

  const otherMethods = ["信用卡", "花呗", "HK支付宝"];

  return (
    <div className="account-page">
      <AccountPageHeader title="支付设置" go={go} />
      <main className="account-list account-list-spaced">
        {["支付宝", "微信付款", "银行卡"].map((method) => (
          <button type="button" key={method} onClick={() => bind(method)}>
            <span>{method}</span>
            <small>{bindings[method] ? "已绑定" : "未绑定"}</small>
            <b>›</b>
          </button>
        ))}
        {otherMethods.map((method) => (
          <button type="button" key={method} onClick={() => toggle(method)}>
            <span>{method}</span>
            <small>{bindings[method] ? "已绑定" : "未绑定"}</small>
            <i className={bindings[method] ? "is-on" : ""}>
              <em />
            </i>
          </button>
        ))}
        {bankForm && (
          <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, background: "rgba(0,0,0,.25)" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 20px", width: 280, boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>绑定银行卡</div>
              <input
                placeholder="持卡人姓名"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
              />
              <input
                placeholder="银行卡号"
                value={bankCard}
                onChange={(e) => setBankCard(e.target.value.replace(/\D/g, ""))}
                maxLength={19}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setBankForm(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 13 }}>
                  取消
                </button>
                <button onClick={saveBank} style={{ flex: 1, padding: 10, borderRadius: 8, border: 0, background: "#5f554d", color: "#fff", fontSize: 13 }}>
                  确认绑定
                </button>
              </div>
            </div>
          </div>
        )}
        {notice && <p className="account-notice">{notice} 绑定状态已更新</p>}
      </main>
    </div>
  );
}