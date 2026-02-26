import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fashion Forum",
  description: "AI-powered fashion discussion forum",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
          <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-black text-zinc-950">
                F
              </div>
              <span className="text-sm font-bold tracking-tight">
                fashion<span className="text-amber-400">forum</span>
              </span>
            </Link>

            <nav className="ml-2 flex items-center gap-1 text-sm font-medium">
              <Link
                href="/"
                className="rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Forum
              </Link>
              <Link
                href="/gallery"
                className="rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Gallery
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
              <span className="hidden sm:inline">AI-Powered Discussion</span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                mvp
              </span>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
