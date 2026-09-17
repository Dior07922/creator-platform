import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();
  const id = `hw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const userId = "anonymous";

  let imageUrl = "";

  if (body.image && body.image.startsWith("data:")) {
    const base64Data = body.image.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    const fileName = `${id}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("homework")
      .upload(fileName, buffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      return NextResponse.json({ message: "图片上传失败: " + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("homework").getPublicUrl(fileName);
    imageUrl = urlData.publicUrl;
  }

  const { error } = await supabase.from("homework").insert({
    id,
    work_id: body.workId,
    user_id: userId,
    user_name: body.userName || "我",
    user_avatar: body.userAvatar || "🐱",
    content: body.content || "这是我的作业",
    image_url: imageUrl,
    author_reply: null,
  });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const { data: work } = await supabase
    .from("works")
    .select("homework_count")
    .eq("id", body.workId)
    .single();

  await supabase
    .from("works")
    .update({ homework_count: (work?.homework_count || 0) + 1 })
    .eq("id", body.workId);

  return NextResponse.json({ success: true });
}
