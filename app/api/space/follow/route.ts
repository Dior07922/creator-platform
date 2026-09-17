import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
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
