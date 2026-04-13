import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { UserProfile } from "@/lib/user-types";

export async function GET(req: NextRequest) {
    const startedAt = Date.now();

    try {
        const { data, error } = await supabaseServer
            .from("users")
            .select(
                "user_id, first_name, last_name, username, bio, email_id, phone_number, location, sex, height, front_image, back_image, images, created_at, updated_at, onboarding_completed",
            )
            .eq("first_name", "Aditya")
            .eq("last_name", "Bhandari")
            .single();

        if (error || !data) {
            console.info("[api/users] not_found", {
                durationMs: Date.now() - startedAt,
            });
            return NextResponse.json({ error: "User not found." }, { status: 404 });
        }

        const user: UserProfile = {
            user_id: data.user_id,
            first_name: data.first_name,
            last_name: data.last_name,
            username: data.username,
            bio: data.bio,
            email_id: data.email_id,
            phone_number: data.phone_number,
            location: data.location,
            sex: data.sex,
            height: data.height,
            front_image: data.front_image,
            back_image: data.back_image,
            images: data.images ?? [],
            created_at: data.created_at,
            updated_at: data.updated_at,
            onboarding_completed: data.onboarding_completed,
        };

        console.info("[api/users] ok", {
            userId: user.user_id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ user }, { status: 200 });
    } catch (err) {
        console.error("[api/users] unhandled_error", {
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: "Users API unavailable." }, { status: 500 });
    }
}
