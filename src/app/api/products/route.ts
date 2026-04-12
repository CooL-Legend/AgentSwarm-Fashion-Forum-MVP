import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { ProductCardItem, ProductsPageResponse } from "@/lib/gallery-types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function clampLimit(value: number | null): number {
    if (value == null) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, value));
}

export async function GET(req: NextRequest) {
    const startedAt = Date.now();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get("q")?.trim() || "";
    const cursor = searchParams.get("cursor")?.trim() || null;
    const limitParam = searchParams.get("limit");
    const limit = clampLimit(limitParam ? Number.parseInt(limitParam, 10) : null);

    try {
        let query = supabaseServer
            .from("products")
            .select("id,image_url,all_image_urls,title,created_at")
            .not("image_url", "is", null)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit + 1);

        if (cursor) {
            query = query.lt("id", cursor);
        }

        if (q) {
            query = query.ilike("title", `%${q}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error("[api/products] query_failed", {
                message: error.message,
                code: error.code,
                limit,
                cursor,
                qLength: q.length,
                durationMs: Date.now() - startedAt,
            });
            return NextResponse.json({ error: "Failed to fetch products." }, { status: 500 });
        }

        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const items: ProductCardItem[] = pageRows.map((row) => ({
            id: row.id,
            image_url: row.image_url,
            all_image_urls: row.all_image_urls ?? null,
            title: row.title,
            created_at: row.created_at,
        }));

        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        const response: ProductsPageResponse = {
            items,
            nextCursor,
            hasMore,
            total: null,
        };

        console.info("[api/products] ok", {
            rows: items.length,
            hasMore,
            limit,
            cursor,
            qLength: q.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(response, { status: 200 });
    } catch (error) {
        console.error("[api/products] unhandled_error", {
            error: error instanceof Error ? error.message : String(error),
            limit,
            cursor,
            qLength: q.length,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: "Products API unavailable." }, { status: 500 });
    }
}
