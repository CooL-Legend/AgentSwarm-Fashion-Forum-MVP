const DEFAULT_BACKEND_API_BASE_URL = "http://localhost:8080";

const backendApiBaseUrl = (
    process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL || DEFAULT_BACKEND_API_BASE_URL
).replace(/\/$/, "");

export function backendApiUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${backendApiBaseUrl}${normalizedPath}`;
}

type ClerkWindow = {
    Clerk?: {
        session?: { getToken?: () => Promise<string | null> };
    };
};

async function getClerkToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const clerk = (window as unknown as ClerkWindow).Clerk;
    try {
        const token = await clerk?.session?.getToken?.();
        return token ?? null;
    } catch {
        return null;
    }
}

// backendFetch wraps fetch with the current Clerk session token attached.
// Use this for every call that hits the Go backend so the handler can identify the user.
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await getClerkToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(backendApiUrl(path), { ...init, headers });
}
