"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ProductCardItem, ProductsPageResponse } from "@/lib/gallery-types";
import { backendApiUrl } from "@/lib/backend-api";
import GalleryLightbox from "./GalleryLightbox";
import GarmentInput, { type GarmentSelection } from "./GarmentInput";
import TryOnModal from "./TryOnModal";
import TryOnNotification from "./TryOnNotification";
import TryOnResultModal from "./TryOnResultModal";
import ProductCard from "./ProductCard";
import { useTryOnTask } from "../hooks/useTryOnTask";

const PAGE_LIMIT = 100;
const VIRTUAL_ROW_HEIGHT = 320;
const VIRTUAL_OVERSCAN_ROWS = 5;

function resolveColumns(width: number): number {
    if (width >= 1280) return 5;
    if (width >= 1024) return 4;
    if (width >= 640) return 3;
    return 2;
}

function columnsClass(columns: number): string {
    switch (columns) {
        case 5:
            return "grid-cols-5";
        case 4:
            return "grid-cols-4";
        case 3:
            return "grid-cols-3";
        default:
            return "grid-cols-2";
    }
}

export default function GalleryView() {
    const [images, setImages] = useState<ProductCardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [userGender, setUserGender] = useState<string | null>(null);
    const [genderResolved, setGenderResolved] = useState(false);
    const [lightbox, setLightbox] = useState<{ item: ProductCardItem; initialIndex: number } | null>(null);
    const [garmentSelection, setGarmentSelection] = useState<GarmentSelection | null>(null);
    const [tryOnImage, setTryOnImage] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [total] = useState<number | null>(null);

    const [showTryOnResult, setShowTryOnResult] = useState(false);
    const { task, startTryOn, dismiss } = useTryOnTask();

    const [viewportHeight, setViewportHeight] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [scrollY, setScrollY] = useState(0);
    const [gridTop, setGridTop] = useState(0);

    const gridRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const inFlightRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    const columns = useMemo(() => resolveColumns(viewportWidth), [viewportWidth]);

    useEffect(() => {
        fetch(backendApiUrl("/api/users"))
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const raw = data?.user?.sex ?? data?.sex;
                const sex = typeof raw === "string" ? raw.trim().toLowerCase() : null;
                const genderMap: Record<string, string> = { male: "men", female: "women" };
                setUserGender(sex ? (genderMap[sex] ?? sex) : null);
            })
            .catch(() => setUserGender(null))
            .finally(() => setGenderResolved(true));
    }, []);

    const fetchProducts = useCallback(
        async ({ cursor, reset }: { cursor: string | null; reset: boolean }) => {
            if (inFlightRef.current) {
                if (reset) {
                    abortRef.current?.abort();
                } else {
                    return;
                }
            }

            inFlightRef.current = true;
            setError(null);
            if (reset) {
                setLoading(true);
                setLoadingMore(false);
            } else {
                setLoadingMore(true);
            }

            const controller = new AbortController();
            abortRef.current = controller;
            const requestId = ++requestIdRef.current;

            const params = new URLSearchParams({
                limit: String(PAGE_LIMIT),
            });
            if (cursor) {
                params.set("cursor", cursor);
            }
            if (debouncedSearch) {
                params.set("q", debouncedSearch);
            }
            if (userGender) {
                params.set("gender", userGender);
            }

            try {
                const response = await fetch(`${backendApiUrl("/api/products")}?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.error || `Products API returned ${response.status}`);
                }

                const payload = (await response.json()) as ProductsPageResponse;
                if (requestId !== requestIdRef.current) {
                    return;
                }

                setHasMore(payload.hasMore);
                setNextCursor(payload.nextCursor);
                setImages((prev) => {
                    const merged = new Map<string, ProductCardItem>();
                    const base = reset ? [] : prev;
                    for (const item of base) {
                        merged.set(item.id, item);
                    }
                    for (const item of payload.items) {
                        merged.set(item.id, item);
                    }
                    return Array.from(merged.values());
                });
            } catch (err: unknown) {
                if (controller.signal.aborted) {
                    return;
                }
                const message = err instanceof Error ? err.message : "Failed to load products";
                if (reset) {
                    setImages([]);
                    setHasMore(false);
                    setNextCursor(null);
                }
                setError(message);
            } finally {
                if (requestId === requestIdRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
                inFlightRef.current = false;
                if (abortRef.current === controller) {
                    abortRef.current = null;
                }
            }
        },
        [debouncedSearch, userGender],
    );

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 350);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        setImages([]);
        setHasMore(true);
        setNextCursor(null);
        if (genderResolved) {
            fetchProducts({ cursor: null, reset: true });
        }
    }, [debouncedSearch, fetchProducts, genderResolved]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        let ticking = false;

        const updateViewport = () => {
            setViewportHeight(window.innerHeight);
            setViewportWidth(window.innerWidth);
            setScrollY(window.scrollY);
            if (gridRef.current) {
                const rect = gridRef.current.getBoundingClientRect();
                setGridTop(rect.top + window.scrollY);
            }
        };

        const onChange = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                updateViewport();
                ticking = false;
            });
        };

        updateViewport();
        window.addEventListener("scroll", onChange, { passive: true });
        window.addEventListener("resize", onChange);

        return () => {
            window.removeEventListener("scroll", onChange);
            window.removeEventListener("resize", onChange);
        };
    }, []);

    useEffect(() => {
        if (!gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        setGridTop(rect.top + window.scrollY);
    }, [images.length]);

    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;
                if (loading || loadingMore) return;
                if (!hasMore || !nextCursor) return;
                fetchProducts({ cursor: nextCursor, reset: false });
            },
            {
                root: null,
                rootMargin: "1000px 0px 700px 0px",
                threshold: 0,
            },
        );

        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [fetchProducts, hasMore, loading, loadingMore, nextCursor]);

    const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
        if (images.length === 0 || viewportHeight <= 0) {
            return {
                startIndex: 0,
                endIndex: images.length,
                topSpacerHeight: 0,
                bottomSpacerHeight: 0,
            };
        }

        const totalRows = Math.ceil(images.length / columns);
        const relativeScroll = Math.max(scrollY - gridTop, 0);
        const startRow = Math.max(
            Math.floor(relativeScroll / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS,
            0,
        );
        const endRow = Math.min(
            totalRows,
            Math.ceil((relativeScroll + viewportHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN_ROWS,
        );
        const visibleStart = startRow * columns;
        const visibleEnd = Math.min(images.length, endRow * columns);

        return {
            startIndex: visibleStart,
            endIndex: visibleEnd,
            topSpacerHeight: startRow * VIRTUAL_ROW_HEIGHT,
            bottomSpacerHeight: Math.max(0, (totalRows - endRow) * VIRTUAL_ROW_HEIGHT),
        };
    }, [columns, gridTop, images.length, scrollY, viewportHeight]);

    const visibleImages = useMemo(
        () => images.slice(startIndex, endIndex),
        [endIndex, images, startIndex],
    );

    return (
        <div className="mx-auto max-w-7xl px-4 py-8">
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
                            Search Supabase products, upload an image, or paste a link to find your garment.
                        </p>
                    </div>

                    <div className="my-6">
                        <GarmentInput
                            search={search}
                            onSearchChange={setSearch}
                            onGarmentSelect={setGarmentSelection}
                        />
                    </div>

                    {garmentSelection && garmentSelection.imageUrl && (
                        <div className="mx-auto mb-2 flex max-w-2xl items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
                            <img
                                src={garmentSelection.imageUrl}
                                alt="Selected garment"
                                className="h-12 w-12 rounded-lg object-cover"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-amber-300/90">
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
                                className="shrink-0 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {loading && (
                <div className={`grid ${columnsClass(columns)} gap-4`}>
                    {Array.from({ length: 12 }).map((_, index) => (
                        <div
                            key={index}
                            className="h-[360px] animate-pulse rounded-2xl bg-zinc-800/60"
                            style={{ animationDelay: `${index * 60}ms` }}
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
                    <p className="text-sm font-medium text-red-400">Could not load gallery</p>
                    <p className="mt-1 max-w-sm text-xs text-zinc-500">{error}</p>
                </div>
            )}

            {!loading && !error && images.length === 0 && (
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
                        {debouncedSearch ? "No products match your search" : "No products yet"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                        {debouncedSearch
                            ? "Try a broader search keyword"
                            : "Add images to the Supabase products table to populate this view"}
                    </p>
                </div>
            )}

            {!loading && !error && images.length > 0 && (
                <>
                    <div ref={gridRef}>
                        {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
                        <div className={`grid ${columnsClass(columns)} gap-4`}>
                            {visibleImages.map((img, index) => {
                                const isSelected =
                                    garmentSelection?.mode === "local" &&
                                    garmentSelection.localProduct?.id === img.id;
                                return (
                                    <ProductCard
                                        key={img.id}
                                        item={img}
                                        isSelected={isSelected}
                                        altIndex={startIndex + index + 1}
                                        onClick={() =>
                                            setLightbox({ item: img, initialIndex: 0 })
                                        }
                                    />
                                );
                            })}
                        </div>
                        {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
                    </div>

                    <div ref={sentinelRef} className="h-1" />

                    <div className="mt-5 text-center text-xs text-zinc-600">
                        Loaded {images.length} product{images.length !== 1 && "s"}
                        {total != null ? ` of ${total}` : ""}
                        {hasMore ? " (scroll for more)" : " (all loaded)"}
                    </div>

                    {loadingMore && (
                        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                            </svg>
                            Loading more products...
                        </div>
                    )}
                </>
            )}

            {lightbox && (
                <GalleryLightbox
                    image={lightbox.item}
                    initialIndex={lightbox.initialIndex}
                    onClose={() => setLightbox(null)}
                    onSelect={(imageUrl) => {
                        setGarmentSelection({
                            mode: "local",
                            imageUrl,
                            localProduct: {
                                id: lightbox.item.id,
                                title: lightbox.item.title || undefined,
                                image_url: imageUrl,
                            },
                        });
                        setLightbox(null);
                    }}
                    onTryOn={(imageUrl) => {
                        setTryOnImage(imageUrl);
                        setLightbox(null);
                    }}
                />
            )}

            {tryOnImage && (
                <TryOnModal
                    garmentImageUrl={tryOnImage}
                    onClose={() => setTryOnImage(null)}
                    onTryOnSubmit={(personBase64) => {
                        startTryOn({ personBase64, garmentImageUrl: tryOnImage });
                        setTryOnImage(null);
                    }}
                />
            )}

            {task && (
                <TryOnNotification
                    status={task.status}
                    error={task.error}
                    onView={() => setShowTryOnResult(true)}
                    onDismiss={dismiss}
                />
            )}

            {showTryOnResult && task?.status === "done" && task.resultImage && (
                <TryOnResultModal
                    personPreview={task.personPreview}
                    garmentImageUrl={task.garmentUrl}
                    resultImage={task.resultImage}
                    onClose={() => {
                        setShowTryOnResult(false);
                        dismiss();
                    }}
                />
            )}
        </div>
    );
}
