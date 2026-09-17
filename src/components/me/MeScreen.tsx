// name=src/components/me/MeScreen.tsx

import React, { useEffect, useState } from "react";
import { loadPersonalProfile } from "../../lib/localProfile";
import type { PersonalProfile } from "../../types/profile";
import splashCover from "../../assets/splash-cover-original.png";

type Props = {
  go: (s: string) => void;
};

const ACCOUNT_ITEMS: { label: string; screen: string }[] = [
  { label: "个人资料", screen: "personal-profile" },
  { label: "支付方式", screen: "payment-settings" },
  { label: "消息通知", screen: "message-settings" },
  { label: "隐私设置", screen: "privacy-settings" },
  { label: "会员设置", screen: "membership-settings" },
  { label: "账号与安全", screen: "account-security" },
];

export default function MeScreen({ go }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState<PersonalProfile>(loadPersonalProfile);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    setProfile(loadPersonalProfile());
    try {
      setAvatarUrl(localStorage.getItem("ranjingUserAvatar") || "");
    } catch {
      setAvatarUrl("");
    }
  }, [refreshKey]);

  useEffect(() => {
    function handleFocus() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  return (
    <div className="profile-page flex-1 flex flex-col overflow-hidden">
      <div className="profile-scroll flex-1 overflow-y-auto scrollbar-hide">
        <section className="profile-identity">
          <div className="profile-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="用户头像" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <img src={splashCover.src} alt="用户原创手绘头像" className="absolute inset-0 w-full h-full object-cover" />
            )}
          </div>
          <div className="profile-copy">
            <div className="profile-name">{profile.name}</div>
            <div className="profile-bio">{profile.bio || "还没有简介"}</div>
          </div>
        </section>
        <div className="profile-directory">
          {ACCOUNT_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                go(item.screen);
                setRefreshKey((k) => k + 1);
              }}
              className="profile-directory-item"
            >
              <span>{item.label}</span>
              <span className="profile-directory-arrow">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}