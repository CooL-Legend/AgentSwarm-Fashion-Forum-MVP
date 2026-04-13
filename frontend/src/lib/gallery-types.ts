export interface ProductCardItem {
    id: string;
    image_url: string;
    all_image_urls: string[] | null;
    title: string | null;
    created_at: string | null;
}

export function resolveImages(item: ProductCardItem): string[] {
    const raw: unknown = item.all_image_urls;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (typeof raw === "string" && raw.length > 0) {
        // DB stores URLs as pipe-delimited string
        const urls = raw.split("|").map((u) => u.trim()).filter(Boolean);
        if (urls.length > 0) return urls;
    }
    return [item.image_url];
}

export interface ProductsPageResponse {
    items: ProductCardItem[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number | null;
}
