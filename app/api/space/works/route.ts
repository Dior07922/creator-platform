import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const items = await Promise.all(
    (data || []).map(async (w: any) => {
      const { data: hw } = await supabase
        .from("homework")
        .select("*")
        .eq("work_id", w.id)
        .order("created_at", { ascending: false });

      return {
        id: w.id,
        authorId: w.author_id,
        authorName: w.author_name,
        authorAvatar: w.author_avatar,
        title: w.title,
        image: w.image,
        copyRule: w.copy_rule,
        likes: w.likes,
        followers: w.followers,
        homeworkCount: w.homework_count,
        discussing: w.discussing,
        isFollowing: false,
        isLiked: false,
        homeworkList: (hw || []).map((h: any) => ({
          id: h.id,
          userAvatar: h.user_avatar,
          userName: h.user_name,
          content: h.content,
          image: h.image_url,
          authorReply: h.author_reply,
        })),
      };
    })
  );

  return NextResponse.json({ items });
}
