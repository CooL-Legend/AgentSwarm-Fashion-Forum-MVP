"use client";

import { useEffect, useState } from "react";
import { backendApiUrl } from "@/lib/backend-api";

interface TryonRow {
    id: string;
    user_id: string;
    product_id: string | null;
    gcs_url: string | null;
    person_img_url: string | null;
    signed_url: string | null;
    person_img_signed_url: string | null;
    description: string | null;
    created_at: string;
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

export default function HistoryPage() {
    const [tryons, setTryons] = useState<TryonRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(backendApiUrl("/api/tryons"));
                if (!resp.ok) throw new Error(`Failed to load (${resp.status})`);
                const data = await resp.json();
                if (!cancelled) setTryons(data.tryons ?? []);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load history");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <main className="mx-auto max-w-6xl px-6 py-10">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-zinc-100">Your try-ons</h1>
                <p className="mt-1 text-sm text-zinc-500">
                    Hover a card to see the photo you uploaded.
                </p>
            </header>

            {error && (
                <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            {tryons === null && !error && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className="aspect-[3/4] animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60"
                        />
                    ))}
                </div>
            )}

            {tryons !== null && tryons.length === 0 && !error && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-6 py-16 text-center">
                    <p className="text-sm text-zinc-400">No try-ons yet.</p>
                    <p className="mt-1 text-xs text-zinc-600">
                        Head to the Marketplace to generate your first one.
                    </p>
                </div>
            )}

            {tryons !== null && tryons.length > 0 && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {tryons.map((t) => (
                        <TryonCard key={t.id} row={t} />
                    ))}
                </div>
            )}
        </main>
    );
}

function TryonCard({ row }: { row: TryonRow }) {
    const [hovered, setHovered] = useState(false);
    const resultSrc = row.signed_url || row.gcs_url || "";
    const inputSrc = row.person_img_signed_url || row.person_img_url || "";
    const src = hovered && inputSrc ? inputSrc : resultSrc;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
        >
            <div className="aspect-[3/4] w-full">
                {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt="Try-on"
                        className="h-full w-full object-cover transition-opacity duration-200"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                        No image
                    </div>
                )}
            </div>

            {inputSrc && (
                <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-zinc-200 backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100">
                    You
                </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8">
                <p className="text-[11px] text-zinc-300">{formatDate(row.created_at)}</p>
            </div>
        </div>
    );
}
