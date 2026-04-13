"use client";

import type { TryOnStatus } from "../hooks/useTryOnTask";

interface Props {
    status: TryOnStatus;
    error: string | null;
    onView: () => void;
    onDismiss: () => void;
}

export default function TryOnNotification({ status, error, onView, onDismiss }: Props) {
    const borderClass =
        status === "done"
            ? "border-emerald-500/40"
            : status === "error"
              ? "border-red-500/30"
              : "border-amber-500/30";

    const animationClass =
        status === "done" ? "animate-[ping-once_0.6s_ease-out]" : "";

    return (
        <div
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur-md animate-[slideUp_0.3s_ease-out] ${borderClass} ${animationClass}`}
            style={{ minWidth: 260, maxWidth: 340 }}
        >
            {status === "processing" && (
                <>
                    <div className="relative h-5 w-5 shrink-0">
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400" />
                    </div>
                    <p className="text-sm text-zinc-300">Generating try-on...</p>
                </>
            )}

            {status === "done" && (
                <>
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                        <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <p className="flex-1 text-sm font-medium text-zinc-200">Try-on ready!</p>
                    <button
                        onClick={onView}
                        className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400"
                    >
                        View
                    </button>
                    <button
                        onClick={onDismiss}
                        className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </>
            )}

            {status === "error" && (
                <>
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                        <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <p className="flex-1 truncate text-sm text-red-400">
                        {error || "Try-on failed"}
                    </p>
                    <button
                        onClick={onDismiss}
                        className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                    >
                        Dismiss
                    </button>
                </>
            )}
        </div>
    );
}
