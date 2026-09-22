import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 惰性初始化：Supabase 未配置时不在构建期 throw，请求到达再判断
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function getClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: Request) {
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ success: false, error: "supabase 未配置" }, { status: 503 });
  const body = await req.json();
  const userId = "anonymous";

  const { data: existing } = await supabase
    .from("likes")
    .select()
    .eq("work_id", body.workId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: work } = await supabase
    .from("works")
    .select("likes")
    .eq("id", body.workId)
    .single();

  const currentLikes = work?.likes || 0;

  if (existing) {
    await supabase.from("likes").delete().eq("work_id", body.workId).eq("user_id", userId);
    await supabase.from("works").update({ likes: Math.max(0, currentLikes - 1) }).eq("id", body.workId);
    return NextResponse.json({ success: true, liked: false, likes: Math.max(0, currentLikes - 1) });
  } else {
    await supabase.from("likes").insert({ work_id: body.workId, user_id: userId });
    await supabase.from("works").update({ likes: currentLikes + 1 }).eq("id", body.workId);
    return NextResponse.json({ success: true, liked: true, likes: currentLikes + 1 });
  }
}
