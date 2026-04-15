# Backend-Only Refactor + Canonical Frontend Move

## What changed

**Problem:** The repo had two frontend source trees (`src/` and `frontend/src/`) and backend logic split across Next.js route handlers and Go handlers, which caused drift and build/runtime confusion.

**Solution:** Consolidated to a single frontend source tree (`frontend/src`) and moved all runtime backend APIs/services into the Go backend. Frontend now renders UI only and calls Go APIs directly through `NEXT_PUBLIC_BACKEND_API_BASE_URL`.

## Files modified

- **`backend/main.go`** — Added new config fields (`GEMINI_MODEL`, `HF_TOKEN`, `HF_VIDEO_SPACE_URL`) and registered additional API routes:q
  - `GET /api/users`
  - `POST /api/pose-transfer`
  - `POST /api/generate-video`
- **`backend/api.go`** — Implemented:
  - `usersHandler` (Supabase-backed profile fetch, returns `{ user }`)
  - `poseTransferHandler` (Gemini image generation, returns `{ success, image }`)
  - `generateVideoHandler` (HF Gradio queue flow via `/gradio_api/call/generate_video` + SSE polling, returns `{ video }`)
  - Added robust `all_image_urls` decoding for products to support both array and pipe-delimited string DB formats.
- **`frontend/src/lib/backend-api.ts`** — Kept as single API URL resolver for direct frontend -> Go backend calls.
- **`frontend/src/lib/gallery-types.ts`** — Uses `all_image_urls` in shared product type/utility logic.
- **`package.json` (repo root)** — Added root-level wrappers/scripts:
  - `run_backend`
  - `run_frontend`
  - `build_backend`
  - `build_frontend`
  - Updated `dev/build/start` to run through `frontend`.
- **`dev.sh`** — Updated to run Next.js from `frontend/` and use `frontend/.next` lock file.
- **`vercel.json`** — Updated build/install/output paths to target `frontend` app ownership.
- **`README.md`, `TECHNICAL_GUIDE.md`, `DOCUMENTATION.md`** — Updated architecture docs to frontend UI-only + backend-owned API model.

## Files removed / migrated

- **Removed frontend Next API routes:** `frontend/src/app/api/*` (products/scrape/tryon).
- **Retired old root frontend tree:** `src/app/*` and `src/lib/*`.
- **Canonical frontend location is now:** `frontend/src/app` and `frontend/src/lib`.

## Validation completed

- **Backend build:** `cd backend && go build ./...` passed.
- **Frontend build:** `cd frontend && npm run build` passed.
- **Root wrapper build:** `npm run build` passed (delegates to frontend).
- **Backend smoke tests (localhost):**
  - `GET /api/products` -> 200
  - `GET /api/users` -> 200
  - `POST /api/tryon`, `POST /api/pose-transfer`, `POST /api/generate-video` -> correct validation/error responses for test payloads
  - `POST /api/scrape` reached backend path and returned upstream/fallback error shape as expected for test URL.

---

# Multi-Image Product Support

## What changed

**Problem:** The app only displayed a single `image_url` per product, ignoring the `all_image_urls` array column in the database.

**Solution:** Products now fetch and render all available images with carousel navigation.

## Files modified

- **`src/lib/gallery-types.ts`** — Added `all_image_urls` field to `ProductCardItem` and a `resolveImages()` helper that falls back to `[image_url]` when the array is empty/null.
- **`src/app/api/products/route.ts`** — Added `all_image_urls` to the Supabase select query and response mapping.
- **`backend/api.go`** — Added `AllImageURLs` to Go product structs and the Supabase REST query.
- **`src/app/components/ProductCard.tsx`** *(new)* — Extracted card rendering into its own component with a per-card image carousel: left/right chevrons on hover, dot indicators, and isolated state so cycling images only re-renders that card.
- **`src/app/components/GalleryView.tsx`** — Replaced inline card markup with `<ProductCard>`. Lightbox now receives `initialIndex` from the card's active image.
- **`src/app/components/GalleryLightbox.tsx`** — Added multi-image navigation: left/right arrow buttons, keyboard arrow keys, image counter ("2 / 5"), and adjacent image preloading.

## No changes needed

- `TryOnModal` and `GarmentInput` — they already work with a single selected image URL, which the caller now passes from the active carousel image.

---

# Background Try-On with Notification

## What changed

**Problem:** The virtual try-on feature blocked the user in a full-screen modal for 10-20 seconds while Google Vertex AI processed the image. Users could not browse the gallery during this time.

**Solution:** Try-on now runs in the background. After submitting, the modal closes and a floating notification tracks progress. When the result is ready, the notification pings and offers a "View" button to open the result.

## Files created

- **`src/app/hooks/useTryOnTask.ts`** — Custom hook that owns the background try-on state and fetch logic. Manages `processing` / `done` / `error` status, uses `AbortController` for cancellation if a new try-on starts, and cleans up on unmount.
- **`src/app/components/TryOnNotification.tsx`** — Floating pill fixed at bottom-right of the viewport. Shows an amber spinner while processing, switches to an emerald "Try-on ready!" pill with a ping animation on success, or a red error state with a dismiss button on failure.
- **`src/app/components/TryOnResultModal.tsx`** — Lightweight 3-column result viewer (person | garment | result) with a download button. Opens when the user clicks "View" on the notification.

## Files modified

- **`src/app/components/TryOnModal.tsx`** — Added optional `onTryOnSubmit` prop. When provided, clicking "Try On" delegates the API call to the parent and closes the modal immediately instead of blocking with a spinner.
- **`src/app/components/GalleryView.tsx`** — Wired the `useTryOnTask` hook, passes `onTryOnSubmit` to `TryOnModal`, renders `TryOnNotification` and `TryOnResultModal`. One new state variable (`showTryOnResult`).
- **`src/app/globals.css`** — Added `slideUp` and `ping-once` keyframe animations for the notification entry and success ping.

## No changes needed

- API routes (`/api/tryon`) — the endpoint is unchanged; only the client-side calling pattern moved from inside the modal to the background hook.
- `GarmentInput`, `GalleryLightbox`, `ProductCard` — unaffected.

---

# User Profile Page

## What changed

**Problem:** Users had no way to view their own profile information or showcase their visual content.

**Solution:** Added a complete profile page that displays user information, hero visuals, contact details, and a visual gallery of their uploaded images.

## Files created

- **`src/app/api/users/route.ts`** — New API route that fetches user profile data from Supabase by first/last name (hardcoded for Aditya Bhandari).
- **`src/app/components/ProfileView.tsx`** — Main profile page component with loading states, error handling, and skeleton UI.
- **`src/app/components/ProfileHeader.tsx`** — Profile header with avatar, name, username, bio, and action buttons (share/edit).
- **`src/app/components/HeroVisuals.tsx`** — Hero section displaying front/back profile images in a grid layout.
- **`src/app/components/InformationGrid.tsx`** — Contact details and stats grid with icons for email, location, phone, gender, height.
- **`src/app/components/VisualGallery.tsx`** — Image gallery component showing user's uploaded images with overflow indicator.
- **`src/app/profile/page.tsx`** — Profile page route with dynamic rendering.
- **`src/lib/user-types.ts`** — TypeScript interface defining the UserProfile structure.

## Files modified

- **`src/app/layout.tsx`** — Added Manrope font import and profile navigation link in header.
- **`backend/api.go`** — Added clarifying comment about Google Vertex AI virtual try-on model.

---

# Pose Transfer Module

## What changed

**Problem:** After a virtual try-on, the result image was locked to the original person's pose. Users had no way to see how the garment would look in a different pose (e.g. walking, arms raised, sitting).

**Solution:** Added an optional pose transfer step after try-on. Users paste a URL to a pose reference image, and the system uses Gemini 3.1 Flash Image Preview to generate a new image preserving the person's identity and garment from the try-on result but adopting the pose from the reference image.

## Files created

- **`src/app/api/pose-transfer/route.ts`** — New API route that accepts the try-on result image (base64) and a pose reference URL. Fetches the pose image server-side, sends both images with a detailed pose transfer prompt to the Gemini `generateContent` API, parses the response for the generated image, and returns it as a data URL. Uses the same conventions as the tryon route (60s max duration, 50s abort timeout, consistent error shape).

## Files modified

- **`src/app/components/TryOnResultModal.tsx`** — Added pose transfer UI to the background try-on result modal. After viewing a completed try-on, a "Pose Transfer" section appears below the 3-column grid with a URL input and "Transfer Pose" button. The Result column toggles between the original try-on and pose-transferred output via a pill switcher. Download button dynamically points to whichever result is currently displayed. Error state shown inline.
- **`src/app/components/TryOnModal.tsx`** — Added the same pose transfer UI in the inline try-on result view, with matching state, handler, toggle, and download behavior. "Try Another" resets all pose state.

## No changes needed

- API routes (`/api/tryon`) — the try-on endpoint is unchanged; pose transfer is a separate downstream step.
- `TryOnNotification`, `GalleryView` — unaffected.
- `.env` — `GEMINI_API_KEY` and `GEMINI_MODEL` were already configured.
