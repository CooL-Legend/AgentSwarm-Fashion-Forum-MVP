# Fashion MVP

A fashion inspiration and virtual try-on platform with an infinite-scroll product gallery, scraping tools, Google-powered try-on/pose transfer, and backend-served APIs.

## Architecture

| Layer | Tech | Location |
|-------|------|----------|
| Frontend (UI only) | Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript | `frontend/src/app/` |
| Backend services/APIs | Go HTTP server | `backend/` |
| Database | Supabase (PostgreSQL) | Cloud |
| External services | Google Vertex AI, Gemini image generation, Hugging Face Spaces | Cloud |

## Quick Start

Prerequisites: Node.js + npm, Go (see `backend/go.mod`)

Install frontend dependencies:

```bash
cd frontend
npm install
```

Start backend (terminal 1):

```bash
./run-backend.sh
```

Start frontend (terminal 2):

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Backend API (Go, port 8080)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/healthz` | Health check |
| GET | `/api/products` | Paginated product listing from Supabase |
| POST | `/api/scrape` | HF scraper proxy with HTML fallback |
| POST | `/api/tryon` | Google Vertex AI virtual try-on |
| GET | `/api/users` | User profile lookup |
| POST | `/api/pose-transfer` | Gemini pose transfer generation |
| POST | `/api/generate-video` | HF Gradio queued video generation |

### API Notes

- `GET /api/products?cursor=<id>&limit=<n>&q=<search>`
  - Keyset pagination by `id DESC`
  - Default `limit=100`, max `200`
  - Returns `{ items, nextCursor, hasMore, total }`
- `POST /api/scrape`
  - Body: `{ "url": "...", "max_images": 3 }`
- `POST /api/tryon`
  - Body: person image + garment image or garment URL
- `POST /api/pose-transfer`
  - Body: `{ "result_image": "<base64-or-data-url>", "pose_image": "<base64-or-data-url>" }`
- `POST /api/generate-video`
  - Body: `{ "image_base64": "<base64-or-data-url>", "gender": "male|female" }`

## Frontend behavior

Frontend components call backend directly through:

- `NEXT_PUBLIC_BACKEND_API_BASE_URL` (default: `http://localhost:8080`)

There are no Next.js route handlers in the frontend app.

## Scripts

| Script | Purpose |
|--------|---------|
| `./run-backend.sh` | Run Go backend |
| `./dev.sh` | Start frontend dev server + localtunnel |
| `npm run dev` (repo root) | Wrapper to `frontend` dev script |
| `npm run build` (repo root) | Wrapper to `frontend` build script |

## Environment Variables

Both frontend and backend read from repo-root `.env`.

### Required

- `SUPABASE_URL` (fallback: `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Common

- `NEXT_PUBLIC_BACKEND_API_BASE_URL` (default: `http://localhost:8080`)
- `SCRAPER_URL` (default: `https://varun2808-product-image-scraper.hf.space`)

### Google APIs

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `GEMINI_MODEL` (optional, default: `gemini-3.1-flash-image-preview`)

### Hugging Face

- `HF_TOKEN`
- `HF_VIDEO_SPACE_URL` (optional, default: `https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space`)

### Backend

- `BACKEND_PORT` (default: `8080`)
- `BACKEND_CORS_ORIGIN` (default: `*`)

## Deployment

### Frontend (Vercel)

- Root directory: `frontend`
- Framework preset: Next.js

### Backend

- Deploy `backend/` as a Go service
- Set all required env vars in backend environment
- Set `BACKEND_CORS_ORIGIN` to your frontend origin in production
