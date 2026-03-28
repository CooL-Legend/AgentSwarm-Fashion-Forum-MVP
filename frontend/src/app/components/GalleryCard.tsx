"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export interface GalleryImage {
    id: number | string;
    image_url: string;
    title?: string;
    description?: string;
    brand?: string;
    price?: number | string;
    product_url?: string;
    category?: string;
    created_at?: string;
    likeCount?: number;
}

interface Props {
    image: GalleryImage;
    index: number;
    onClick: () => void;
    userId: string | null;
}

export default function GalleryCard({ image, index, onClick, userId }: Props) {
    const [loaded, setLoaded] = useState(false);
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(image.likeCount || 0);
    const [isLoading, setIsLoading] = useState(false);

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!userId || isLoading) return;

        setIsLoading(true);
        try {
            if (liked) {
                // Unlike - delete the interaction
                await supabase
                    .from("interactions")
                    .delete()
                    .match({ 
                        user_id: userId, 
                        item_id: String(image.id),
                        type: "LIKE"
                    });
                setLiked(false);
                setLikeCount(likeCount - 1);
            } else {
                const { error } = await supabase
                    .from("interactions")
                    .insert({
                        user_id: userId,
                        item_id: String(image.id),
                        item_type: "PRODUCT",
                        type: "LIKE",
                    });

                if (!error) {
                    setLiked(true);
                    setLikeCount(likeCount + 1);
                }
            }
        } catch (error) {
            console.error("Failed to like:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            onClick={onClick}
            className="group relative mb-4 w-full break-inside-avoid overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900 transition-all duration-300 hover:border-amber-500/30 hover:shadow-[0_0_30px_rgba(245,158,11,0.08)] cursor-pointer"
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
                {(image.brand || image.price) && (
                    <p className="mt-1 truncate text-xs text-zinc-300/90">
                        {[image.brand, image.price ? `₹${image.price}` : null]
                            .filter(Boolean)
                            .join(" • ")}
                    </p>
                )}
                {image.category && (
                    <span className="mt-1 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                        {image.category}
                    </span>
                )}
            </div>

            {/* Top-right action dot with like button */}
            <div className="absolute right-2.5 top-2.5 flex gap-2">
                <button
                    onClick={handleLike}
                    disabled={!userId || isLoading}
                    className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 ${userId ? "bg-black/40 hover:bg-amber-500/40" : "bg-black/40 opacity-0"} ${liked ? "text-amber-400" : "text-white"}`}
                    title={userId ? (liked ? "Unlike" : "Like") : "Select a user to like"}
                >
                    <svg
                        className="h-4 w-4"
                        fill={liked ? "currentColor" : "none"}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                    </svg>
                </button>
                <div className="flex h-8 items-center justify-center rounded-full bg-black/40 px-2 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
                    <span className="text-xs font-medium text-white">{likeCount}</span>
                </div>
            </div>
        </div>
    );
}
