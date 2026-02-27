"use client";

import { useEffect, useCallback, useState } from "react";
import type { GalleryImage } from "./GalleryCard";
import { supabase } from "@/lib/supabase";

interface Props {
    image: GalleryImage;
    onClose: () => void;
    userId: number | null;
}

export default function GalleryLightbox({ image, onClose, userId }: Props) {
    const [viewTracked, setViewTracked] = useState(false);
    const [viewStartTime, setViewStartTime] = useState<number | null>(null);

    // Track view when lightbox opens
    useEffect(() => {
        if (userId && !viewTracked) {
            setViewStartTime(Date.now());
        }
    }, [userId, viewTracked]);

    // Track view duration when lightbox closes
    const handleClose = useCallback(() => {
        if (userId && viewStartTime) {
            const viewDuration = (Date.now() - viewStartTime) / 1000; // seconds
            
            // Only track if viewed for at least 1 second
            if (viewDuration >= 1) {
                // Calculate weight based on view duration
                // Image Views: 0.2 to 0.5 (longer views = higher weight)
                let weight = 0.2;
                if (viewDuration >= 2.0) weight = 0.35;
                if (viewDuration >= 5.0) weight = 0.45;
                if (viewDuration >= 10.0) weight = 0.5; // Higher interest for longer views
                
                supabase.from("interactions").insert({
                    user_id: userId,
                    item_id: image.id,
                    interaction_type: "VIEW",
                    weight: weight,
                    created_at: new Date().toISOString(),
                }).then(({ error }) => {
                    if (error) console.error("Failed to track view:", error);
                });
            }
        }
        onClose();
    }, [userId, viewStartTime, image.id, onClose]);

    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        },
        [handleClose]
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.body.style.overflow = "";
        };
    }, [handleKey]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleClose}
        >
            {/* Blurred backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xl animate-in fade-in duration-200" />

            {/* Content */}
            <div
                className="relative z-10 flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/90 shadow-2xl animate-in zoom-in-95 fade-in duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                >
                    <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>

                {/* Image */}
                <div className="flex-1 overflow-hidden">
                    <img
                        src={image.image_url}
                        alt={image.title || "Gallery image"}
                        className="h-full max-h-[70vh] w-full object-contain"
                    />
                </div>

                {/* Details bar */}
                <div className="border-t border-zinc-800 bg-zinc-900/80 px-6 py-4 backdrop-blur-md">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            {image.title && (
                                <h2 className="text-lg font-bold text-zinc-100">
                                    {image.title}
                                </h2>
                            )}
                            {image.description && (
                                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                                    {image.description}
                                </p>
                            )}
                        </div>
                        {image.category && (
                            <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber-400">
                                {image.category}
                            </span>
                        )}
                    </div>
                    {image.created_at && (
                        <p className="mt-2 text-[11px] text-zinc-600">
                            {new Date(image.created_at).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
