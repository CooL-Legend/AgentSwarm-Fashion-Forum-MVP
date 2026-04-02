import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { ProductCardItem, ProductsPageResponse } from "@/lib/gallery-types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function parsePositiveInt(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function clampLimit(value: number | null): number {
    if (value == null) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, value));
}

export async function GET(req: NextRequest) {
    const startedAt = Date.now();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get("q")?.trim() || "";
    const cursor = parsePositiveInt(searchParams.get("cursor"));
    const limit = clampLimit(parsePositiveInt(searchParams.get("limit")));

    try {
        let query = supabaseServer
            .from("products")
            .select("id,image_url,title,created_at")
            .not("image_url", "is", null)
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
            id: Number(row.id),
            image_url: row.image_url,
            title: row.title,
            created_at: row.created_at,
        }));

        const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;

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
