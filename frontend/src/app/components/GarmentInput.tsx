"use client";

import { useState, useRef, useCallback } from "react";

export interface GarmentSelection {
    mode: "local" | "upload" | "link";
    imageUrl?: string;
    file?: File;
    localProduct?: { id: number | string; title?: string; image_url: string };
}

interface ScrapedImage {
    src: string;
    alt: string;
    tag: string;
}

interface Props {
    search: string;
    onSearchChange: (val: string) => void;
    onGarmentSelect: (selection: GarmentSelection) => void;
}

const TABS = [
    { key: "local" as const, label: "Local Search", icon: "search" },
    { key: "upload" as const, label: "Upload Image", icon: "upload" },
    { key: "link" as const, label: "Paste Link", icon: "link" },
];

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif)(\?|$)/i;

export default function GarmentInput({ search, onSearchChange, onGarmentSelect }: Props) {
    const [activeTab, setActiveTab] = useState<"local" | "upload" | "link">("local");
    const [dragOver, setDragOver] = useState(false);
    const [uploadPreview, setUploadPreview] = useState<string | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkPreview, setLinkPreview] = useState<string | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);
    const [scraping, setScraping] = useState(false);
    const [scrapedImages, setScrapedImages] = useState<ScrapedImage[]>([]);
    const [scrapedSite, setScrapedSite] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith("image/")) {
                processFile(file);
            }
        },
        []
    );

    const processFile = (file: File) => {
        setUploadFile(file);
        const url = URL.createObjectURL(file);
        setUploadPreview(url);
        onGarmentSelect({ mode: "upload", file, imageUrl: url });
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const clearUpload = () => {
        if (uploadPreview) URL.revokeObjectURL(uploadPreview);
        setUploadFile(null);
        setUploadPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const isDirectImageUrl = (url: string): boolean => {
        try {
            const parsed = new URL(url);
            return IMAGE_EXT_RE.test(parsed.pathname);
        } catch {
            return false;
        }
    };

    const handleLinkSubmit = async () => {
        if (!linkUrl.trim()) return;
        setLinkError(null);
        setScrapedImages([]);

        try {
            new URL(linkUrl);
        } catch {
            setLinkError("Please enter a valid URL");
            return;
        }

        // Direct image URL — use it directly
        if (isDirectImageUrl(linkUrl)) {
            setLinkPreview(linkUrl);
            onGarmentSelect({ mode: "link", imageUrl: linkUrl });
            return;
        }

        // Product page URL — scrape it
        setScraping(true);
        try {
            const resp = await fetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: linkUrl, max_images: 20 }),
            });

            if (!resp.ok) {
                const data = await resp.json().catch(() => null);
                throw new Error(data?.error || `Scraper returned ${resp.status}`);
            }

            const data = await resp.json();
            if (data.images && data.images.length > 0) {
                setScrapedImages(data.images);
                setScrapedSite(data.site || "");
            } else {
                setLinkError("No product images found on this page");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to scrape images";
            setLinkError(msg);
        } finally {
            setScraping(false);
        }
    };

    const selectScrapedImage = (img: ScrapedImage) => {
        setLinkPreview(img.src);
        setScrapedImages([]);
        onGarmentSelect({ mode: "link", imageUrl: img.src });
    };

    const clearLink = () => {
        setLinkUrl("");
        setLinkPreview(null);
        setLinkError(null);
        setScrapedImages([]);
        setScrapedSite("");
    };

    return (
        <div className="mx-auto w-full max-w-2xl">
            {/* Tabs */}
            <div className="mb-3 flex gap-1 rounded-xl bg-zinc-900/80 p-1 border border-zinc-800/60">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                            activeTab === tab.key
                                ? "bg-amber-500/15 text-amber-300 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        <TabIcon type={tab.icon} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[56px]">
                {/* Local Search */}
                {activeTab === "local" && (
                    <div className="relative">
                        <svg
                            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
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
                        <input
                            type="text"
                            placeholder="Search garments from local database..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-950/90 py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
                        />
                    </div>
                )}

                {/* Upload Image */}
                {activeTab === "upload" && (
                    <div>
                        {uploadPreview ? (
                            <div className="relative flex items-center gap-4 rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-3">
                                <img
                                    src={uploadPreview}
                                    alt="Uploaded garment"
                                    className="h-16 w-16 rounded-xl object-cover"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-200 truncate">
                                        {uploadFile?.name}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        {uploadFile && formatFileSize(uploadFile.size)}
                                    </p>
                                </div>
                                <button
                                    onClick={clearUpload}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleFileDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`cursor-pointer rounded-2xl border-2 border-dashed py-6 text-center transition-all ${
                                    dragOver
                                        ? "border-amber-400/60 bg-amber-500/5"
                                        : "border-zinc-700/60 bg-zinc-950/90 hover:border-zinc-600"
                                }`}
                            >
                                <svg className="mx-auto mb-2 h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                <p className="text-sm text-zinc-400">
                                    Drop your garment image here or{" "}
                                    <span className="text-amber-400">browse</span>
                                </p>
                                <p className="mt-1 text-xs text-zinc-600">PNG, JPG, WEBP up to 10MB</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Paste Link */}
                {activeTab === "link" && (
                    <div>
                        {linkPreview ? (
                            /* Selected image preview */
                            <div className="relative flex items-center gap-4 rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-3">
                                <img
                                    src={linkPreview}
                                    alt="Linked garment"
                                    className="h-16 w-16 rounded-xl object-cover"
                                    onError={() => setLinkError("Failed to load image")}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-zinc-400 truncate">{linkUrl}</p>
                                    <p className="text-xs text-emerald-400 mt-1">Image selected</p>
                                </div>
                                <button
                                    onClick={clearLink}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            /* URL input */
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <svg
                                        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                                    </svg>
                                    <input
                                        type="url"
                                        placeholder="Paste product page URL or direct image link..."
                                        value={linkUrl}
                                        onChange={(e) => { setLinkUrl(e.target.value); setLinkError(null); }}
                                        onKeyDown={(e) => e.key === "Enter" && !scraping && handleLinkSubmit()}
                                        disabled={scraping}
                                        className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-950/90 py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20 disabled:opacity-50"
                                    />
                                </div>
                                <button
                                    onClick={handleLinkSubmit}
                                    disabled={!linkUrl.trim() || scraping}
                                    className="rounded-2xl bg-amber-500/15 px-5 py-3 text-sm font-medium text-amber-300 transition-all hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {scraping ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Scraping
                                        </span>
                                    ) : "Fetch"}
                                </button>
                            </div>
                        )}

                        {/* Scraping status */}
                        {scraping && (
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-4 py-3">
                                <svg className="h-4 w-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <p className="text-xs text-zinc-400">Scraping product images from the page...</p>
                            </div>
                        )}

                        {/* Scraped images picker */}
                        {scrapedImages.length > 0 && (
                            <div className="mt-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs text-zinc-400">
                                        Found {scrapedImages.length} images
                                        {scrapedSite && scrapedSite !== "generic" && (
                                            <span className="ml-1 text-amber-400/70">
                                                from {scrapedSite}
                                            </span>
                                        )}
                                        {" "}&mdash; click to select
                                    </p>
                                    <button
                                        onClick={() => setScrapedImages([])}
                                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                                <div className="grid grid-cols-4 gap-2 max-h-[240px] overflow-y-auto rounded-xl border border-zinc-800/60 bg-zinc-950/80 p-2">
                                    {scrapedImages.map((img, i) => (
                                        <button
                                            key={i}
                                            onClick={() => selectScrapedImage(img)}
                                            className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-900 transition-all hover:border-amber-500/40 hover:ring-1 hover:ring-amber-500/20"
                                        >
                                            <img
                                                src={img.src}
                                                alt={img.alt || `Product ${i + 1}`}
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).parentElement!.style.display = "none";
                                                }}
                                            />
                                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                                            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                                                Select
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {linkError && (
                            <p className="mt-2 text-xs text-red-400">{linkError}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function TabIcon({ type }: { type: string }) {
    if (type === "search")
        return (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
        );
    if (type === "upload")
        return (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
        );
    return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
        </svg>
    );
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
