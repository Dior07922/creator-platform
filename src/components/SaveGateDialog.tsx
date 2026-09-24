"use client";

/* 保存闸门：点「保存」且未登录时弹出。复用原工程 .mini-confirm-* 样式。 */
export default function SaveGateDialog({ onLogin, onCancel }: { onLogin: () => void; onCancel: () => void }) {
  return (
    <div className="mini-confirm-overlay" onClick={onCancel}>
      <div className="mini-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="mini-confirm-msg">保存作品需要先注册登录</div>
        <div className="mini-confirm-actions">
          <button type="button" className="mini-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="mini-confirm-ok" onClick={onLogin}>去登录</button>
        </div>
      </div>
    </div>
  );
}
