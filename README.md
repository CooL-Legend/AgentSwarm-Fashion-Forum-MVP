# Fashion MVP

A fashion inspiration and virtual try-on platform with an infinite-scroll product gallery, web scraping, Google AI-powered virtual try-on, and video generation.

## Architecture

| Layer | Tech | Location |
|-------|------|----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript | `src/app/` |
| Backend | Go HTTP server | `backend/` |
| Database | Supabase (PostgreSQL) | Cloud |
| External | Google Vertex AI (VTO), Hugging Face (scraper + video gen) | Cloud |

## Quick Start

Prerequisites: Node.js + npm, Go (see `backend/go.mod`)

**Install frontend deps:**

```bash
npm install
```

**Start backend (terminal 1):**

```bash
./run-backend.sh
```

**Start frontend (terminal 2):**

```bash
npm run dev
```

Open `http://localhost:3000`.

## Features

### Infinite-Scroll Gallery

- Keyset pagination with `cursor` and `limit` params
- Virtual windowing for efficient rendering of large datasets
- Responsive grid: 2 columns (mobile) to 5 columns (desktop)
- Debounced search with automatic pagination reset

### Virtual Try-On

- Upload a person photo and select a garment from the gallery
- Powered by Google Vertex AI Virtual Try-On model
- Returns generated composite image

### Product Image Scraping

- Paste any product URL to extract images
- Proxies to a Hugging Face Space scraper
- Built-in fallback extractor (meta tags, img/source elements) when upstream fails

### Video Generation

- Generates short fashion videos from product images
- Uses Hugging Face Gradio client for 360-degree rotation and pose generation

## API Routes

### Go Backend (port 8080)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | Paginated product listing from Supabase |
| POST | `/api/scrape` | Proxy to HF scraper with fallback HTML extraction |
| POST | `/api/tryon` | Google Vertex AI virtual try-on |
| GET | `/healthz` | Health check |

### Next.js API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | Proxies to Go backend |
| POST | `/api/scrape` | Proxies scraper request |
| POST | `/api/tryon` | Proxies try-on request |
| POST | `/api/generate-video` | HF Gradio video generation |

### API Details

**`GET /api/products?cursor=<id>&limit=<n>&q=<search>`**

- Keyset pagination by `id` descending
- Default `limit=100`, max `200`
- Returns `{ items, nextCursor, hasMore, total }`

**`POST /api/scrape`**

- Body: `{ "url": "...", "max_images": 3 }`
- Returns image candidates from upstream scraper or fallback extractor

**`POST /api/tryon`**

- Body: person image (base64) + garment image (base64 or URL)
- Returns generated image when Google credentials are configured

**`POST /api/generate-video`**

- Body: `{ "image": "<base64>" }`
- Returns base64-encoded MP4 video

## Frontend Components

| Component | Purpose |
|-----------|---------|
| `GalleryView` | Main infinite-scroll product grid with search and virtual windowing |
| `GarmentInput` | Product selection via local search, image upload, or URL scraping |
| `TryOnModal` | Person photo upload and virtual try-on result display |
| `GalleryLightbox` | Full-screen image viewer with product details |

## Scripts

| Script | Purpose |
|--------|---------|
| `dev.sh` | Start Next.js dev server + localtunnel |
| `run-backend.sh` | Run Go backend |
| `seed-garments.js` | Seed Supabase `products` table from CSV sources (H&M, Westside, WROGN) |
| `scripts/generate_vector.js` | Generate embedding vectors for products via HF API |

## Environment Variables

Both frontend and backend read from the repo-root `.env`.

### Required

- `SUPABASE_URL` (fallback: `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Common

- `NEXT_PUBLIC_BACKEND_API_BASE_URL` -- defaults to `http://localhost:8080`
- `SCRAPER_URL` -- defaults to `https://varun2808-product-image-scraper.hf.space`

### Optional (Virtual Try-On)

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`

### Optional (Video Generation)

- `HF_TOKEN`

### Optional (Backend)

- `BACKEND_PORT` -- defaults to `8080`
- `BACKEND_CORS_ORIGIN` -- defaults to `*`

## Deployment

### Frontend (Vercel)

- Root directory: repo root (`.`)
- Framework preset: Next.js
- See `vercel.json` for build config

### Backend

- Deploy `backend/` as a Go service
- Set all required env vars in the backend environment
- Set `BACKEND_CORS_ORIGIN` to your frontend origin in production

## Troubleshooting

**`No Next.js version detected` on Vercel:**
Confirm the project Root Directory is the repo root where `package.json` includes `next`.

**`Scraper returned 500`:**
Verify `SCRAPER_URL` is set correctly. The upstream HF scraper may be temporarily unstable -- the backend fallback will still extract images directly from page HTML.
