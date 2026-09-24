import { cookies } from "next/headers";

import { db, SESSION_COOKIE, tokenHash } from "./auth";

/*
 * 会话 → 用户 id 的唯一入口。
 *
 * 原先 membership/orders 和 membership/status 各自抄了一份一模一样的实现，
 * 而 orders / payments 三个接口则完全没有鉴权 —— 任何人拿到订单号就能读到
 * 别人的订单（含 deliveryEmail、userId、alipayTradeNo）。统一到这里之后，
 * 所有需要「这单是不是你的」判断的接口都走同一个函数。
 */
export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db()`
    SELECT user_id AS "userId"
    FROM user_sessions
    WHERE token_hash = ${tokenHash(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) return null;
  return String(rows[0].userId);
}

/*
 * 判断订单归属。
 *
 * 老订单（order_kind = 'product' 时代）可能没有 user_id。这类订单不允许
 * 匿名读取 —— 宁可让极少数历史订单查不到，也不能把买家信息开放出去。
 */
export function orderBelongsTo(orderUserId: string | undefined, userId: string | null): boolean {
  if (!orderUserId) return false;
  return userId !== null && orderUserId === userId;
}
