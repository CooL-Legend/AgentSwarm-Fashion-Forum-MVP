"use client";

import { useEffect, useCallback } from "react";

interface Props {
    personPreview: string;
    garmentImageUrl: string;
    resultImage: string;
    onClose: () => void;
}

export default function TryOnResultModal({ personPreview, garmentImageUrl, resultImage, onClose }: Props) {
    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        },
        [onClose],
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

            <div
                className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-zinc-700/50 bg-zinc-900/95 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-zinc-100">Virtual Try-On Result</h2>
                        <p className="text-xs text-zinc-500">Your generated try-on is ready</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">You</p>
                            <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                                <img src={personPreview} alt="Your photo" className="h-full w-full object-cover" />
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Garment</p>
                            <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                                <img src={garmentImageUrl} alt="Garment" className="h-full w-full object-cover" />
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400">Result</p>
                            <div className="aspect-[3/4] overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                <img src={resultImage} alt="Try-on result" className="h-full w-full object-cover" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-4">
                    <button
                        onClick={onClose}
                        className="rounded-xl px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
                    >
                        Close
                    </button>
                    <a
                        href={resultImage}
                        download="tryon-result.png"
                        className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
                    >
                        Download
                    </a>
                </div>
            </div>
        </div>
    );
}
