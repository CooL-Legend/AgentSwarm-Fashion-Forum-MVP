"use client";

import type { ProductCardItem } from "@/lib/gallery-types";

interface ProductCardProps {
    item: ProductCardItem;
    isSelected: boolean;
    altIndex: number;
    onClick: () => void;
}

export default function ProductCard({
    item,
    isSelected,
    altIndex,
    onClick,
}: ProductCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`group relative h-[300px] overflow-hidden rounded-2xl border transition-all duration-300 ${
                isSelected
                    ? "border-amber-400/60 ring-2 ring-amber-400/30"
                    : "border-zinc-800/70 hover:border-zinc-700"
            } bg-zinc-900/80`}
        >
            <img
                src={item.image_url}
                alt={item.title || `Product image ${altIndex}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
            />

            {/* Bottom overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="truncate text-xs font-medium text-white">
                    {item.title || "Untitled product"}
                </span>
                <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    {isSelected ? "Selected" : "View"}
                </span>
            </div>

            {/* Selected checkmark */}
            {isSelected && (
                <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            )}
        </button>
    );
}
