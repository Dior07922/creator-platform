import { NextResponse } from "next/server";
import { newCaptcha } from "@/server/captcha";

/* 取一张图形验证码：{ id, svgText }。前端把 svgText 直接内联渲染（自己的服务端产出，无用户输入）。 */
export async function GET() {
  const { id, svg } = newCaptcha();
  return NextResponse.json(
    { id, svgText: svg },
    { headers: { "Cache-Control": "no-store" } }
  );
}
