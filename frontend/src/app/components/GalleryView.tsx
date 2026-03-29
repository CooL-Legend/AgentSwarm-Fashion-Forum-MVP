"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type GalleryImage } from "./GalleryCard";
import GalleryLightbox from "./GalleryLightbox";

const SKELETON_CARD_HEIGHTS = [220, 280, 260, 320, 240, 300];

export default function GalleryView() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

    // ── Fetch product images from Supabase `products` table ─────
    // Load 500 men + 500 women, shuffled together
    useEffect(() => {
        async function fetchImages() {
            setLoading(true);
            setError(null);
            try {
                const [menRes, womenRes] = await Promise.all([
                    supabase
                        .from("products")
                        .select("id, image_url, title, brand, price, category, gender, created_at")
                        .eq("gender", "Men")
                        .not("image_url", "is", null)
                        .order("created_at", { ascending: false })
                        .limit(500),
                    supabase
                        .from("products")
                        .select("id, image_url, title, brand, price, category, gender, created_at")
                        .eq("gender", "Women")
                        .not("image_url", "is", null)
                        .order("created_at", { ascending: false })
                        .limit(500),
                ]);

                if (menRes.error) throw menRes.error;
                if (womenRes.error) throw womenRes.error;

                const all = [...(menRes.data ?? []), ...(womenRes.data ?? [])];
                // Shuffle so men and women are interleaved
                for (let i = all.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [all[i], all[j]] = [all[j], all[i]];
                }

                const mapped: GalleryImage[] = all.map((product: any) => ({
                    id: product.id,
                    image_url: product.image_url,
                    title: product.title,
                    brand: product.brand,
                    price: product.price,
                    category: product.category,
                    created_at: product.created_at,
                }));

                setImages(mapped);
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : "Failed to load images";
                setError(message);
            } finally {
                setLoading(false);
            }
        }
        fetchImages();
    }, []);

    const filtered = search.trim()
        ? images.filter((img) =>
            img.title?.toLowerCase().includes(search.toLowerCase())
        )
        : images;

    // ── UI ──────────────────────────────────────────────────────
    return (
        <div className="mx-auto max-w-7xl px-4 py-8">
            {/* ── Hero ───────────────────────────────────────────── */}
            <div className="relative mb-8 overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
                <div className="pointer-events-none absolute -left-28 top-0 h-64 w-64 rounded-full bg-amber-400/12 blur-3xl" />
                <div className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />

                <div className="relative p-5 sm:p-7">
                    <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                            Product Gallery
                        </p>
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
                            Inspiration&nbsp;
                            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                                Board
                            </span>
                        </h1>
                        <p className="mt-2 max-w-xl text-sm text-zinc-400">
                            Image-only view powered directly by the Supabase products table.
                        </p>
                    </div>

                    {/* Center search bar */}
                    <div className="mx-auto my-6 w-full max-w-2xl">
                        <div className="relative">
                            <svg
                                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                                />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search images by title..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-950/90 py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── States ─────────────────────────────────────────── */}
            {loading && (
                <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div
                            key={i}
                            className="mb-4 break-inside-avoid animate-pulse rounded-2xl bg-zinc-800/60"
                            style={{
                                height: `${SKELETON_CARD_HEIGHTS[i % SKELETON_CARD_HEIGHTS.length]}px`,
                                animationDelay: `${i * 100}ms`,
                            }}
                        />
                    ))}
                </div>
            )}

            {error && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                        <svg
                            className="h-8 w-8 text-red-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                            />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-red-400">
                        Could not load gallery
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-zinc-500">{error}</p>
                    <p className="mt-3 text-xs text-zinc-600">
                        Make sure your <code className="text-zinc-400">.env.local</code>{" "}
                        has valid Supabase credentials and the{" "}
                        <code className="text-zinc-400">products</code> table exists.
                    </p>
                </div>
            )}

            {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800">
                        <svg
                            className="h-8 w-8 text-zinc-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                            />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-zinc-400">
                        {search
                            ? "No images match your filters"
                            : "No images yet"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                        {search
                            ? "Try broadening your search"
                            : "Add images to your Supabase 'products' table to see them here"}
                    </p>
                </div>
            )}

            {/* ── Image Grid ─────────────────────────────────────── */}
            {!loading && !error && filtered.length > 0 && (
                <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
                    {filtered.map((img, i) => (
                        <button
                            type="button"
                            key={img.id}
                            onClick={() => setLightbox(img)}
                            className="group mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/80 transition-all duration-300 hover:border-zinc-700"
                        >
                            <img
                                src={img.image_url}
                                alt={img.title || `Product image ${i + 1}`}
                                loading="lazy"
                                className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* ── Results count ──────────────────────────────────── */}
            {!loading && !error && filtered.length > 0 && (
                <div className="mt-6 text-center text-xs text-zinc-600">
                    Showing {filtered.length} of {images.length} image
                    {images.length !== 1 && "s"}
                </div>
            )}

            {/* ── Lightbox ───────────────────────────────────────── */}
            {lightbox && (
                <GalleryLightbox
                    image={lightbox}
                    onClose={() => setLightbox(null)}
                    userId={null}
                />
            )}
        </div>
    );
}
