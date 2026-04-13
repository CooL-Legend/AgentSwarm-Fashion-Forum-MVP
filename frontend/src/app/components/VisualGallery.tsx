"use client";

const MAX_VISIBLE = 8;

export default function VisualGallery({ images }: { images: string[] | null }) {
    if (!images || images.length === 0) return null;

    const hasOverflow = images.length > MAX_VISIBLE;
    const visibleImages = hasOverflow ? images.slice(0, MAX_VISIBLE) : images;
    const overflowCount = images.length - MAX_VISIBLE + 1;

    return (
        <section>
            {/* Section header */}
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                    Visual Gallery
                </h2>
                <button
                    type="button"
                    className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
                >
                    View All
                </button>
            </div>

            {/* Image grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibleImages.map((src, i) => {
                    const isLastAndOverflow = hasOverflow && i === visibleImages.length - 1;

                    return (
                        <div
                            key={i}
                            className="group relative aspect-square overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/80"
                        >
                            <img
                                src={src}
                                alt={`Gallery image ${i + 1}`}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            />

                            {/* Hover overlay */}
                            {!isLastAndOverflow && (
                                <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
                            )}

                            {/* +X More overlay */}
                            {isLastAndOverflow && (
                                <div className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 backdrop-blur-sm">
                                    <span className="text-lg font-bold text-white">
                                        +{overflowCount} More
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
