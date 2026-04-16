import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-7xl items-center justify-center px-4 py-10">
            <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/65 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                <SignIn
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/sign-up"
                    forceRedirectUrl="/onboarding"
                    appearance={{
                        variables: {
                            colorBackground: "#0a0a0a",
                            colorInputBackground: "#18181b",
                            colorInputText: "#f4f4f5",
                            colorText: "#f4f4f5",
                            colorPrimary: "#f59e0b",
                            colorTextSecondary: "#a1a1aa",
                            colorNeutral: "#27272a",
                        },
                    }}
                />
            </div>
        </main>
    );
}
