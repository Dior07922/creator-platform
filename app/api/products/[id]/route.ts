import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const dataDirectory = path.join(process.cwd(), "data");

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(dataDirectory, name), "utf8")) as T;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  const products = await readJson<Array<{ id: number }>>("products.json");
  const product = products.find((item) => item.id === id);

  if (!product) {
    return NextResponse.json({ message: "没有找到这个商品" }, { status: 404 });
  }

  const orders = await readJson<Array<{ productId: number }>>("orders.json");
  const codes = await readJson<Array<{ productId: number }>>("codes.json");
  if (orders.some((item) => item.productId === id) || codes.some((item) => item.productId === id)) {
    return NextResponse.json(
      { message: "该商品已有订单或兑换码，不能删除；可以将它下架。" },
      { status: 409 },
    );
  }

  await writeFile(
    path.join(dataDirectory, "products.json"),
    JSON.stringify(products.filter((item) => item.id !== id), null, 2),
    "utf8",
  );
  return NextResponse.json({ success: true });
}
