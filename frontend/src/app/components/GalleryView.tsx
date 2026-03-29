"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type GalleryImage } from "./GalleryCard";
import GalleryLightbox from "./GalleryLightbox";
import GarmentInput, { type GarmentSelection } from "./GarmentInput";
import TryOnModal from "./TryOnModal";

const SKELETON_CARD_HEIGHTS = [220, 280, 260, 320, 240, 300];

export default function GalleryView() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
    const [garmentSelection, setGarmentSelection] = useState<GarmentSelection | null>(null);
    const [tryOnImage, setTryOnImage] = useState<string | null>(null);

    // ── Fetch product images from Supabase `products` table ─────
    useEffect(() => {
        async function fetchImages() {
            setLoading(true);
            setError(null);
            try {
                const { data, error: sbError } = await supabase
                    .from("products")
                    .select("id, image_url, title, created_at")
                    .not("image_url", "is", null)
                    .order("created_at", { ascending: false });

                if (sbError) throw sbError;

                const mapped: GalleryImage[] =
                    (data ?? []).map((product: any) => ({
                        id: product.id,
                        image_url: product.image_url,
                        title: product.title,
                        created_at: product.created_at,
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
                            Search locally, upload an image, or paste a link to find your garment.
                        </p>
                    </div>

                    {/* Garment Input: Local Search / Upload / Link */}
                    <div className="my-6">
                        <GarmentInput
                            search={search}
                            onSearchChange={setSearch}
                            onGarmentSelect={setGarmentSelection}
                        />
                    </div>

                    {/* Selected garment banner with Try On button */}
                    {garmentSelection && garmentSelection.imageUrl && (
                        <div className="mx-auto mb-2 flex max-w-2xl items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
                            <img
                                src={garmentSelection.imageUrl}
                                alt="Selected garment"
                                className="h-12 w-12 rounded-lg object-cover"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-amber-300/90 truncate">
                                    {garmentSelection.localProduct?.title || `Garment via ${garmentSelection.mode}`}
                                </p>
                                <p className="text-[10px] text-zinc-500">Click &quot;Try On&quot; to see it on you</p>
                            </div>
                            <button
                                onClick={() => setTryOnImage(garmentSelection.imageUrl!)}
                                className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber-400"
                            >
                                Try On
                            </button>
                            <button
                                onClick={() => setGarmentSelection(null)}
                                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    )}
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
                        Make sure your <code className="text-zinc-400">.env</code>{" "}
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
                    {filtered.map((img, i) => {
                        const isSelected = garmentSelection?.mode === "local" && garmentSelection.localProduct?.id === img.id;
                        return (
                            <button
                                type="button"
                                key={img.id}
                                onClick={() => {
                                    setGarmentSelection({
                                        mode: "local",
                                        imageUrl: img.image_url,
                                        localProduct: { id: img.id, title: img.title, image_url: img.image_url },
                                    });
                                }}
                                onDoubleClick={() => setLightbox(img)}
                                className={`group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl border transition-all duration-300 ${
                                    isSelected
                                        ? "border-amber-400/60 ring-2 ring-amber-400/30"
                                        : "border-zinc-800/70 hover:border-zinc-700"
                                } bg-zinc-900/80`}
                            >
                                <img
                                    src={img.image_url}
                                    alt={img.title || `Product image ${i + 1}`}
                                    loading="lazy"
                                    className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                                />
                                {/* Hover overlay */}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                    <span className="truncate text-xs font-medium text-white">{img.title}</span>
                                    <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                        {isSelected ? "Selected" : "Select"}
                                    </span>
                                </div>
                                {/* Try On shortcut */}
                                <div
                                    className="pointer-events-auto absolute left-2 top-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                                    onClick={(e) => { e.stopPropagation(); setTryOnImage(img.image_url); }}
                                >
                                    <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-black shadow-lg cursor-pointer hover:bg-amber-400 transition-colors">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                                        </svg>
                                        Try On
                                    </span>
                                </div>
                                {/* Selected check */}
                                {isSelected && (
                                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black">
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                )}
                            </button>
                        );
                    })}
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

            {/* ── Try-On Modal ──────────────────────────────────── */}
            {tryOnImage && (
                <TryOnModal
                    garmentImageUrl={tryOnImage}
                    onClose={() => setTryOnImage(null)}
                />
            )}
        </div>
    );
}
