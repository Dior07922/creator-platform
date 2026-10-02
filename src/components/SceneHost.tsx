"use client";

/* 场景容器：把独立的场景 HTML（复古电脑 / 碎碎念之神 / 发不出去的信息）
   装进同源 iframe，主程序只负责开、关、收消息。
   为什么用 iframe：这三个场景是各自完整的独立页面（自带样式与 3D/打字机引擎），
   塞进 React 会互相打架；同源 iframe 让它们原样运行，退出契约只走 postMessage 一条路。

   消息契约（子 → 父）：
     { type: "ranjing:scene-exit", detail: { scene, source, result } }
     { type: "ranjing-buy" }              复古电脑 B 页「在苒境中开通会员」
     { type: "ranjing-need-membership" }  记忆空间开门被会员门槛拦下（由 MemorySpace 处理） */
import { useEffect, useRef, useState, type ReactNode } from "react";

export type SceneMessage = { type: string; detail?: Record<string, unknown>; [key: string]: unknown };

export default function SceneHost({ src, title, onEvent, children }: {
  src: string;
  title: string;
  onEvent: (msg: SceneMessage) => void;
  /** 主程序叠在场景上的自有控件（返回、入口按钮） */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      /* 只认自己这扇窗的消息（页面里可能有多个场景同时挂着） */
      if (ev.source !== ref.current?.contentWindow) return;
      const data = ev.data;
      if (data && typeof data === "object" && typeof (data as SceneMessage).type === "string") {
        onEvent(data as SceneMessage);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onEvent]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2600, background: "#0d0f10" }}>
      <iframe
        ref={ref}
        src={src}
        title={title}
        onLoad={() => setReady(true)}
        allow="fullscreen"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }}
      />
      {/* 载入遮罩：本机文件几乎瞬间就好，只防止白闪一帧 */}
      <div style={{
        position: "absolute", inset: 0, background: "#0d0f10", display: "flex",
        alignItems: "center", justifyContent: "center", pointerEvents: "none",
        opacity: ready ? 0 : 1, transition: "opacity .35s ease",
        color: "#7d949e", fontSize: 12, letterSpacing: ".3em",
      }}>正在连接…</div>
      {children}
    </div>
  );
}
