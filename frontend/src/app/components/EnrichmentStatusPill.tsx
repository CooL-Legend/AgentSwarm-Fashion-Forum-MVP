"use client";

import type { EnrichmentStatus } from "../hooks/useImageEnrichment";

interface Props {
    status: EnrichmentStatus;
    tryonRunning: boolean;
    error?: string | null;
    onDismiss?: () => void;
}

export default function EnrichmentStatusPill({ status, tryonRunning, error, onDismiss }: Props) {
    if (status === "idle") return null;

    const isReady = status === "ready";
    const isError = status === "error";

    const borderClass = isError
        ? "border-red-500/30"
        : isReady
          ? "border-emerald-500/40"
          : "border-amber-500/30";

    let message = "";
    if (status === "uploading") {
        message = "Uploading your photo...";
    } else if (status === "understanding") {
        message = tryonRunning
            ? "Still understanding \u2014 try-on running in parallel"
            : "Understanding your image...";
    } else if (status === "ready") {
        message = tryonRunning
            ? "Understanding done \u2014 try-on still generating"
            : "Image understood \u2014 ready to try on";
    } else if (status === "error") {
        message = error || "Enrichment failed";
    }

    return (
        <div
            className={`flex items-center gap-3 rounded-xl border bg-zinc-900/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md ${borderClass}`}
            role="status"
            aria-live="polite"
        >
            {(status === "uploading" || status === "understanding") && (
                <div className="relative h-4 w-4 shrink-0">
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400" />
                </div>
            )}

            {isReady && (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg className="h-2.5 w-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            )}

            {isError && (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                    <svg className="h-2.5 w-2.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
            )}

            <p className={`flex-1 ${isError ? "text-red-400" : "text-zinc-300"}`}>{message}</p>

            {isError && onDismiss && (
                <button
                    onClick={onDismiss}
                    className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
                >
                    Dismiss
                </button>
            )}
        </div>
    );
}
