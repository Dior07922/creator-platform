// name=src/components/me/AccountPageHeader.tsx

import React from "react";

type Props = {
  title: string;
  go: (s: string) => void;
};

export default function AccountPageHeader({ title, go }: Props) {
  return (
    <header className="account-page-header">
      <button type="button" onClick={() => go("profile")} aria-label="返回我的">
        ‹
      </button>
      <h1>{title}</h1>
      <span />
    </header>
  );
}