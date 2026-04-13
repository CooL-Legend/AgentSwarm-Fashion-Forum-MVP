# Fashion MVP Documentation

## Current Architecture

- Frontend (UI only): `frontend/src/app`
- Backend/API (all services): `backend/`
- Database: Supabase
- AI integrations: Google Vertex AI, Gemini image generation, Hugging Face Spaces

The frontend does not define Next.js API route handlers. Browser calls go directly to the Go backend using `NEXT_PUBLIC_BACKEND_API_BASE_URL`.

## Backend Endpoints

- `GET /healthz`
- `GET /api/products`
- `POST /api/scrape`
- `POST /api/tryon`
- `GET /api/users`
- `POST /api/pose-transfer`
- `POST /api/generate-video`

## Frontend App Routes

- `/` -> gallery experience
- `/gallery` -> gallery experience
- `/profile` -> profile experience

## Core Frontend Modules

- `frontend/src/app/components/GalleryView.tsx`
- `frontend/src/app/components/GarmentInput.tsx`
- `frontend/src/app/components/TryOnModal.tsx`
- `frontend/src/app/components/TryOnResultModal.tsx`
- `frontend/src/app/components/ProfileView.tsx`
- `frontend/src/app/hooks/useTryOnTask.ts`

## Runtime and Deployment

- Frontend local dev: `cd frontend && npm run dev`
- Backend local dev: `./run-backend.sh`
- Vercel frontend project root directory: `frontend`

## Environment Variables

Shared from repo-root `.env`:

- `NEXT_PUBLIC_BACKEND_API_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCRAPER_URL`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `GEMINI_MODEL` (optional)
- `HF_TOKEN`
- `HF_VIDEO_SPACE_URL` (optional)
- `BACKEND_PORT`
- `BACKEND_CORS_ORIGIN`
