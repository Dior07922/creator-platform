// name=src/components/me/PersonalProfile.tsx

import React, { useRef, useState } from "react";
import AccountPageHeader from "./AccountPageHeader";
import { loadPersonalProfile } from "../../lib/localProfile";
import type { PersonalProfile as ProfileModel } from "../../types/profile";
import splashCover from "../../assets/splash-cover-original.png";

type Props = {
  go: (s: string) => void;
};

export default function PersonalProfile({ go }: Props) {
  const [profile, setProfile] = useState<ProfileModel>(loadPersonalProfile);
  const [showSaved, setShowSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>(() => {
    try {
      return localStorage.getItem("ranjingUserAvatar") || "";
    } catch {
      return "";
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setAvatarUrl(url);
      try {
        localStorage.setItem("ranjingUserAvatar", url);
      } catch {
        /* noop */
      }
    };
    reader.readAsDataURL(file);
  }

  function save() {
    localStorage.setItem("ranjingPersonalProfile", JSON.stringify(profile));
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }

  return (
    <div className="account-page">
      <AccountPageHeader title="编辑资料" go={go} />
      <main className="personal-profile-form">
        <div className="pp-avatar-block">
          <button
            type="button"
            className="pp-avatar-btn"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            aria-label="更换头像"
          >
            <img src={avatarUrl || splashCover.src} alt="用户头像" />
          </button>
          <span className="pp-avatar-label">头像</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarPick}
          />
        </div>
        <div className="pp-field-list">
          <div className="pp-field-row">
            <span className="pp-field-label">昵称</span>
            <input
              className="pp-field-input"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>
          <div className="pp-field-row">
            <span className="pp-field-label">简介</span>
            <input
              className="pp-field-input"
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            />
          </div>
          <div className="pp-field-row">
            <span className="pp-field-label">性别</span>
            <select
              className="pp-field-input"
              value={profile.gender}
              onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
            >
              <option value="">不透露</option>
              <option>女</option>
              <option>男</option>
              <option>其他</option>
            </select>
          </div>
          <div className="pp-field-row">
            <span className="pp-field-label">生日</span>
            <input
              type="date"
              className="pp-field-input"
              value={profile.birthday}
              onChange={(e) => setProfile({ ...profile, birthday: e.target.value })}
            />
          </div>
        </div>
        <div className="pp-wish-block">
          <span className="pp-field-label">写给自己的祝愿</span>
          <textarea
            className="pp-wish-textarea"
            value={profile.wish}
            onChange={(e) => setProfile({ ...profile, wish: e.target.value })}
          />
        </div>
        <button type="button" className="account-primary-action" onClick={save}>
          保存资料
        </button>
      </main>
      {showSaved && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, background: "rgba(0,0,0,.25)" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "32px 40px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,.12)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#333" }}>保存成功</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>个人资料已更新</div>
          </div>
        </div>
      )}
    </div>
  );
}