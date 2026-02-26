"use client";

import { useState } from "react";

export interface GalleryImage {
    id: number | string;
    image_url: string;
    title?: string;
    description?: string;
    category?: string;
    created_at?: string;
}

interface Props {
    image: GalleryImage;
    index: number;
    onClick: () => void;
}

export default function GalleryCard({ image, index, onClick }: Props) {
    const [loaded, setLoaded] = useState(false);

    return (
        <button
            onClick={onClick}
            className="group relative mb-4 w-full break-inside-avoid overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900 transition-all duration-300 hover:border-amber-500/30 hover:shadow-[0_0_30px_rgba(245,158,11,0.08)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            style={{ animationDelay: `${index * 60}ms` }}
        >
            {/* Skeleton */}
            {!loaded && (
                <div className="aspect-[3/4] w-full animate-pulse bg-zinc-800" />
            )}

            {/* Image */}
            <img
                src={image.image_url}
                alt={image.title || "Gallery image"}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${loaded ? "opacity-100" : "h-0 opacity-0"
                    }`}
            />

            {/* Bottom gradient overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            {/* Info bar */}
            <div className="absolute inset-x-0 bottom-0 translate-y-2 px-3.5 pb-3.5 pt-6 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                {image.title && (
                    <p className="truncate text-sm font-semibold text-white drop-shadow-md">
                        {image.title}
                    </p>
                )}
                {image.category && (
                    <span className="mt-1 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                        {image.category}
                    </span>
                )}
            </div>

            {/* Top-right action dot */}
            <div className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
                <svg
                    className="h-4 w-4 text-white"
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
            </div>
        </button>
    );
}
