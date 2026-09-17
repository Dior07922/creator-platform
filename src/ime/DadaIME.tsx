'use client';
import { useEffect, useRef, useState } from 'react';
import { createPinyinInput } from 'jsh_rime';
import { useDada } from './store';

const WEIRD = [
  '未发送的消息', '凌晨三点', '一块会呼吸的灰',
  '你昨天删掉的话', '第404个错误', '雨声倒放',
  '反方向的钟', '打翻的墨', '没有标题的网页',
];

export default function DadaIME() {
  const [open, setOpen] = useState(false);
  const [buf, setBuf] = useState('');
  const [cands, setCands] = useState<string[]>([]);
  const rimeRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const nodes = useDada(s => s.nodes);
  const links = useDada(s => s.links);
  const selected = useDada(s => s.selected);
  const spawnNode = useDada(s => s.spawnNode);

  useEffect(() => {
    let mounted = true;
    createPinyinInput({ wasmDir: '/rime', simplified: true })
      .then(e => { if (mounted) { rimeRef.current = e; console.log('Rime ready'); } })
      .catch(err => console.warn('Rime init failed', err));
    return () => {
      mounted = false;
      if (rimeRef.current) try { rimeRef.current.destroy(); } catch {}
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rime = rimeRef.current;
      if (!buf) {
        setCands([]);
        if (rime) try { rime.clear(); } catch {}
        return;
      }
      const out: string[] = [];
      if (rime) {
        try {
          const st = await rime.input(buf);
          if (st?.candidates) for (const cd of st.candidates.slice(0, 9)) out.push(cd.text);
        } catch {}
      }
      if (!out.length) out.push(buf);
      while (out.length < 6) out.push(WEIRD[(Math.random() * WEIRD.length) | 0]);
      if (!cancelled) setCands(out.slice(0, 9));
    })();
    return () => { cancelled = true; };
  }, [buf]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const DPR = Math.min(devicePixelRatio || 1, 2);
    const rect = c.getBoundingClientRect();
    const W = c.width = rect.width * DPR;
    const H = c.height = rect.height * DPR;
    ctx.fillStyle = 'rgba(20,20,24,0.9)';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(160,160,220,0.55)';
    ctx.lineWidth = 1.5 * DPR;
    for (const l of links) {
      const a = nodes.find(n => n.id === l.a);
      const b = nodes.find(n => n.id === l.b);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * DPR, a.y * DPR);
      ctx.lineTo(b.x * DPR, b.y * DPR);
      ctx.stroke();
    }

    for (const n of nodes) {
      const nx = n.x * DPR, ny = n.y * DPR;
      const sel = n.id === selected;
      ctx.beginPath();
      ctx.arc(nx, ny, (sel ? 10 : 7) * DPR, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${n.hue},70%,${sel ? 85 : 70}%)`;
      ctx.fill();
      ctx.font = `${11 * DPR}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, nx, ny - 14 * DPR);
    }
  }, [nodes, links, selected, open]);

  function pickCandidate(text: string) {
    const c = canvasRef.current;
    const rect = c?.getBoundingClientRect();
    const w = rect?.width || 300;
    const h = rect?.height || 160;
    const x = w / 2 + (Math.random() - 0.5) * 80;
    const y = h / 2 + (Math.random() - 0.5) * 80;
    spawnNode(text, x, y);
    setBuf('');
    setCands([]);
    if (rimeRef.current) try { rimeRef.current.clear(); } catch {}
    if (inputRef.current) inputRef.current.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="fixed z-[9999] rounded-full shadow-lg"
        style={{
          right: 16, bottom: 90, width: 48, height: 48,
          background: '#5f554d', color: '#fff', border: 0, fontSize: 20,
          cursor: 'pointer',
        }}
        onClick={() => setOpen(true)}
        aria-label="打开输入法"
      >
        达
      </button>
    );
  }

  return (
    <div
      className="fixed z-[9999] rounded-2xl shadow-2xl"
      style={{
        right: 16, bottom: 90, width: 320,
        background: '#1a1a1f', color: '#fff', padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>达达输入</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ border: 0, background: 'transparent', color: '#fff', fontSize: 18, cursor: 'pointer' }}
          aria-label="收起"
        >
          ×
        </button>
      </div>

      <input
        ref={inputRef}
        value={buf}
        onChange={e => setBuf(e.target.value)}
        placeholder="输入拼音"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '8px 10px', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)',
          color: '#fff', fontSize: 14, outline: 'none', marginBottom: 8,
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 32 }}>
        {cands.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => pickCandidate(c)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: 0,
              background: i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)',
              color: i === 0 ? '#1a1a1f' : '#fff',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 160, borderRadius: 10, display: 'block' }}
      />
    </div>
  );
}