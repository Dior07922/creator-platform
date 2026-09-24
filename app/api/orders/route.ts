import { NextResponse } from "next/server";
import { findOrder } from "../../../src/server/order-store";
import { currentUserId, orderBelongsTo } from "../../../src/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/orders?orderId=VIP-xxx ─────────────────────────────────────────
// 仅供会员订单查询使用（原商品订单已移除）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ message: "缺少 orderId 参数" }, { status: 400 });
  }

  try {
    /* 订单含买家邮箱与用户 id，必须校验归属，否则知道订单号即可读取他人信息 */
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json({ message: "请先登录" }, { status: 401 });
    }

    const order = await findOrder(orderId);
    if (!order) {
      return NextResponse.json({ message: "订单不存在" }, { status: 404 });
    }

    /* 不是自己的订单：一律按「不存在」返回，不泄露订单是否存在 */
    if (!orderBelongsTo(order.userId, userId)) {
      return NextResponse.json({ message: "订单不存在" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ message: "订单数据读取失败" }, { status: 500 });
  }
}
