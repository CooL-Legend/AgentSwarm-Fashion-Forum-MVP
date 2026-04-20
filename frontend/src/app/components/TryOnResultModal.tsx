"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { backendApiUrl } from "@/lib/backend-api";

interface Props {
    personPreview: string;
    garmentImageUrl: string;
    resultImage: string;
    userId?: string | null;
    onClose: () => void;
}

export default function TryOnResultModal({ personPreview, garmentImageUrl, resultImage, onClose }: Props) {
    const [poseImageBase64, setPoseImageBase64] = useState<string | null>(null);
    const [posePreview, setPosePreview] = useState<string | null>(null);
    const [poseTransferring, setPoseTransferring] = useState(false);
    const [poseResultImage, setPoseResultImage] = useState<string | null>(null);
    const [showPoseResult, setShowPoseResult] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const poseFileInputRef = useRef<HTMLInputElement>(null);

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

    const processPoseFile = useCallback((file: File) => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setPosePreview(dataUrl);
            setPoseImageBase64(dataUrl);
            setPoseResultImage(null);
            setShowPoseResult(false);
            setError(null);
        };
        reader.readAsDataURL(file);
    }, []);

    const handlePoseTransfer = async () => {
        if (!resultImage || !poseImageBase64) return;
        setPoseTransferring(true);
        setPoseResultImage(null);
        setError(null);
        try {
            const resp = await fetch(backendApiUrl("/api/pose-transfer"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    result_image: resultImage,
                    pose_image: poseImageBase64,
                }),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => null);
                throw new Error(data?.error || `Pose transfer failed (${resp.status})`);
            }
            const data = await resp.json();
            if (data.image) {
                setPoseResultImage(data.image);
                setShowPoseResult(true);
            } else {
                throw new Error("No pose transfer image returned");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Pose transfer failed");
        } finally {
            setPoseTransferring(false);
        }
    };

    const displayedImage = showPoseResult && poseResultImage ? poseResultImage : resultImage;

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
                                <img src={displayedImage} alt="Try-on result" className="h-full w-full object-cover" />
                            </div>
                            {poseResultImage && (
                                <div className="mt-2 flex rounded-lg bg-zinc-800/60 p-0.5">
                                    <button
                                        onClick={() => setShowPoseResult(false)}
                                        className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${!showPoseResult ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                                    >
                                        Try-On
                                    </button>
                                    <button
                                        onClick={() => setShowPoseResult(true)}
                                        className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${showPoseResult ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                                    >
                                        Pose Transfer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pose Transfer Section */}
                    <div className="mt-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-violet-400/80">Pose Transfer</p>
                        <div className="flex items-center gap-3">
                            {posePreview ? (
                                <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">
                                    <img src={posePreview} alt="Pose reference" className="h-full w-full object-cover" />
                                    <button
                                        onClick={() => { setPosePreview(null); setPoseImageBase64(null); }}
                                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500/80"
                                    >
                                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => poseFileInputRef.current?.click()}
                                    disabled={poseTransferring}
                                    className="flex h-16 w-12 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-zinc-700/60 bg-zinc-950 transition-colors hover:border-violet-500/40 disabled:opacity-50"
                                >
                                    <svg className="h-5 w-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                </button>
                            )}
                            <input
                                ref={poseFileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) processPoseFile(file);
                                }}
                                className="hidden"
                            />
                            <div className="flex-1">
                                <p className="text-xs text-zinc-400">
                                    {posePreview ? "Pose image selected" : "Upload a pose reference image"}
                                </p>
                                <p className="text-[10px] text-zinc-600">The result will adopt this pose</p>
                            </div>
                            <button
                                onClick={handlePoseTransfer}
                                disabled={!poseImageBase64 || poseTransferring}
                                className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {poseTransferring ? "Transferring..." : "Transfer Pose"}
                            </button>
                        </div>
                        {poseTransferring && (
                            <div className="mt-3 flex items-center gap-2">
                                <div className="relative h-4 w-4">
                                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-violet-400/20 border-t-violet-400" />
                                </div>
                                <p className="text-xs text-zinc-500">Generating pose transfer... this may take 15-30 seconds</p>
                            </div>
                        )}
                        {error && (
                            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                                <p className="text-xs text-red-400">{error}</p>
                            </div>
                        )}
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
                        href={displayedImage}
                        download={showPoseResult && poseResultImage ? "pose-transfer-result.png" : "tryon-result.png"}
                        className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
                    >
                        Download
                    </a>
                </div>
            </div>
        </div>
    );
}
