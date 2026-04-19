import Link from "next/link";

const painPoints = [
    {
        title: "Shopping and fit confidence are split",
        description: "Users can browse products quickly, but still leave the app to judge how items might look on them.",
    },
    {
        title: "Try-on is often a separate tool",
        description: "Trying garments usually happens outside the shopping flow, which adds friction before checkout decisions.",
    },
    {
        title: "Visual comparison takes too long",
        description: "Without pose variation, users still second-guess results and hesitate to move forward.",
    },
];

const pillars = [
    {
        title: "Marketplace discovery",
        description: "Browse product cards in one place and pick garments directly from the live marketplace feed.",
    },
    {
        title: "Virtual try-on",
        description: "Generate a try-on preview from your photo and selected garment before deciding.",
    },
    {
        title: "Pose transfer",
        description: "Transform your try-on output into a new pose to better evaluate look and confidence.",
    },
];

const steps = [
    {
        title: "Discover in Marketplace",
        description: "Open Marketplace and find a garment from the product feed.",
    },
    {
        title: "Run Try-On",
        description: "Upload your photo and generate a virtual preview with the selected item.",
    },
    {
        title: "Apply Pose Transfer",
        description: "Use a pose reference image to see the same result in a different stance.",
    },
    {
        title: "Decide with confidence",
        description: "Compare outputs and move forward only when the look feels right.",
    },
];

export default function HomePage() {
    return (
        <main className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:pb-24 sm:pt-14">
            <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-10">
                <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-amber-400/12 blur-3xl" />
                <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />

                <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/85">FashionHub</p>
                        <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-100 sm:text-5xl">Wear it before you own it.</h1>
                        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                            FashionHub connects Marketplace browsing, virtual try-on, and pose transfer in one minimalist flow for faster fashion decisions.
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Link
                                href="/gallery"
                                className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                            >
                                Try Marketplace
                            </Link>
                            <Link
                                href="#how-it-works"
                                className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                            >
                                See how it works
                            </Link>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                        <article className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Discover</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">Marketplace</p>
                            <div className="mt-3 space-y-2">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="h-10 rounded-lg bg-gradient-to-r from-zinc-800 to-zinc-700/70" />
                                ))}
                            </div>
                        </article>

                        <article className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">Try-On</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">Virtual Preview</p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div className="h-16 rounded-lg bg-zinc-800/90" />
                                <div className="h-16 rounded-lg bg-zinc-800/90" />
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-amber-400/60 to-orange-400/60" />
                        </article>

                        <article className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Transfer</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">Pose Transfer</p>
                            <div className="mt-3 rounded-lg bg-zinc-800/80 p-2">
                                <div className="h-14 rounded-md bg-zinc-700/70" />
                                <p className="mt-2 text-[11px] text-zinc-300">View your look in a second pose</p>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    Fashion discovery is easy. Fit confidence is hard.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                    Most apps help users browse products, but the confidence step happens elsewhere. FashionHub closes that gap inside one workflow.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {painPoints.map((item) => (
                        <article key={item.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5">
                            <h3 className="text-sm font-semibold text-zinc-100">{item.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    Three core product pillars
                </h2>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {pillars.map((pillar) => (
                        <article
                            key={pillar.title}
                            className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5 transition-colors hover:border-zinc-700"
                        >
                            <h3 className="text-base font-semibold text-zinc-100">{pillar.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{pillar.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section id="how-it-works" className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">How it works</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {steps.map((step, index) => (
                        <article key={step.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">
                                {String(index + 1).padStart(2, "0")}
                            </p>
                            <h3 className="mt-2 text-base font-semibold text-zinc-100">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mt-16 rounded-3xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 p-6 sm:p-10">
                <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                    Browse less blindly. Decide with visual proof.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                    Start in Marketplace, run try-on, validate with pose transfer, and move forward with confidence.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                        href="/gallery"
                        className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                    >
                        Try Marketplace
                    </Link>
                </div>
            </section>

        </main>
    );
}
