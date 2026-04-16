# Gender-Based Product Filtering

## What changed

**Problem:** The gallery showed all products regardless of the user's gender, displaying irrelevant items (e.g. women's clothing for a male user).

**Solution:** Added gender-based filtering to the products API. On gallery load, the user's `sex` field is fetched from the profile, mapped to the product gender convention (`male` -> `men`, `female` -> `women`), and passed as a query parameter. The backend filters products using a case-insensitive match to handle inconsistent DB casing (`Men`, `men`, `MAle`, etc.).

## Files modified

- **`backend/api.go`** — Added `gender` query param to `productsHandler`; applies PostgREST `ilike` filter for case-insensitive matching.
- **`frontend/src/app/api/products/route.ts`** — Added `gender` query param support with Supabase `.ilike("gender", gender)` filter.
- **`frontend/src/app/components/GalleryView.tsx`** — Fetches user profile on mount to resolve gender; maps `sex` values (`male`/`female`) to product gender values (`men`/`women`); passes gender param to products API; gates product fetching until gender is resolved. Reads from `data.user.sex` to match the `{ user: { ... } }` response shape.
- **`frontend/src/lib/gallery-types.ts`** — Added `gender: string | null` to `ProductCardItem`.

## Notes

- If the user has no gender set, all products are shown (no filter applied).
- The mapping handles the mismatch between user `sex` values (`male`/`female`) and product `gender` values (`Men`/`Women`).

---

# Product Metadata + Card UI Refresh

## What changed

**Problem:** Gallery cards only surfaced a product title, and `/api/products` did not return brand or price fields needed for a richer storefront-style card.

**Solution:** Extended the frontend product model and products API response to include `brand` and `price`, then updated card presentation to show brand/title/price persistently with a cleaner selected state indicator.

## Files modified

- **`frontend/src/app/api/products/route.ts`** — Expanded Supabase select to `id,image_url,title,brand,price,created_at`; mapped `brand` as nullable string and `price` as nullable number.
- **`frontend/src/lib/gallery-types.ts`** — Added `brand` and `price` to `ProductCardItem`.
- **`frontend/src/app/components/ProductCard.tsx`** — Refactored card UI:
  - Added INR price formatter (`Intl.NumberFormat`).
  - Switched to a fixed 4:5 media area with persistent metadata section.
  - Displayed optional brand label and optional price text.
  - Kept selection behavior but moved to a stronger top-right check badge.
- **`frontend/src/app/components/GalleryView.tsx`** — Updated loading skeleton card height from `300px` to `360px` to better match new card proportions during fetch states.

## Notes

- This update is frontend-only and does not change backend Go handlers.
- Existing gallery selection/lightbox flow remains intact; this pass focuses on metadata flow + visual card polish.

---

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

---

# Google Cloud Storage Integration

## What changed

**Problem:** All try-on and pose transfer images were processed entirely in-memory as base64 strings and never persisted. Users had no way to retrieve past results, and there was no per-user storage for uploaded images.

**Solution:** Integrated Google Cloud Storage (bucket: `tryown-media`) using raw HTTP calls to the GCS JSON API. Each user gets a folder structure in the bucket, and all images (inputs, try-on results, pose transfers) are automatically stored when a `user_id` is present. Reuses the existing Google service account OAuth flow (`getAccessToken`) — no new credentials or SDK dependencies needed.

## Per-user folder structure

```
tryown-media/users/{user_id}/
  ├── input/{input_id}.png        # user-uploaded source images
  ├── tryon/{tryon_id}.png        # generated try-on outputs
  ├── pose/{pose_id}.png          # pose transfer outputs
  ├── info/{image_id}.txt         # metadata file per image
  └── profile.md                  # auto-created on first interaction
```

## Files created

- **`backend/gcs.go`** — All GCS logic (~450 lines):
  - **GCS operations:** `gcsUpload`, `gcsRead`, `gcsDelete`, `gcsListPrefix` — raw HTTP calls to `storage.googleapis.com` JSON API with bearer token auth.
  - **Helpers:** `generateImageID` (timestamp + random hex), `decodeBase64Image` (strips data URL prefix + decodes), `contentTypeToExt`, `gcsObjectPath`, `gcsUserPrefix`.
  - **User management:** `gcsCheckAccess` (write/read/delete health check), `gcsInitUserFolder` (creates `profile.md` on first interaction), `gcsWriteInfoFile` (creates `info/{id}.txt` metadata per image).
  - **Duplicate detection:** Upload-input handler compares incoming image size against existing `input/` objects; skips re-upload if a match is found.
  - **HTTP handlers:**
    - `GET /api/gcs-health` — verifies read/write/delete access to the bucket.
    - `POST /api/upload-input` — stores user-uploaded images in `input/`, creates corresponding `info/{id}.txt`, detects duplicates.
    - `GET /api/user-images?user_id=xxx&category=tryon` — lists stored objects for a user, filterable by category (`input`, `tryon`, `pose`, `info`).

## Files modified

- **`backend/main.go`** — Added `GCSBucket` and `GCSBasePath` fields to `AppConfig`; loads from `GCS_BUCKET` and `GCS_BASE_PATH` env vars; registered three new routes (`/api/gcs-health`, `/api/upload-input`, `/api/user-images`).
- **`backend/api.go`** — Modified `tryOnHandler` and `poseTransferHandler`:
  - Added `user_id` field to `tryOnRequest` and `poseTransferRequest` structs.
  - Added `stored_path` and `stored_url` fields to `tryOnResponse`.
  - After successful image generation, if `user_id` is present, the result is synchronously uploaded to GCS (`tryon/` or `pose/` folder), an `info/{id}.txt` is written in the background, and `stored_path`/`stored_url` are included in the API response.
- **`frontend/src/app/hooks/useTryOnTask.ts`** — Extended `TryOnTaskInput` with optional `userId`; sends `user_id` in the request body when present; surfaces `storedPath` and `storedUrl` from the response in `TryOnTask` state.
- **`frontend/src/app/components/TryOnResultModal.tsx`** — Accepts optional `userId` prop; passes `user_id` in the pose-transfer fetch call so pose results are stored to GCS.
- **`frontend/src/app/components/GalleryView.tsx`** — Extracts `user_id` from the `/api/users` response and stores it in component state; passes it to `startTryOn` and `TryOnResultModal` so all generated images are automatically persisted.
- **`.env`** — Added `GCS_BUCKET=tryown-media` and `GCS_BASE_PATH=` (empty, files go directly under `users/` in the bucket root).

## Design decisions

- **No SDK, raw HTTP:** The GCS JSON API is called directly via `net/http`, consistent with the existing Vertex AI and Gemini integrations. Keeps the backend at zero external Go dependencies.
- **PNG format:** Images are stored in their native format (PNG from Vertex AI, PNG/JPEG from Gemini). No WebP conversion — avoids CGo/platform-dependent dependencies.
- **Synchronous upload:** GCS upload completes before the API response is sent (~200-500ms overhead on top of 10-55s generation time). Storage URL is returned in the response. Upload failure is logged but never blocks the image result.
- **Automatic storage:** No opt-in toggle — images are stored whenever a `user_id` is present in the request. The frontend sends `user_id` automatically when the user profile is loaded.
- **Duplicate detection:** Input image uploads are checked against existing files by size; duplicates return the existing object path without re-uploading.

## Validation completed

- **Backend build:** `cd backend && go build ./...` passed (zero external deps).
- **Frontend TypeScript:** `npx tsc --noEmit` passed for all modified files.
- **GCS health check:** `GET /api/gcs-health` returned `{ ok: true }` — confirmed read/write/delete access.
- **Upload + dedup:** Uploaded a test image via `POST /api/upload-input`; re-uploading the same image returned `{ duplicate: true }` without creating a new object.
- **List images:** `GET /api/user-images` correctly lists objects per category; validates category names; returns empty list for non-existent users.
- **End-to-end:** Try-on results for the real user (`user_393o0b5tH35nhDaMofldcbKBrgA`) were confirmed stored in `tryown-media/users/{user_id}/tryon/` with corresponding `info/` metadata files.

---

# Homepage Re-Scope: Marketplace + Try-On + Pose Transfer

## What changed

**Problem:** The homepage messaging had grown broad and included non-core narratives (community/forum, roadmap, brand-investor framing, profile-led promotion) that did not match the current product scope.

**Solution:** Rebuilt the homepage as a lean 5-section flow focused only on shipped value:

1. Hero
2. Problem framing
3. 3 product pillars
4. How it works
5. Final CTA

Copy and visual framing now center on three active surfaces only: **Marketplace**, **Virtual Try-On**, and **Pose Transfer**.

## Files modified

- **`frontend/src/app/page.tsx`** — Replaced long-form landing content with a minimalist 5-section page:
  - Hero with primary CTA **Try Marketplace** (`/gallery`) and secondary in-page anchor **See how it works**.
  - Minimal 3-card story visual (`Discover -> Try-On -> Pose Transfer`) without screenshots.
  - Problem section focused on shopping/fit-confidence fragmentation.
  - Exactly 3 pillars: Marketplace discovery, Virtual try-on, Pose transfer.
  - How-it-works sequence ending at pose transfer.
  - Final CTA with a single product-focused action to `/gallery`.
  - Removed non-core sections and copy for forum/community, roadmap/future vision, brand-growth cards, and profile demo CTA.

- **`frontend/src/app/layout.tsx`** — Aligned shell navigation and metadata to the same scope:
  - Updated metadata description to: `Marketplace discovery with virtual try-on and pose transfer.`
  - Header navigation now includes only **Home** and **Marketplace**.
  - Removed profile link and extra header CTA so the top nav stays core-only.

## Public behavior notes

- Route structure is unchanged: `/`, `/gallery`, `/profile` still exist.
- User-facing surface naming now prefers **Marketplace** while still routing to `/gallery`.
- Profile remains implemented but is no longer promoted on the homepage.

## Validation completed

- Content checks confirmed homepage copy no longer includes non-core narratives (forum/community/roadmap/profile-demo).
- CTA and anchor checks:
  - Hero primary CTA -> `/gallery`
  - Final CTA -> `/gallery`
  - Secondary CTA anchors to `#how-it-works`
- Frontend build command was run (`cd frontend && npm run build`) and failed due to a pre-existing unrelated issue:
  - `Module not found: Can't resolve '@/lib/supabase-server'` in `frontend/src/app/api/products/route.ts`.
