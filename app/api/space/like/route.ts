import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
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
