import { NextResponse } from "next/server";

// 🚨 临时内存数据（后续接数据库时替换）
export const mockWorks = [
  {
    id: "w1",
    authorId: "u1",
    authorName: "拾光画师",
    authorAvatar: "https://i.pravatar.cc/150?u=10",
    title: "赛博朋克小巷",
    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800",
    copyRule: "粉丝可临摹",
    likes: 128, isLiked: false,
    followers: 340, isFollowing: false,
    comments: 24,
    discussing: 12,
    homeworkCount: 0,
    homeworkList: [] as any[],
  }
];

export async function GET() {
  return NextResponse.json({ items: mockWorks });
}