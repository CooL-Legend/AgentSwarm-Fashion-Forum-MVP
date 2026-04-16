import Link from "next/link";

const painPoints = [
    {
        title: "Inspiration is passive",
        description: "Most fashion feeds help people scroll, but not confidently act on what they see.",
    },
    {
        title: "Try-on is fragmented",
        description: "Users jump across tools to upload images, test a garment, and compare outcomes.",
    },
    {
        title: "Shopping feels impersonal",
        description: "Generic product grids rarely adapt to the user before they make a decision.",
    },
];

const pillars = [
    {
        title: "Personalized For You feed",
        description: "Discover products from a feed tuned by search, profile context, and your style actions.",
    },
    {
        title: "Flexible garment input",
        description: "Start from local products, upload your own image, or paste a product page link.",
    },
    {
        title: "Try-on powered marketplace",
        description: "Preview garments on yourself, run pose transfer, and decide faster before purchase.",
    },
];

const steps = [
    {
        title: "Discover",
        description: "Browse the For You gallery of looks and product cards.",
    },
    {
        title: "Select",
        description: "Choose a garment by search, upload, or direct link scraping.",
    },
    {
        title: "Try on",
        description: "Generate a virtual try-on and optionally transfer to a new pose.",
    },
    {
        title: "Decide smarter",
        description: "Compare results and move to confident buying decisions.",
    },
];

const features = [
    {
        title: "AI-powered virtual try-on",
        description: "Generate wearable previews from your photo and selected garment.",
    },
    {
        title: "Pose transfer preview",
        description: "Re-render your try-on output in a new pose before finalizing choices.",
    },
    {
        title: "Personalized feed filters",
        description: "Gallery fetches adapt using profile-aware product filtering and search.",
    },
    {
        title: "Product-page image scraping",
        description: "Paste a shopping link and fetch candidate garment images in-app.",
    },
    {
        title: "Background result tracking",
        description: "Try-ons run asynchronously with notifications when the render is ready.",
    },
    {
        title: "Profile + visual context",
        description: "Profile surfaces keep identity, images, and fit context connected to discovery.",
    },
];

const brandCards = [
    {
        title: "Show garments in context",
        description: "Products appear in a discovery feed and can be tested with real-user try-on flows.",
    },
    {
        title: "Improve conversion confidence",
        description: "Try-on plus pose transfer helps users commit with less uncertainty.",
    },
    {
        title: "Get discovered earlier",
        description: "Emerging labels can appear in personalized discovery before they become mainstream.",
    },
];

const roadmapItems = [
    "Community-led fashion discussion surface",
    "Freelance model and brand collaboration network",
    "Campaign selection assisted by try-on outcomes",
    "Self-serve tools for smaller fashion labels",
    "APIs for try-on, pose, and video workflows",
];

export default function HomePage() {
    return (
        <main className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:pb-24 sm:pt-14">
            <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-10">
                <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-amber-400/12 blur-3xl" />
                <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />

                <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/85">
                            FashionHub
                        </p>
                        <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-100 sm:text-5xl">
                            Wear it before you own it.
                        </h1>
                        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                            FashionHub combines personalized fashion discovery with virtual try-on, so users can
                            explore products, preview fit, and make better buying decisions in one flow.
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Link
                                href="/gallery"
                                className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                            >
                                Try FashionHub
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
                        <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                                Discover
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">For You Feed</p>
                            <div className="mt-3 space-y-2">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="h-12 rounded-lg bg-gradient-to-r from-zinc-800 to-zinc-700/70"
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
                                Try
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">Virtual Try-On</p>
                            <div className="mt-3 flex items-center gap-2">
                                <div className="h-16 flex-1 rounded-lg bg-zinc-800/90" />
                                <div className="text-xs text-zinc-500">+</div>
                                <div className="h-16 flex-1 rounded-lg bg-zinc-800/90" />
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-amber-400/60 to-orange-400/60" />
                        </div>

                        <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                                Decide
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">Marketplace Card</p>
                            <div className="mt-3 rounded-lg bg-zinc-800/80 p-2">
                                <div className="h-14 rounded-md bg-zinc-700/70" />
                                <p className="mt-2 text-xs text-zinc-300">Satin Blazer</p>
                                <p className="text-xs font-semibold text-amber-300">INR 4,999</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    Fashion apps show products. They don&apos;t show you.
                </h2>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {painPoints.map((item) => (
                        <article key={item.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5">
                            <h3 className="text-sm font-semibold text-zinc-100">{item.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.description}</p>
                        </article>
                    ))}
                </div>
                <p className="mt-5 text-sm font-medium text-amber-300/90">
                    FashionHub brings discovery and try-on into one clean workflow.
                </p>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    A place designed for fashion decisions
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
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    How FashionHub works
                </h2>
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

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    Built for the future of fashion discovery
                </h2>
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature) => (
                        <article key={feature.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5">
                            <h3 className="text-sm font-semibold text-zinc-100">{feature.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{feature.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mt-16 rounded-3xl border border-zinc-800 bg-zinc-900/45 p-6 sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">More than a storefront</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                    People don&apos;t open fashion apps only to buy. They open them to explore possibilities, check what
                    works for their body and style, and gain confidence before acting.
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                    FashionHub keeps that journey connected from discovery to visualization.
                </p>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    A new growth channel for fashion brands
                </h2>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {brandCards.map((item) => (
                        <article key={item.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5">
                            <h3 className="text-sm font-semibold text-zinc-100">{item.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mt-16 rounded-3xl border border-zinc-800 bg-zinc-900/45 p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">Where we&apos;re going</h2>
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                        Roadmap
                    </span>
                </div>
                <ul className="mt-4 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                    {roadmapItems.map((item) => (
                        <li key={item} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                            {item}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-16 rounded-3xl border border-zinc-800 bg-zinc-900/45 p-6 text-center sm:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">Early Stage</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    Built for early fashion explorers and emerging brands
                </h2>
                <p className="mt-3 text-sm text-zinc-400 sm:text-base">
                    Live MVP surfaces already include gallery discovery, virtual try-on, pose transfer, and profile context.
                </p>
            </section>

            <section className="mt-16 rounded-3xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 p-6 sm:p-10">
                <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                    Discover fashion that actually feels personal
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                    Explore styles, run try-ons, and make better decisions before you buy.
                </p>
                <div className="mt-6 flex flex-wrap justify-start gap-3">
                    <Link
                        href="/gallery"
                        className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                    >
                        Try FashionHub
                    </Link>
                    <Link
                        href="/profile"
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                    >
                        See profile demo
                    </Link>
                </div>
            </section>

            <footer className="mt-10 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
                <p>FashionHub MVP</p>
            </footer>
        </main>
    );
}
