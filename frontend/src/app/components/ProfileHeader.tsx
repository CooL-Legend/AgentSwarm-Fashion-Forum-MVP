"use client";

import type { UserProfile } from "@/lib/user-types";

function getInitials(first: string | null, last: string | null): string {
    return `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase() || "?";
}

export default function ProfileHeader({ user }: { user: UserProfile }) {
    return (
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-8">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-amber-400/5 blur-3xl" />

            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                {/* Left: Avatar + text */}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    {/* Avatar */}
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-zinc-700 bg-zinc-800 text-xl font-bold text-zinc-400">
                        {getInitials(user.first_name, user.last_name)}
                    </div>

                    {/* Text block */}
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
                            {user.first_name} {user.last_name}
                        </h1>
                        <p className="mt-1 text-sm font-medium text-amber-300">
                            @{user.username}
                        </p>
                        {user.bio && (
                            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
                                {user.bio}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right: Action buttons */}
                <div className="flex shrink-0 items-center gap-2">
                    {/* Share button */}
                    <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/80 text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200"
                        title="Share profile"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                    </button>

                    {/* Edit Profile */}
                    <button
                        type="button"
                        className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                    >
                        Edit Profile
                    </button>
                </div>
            </div>
        </section>
    );
}
