import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type Product = {
  id: number;
  name: string;
  desc: string;
  price: string;
  badge: string;
  icon: string;
  color: string;
  stock?: number;
};

const productsFile = path.join(process.cwd(), "data", "products.json");

async function readProducts(): Promise<Product[]> {
  return JSON.parse(await readFile(productsFile, "utf8")) as Product[];
}

export async function GET() {
  return NextResponse.json(await readProducts());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name?.trim() || !body.price?.trim()) {
    return NextResponse.json({ message: "请填写商品名称和价格" }, { status: 400 });
  }

  const products = await readProducts();
  const product: Product = {
    id: products.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    name: String(body.name).trim(),
    desc: String(body.desc ?? "").trim(),
    price: `¥${String(body.price).trim().replace(/^[¥$]/, "")}`,
    badge: String(body.badge ?? "自有商品").trim(),
    icon: String(body.icon ?? "🎁").trim() || "🎁",
    color: String(body.color ?? "#EDE4D8"),
    stock: Number(body.stock ?? 0),
  };

  products.push(product);
  await writeFile(productsFile, JSON.stringify(products, null, 2), "utf8");
  return NextResponse.json(product, { status: 201 });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const id = Number(body.id);
  const products = await readProducts();
  const index = products.findIndex((item) => item.id === id);

  if (index === -1) {
    return NextResponse.json({ message: "没有找到这个商品" }, { status: 404 });
  }
  if (!body.name?.trim() || !body.price?.trim()) {
    return NextResponse.json({ message: "请填写商品名称和价格" }, { status: 400 });
  }

  const current = products[index];
  const updated: Product = {
    ...current,
    name: String(body.name).trim(),
    desc: String(body.desc ?? "").trim(),
    price: `¥${String(body.price).trim().replace(/^[¥$]/, "")}`,
    badge: String(body.badge ?? "自有商品").trim(),
    icon: String(body.icon ?? "🎁").trim() || "🎁",
    stock: Number(body.stock ?? 0),
  };

  products[index] = updated;
  await writeFile(productsFile, JSON.stringify(products, null, 2), "utf8");
  return NextResponse.json(updated);
}
