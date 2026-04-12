"use client";

import { useEffect, useCallback, useState } from "react";
import type { ProductCardItem } from "@/lib/gallery-types";
import { resolveImages } from "@/lib/gallery-types";

interface Props {
    image: ProductCardItem;
    initialIndex?: number;
    onClose: () => void;
    onSelect: (imageUrl: string) => void;
    onTryOn: (imageUrl: string) => void;
}

export default function GalleryLightbox({ image, initialIndex = 0, onClose, onSelect, onTryOn }: Props) {
    const images = resolveImages(image);
    const [currentIndex, setCurrentIndex] = useState(
        Math.min(initialIndex, images.length - 1),
    );
    const hasMultiple = images.length > 1;

    const handleClose = useCallback(() => onClose(), [onClose]);

    const goPrev = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    }, [images.length]);

    const goNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    }, [images.length]);

    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
            if (e.key === "ArrowLeft") goPrev();
            if (e.key === "ArrowRight") goNext();
        },
        [handleClose, goPrev, goNext],
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.body.style.overflow = "";
        };
    }, [handleKey]);

    // Preload adjacent images
    useEffect(() => {
        if (!hasMultiple) return;
        for (const offset of [1, -1]) {
            const img = new Image();
            img.src = images[(currentIndex + offset + images.length) % images.length];
        }
    }, [currentIndex, hasMultiple, images]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleClose}
        >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xl animate-in fade-in duration-200" />

            <div
                className="relative z-10 flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/90 shadow-2xl animate-in zoom-in-95 fade-in duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Main image */}
                <div className="relative flex-1 overflow-hidden">
                    <img
                        src={images[currentIndex]}
                        alt={image.title || "Gallery image"}
                        className="h-full max-h-[70vh] w-full object-contain"
                    />

                    {/* Left/Right arrows */}
                    {hasMultiple && (
                        <>
                            <button
                                onClick={goPrev}
                                className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            </button>
                            <button
                                onClick={goNext}
                                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>

                {/* Bottom bar: info + actions */}
                <div className="border-t border-zinc-800 bg-zinc-900/80 px-6 py-4 backdrop-blur-md">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            {image.title && (
                                <h2 className="truncate text-lg font-bold text-zinc-100">
                                    {image.title}
                                </h2>
                            )}
                            <div className="mt-1 flex items-center gap-2">
                                {image.created_at && (
                                    <p className="text-[11px] text-zinc-600">
                                        {new Date(image.created_at).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                        })}
                                    </p>
                                )}
                                {hasMultiple && (
                                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                        {currentIndex + 1} / {images.length}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                onClick={() => onSelect(images[currentIndex])}
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
                            >
                                Select
                            </button>
                            <button
                                onClick={() => onTryOn(images[currentIndex])}
                                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber-400"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                                </svg>
                                Try On
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
