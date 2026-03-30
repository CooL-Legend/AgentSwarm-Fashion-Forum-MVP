# AgentSwarm (Product Gallery MVP)

This project is now a two-service app:
- repo root (Next.js) for UI only
- `backend/` (Go) for all API/backend logic

## What It Does

- Loads products from Supabase table `products`
- Uses paginated API access from Go backend (`/api/products`) with infinite scroll
- Supports search against product titles
- Uses Go backend utility APIs for image scraping and try-on (`/api/scrape`, `/api/tryon`)

## Data Source Policy

- Runtime product data source: **Supabase `products` table only**
- Local JSON forum/user persistence has been removed
- Legacy forum/local JSON APIs have been removed

## API

- `GET /api/products?cursor=<id>&limit=<n>&q=<optional>`
  - Keyset pagination by `id` (descending)
  - Default `limit=100`, max `200`
  - Response:
    - `items`: product card rows
    - `nextCursor`: cursor for next page or `null`
    - `hasMore`: whether more rows exist
    - `total`: currently `null` (intentionally omitted for performance)

## Run

```bash
./run-backend.sh
```

In a second terminal:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Frontend reads env from repo-root `.env` via `next.config.ts`.

Required:

- `SUPABASE_URL` (preferred) or `NEXT_PUBLIC_SUPABASE_URL` fallback
- `SUPABASE_SERVICE_ROLE_KEY` (preferred for server API) or `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback
- `NEXT_PUBLIC_BACKEND_API_BASE_URL` (optional, defaults to `http://localhost:8080`)

Optional:

- `SCRAPER_URL`
- Google/VTO credentials for `/api/tryon`
