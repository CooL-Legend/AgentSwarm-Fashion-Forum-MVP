"use client";

function ImageCard({
    src,
    label,
    alt,
}: {
    src: string;
    label: string;
    alt: string;
}) {
    return (
        <div className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/80">
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                </div>
            )}

            {/* Glassmorphism label overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                <span className="inline-block rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white backdrop-blur-md">
                    {label}
                </span>
            </div>
        </div>
    );
}

export default function HeroVisuals({
    frontImage,
    backImage,
}: {
    frontImage: string | null;
    backImage: string | null;
}) {
    return (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ImageCard src={frontImage ?? ""} label="Front View" alt="Front view" />
            <ImageCard src={backImage ?? ""} label="Detail Focus" alt="Detail focus" />
        </section>
    );
}
