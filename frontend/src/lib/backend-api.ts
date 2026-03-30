const DEFAULT_BACKEND_API_BASE_URL = "http://localhost:8080";

const backendApiBaseUrl = (
    process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL || DEFAULT_BACKEND_API_BASE_URL
).replace(/\/$/, "");

export function backendApiUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${backendApiBaseUrl}${normalizedPath}`;
}
