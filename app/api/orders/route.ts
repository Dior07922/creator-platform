import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type StoredOrder = {
  id: string;
  productId: number;
  product: string;
  icon: string;
  quantity: number;
  amount: string;
  paymentMethod: string;
  status: "Pending";
  createdAt: string;
  deliveryEmail: string;
  saveDeliveryEmail: boolean;
  emailDeliveryStatus: "NotConfigured" | "Pending" | "Sent" | "Failed";
};

const dataDirectory = path.join(process.cwd(), "data");
const ordersFile = path.join(dataDirectory, "orders.json");

async function readOrders(): Promise<StoredOrder[]> {
  try {
    return JSON.parse(await readFile(ordersFile, "utf8")) as StoredOrder[];
  } catch (error) {
    // 只有文件不存在时才返回空数组；其他错误（JSON 损坏、权限问题等）必须向上抛出
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// ─── GET /api/orders?orderId=ORD-xxx ─────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ message: "缺少 orderId 参数" }, { status: 400 });
  }

  try {
    const orders = await readOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      return NextResponse.json({ message: "订单不存在" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ message: "订单数据读取失败" }, { status: 500 });
  }
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const body = await request.json();

  if (!body.productId || !body.product || !body.amount) {
    return NextResponse.json({ message: "订单信息不完整" }, { status: 400 });
  }
  const deliveryEmail = String(body.deliveryEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryEmail)) {
    return NextResponse.json({ message: "请输入正确的接收邮箱" }, { status: 400 });
  }

  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  const order: StoredOrder = {
    id: `ORD-${date}-${suffix}`,
    productId: Number(body.productId),
    product: String(body.product),
    icon: String(body.icon ?? "📦"),
    quantity: 1,
    amount: String(body.amount),
    paymentMethod: String(body.paymentMethod ?? "alipay"),
    status: "Pending",
    createdAt: now.toISOString(),
    deliveryEmail,
    saveDeliveryEmail: Boolean(body.saveDeliveryEmail),
    emailDeliveryStatus: "NotConfigured",
  };

  await mkdir(dataDirectory, { recursive: true });
  const orders = await readOrders();
  orders.push(order);
  await writeFile(ordersFile, JSON.stringify(orders, null, 2), "utf8");

  return NextResponse.json(order, { status: 201 });
}
