"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import GalleryCard, { type GalleryImage } from "./GalleryCard";
import GalleryLightbox from "./GalleryLightbox";

export default function GalleryView() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
    const [activeUserId, setActiveUserId] = useState<number | null>(null);
    const [users, setUsers] = useState<{id: number; username: string}[]>([]);

    // Fetch users for the selector
    useEffect(() => {
        fetch("/api/auth/users")
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setUsers(data.slice(0, 20)); // Limit to 20 users
                }
            })
            .catch(console.error);
    }, []);

    // ── Fetch product images from Supabase `items` table ────────
    useEffect(() => {
        async function fetchImages() {
            setLoading(true);
            setError(null);
            try {
                const { data, error: sbError } = await supabase
                    .from("items")
                    .select("*")
                    .eq("item_type", "PRODUCT")
                    .not("media_url", "is", null)
                    .order("created_at", { ascending: false });

                if (sbError) throw sbError;

                const mapped: GalleryImage[] =
                    (data ?? []).map((item: any) => ({
                        id: item.id,
                        image_url: item.media_url,
                        title: item.title,
                        description: item.body_text,
                        category:
                            Array.isArray(item.tags) && item.tags.length > 0
                                ? item.tags[0]
                                : undefined,
                        created_at: item.created_at,
                    })) ?? [];

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

    // ── Derived data ────────────────────────────────────────────
    const categories = useMemo(() => {
        const set = new Set<string>();
        images.forEach((img) => {
            if (img.category) set.add(img.category);
        });
        return Array.from(set).sort();
    }, [images]);

    const filtered = useMemo(() => {
        let list = images;
        if (activeCategory) {
            list = list.filter((img) => img.category === activeCategory);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (img) =>
                    img.title?.toLowerCase().includes(q) ||
                    img.description?.toLowerCase().includes(q) ||
                    img.category?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [images, activeCategory, search]);

    // ── UI ──────────────────────────────────────────────────────
    return (
        <div className="mx-auto max-w-7xl px-4 py-6">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                        Inspiration&nbsp;
                        <span className="text-amber-400">Board</span>
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">
                        Curated looks, moods, and references from the community
                    </p>
                </div>
                {/* User selector for likes */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">As:</span>
                    <select
                        value={activeUserId ?? ""}
                        onChange={(e) => setActiveUserId(e.target.value ? Number(e.target.value) : null)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none"
                    >
                        <option value="">Select user</option>
                        {users.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.username}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Search + Filters ───────────────────────────────── */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Search */}
                <div className="relative flex-1">
                    <svg
                        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
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
                        placeholder="Search looks, styles, moods…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                    />
                </div>

                {/* Category pills */}
                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setActiveCategory(null)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${activeCategory === null
                                ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
                                : "border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                                }`}
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() =>
                                    setActiveCategory(activeCategory === cat ? null : cat)
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${activeCategory === cat
                                    ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
                                    : "border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── States ─────────────────────────────────────────── */}
            {loading && (
                <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div
                            key={i}
                            className="mb-4 break-inside-avoid animate-pulse rounded-2xl bg-zinc-800/60"
                            style={{
                                height: `${200 + Math.floor(Math.random() * 200)}px`,
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
                        <code className="text-zinc-400">items</code> table exists.
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
                        {search || activeCategory
                            ? "No images match your filters"
                            : "No images yet"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                        {search || activeCategory
                            ? "Try broadening your search"
                            : "Add images to your Supabase 'items' table to see them here"}
                    </p>
                </div>
            )}

            {/* ── Masonry Grid ───────────────────────────────────── */}
            {!loading && !error && filtered.length > 0 && (
                <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
                    {filtered.map((img, i) => (
                        <GalleryCard
                            key={img.id}
                            image={img}
                            index={i}
                            onClick={() => setLightbox(img)}
                            userId={activeUserId}
                        />
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
                    userId={activeUserId}
                />
            )}
        </div>
    );
}
