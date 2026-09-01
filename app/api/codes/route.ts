import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type RedemptionCode = {
  code: string;
  productId: number;
  productName: string;
  status: "Available" | "Issued" | "Redeemed";
  orderId?: string;
  createdAt: string;
  issuedAt?: string;
  redeemedAt?: string;
};

const codesFile = path.join(process.cwd(), "data", "codes.json");
const productsFile = path.join(process.cwd(), "data", "products.json");
const ordersFile = path.join(process.cwd(), "data", "orders.json");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function makeCode(prefix: string) {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `${prefix}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}`;
}

export async function GET(request: Request) {
  const productId = Number(new URL(request.url).searchParams.get("productId"));
  const codes = await readJson<RedemptionCode[]>(codesFile);
  if (productId) {
    const available = codes.filter((code) => code.productId === productId && code.status === "Available").length;
    return NextResponse.json({ productId, available, canPurchase: available > 0 });
  }
  return NextResponse.json(codes);
}

export async function POST(request: Request) {
  const body = await request.json();
  const productId = Number(body.productId);
  const count = Math.min(500, Math.max(1, Number(body.count ?? 1)));
  const prefix = String(body.prefix ?? "SKILL").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "SKILL";
  const products = await readJson<Array<{ id: number; name: string }>>(productsFile);
  const product = products.find((item) => item.id === productId);

  if (!product) return NextResponse.json({ message: "请选择有效商品" }, { status: 400 });

  const codes = await readJson<RedemptionCode[]>(codesFile);
  const existing = new Set(codes.map((item) => item.code));
  const created: RedemptionCode[] = [];

  while (created.length < count) {
    const code = makeCode(prefix);
    if (existing.has(code)) continue;
    existing.add(code);
    created.push({ code, productId, productName: product.name, status: "Available", createdAt: new Date().toISOString() });
  }

  codes.push(...created);
  await writeFile(codesFile, JSON.stringify(codes, null, 2), "utf8");
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const codes = await readJson<RedemptionCode[]>(codesFile);

  if (body.action === "assign") {
    const productId = Number(body.productId);
    const orderId = String(body.orderId ?? "");
    const item = codes.find((code) => code.productId === productId && code.status === "Available");
    if (!item) return NextResponse.json({ message: "该商品暂无可用兑换码" }, { status: 409 });

    item.status = "Issued";
    item.orderId = orderId;
    item.issuedAt = new Date().toISOString();
    await writeFile(codesFile, JSON.stringify(codes, null, 2), "utf8");

    const orders = await readJson<Array<Record<string, unknown>>>(ordersFile);
    const order = orders.find((entry) => entry.id === orderId);
    if (order) {
      order.status = "Paid";
      order.deliveredCode = item.code;
      order.paidAt = new Date().toISOString();
      await writeFile(ordersFile, JSON.stringify(orders, null, 2), "utf8");
    }
    return NextResponse.json(item);
  }

  if (body.action === "redeem") {
    const item = codes.find((code) => code.code === String(body.code));
    if (!item) return NextResponse.json({ message: "兑换码不存在" }, { status: 404 });
    if (item.status !== "Issued") return NextResponse.json({ message: "该兑换码当前不能兑换" }, { status: 409 });
    item.status = "Redeemed";
    item.redeemedAt = new Date().toISOString();
    await writeFile(codesFile, JSON.stringify(codes, null, 2), "utf8");
    return NextResponse.json(item);
  }

  return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
}
