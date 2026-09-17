// name=src/components/me/MembershipSettings.tsx

import React, { useState } from "react";
import AccountPageHeader from "./AccountPageHeader";

type Props = {
  go: (s: string) => void;
};

export default function MembershipSettings({ go }: Props) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ranjingMembershipSettings") || "{}");
    } catch {
      return {};
    }
  });
  const [prefType, setPrefType] = useState(
    () => localStorage.getItem("ranjingTemplatePref") || ""
  );

  function toggle(key: string) {
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    localStorage.setItem("ranjingMembershipSettings", JSON.stringify(next));
  }

  function setPref(type: string) {
    setPrefType(type);
    localStorage.setItem("ranjingTemplatePref", type);
  }

  const prefTypes = [
    { key: "可爱", icon: "🎀" },
    { key: "搞怪", icon: "🤪" },
    { key: "工作", icon: "💼" },
    { key: "设计", icon: "🎨" },
  ];

  return (
    <div className="account-page">
      <AccountPageHeader title="会员设置" go={go} />
      <main className="account-list account-list-spaced">
        {(["续费提醒", "订阅消息"] as const).map((key) => {
          const on = values[key] !== false;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 3px",
                borderBottom: "1px solid rgba(74,70,63,.055)",
              }}
            >
              <span style={{ fontSize: 14, color: "#57524c" }}>{key}</span>
              <button
                onClick={() => toggle(key)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  border: 0,
                  background: on ? "#7c6f64" : "#d5d0cb",
                  position: "relative",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: on ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: "#fff",
                    transition: "left .2s",
                  }}
                />
              </button>
            </div>
          );
        })}
        <div style={{ padding: "18px 3px 6px", fontSize: 11, color: "#918981" }}>
          设置偏好  推荐模板类型
        </div>
        <div style={{ display: "flex", gap: 8, padding: "8px 3px" }}>
          {prefTypes.map((t) => (
            <button
              key={t.key}
              onClick={() => setPref(t.key)}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: prefType === t.key ? "1px solid #75655a" : "1px solid rgba(128,107,92,.15)",
                background: prefType === t.key ? "#f3eee8" : "#fffdfa",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 20 }}>{t.icon}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: "#57524c" }}>{t.key}</div>
            </button>
          ))}
        </div>
        <div style={{ padding: "18px 3px 6px", fontSize: 11, color: "#918981" }}>
          团队默认模板（仅团队长可见）
        </div>
        <button type="button" onClick={() => go("membership")}>
          <span>团队模板设置</span>
          <b>›</b>
        </button>
      </main>
    </div>
  );
}