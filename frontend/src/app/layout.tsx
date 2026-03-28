import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inspiration Board",
  description: "Curated fashion inspiration powered by Supabase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400 text-sm font-black text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.25)]">
                I
              </div>
              <span className="text-sm font-semibold tracking-wide text-zinc-200 transition-colors group-hover:text-zinc-100">
                inspiration<span className="text-amber-300">board</span>
              </span>
            </Link>

            <div className="flex items-center gap-2 text-xs">
              <span className="hidden text-zinc-500 sm:inline">Curated Visual Feed</span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                live
              </span>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
