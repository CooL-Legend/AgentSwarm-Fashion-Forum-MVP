import { NextRequest, NextResponse } from "next/server";

const SCRAPER_URL = process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000";

export const maxDuration = 60; // Allow up to 60s for serverless functions

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { url, max_images = 20 } = body;

        if (!url || typeof url !== "string") {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout

        try {
            const resp = await fetch(`${SCRAPER_URL}/api/scrape`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, max_images }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!resp.ok) {
                const text = await resp.text();
                return NextResponse.json(
                    { error: `Scraper error: ${text}` },
                    { status: resp.status }
                );
            }

            const data = await resp.json();
            return NextResponse.json(data);
        } catch (err) {
            clearTimeout(timeout);
            throw err;
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Scraper service unavailable";
        const isTimeout = err instanceof Error && err.name === "AbortError";
        return NextResponse.json(
            { error: isTimeout ? "Scraper timed out — the site may be slow to respond" : message },
            { status: 502 }
        );
    }
}
