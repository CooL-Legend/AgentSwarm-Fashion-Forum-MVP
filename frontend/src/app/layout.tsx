import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FashionHub",
  description: "Marketplace discovery with virtual try-on and pose transfer.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  return (
    <html lang="en" className="dark">
      <body className={`${manrope.className} min-h-screen bg-zinc-950 text-zinc-100 antialiased`}>
        <ClerkProvider>
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

              <nav className="flex items-center gap-5 text-xs text-zinc-400">
                <Link href="/" className="transition-colors hover:text-zinc-100">
                  Home
                </Link>
                <Link href="/gallery" className="transition-colors hover:text-zinc-100">
                  Marketplace
                </Link>
                {userId && (
                  <Link href="/profile" className="transition-colors hover:text-zinc-100">
                    Profile
                  </Link>
                )}
              </nav>

              {!userId && (
                <div className="flex items-center gap-3">
                  <Link
                    href="/sign-in"
                    className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
