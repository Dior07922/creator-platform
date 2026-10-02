// name=src/server/captcha.ts
/* 图形验证码（第六步·注册表单里的「验证码」字段）
   手稿的注册页有验证码一格，但这里没有第三方验证码服务 —— 不引外部依赖，
   自己签发：服务端生成 4 位字符 -> 返回 SVG 图片 + 一次性 id，
   注册时用 id 找回答案校验，验完即删（不许复用）。
   存内存 Map 即可：验证码 5 分钟有效，进程重启后作废重取，代价可忽略。 */
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉 I/L/O/0/1 等易混字符
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

const store = new Map<string, { text: string; expiresAt: number }>();

function purge() {
  const now = Date.now();
  for (const [id, item] of store) {
    if (item.expiresAt <= now) store.delete(id);
  }
  /* 极端情况下（被刷）兜底：超量时丢最早的 */
  if (store.size > MAX_ENTRIES) {
    const overflow = store.size - MAX_ENTRIES;
    let i = 0;
    for (const id of store.keys()) {
      if (i++ >= overflow) break;
      store.delete(id);
    }
  }
}

export function newCaptcha(): { id: string; svg: string } {
  purge();
  let text = "";
  for (let i = 0; i < 4; i++) text += ALPHABET[randomInt(0, ALPHABET.length)];
  const id = `cap-${Date.now().toString(36)}-${randomInt(0, 1 << 30).toString(36)}`;
  store.set(id, { text, expiresAt: Date.now() + TTL_MS });

  const colors = ["#37535f", "#4a6b7a", "#2f4854", "#5b7380"];
  const chars = text.split("").map((ch, i) => {
    const x = 16 + i * 24;
    const y = 30 + randomInt(-3, 4);
    const rotate = randomInt(-14, 15);
    const color = colors[randomInt(0, colors.length)];
    return `<text x="${x}" y="${y}" font-size="25" font-family="Georgia,serif" font-weight="700" fill="${color}" transform="rotate(${rotate} ${x} ${y - 8})">${ch}</text>`;
  }).join("");
  const lines = Array.from({ length: 3 }, () => {
    const x1 = randomInt(0, 40), y1 = randomInt(4, 40), x2 = randomInt(80, 120), y2 = randomInt(4, 40);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9db4bf" stroke-width="1" opacity="0.55"/>`;
  }).join("");
  const dots = Array.from({ length: 18 }, () => {
    return `<circle cx="${randomInt(2, 118)}" cy="${randomInt(2, 42)}" r="1" fill="#8aa4b0" opacity="0.5"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44" viewBox="0 0 120 44" role="img" aria-label="图形验证码"><rect width="120" height="44" rx="6" fill="#eef4f6"/>${lines}${dots}${chars}</svg>`;
  return { id, svg };
}

/** 校验并消费（一次性）：对错都会删掉本条，防止暴力猜。 */
export function checkCaptcha(id: string, input: string): boolean {
  purge();
  const item = store.get(id);
  if (!item) return false;
  store.delete(id);
  if (item.expiresAt <= Date.now()) return false;
  return item.text === input.trim().toUpperCase();
}
