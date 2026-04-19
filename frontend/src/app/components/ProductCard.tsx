"use client";

import type { ProductCardItem } from "@/lib/gallery-types";

interface ProductCardProps {
    item: ProductCardItem;
    isSelected: boolean;
    altIndex: number;
    onClick: () => void;
}

const priceFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
});

export default function ProductCard({
    item,
    isSelected,
    altIndex,
    onClick,
}: ProductCardProps) {
    const title = item.title || "Untitled product";
    const brand = item.brand?.trim() || null;
    const price = item.price != null ? priceFormatter.format(item.price) : null;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-zinc-900/80 text-left transition-all duration-300 ${
                isSelected
                    ? "border-amber-400/60 ring-2 ring-amber-400/30"
                    : "border-zinc-800/70 hover:border-zinc-700"
            }`}
        >
            <div className="relative aspect-[4/5] overflow-hidden bg-zinc-950">
                <img
                    src={item.image_url}
                    alt={item.title || `Product image ${altIndex}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />

                {isSelected && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black shadow-md">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1 border-t border-zinc-800/70 px-3 py-2.5">
                {brand && (
                    <span className="truncate text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                        {brand}
                    </span>
                )}
                <span className="truncate text-sm font-medium text-zinc-100">
                    {title}
                </span>
                {price && (
                    <span className="text-base font-semibold text-amber-300">
                        {price}
                    </span>
                )}
            </div>
        </button>
    );
}
