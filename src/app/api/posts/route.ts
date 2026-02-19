import { NextRequest } from "next/server";
import { listPosts, createPost } from "@/lib/controllers/postController";

export async function GET(req: NextRequest) {
  return listPosts(req);
}

export async function POST(req: NextRequest) {
  return createPost(req);
}
