"use client";

import { useEffect, useState } from "react";
import { backendApiUrl } from "@/lib/backend-api";
import type { UserProfile } from "@/lib/user-types";
import ProfileHeader from "./ProfileHeader";
import HeroVisuals from "./HeroVisuals";
import InformationGrid from "./InformationGrid";
import VisualGallery from "./VisualGallery";

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        fetch(backendApiUrl("/api/users"), { signal: controller.signal })
            .then((res) => {
                if (!res.ok) {
                    if (res.status === 404) throw new Error("User not found.");
                    throw new Error("Failed to load profile.");
                }
                return res.json();
            })
            .then((data) => {
                setUser(data.user);
                setLoading(false);
            })
            .catch((err) => {
                if (err.name !== "AbortError") {
                    setError(err.message);
                    setLoading(false);
                }
            });

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

            {user && (
                <div className="space-y-8">
                    <ProfileHeader user={user} />
                    <HeroVisuals
                        frontImage={user.front_image}
                        backImage={user.back_image}
                    />
                    <InformationGrid user={user} />
                    <VisualGallery images={user.images} />
                </div>
            )}
        </main>
    );
}
