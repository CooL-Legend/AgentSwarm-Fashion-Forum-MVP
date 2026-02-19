import { NextRequest, NextResponse } from "next/server";
import * as commentService from "../services/commentService";

export async function createComment(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, userId, content } = body;

    if (!postId || !userId || !content) {
      return NextResponse.json(
        { error: "postId, userId, and content are required" },
        { status: 400 },
      );
    }

    const comment = commentService.createComment(postId, userId, content);
    return NextResponse.json(comment, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function getComments(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json(
        { error: "postId query param is required" },
        { status: 400 },
      );
    }

    const comments = commentService.getCommentsByPostId(Number(postId));
    return NextResponse.json(comments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
