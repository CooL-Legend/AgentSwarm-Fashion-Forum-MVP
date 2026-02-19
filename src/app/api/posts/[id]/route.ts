import { NextRequest } from "next/server";
import { getPost } from "@/lib/controllers/postController";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return getPost(Number(id));
}
