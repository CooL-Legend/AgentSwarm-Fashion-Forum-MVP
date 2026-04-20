"use client";

import type { UserProfile } from "@/lib/user-types";

function DetailField({ label, value, icon }: { label: string; value: string | null; icon: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 text-zinc-500">{icon}</div>
            <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {label}
                </p>
                <p className="mt-0.5 text-sm font-medium text-zinc-200">
                    {value || "—"}
                </p>
            </div>
        </div>
    );
}

function StatBlock({ label, value }: { label: string; value: number }) {
    return (
        <div className="text-center">
            <p className="text-2xl font-bold text-zinc-100">{value}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {label}
            </p>
        </div>
    );
}

const MailIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
);

const MapPinIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);

const PhoneIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const RulerIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
        <path d="m14.5 12.5 2-2" />
        <path d="m11.5 9.5 2-2" />
        <path d="m8.5 6.5 2-2" />
        <path d="m17.5 15.5 2-2" />
    </svg>
);

export default function InformationGrid({ user }: { user: UserProfile }) {
    return (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Identity Card */}
            <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/60 p-6 lg:col-span-2">
                <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                    Contact &amp; Details
                </h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
                    <DetailField label="Email" value={user.email} icon={<MailIcon />} />
                    <DetailField label="Location" value={user.location} icon={<MapPinIcon />} />
                    <DetailField label="Phone" value={user.phone_number} icon={<PhoneIcon />} />
                    <DetailField label="Gender" value={user.gender_identity} icon={<UserIcon />} />
                    <DetailField label="Height" value={user.height_cm ? `${user.height_cm} cm` : null} icon={<RulerIcon />} />
                </div>
            </div>

            {/* Stats Card */}
            <div className="flex flex-col rounded-2xl border border-zinc-800/50 bg-zinc-900/60 p-6">
                <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                    Archive
                </h2>
                <div className="flex flex-1 items-center justify-around">
                    <StatBlock label="Curations" value={0} />
                    <StatBlock label="Followers" value={0} />
                    <StatBlock label="Exhibitions" value={0} />
                </div>
                <div className="mt-5 border-t border-zinc-800/50 pt-5">
                    <button
                        type="button"
                        className="w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                    >
                        View Portfolio
                    </button>
                </div>
            </div>
        </section>
    );
}
