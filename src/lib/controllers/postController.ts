import { NextRequest, NextResponse } from "next/server";
import * as postService from "../services/postService";
import { getRecommendedPosts } from "../recommend";

export async function listPosts(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort");
    const userId = searchParams.get("userId");

    let posts;
    if (sort === "recommend" && userId) {
      posts = getRecommendedPosts(Number(userId));
    } else {
      posts = postService.getAllPosts();
    }

    return NextResponse.json(posts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function createPost(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, title, content, category } = body;

    if (!userId || !title || !content) {
      return NextResponse.json(
        { error: "userId, title, and content are required" },
        { status: 400 },
      );
    }

    const post = postService.createPost(
      userId,
      title,
      content,
      category || "General",
    );
    return NextResponse.json(post, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function getPost(id: number) {
  try {
    const post = postService.getPostById(id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json(post);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
