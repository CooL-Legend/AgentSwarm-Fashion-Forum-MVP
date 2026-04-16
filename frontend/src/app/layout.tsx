import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FashionHub",
  description: "Personalized fashion discovery with virtual try-on.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${manrope.className} min-h-screen bg-zinc-950 text-zinc-100 antialiased`}>
        <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400 text-sm font-black text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.25)]">
                F
              </div>
              <span className="text-sm font-semibold tracking-wide text-zinc-200 transition-colors group-hover:text-zinc-100">
                Fashion<span className="text-amber-300">Hub</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-5 text-xs text-zinc-400 md:flex">
              <Link href="/" className="transition-colors hover:text-zinc-100">
                Home
              </Link>
              <Link href="/gallery" className="transition-colors hover:text-zinc-100">
                Gallery
              </Link>
              <Link
                href="/profile"
                className="transition-colors hover:text-zinc-100"
              >
                Profile
              </Link>
            </nav>

            <div className="flex items-center gap-2 text-xs">
              <span className="hidden rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 sm:inline-flex">
                MVP
              </span>
              <Link
                href="/gallery"
                className="rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-amber-400"
              >
                Try App
              </Link>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
