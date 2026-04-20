/**
 * Returns the correct base URL for Go backend API calls.
 *
 * - In the browser (client-side): use relative `/go-api` so requests always
 *   go to the same host as the frontend. Next.js rewrites `/go-api/:path*`
 *   → `http://localhost:8080/api/:path*` on the server.
 *
 * - On the server (Server Actions, API routes): use the full URL so Next.js
 *   can reach the Go backend from the server process.
 */
export const getBackendUrl = (): string => {
    if (typeof window === 'undefined') {
        return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
    }
    return '/go-api';
};

export const getGoApiUrl = (path: string): string => {
    const base = getBackendUrl();
    const cleanPath = path.replace(/^\/api\//, '').replace(/^\//, '');
    if (typeof window === 'undefined') {
        return `${base}/api/${cleanPath}`;
    }
    return `${base}/${cleanPath}`;
};

export const getDirectGoApiUrl = (path: string): string => {
    const cleanPath = path.replace(/^\/api\//, '').replace(/^\//, '');
    let base = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!base) {
        if (typeof window !== 'undefined') {
            base = `http://${window.location.hostname}:8080`;
        } else {
            base = 'http://127.0.0.1:8080';
        }
    }
    return `${base}/api/${cleanPath}`;
};

type ClerkWindow = {
    Clerk?: {
        session?: { getToken?: () => Promise<string | null> };
    };
};

async function resolveClerkToken(): Promise<string | null> {
    if (typeof window === 'undefined') {
        try {
            const { auth } = await import('@clerk/nextjs/server');
            const session = await auth();
            const token = await session.getToken();
            return token ?? null;
        } catch {
            return null;
        }
    }
    try {
        const clerk = (window as unknown as ClerkWindow).Clerk;
        const token = await clerk?.session?.getToken?.();
        return token ?? null;
    } catch {
        return null;
    }
}

export const apiFetch = async (path: string, options?: RequestInit) => {
    const url = getGoApiUrl(path);

    let bodyToSend = options?.body;
    if (
        bodyToSend &&
        typeof bodyToSend === 'object' &&
        !(bodyToSend instanceof FormData) &&
        !(bodyToSend instanceof URLSearchParams) &&
        !(bodyToSend instanceof Blob) &&
        !(bodyToSend instanceof ArrayBuffer)
    ) {
        bodyToSend = JSON.stringify(bodyToSend);
    }

    const headers = new Headers(options?.headers);
    const hasBody = bodyToSend !== undefined && bodyToSend !== null;

    if (hasBody && typeof bodyToSend === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    if (!headers.has('Authorization')) {
        const token = await resolveClerkToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, {
        ...options,
        method: options?.method || 'GET',
        headers,
        body: hasBody ? bodyToSend : undefined,
    });
};
