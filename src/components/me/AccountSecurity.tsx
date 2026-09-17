// name=src/components/me/AccountSecurity.tsx

import React, { useEffect, useState } from "react";
import AccountPageHeader from "./AccountPageHeader";
import { API_BASE } from "../../lib/apiBase";

type Props = {
  go: (s: string) => void;
};

export default function AccountSecurity({ go }: Props) {
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`)
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.phone) setPhone(d.user.phone);
      })
      .catch(() => {});
  }, []);

  const displayPhone = phone
    ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")
    : "未绑定";

  const items = [
    { label: "手机号", value: displayPhone, action: "phone" },
    { label: "修改昵称", action: "nickname" },
    { label: "授权管理", action: "auth" },
    { label: "实名认证", value: "未认证", action: "verify" },
    { label: "注销苒境账号", danger: true, action: "delete" },
  ];

  function handleAction(action: string, label: string) {
    if (action === "phone") {
      setNotice("当前登录手机号：" + (phone || "未获取"));
      return;
    }
    if (action === "nickname") {
      go("personal-profile");
      return;
    }
    if (action === "delete") {
      setConfirmAction(label);
      return;
    }
    setNotice(`${label}：功能开发中`);
  }

  return (
    <div className="account-page">
      <AccountPageHeader title="账号设置" go={go} />
      <main className="account-list account-list-spaced">
        {items.map((item) => (
          <button
            type="button"
            className={item.danger ? "is-danger" : ""}
            key={item.label}
            onClick={() => handleAction(item.action!, item.label)}
          >
            <span>{item.label}</span>
            {item.value && <small>{item.value}</small>}
            <b>›</b>
          </button>
        ))}
        {notice && <p className="account-notice">{notice}</p>}
        {confirmAction && (
          <div className="account-notice" style={{ background: "#fde8e8", color: "#c0392b" }}>
            <div>确认{confirmAction}？此操作不可恢复。</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  localStorage.clear();
                  setConfirmAction("");
                  setNotice("已清除本地数据");
                }}
                style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #c0392b", background: "#c0392b", color: "#fff", fontSize: 12 }}
              >
                确认清除
              </button>
              <button
                onClick={() => setConfirmAction("")}
                style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", fontSize: 12 }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}