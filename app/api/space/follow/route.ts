import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);

// 惰性初始化：Supabase 未配置时不在此处 throw（next build 收集配置阶段 env 可能缺失），
// 请求到达时再判断，缺配置返回明确错误而非构建失败。
function getClient() {
  if (!hasSupabase) return null;
  return createClient(supabaseUrl!, supabaseKey!);
}

export async function POST(req: Request) {
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ success: false, error: "supabase 未配置" }, { status: 503 });
  const body = await req.json();
  const userId = "anonymous";

  await supabase.from("follows").upsert({ user_id: userId, author_id: body.targetUserId });

  const { data: work } = await supabase
    .from("works")
    .select("followers")
    .eq("author_id", body.targetUserId)
    .single();

  const newFollowers = (work?.followers || 0) + 1;
  await supabase.from("works").update({ followers: newFollowers }).eq("author_id", body.targetUserId);

  return NextResponse.json({ success: true, isFollowing: true, followers: newFollowers });
}

export async function DELETE(req: Request) {
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ success: false, error: "supabase 未配置" }, { status: 503 });
  const body = await req.json();
  const userId = "anonymous";

  await supabase.from("follows").delete().eq("user_id", userId).eq("author_id", body.targetUserId);

  const { data: work } = await supabase
    .from("works")
    .select("followers")
    .eq("author_id", body.targetUserId)
    .single();

  const newFollowers = Math.max(0, (work?.followers || 0) - 1);
  await supabase.from("works").update({ followers: newFollowers }).eq("author_id", body.targetUserId);

  return NextResponse.json({ success: true, isFollowing: false, followers: newFollowers });
}
