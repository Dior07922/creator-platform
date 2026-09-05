import { NextResponse } from "next/server";
import { findOrder } from "../../../src/server/order-store";

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
    const order = await findOrder(orderId);
    if (!order) {
      return NextResponse.json({ message: "订单不存在" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ message: "订单数据读取失败" }, { status: 500 });
  }
}
