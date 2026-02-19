import { NextRequest, NextResponse } from "next/server";
import * as interactionService from "../services/interactionService";

export async function recordInteraction(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, postId, type } = body;

    if (!userId || !postId || !type) {
      return NextResponse.json(
        { error: "userId, postId, and type are required" },
        { status: 400 },
      );
    }

    if (!["view", "like", "click"].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: view, like, click" },
        { status: 400 },
      );
    }

    const interaction = interactionService.recordInteraction(
      userId,
      postId,
      type,
    );
    return NextResponse.json(interaction, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
