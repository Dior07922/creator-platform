// name=src/components/me/PrivacySettings.tsx

import React, { useState } from "react";
import AccountPageHeader from "./AccountPageHeader";

type Props = {
  go: (s: string) => void;
};

export default function PrivacySettings({ go }: Props) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ranjingPrivacySettings") || "{}");
    } catch {
      return {};
    }
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState("");

  function toggle(key: string) {
    if (key === "允许采集云端" && !values[key]) {
      setShowPrivacy("cloud");
      return;
    }
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    localStorage.setItem("ranjingPrivacySettings", JSON.stringify(next));
  }

  function submitFeedback() {
    if (!feedback.trim()) return;
    const tickets = JSON.parse(localStorage.getItem("supportTickets") || "[]");
    tickets.push({
      id: "FB-" + Date.now(),
      content: feedback.trim(),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("supportTickets", JSON.stringify(tickets));
    setFeedbackSent(true);
    setFeedback("");
    setTimeout(() => {
      setShowFeedback(false);
      setFeedbackSent(false);
    }, 2000);
  }

  return (
    <div className="account-page">
      <AccountPageHeader title="隐私设置" go={go} />
      <main className="account-list account-list-spaced">
        <button type="button" onClick={() => setShowFeedback(true)}>
          <span>我有疑问</span>
          <b>›</b>
        </button>
        <button type="button" onClick={() => setShowPrivacy("permission")}>
          <span>系统权限管理</span>
          <b>›</b>
        </button>
        {(["允许采集云端"] as const).map((key) => {
          const on = values[key] === true;
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
        <button type="button" onClick={() => {}}>
          <span>团队信息</span>
          <b>›</b>
        </button>

        {showFeedback && (
          <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, background: "rgba(0,0,0,.25)" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 20px", width: 300, boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>意见反馈</div>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>如果你有什么想说的请在这里进行记录发送</div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="请输入你的反馈..."
                style={{ width: "100%", height: 100, padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 13, resize: "none", boxSizing: "border-box" }}
              />
              {feedbackSent && <div style={{ color: "#27ae60", fontSize: 13, marginTop: 8 }}>✓ 已发送，我们会尽快回复</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={() => setShowFeedback(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 13 }}>
                  取消
                </button>
                <button
                  onClick={submitFeedback}
                  disabled={!feedback.trim()}
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: 0, background: "#5f554d", color: "#fff", fontSize: 13, opacity: feedback.trim() ? 1 : 0.5 }}
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        )}

        {showPrivacy && (
          <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, background: "rgba(0,0,0,.25)" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 20px", width: 300, maxHeight: "80%", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                {showPrivacy === "cloud" ? "云端数据采集说明" : "系统权限管理"}
              </div>
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.8 }}>
                {showPrivacy === "cloud" ? (
                  <>
                    <p>苒境在提供云端备份服务时，可能需要采集以下信息：</p>
                    <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
                      <li>你的创作文本内容</li>
                      <li>文件结构与元数据</li>
                      <li>设备基本信息（用于同步）</li>
                    </ul>
                    <p style={{ color: "#c0392b", fontWeight: 500 }}>如果不同意采集，云端将无法备份你的文件，文件丢失后很难找回。</p>
                    <p>我们承诺：所有数据仅用于云端备份，不会用于其他用途，不会向第三方披露。</p>
                  </>
                ) : (
                  <>
                    <p>苒境可能需要以下系统权限：</p>
                    <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
                      <li>屏幕方向控制（横屏/竖屏）</li>
                      <li>云端数据存储权限</li>
                      <li>通知推送权限</li>
                    </ul>
                    <p>你可以在这里管理这些权限的开关。关闭某些权限可能影响部分功能的使用。</p>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => setShowPrivacy("")} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 13 }}>
                  不同意
                </button>
                <button
                  onClick={() => {
                    if (showPrivacy === "cloud") {
                      const next = { ...values, 允许采集云端: true };
                      setValues(next);
                      localStorage.setItem("ranjingPrivacySettings", JSON.stringify(next));
                    }
                    setShowPrivacy("");
                  }}
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: 0, background: "#5f554d", color: "#fff", fontSize: 13 }}
                >
                  同意
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}