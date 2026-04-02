Fashion  MVP

Two-service app:

- Next.js app at repo root for UI
- Go backend in `backend/` for runtime APIs

## What We Are Building

- Infinite-scroll product gallery powered by Supabase `products`
- Server-side search and keyset pagination via Go backend
- Product-page image extraction for try-on input
- Virtual try-on endpoint backed by Google VTO

## Current Architecture

- Frontend: Next.js App Router (`src/app`)
- Backend: Go HTTP server (`backend/`)
- Data source: Supabase `products` table

Runtime API routes (served by Go):

- `GET /api/products`
- `POST /api/scrape`
- `POST /api/tryon`
- `GET /healthz`

## Scraper Behavior

Frontend calls backend `POST /api/scrape`, then backend:

1. Proxies to `SCRAPER_URL` (Hugging Face Space API host).
2. If upstream fails (for example returns 5xx), uses a built-in fallback extractor that pulls image candidates from HTML meta/img/source tags.

Recommended scraper URL:

- `https://varun2808-product-image-scraper.hf.space`

## Quick Start

Prereqs:

- Node.js + npm
- Go (see `backend/go.mod`)

Install frontend deps:

```bash
npm install
```

Start backend (terminal 1):

```bash
./run-backend.sh
```

Start frontend (terminal 2):

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Both frontend and backend read from repo-root `.env`.

Required:

- `SUPABASE_URL` (or fallback `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or fallback `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Common:

- `NEXT_PUBLIC_BACKEND_API_BASE_URL` (defaults to `http://localhost:8080`)
- `SCRAPER_URL` (use the `hf.space` host)

Optional (try-on):

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`

## API Notes

`GET /api/products?cursor=<id>&limit=<n>&q=<optional>`

- Keyset pagination by `id` descending
- Default `limit=100`, max `200`
- Returns `items`, `nextCursor`, `hasMore`, `total`

`POST /api/scrape`

- Body: `{ "url": "...", "max_images": 3 }`
- Returns image candidates from upstream scraper or fallback extractor

`POST /api/tryon`

- Body includes person image + garment image (or garment URL)
- Returns generated image payload when credentials are configured

## Deployment Notes

Frontend (Vercel):

- Root Directory must be repo root (`.`)
- Framework preset: Next.js

Backend:

- Deploy `backend/` as a Go service
- Ensure env vars above are set in backend environment
- Set `BACKEND_CORS_ORIGIN` to your frontend origin in production

## Troubleshooting

`No Next.js version detected` on Vercel:

- Confirm project Root Directory is repo root where `package.json` includes `next`

`Scraper returned 500`:

- Verify `SCRAPER_URL` is `https://varun2808-product-image-scraper.hf.space`
- Upstream HF scraper may be temporarily unstable; backend fallback will still try to extract images directly from page HTML
