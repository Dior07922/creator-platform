"use client";

import { useUiTheme } from "./creation/CreationLocalRoom";

/* 导出分享闸门：点「导出分享」且未登录时弹出（第六步：闸门从「保存」挪到这里）。
   复用原工程 .mini-confirm-* 样式。它挂在 App 层（创作房间外面），所以自己挂 rj-ui +
   data-theme，与房间同一把钥匙（ranjing:ui-theme），夜里跟界面设置一起变深，不漏白。 */
export default function SaveGateDialog({ onLogin, onCancel }: { onLogin: () => void; onCancel: () => void }) {
  const uiTheme = useUiTheme();
  return (
    <div className="mini-confirm-overlay rj-ui" data-theme={uiTheme} onClick={onCancel}>
      <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg">导出分享需要先注册登录</div>
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok" onClick={onLogin}>去登录</button>
        </div>
      </div>
    </div>
  );
}
