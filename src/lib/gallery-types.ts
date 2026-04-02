export interface ProductCardItem {
    id: number;
    image_url: string;
    title: string | null;
    created_at: string | null;
}

export interface ProductsPageResponse {
    items: ProductCardItem[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number | null;
}
