import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const creatorsFile = path.join(process.cwd(), "data", "creators.json");
const blockedTerms = ["色情", "裸聊", "赌博", "博彩", "赌场", "毒品", "冰毒", "海洛因", "枪支", "洗钱", "诈骗", "代开发票"];

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim().slice(0, 40);
  const contact = String(body.contact ?? "").trim().slice(0, 100);
  const skill = String(body.skill ?? "").trim().slice(0, 80);
  const description = String(body.description ?? "").trim().slice(0, 1000);
  const category = String(body.category ?? "").trim().slice(0, 50);
  const combined = `${skill} ${description}`.toLowerCase();

  if (!name || !contact || !skill || !description || !body.agreed) {
    return NextResponse.json({ message: "请完整填写资料并同意平台规则" }, { status: 400 });
  }
  const hit = blockedTerms.find((term) => combined.includes(term));
  if (hit) {
    return NextResponse.json({ message: "提交内容包含平台禁止发布的信息，无法入驻" }, { status: 422 });
  }

  const creators = JSON.parse(await readFile(creatorsFile, "utf8")) as Array<Record<string, unknown>>;
  const application = {
    id: `CREATOR-${Date.now()}`,
    name,
    contact,
    skill,
    description,
    category,
    portfolio: String(body.portfolio ?? "").trim().slice(0, 300),
    status: "PendingReview",
    createdAt: new Date().toISOString(),
  };
  creators.push(application);
  await writeFile(creatorsFile, JSON.stringify(creators, null, 2), "utf8");
  return NextResponse.json({ id: application.id, status: application.status }, { status: 201 });
}
