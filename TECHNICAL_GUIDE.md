# Product Gallery Technical Guide

## Architecture

- Frontend: Next.js App Router (`src/app`) for UI only
- Backend: Go HTTP API (`backend/`) for all runtime backend behavior
- Data source: Supabase `products` table
- Runtime backend routes (served by Go on `:8080`):
  - `GET /api/products` (Supabase pagination/search)
  - `POST /api/scrape` (external scraper proxy)
  - `POST /api/tryon` (Google VTO integration)

No local JSON/forum persistence is used at runtime.

## Product Pagination Contract

Endpoint:

`GET /api/products?cursor=<id>&limit=<n>&q=<optional>`

Behavior:

- Sorted by `id DESC`
- Keyset pagination via `id < cursor`
- Default `limit=100`
- Max `limit=200`
- Filters out rows with null `image_url`
- Optional `q` applies `ilike` on product `title`

Response shape:

```json
{
  "items": [
    {
      "id": "61394976-3e81-4125-b587-d6bc1e7da6cc",
      "image_url": "https://...",
      "title": "Product title",
      "created_at": "2026-03-29T10:00:00.000Z"
    }
  ],
  "nextCursor": "61394976-3e81-4125-b587-d6bc1e7da6cc",
  "hasMore": true,
  "total": null
}
```

## Frontend Loading Strategy

`GalleryView` implements:

- Infinite scroll with `IntersectionObserver`
- One in-flight request at a time
- Abort stale requests on new search/reset
- Server-side search pagination (`q`), not in-memory full-dataset filtering
- ID-based dedupe while appending pages
- Windowed rendering (virtual row slicing + spacers) to keep DOM size manageable for large datasets

The frontend calls the Go backend directly through `NEXT_PUBLIC_BACKEND_API_BASE_URL` (default `http://localhost:8080`).

## Performance Notes (15,000 rows)

- Keep page size at 100 (up to 200 max only when needed)
- Do not increase Supabase API row cap to support bulk 15k responses
- Keep `id` indexed/primary key (required for stable keyset pagination)
- Prefer minimal select columns for cards
- Use lazy-loaded images and virtual windowing to avoid browser memory spikes
