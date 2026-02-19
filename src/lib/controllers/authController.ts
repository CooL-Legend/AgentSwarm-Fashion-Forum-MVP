import { NextRequest, NextResponse } from "next/server";
import * as userService from "../services/userService";

export async function register(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, bio, persona_style } = body;

    if (!username) {
      return NextResponse.json(
        { error: "username is required" },
        { status: 400 },
      );
    }

    const existing = userService.getUserByUsername(username);
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const user = userService.createUser(
      username,
      bio || "",
      persona_style || "",
    );
    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function listUsers() {
  try {
    const users = userService.getAllUsers();
    return NextResponse.json(users);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
