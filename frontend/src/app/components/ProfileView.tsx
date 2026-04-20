"use client";

import { useEffect, useState } from "react";
import { backendFetch } from "@/lib/backend-api";
import type { UserProfile } from "@/lib/user-types";
import ProfileHeader from "./ProfileHeader";
import HeroVisuals from "./HeroVisuals";
import InformationGrid from "./InformationGrid";
import VisualGallery from "./VisualGallery";

type ProfileImage = {
    id: string;
    signed_url: string;
    view_type?: string | null;
    description?: string | null;
};

function ProfileSkeleton() {
    return (
        <div className="space-y-8">
            {/* Header skeleton */}
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/50 p-6">
                <div className="flex items-center gap-4">
                    <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-zinc-800/60" />
                    <div className="space-y-2">
                        <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-800/60" />
                        <div className="h-4 w-24 animate-pulse rounded-lg bg-zinc-800/60" />
                        <div className="h-4 w-72 animate-pulse rounded-lg bg-zinc-800/60" />
                    </div>
                </div>
            </div>

            {/* Hero visuals skeleton */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="aspect-[3/4] animate-pulse rounded-2xl bg-zinc-800/60" />
                <div
                    className="aspect-[3/4] animate-pulse rounded-2xl bg-zinc-800/60"
                    style={{ animationDelay: "150ms" }}
                />
            </div>

            {/* Info grid skeleton */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="h-64 animate-pulse rounded-2xl bg-zinc-800/60 lg:col-span-2" />
                <div
                    className="h-64 animate-pulse rounded-2xl bg-zinc-800/60"
                    style={{ animationDelay: "100ms" }}
                />
            </div>

            {/* Gallery skeleton */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="aspect-square animate-pulse rounded-2xl bg-zinc-800/60"
                        style={{ animationDelay: `${i * 75}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

export default function ProfileView() {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [images, setImages] = useState<ProfileImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        const loadProfile = async () => {
            try {
                const response = await backendFetch("/api/users", {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error("Failed to load profile.");
                }

                const data = await response.json();
                setUser(data?.user ?? null);

                // Fetch the user's uploaded reference photos for the hero + gallery.
                // Failure here shouldn't block the profile from rendering.
                try {
                    const imagesResp = await backendFetch("/api/images", {
                        signal: controller.signal,
                    });
                    if (imagesResp.ok) {
                        const imagesData = await imagesResp.json();
                        const list: ProfileImage[] = Array.isArray(imagesData?.images)
                            ? imagesData.images
                            : Array.isArray(imagesData?.assets)
                              ? imagesData.assets
                              : [];
                        setImages(list);
                    }
                } catch (imgErr) {
                    if (!controller.signal.aborted) {
                        console.warn("[profile] images_fetch_failed", imgErr);
                    }
                }

                setLoading(false);
            } catch (err: unknown) {
                if (controller.signal.aborted) return;
                const message = err instanceof Error ? err.message : "Failed to load profile.";
                setError(message);
                setLoading(false);
            }
        };

        loadProfile();

        return () => controller.abort();
    }, []);

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            {loading && <ProfileSkeleton />}

            {error && (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800/60">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-zinc-500"
                        >
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <p className="text-lg font-medium text-zinc-300">{error}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        The profile could not be loaded.
                    </p>
                </div>
            )}

            {user && (() => {
                const frontImg =
                    images.find((i) => i.view_type === "front") ?? images[0] ?? null;
                const backImg =
                    images.find((i) => i.view_type === "back" && i.id !== frontImg?.id) ??
                    images.find((i) => i.id !== frontImg?.id) ??
                    null;
                const heroIds = new Set(
                    [frontImg?.id, backImg?.id].filter((v): v is string => Boolean(v)),
                );
                const galleryUrls = images
                    .filter((i) => !heroIds.has(i.id))
                    .map((i) => i.signed_url);

                return (
                    <div className="space-y-8">
                        <ProfileHeader user={user} />
                        <HeroVisuals
                            frontImage={frontImg?.signed_url ?? null}
                            backImage={backImg?.signed_url ?? null}
                        />
                        <InformationGrid user={user} />
                        <VisualGallery images={galleryUrls.length ? galleryUrls : null} />
                    </div>
                );
            })()}
        </main>
    );
}
