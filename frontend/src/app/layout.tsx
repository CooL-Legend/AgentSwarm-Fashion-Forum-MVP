import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
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
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={`${manrope.className} min-h-screen bg-zinc-950 text-zinc-100 antialiased`}>
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

              <div className="flex items-center gap-3 text-xs">
                <span className="hidden text-zinc-500 sm:inline">Curated Visual Feed</span>
                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  live
                </span>

                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100">
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-opacity hover:opacity-90">
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>

                <Show when="signed-in">
                  <Link
                    href="/history"
                    className="hidden rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 sm:inline-block"
                  >
                    History
                  </Link>
                  <Link
                    href="/profile"
                    className="hidden rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 sm:inline-block"
                  >
                    Profile
                  </Link>
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: "h-8 w-8",
                      },
                    }}
                  />
                </Show>
              </div>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
