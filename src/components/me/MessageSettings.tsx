// name=src/components/me/MessageSettings.tsx

import React, { useState } from "react";
import AccountPageHeader from "./AccountPageHeader";

type Props = {
  go: (s: string) => void;
};

export default function MessageSettings({ go }: Props) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ranjingMessageSettings") || "{}");
    } catch {
      return {};
    }
  });
  const [soundMode, setSoundMode] = useState(
    () => localStorage.getItem("ranjingSoundMode") || "响铃"
  );

  function toggle(key: string) {
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    localStorage.setItem("ranjingMessageSettings", JSON.stringify(next));
  }

  function setSound(mode: string) {
    setSoundMode(mode);
    localStorage.setItem("ranjingSoundMode", mode);
  }

  const notifyItems = [
    { key: "通知消息", desc: "接收来自平台的最新消息" },
    { key: "上新消息", desc: "新模板上线时通知你" },
    { key: "系统升级", desc: "系统维护和升级通知" },
  ];

  return (
    <div className="account-page">
      <AccountPageHeader title="消息通知" go={go} />
      <main className="account-list account-list-spaced">
        <div style={{ padding: "12px 3px 6px", fontSize: 11, color: "#918981" }}>通知设置</div>
        {notifyItems.map((item) => {
          const on = values[item.key] !== false;
          return (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 3px",
                borderBottom: "1px solid rgba(74,70,63,.055)",
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: "#57524c" }}>{item.key}</div>
                <div style={{ fontSize: 11, color: "#aaa59e", marginTop: 2 }}>{item.desc}</div>
              </div>
              <button
                onClick={() => toggle(item.key)}
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
        <div style={{ padding: "18px 3px 6px", fontSize: 11, color: "#918981" }}>系统消息声音</div>
        <div style={{ display: "flex", gap: 8, padding: "8px 3px" }}>
          {["响铃", "震动", "静音"].map((mode) => (
            <button
              key={mode}
              onClick={() => setSound(mode)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: soundMode === mode ? "1px solid #75655a" : "1px solid rgba(128,107,92,.15)",
                background: soundMode === mode ? "#f3eee8" : "#fffdfa",
                fontSize: 13,
                color: "#57524c",
                cursor: "pointer",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}