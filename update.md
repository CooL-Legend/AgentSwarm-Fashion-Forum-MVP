# Varun — GCS Bucket, Auth Fix, Model Fix, User Decode Fix

## What changed

### GCS `agent_swarm` bucket (Option A — pure GCS, no DB index)

- Created bucket `gs://agent_swarm` in `asia-south1` with UBLA + private access.
- Granted `roles/storage.objectAdmin` to `vton-app-account@…` service account.
- **`backend/gcs.go`** *(new)* — self-contained GCS helpers with no new Go dependencies:
  - `gcsUpload` / `gcsUploadBase64` — upload via GCS JSON API using existing service-account OAuth token.
  - `gcsList` — list objects by prefix (up to 500 results).
  - `gcsSignedURL` — V4 RSA-SHA256 signed GET URLs (1-hour TTL) implemented manually using the same `cleanPrivateKey` + `parseRSAPrivateKey` already used by the JWT signer.
  - `gcsDownload`, `gcsPublicURL` helpers.
- **`backend/api.go`** — three new endpoints + auto-save wired into existing handlers:
  - **`POST /api/upload-asset`** — uploads `kind=input` or `kind=pose` image for a user; returns `object_path` + `gs_uri`.
  - **`POST /api/upload-profile`** — upserts `users/{uid}/profile.md` (User.md).
  - **`GET /api/user-assets?user_id=&kind=`** — lists objects under `users/{uid}/` with V4 signed URLs attached.
  - `saveTryOnSession` goroutine — after a successful `/api/tryon`, writes `users/{uid}/input/*.png`, `users/{uid}/tryon/{sid}/result.png`, and `meta.json` to GCS in the background.
  - `savePoseTransferSession` goroutine — same pattern for `/api/pose-transfer`.
- **`backend/main.go`** — registered the three new routes.

### Clerk auth pages (sign-in / sign-up)

- Confirmed `@clerk/nextjs` installed, `ClerkProvider` wrapping layout, `SignedIn`/`SignedOut`/`UserButton` in header — already merged from Adi's branch.
- `frontend/src/middleware.ts` exists and protects `/profile`.
- `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` pages present.

### Gemini model name fix

- Default `GEMINI_MODEL` in `backend/main.go` corrected from `gemini-3.1-flash-image` (404) → `gemini-3.1-flash-image-preview`. The `-preview` suffix was missing, causing all pose-transfer calls to return `NOT_FOUND`.

### `user-temp` array-field decode fix

- **`backend/users_auth.go`** — `appUserProfile.Images` and all other `[]string` slice fields (`MajorBuys`, `SeasonalPreferences`, `ColorFamilies`, `ActivityProfiles`, `FitFrustrations`) changed from `[]string` to `imageURLList`. The `user-temp` table stores these as stringified JSON (`"[\"url\"]"` text columns), not native Postgres arrays. `imageURLList`'s custom `UnmarshalJSON` already handles both string and array forms, so all `/api/users` and `/api/users/bootstrap` calls that previously returned `500 — Failed to load user` now succeed.

## Files modified

- `backend/gcs.go` *(new)*
- `backend/api.go` — new endpoints + auto-save helpers
- `backend/main.go` — new routes + model default fix
- `backend/users_auth.go` — array field type fix

---

### DB-Backed User Input Images + Try-On Generations

### What changed

**Problem:** Try-on and pose-transfer assets were written to GCS only — `meta.json` sidecars were the only record of a generation. Re-uploading the same user photo silently duplicated it in GCS. Nothing was queryable via DB.

**Solution:** Shifted the storage architecture so that every uploaded user photo and every try-on result also becomes a Supabase row:

- **`user-input-images`** — one row per uploaded user photo, deduped on SHA-256 of the raw bytes. Written from `/api/upload-asset` when `kind == "input"`.
- **`tryon-generations`** — one row per successful try-on API call, referencing the input photo's GCS URL and the garment's `product_id`.

GCS remains the source of truth for image bytes (layout unchanged: `users/{uid}/input/*`, `users/{uid}/tryon/{sid}/result.png`, plus `meta.json` sidecar). DB rows store **full `https://storage.googleapis.com/agent_swarm/...` URLs** so the DB is self-describing.

Pose transfer DB writes are deferred until a `pose-generations` schema lands — `savePoseTransferSession` currently writes to GCS only.

### Tables used (already exist in Supabase)

Assumed columns on each table — any mismatch will surface loudly as a PostgREST 400 naming the bad column:

- `user-input-images`: `user_id` (text), `gcs_url` (text), `hash` (text), `view_type` (smallint, defaults to 1=front), `description` (text), plus auto `id` and `created_at`.
- `tryon-generations`: `user_id` (text), `product_id` (text), `gcs_url` (text), `person_image_url` (text), `description` (text), plus auto `id` and `created_at`.

### Files modified

- **`backend/sessions_db.go`** — Rewrote from the interim `insertTryonSession` helper to **`insertTryonGeneration`**. Targets the `tryon-generations` table with the column set above. Uses the existing Supabase REST pattern (`Prefer: return=minimal`).
- **`backend/user_images_db.go`** *(new)* — Three helpers against `user-input-images`:
  - `findUserInputImageByHash(userID, hash)` — GET with `user_id=eq.&hash=eq.&limit=1`; returns the existing row or nil.
  - `insertUserInputImage(payload)` — POST with `Prefer: return=representation` so the generated `id` flows back to the caller (needed for the async caption PATCH).
  - `updateUserInputImageDescription(id, description)` — PATCH by id, used by the async caption job.
- **`backend/caption.go`** *(new)* — `captionUserImage(ctx, cfg, mimeType, b64)` calls Vertex AI Gemini (same OAuth + `GEMINI_MODEL` as `poseTransferHandler`, no new env vars). Prompts the model for compact JSON `{ "description": "..." }` and tolerates fenced code blocks in the reply.
- **`backend/gcs.go`** — Added `gcsPublicURL(objectPath)` helper returning `https://storage.googleapis.com/agent_swarm/{path}` so the same URL format is used everywhere a DB row references a GCS object.
- **`backend/api.go`** — Three touch-points:
  - **`/api/upload-asset`** — when `kind == "input"`: SHA-256 the raw bytes, check `user-input-images` for an existing `(user_id, hash)` match. On hit, short-circuit and return the stored `gcs_url` with `duplicate: true` (no GCS upload). On miss, upload to GCS, insert the row with `view_type: 1`, and spawn a goroutine that captions the image via Gemini and PATCHes the `description`. `kind == "pose"` path is unchanged (GCS-only).
  - **`saveTryOnSession`** — swapped the old `insertTryonSession` call for **`insertTryonGeneration`**, passing `product_id` (= `garmentID`), full `gcs_url` (= result URL), and `person_image_url` (= input URL). The `meta.json` GCS sidecar is still written for legacy walkers.
  - **`savePoseTransferSession`** — removed the DB call; left a `// TODO: insert into pose-generations when the schema lands` marker. `meta.json` sidecar still written.

### Behavior notes

- **Dedup semantics:** Hash is over the raw decoded image bytes (not the base64 string), so the same photo re-uploaded via a different browser, a different data-URL wrapper, or a different session still hits the dedup index on `(user_id, hash)`.
- **Dedup-hit response:** `/api/upload-asset` returns `{ duplicate: true, id, gcs_url, object_path, gs_uri }` without re-uploading to GCS.
- **Caption latency:** Caption job runs in a goroutine with a 45s timeout. The upload response returns immediately with `description` still null in the row; a subsequent fetch picks up the populated description (~3-5s typical).
- **No API surface changes** for `/api/tryon` or `/api/pose-transfer` — existing handlers already call the save helpers.

### Retired

- The interim `tryon-sessions` table (added earlier this session) is no longer referenced by any code path. Drop it from Supabase at your convenience.

### Validation completed

- **Backend build:** `cd backend && go build ./...` passed.
- **End-to-end (pending manual run):**
  1. Upload a new photo via `/api/upload-asset` with `kind=input` → expect a new row in `user-input-images` with `description` null, then re-fetch ~3-5s later to see the populated description.
  2. Re-upload the same photo → expect `duplicate: true` in the response and no new GCS object.
  3. Trigger a try-on from the gallery → expect a row in `tryon-generations` with full `https://storage.googleapis.com/agent_swarm/...` URLs in `gcs_url` and `person_image_url` and `product_id` matching the garment.

---

## Merge Conflict Resolution + Next.js 16 Proxy Migration

### What changed

**Problem:** The local `adi` branch had an incomplete merge (commit `e738358`) that left raw conflict markers in 10 files across backend and frontend, breaking both `go build` and `npm run dev` (JSON parse error on `package.json`). Separately, Next.js 16 deprecated the `middleware` file convention in favor of `proxy`, and both files were present, causing a startup crash.

**Solution:** Resolved every conflict by keeping the incoming `origin/adi` (`>>>>>>> 0c25ba1...`) side, regenerated the lockfile, and removed the deprecated `middleware.ts` so only `proxy.ts` remains.

### Files modified

- **`backend/gcs.go`** — Replaced HEAD's configurable `cfg.GCSBucket` + user-folder helpers with the origin/adi version: hardcoded `gcsBucket = "agent_swarm"`, `gcsUpload` returns `error` only (mimeType before data), added `gcsUploadBase64`, `gcsDownload`, `gcsList`, `gcsSignedURL` (V4 RSA-SHA256 signing) plus helpers `canonicalV4Query`, `v4Escape`, `pathEscapeGCS`, `rsaSignSHA256`. Dropped HEAD-only `gcsHealthHandler`, `gcsUploadInputHandler`, `gcsListUserImagesHandler`.
- **`backend/api.go`** — 3 conflict regions resolved:
  - `tryOnRequest` struct: added `GarmentID string` field.
  - `tryOnHandler`: replaced inline GCS storage block with single `saveTryOnSession(...)` call.
  - `poseTransferHandler`: replaced inline GCS storage block with single `savePoseTransferSession(...)` call.
- **`backend/main.go`** — Replaced HEAD handlers (`/api/gcs-health`, `/api/upload-input`, `/api/user-images`) with origin/adi handlers (`/api/upload-asset`, `/api/upload-profile`, `/api/user-assets`).
- **`frontend/src/app/layout.tsx`** — Switched to incoming Clerk imports (`Show`, `SignInButton`, `SignUpButton`, `UserButton`), moved `ClerkProvider` outside `<html>`, replaced "FashionHub" branding with "inspirationboard" and Clerk's modal auth UI. Removed server-side `auth()` call since signed-in/out state now comes from `<Show>`.
- **`frontend/src/app/sign-in/[[...sign-in]]/page.tsx`** — Reverted to simple centered `<SignIn />` without custom theme variables.
- **`frontend/src/app/sign-up/[[...sign-up]]/page.tsx`** — Reverted to simple centered `<SignUp />` without custom theme variables.
- **`frontend/src/app/components/TryOnResultModal.tsx`** — Removed `userId` prop; sources user via `useUser()` hook from Clerk. Always sends `user_id: user?.id` in pose-transfer requests.
- **`frontend/src/app/components/GalleryView.tsx`** — Removed duplicate `useUser` import and duplicate `const { user } = useUser()` declaration. `startTryOn` now passes `garmentImageUrl: tryOnImage.imageUrl`, `userId: user?.id`, and `garmentId: tryOnImage.garmentId`.
- **`frontend/src/app/hooks/useTryOnTask.ts`** — Added optional `garmentId` to `TryOnTaskInput`; always sends `user_id` and `garment_id` in `/api/tryon` body.
- **`frontend/package-lock.json`** — Deleted and regenerated via `npm install --prefix frontend` since lockfile merges are error-prone.
- **`frontend/src/middleware.ts`** *(removed)* — Deprecated Next.js 16 convention. Routes now protected via `frontend/src/proxy.ts` only (which has the broader `/gallery`, `/profile`, `/onboarding` matcher).
- **`backend/fashion-forum-backend`** *(removed)* — Stale binary with conflict markers baked into compiled strings; rebuilt clean.

### Validation completed

- **Backend build:** `cd backend && go build .` passed.
- **Frontend type check:** `npx tsc --noEmit` passed.
- **Conflict marker sweep:** `grep -rn "<<<<<<" backend/ frontend/src/ frontend/package*.json` returned zero matches in source files.
- **Dev server:** `npm run run_frontend` no longer crashes with the middleware/proxy collision error.

---

## Header Profile Tab (Authenticated Users)

### What changed

**Problem:** The top navigation did not include a direct path to the existing profile page for signed-in users.

**Solution:** Added a `Profile` tab to the shared header navigation, rendered only when a Clerk-authenticated user is present.

### Files modified

- **`frontend/src/app/layout.tsx`**
  - Kept `Home` and `Marketplace` links unchanged.
  - Added conditional `Profile` link (`/profile`) shown only when `userId` exists.
  - Kept signed-out behavior unchanged (`Sign in` button visible, no `Profile` tab).

### Validation completed

- **Frontend build:** `cd frontend && npm run build` passed.

---

## Clerk Google Sign-In + Onboarding on `user-temp`

### What changed

**Problem:** User identity and preferences were not authenticated end-to-end, onboarding was not enforced for new users, and profile reads/writes were tied to old hardcoded `users` flow.

**Solution:** Added Clerk auth (Google-enabled sign-in/up), enforced authenticated user bootstrap + onboarding gate, and moved user profile/onboarding persistence to Supabase `public."user-temp"` as the active user source.

### Files modified

- **`backend/main.go`**
  - Added `CLERK_SECRET_KEY` config support.
  - Switched `GET /api/users` to authenticated current-user lookup.
  - Added:
    - `POST /api/users/bootstrap`
    - `PATCH /api/users/onboarding`
- **`backend/users_auth.go`** *(new)*
  - Implemented Clerk bearer-token verification via JWKS.
  - Added authenticated user handlers for bootstrap, current user, and onboarding updates.
  - Added server-side onboarding validation for:
    - basic profile (`first_name`, `last_name`, `username`, `age`, `sex`)
    - onboarding fields (`occupation`, measurements, style prefs, fit frustrations, etc.)
  - Writes/reads only against Supabase path `user-temp`.
- **`backend/api.go`**
  - Enabled `PATCH` in CORS preflight.
  - Removed legacy hardcoded `usersHandler` implementation tied to `rest/v1/users`.
- **`backend/sql/2026-04-16_user_temp_onboarding.sql`** *(new)*
  - Added onboarding/profile columns on `public."user-temp"`:
    - scalar: `age`, `occupation`, measurement fields, `visual_language`, `tshirt_fit`, `jeans_fit`
    - arrays: `major_buys`, `seasonal_preferences`, `color_families`, `activity_profiles`, `fit_frustrations`
    - flags/meta: `onboarding_skipped`, `onboarding_completed_at`, `onboarding_skipped_at`, `onboarding_version`
- **`frontend/src/proxy.ts`** *(new; Next.js 16 proxy replacement)*
  - Added Clerk route protection for `/gallery`, `/profile`, and `/onboarding`.
- **`frontend/src/app/layout.tsx`**
  - Wrapped app in `ClerkProvider`.
  - Metadata updated to marketplace + try-on + pose-transfer scope.
  - Header kept minimal with core nav (`Home`, `Marketplace`) and signed-out `Sign in`.
- **`frontend/src/app/sign-in/[[...sign-in]]/page.tsx`** *(new)*
- **`frontend/src/app/sign-up/[[...sign-up]]/page.tsx`** *(new)*
  - Added styled Clerk auth entry pages with redirect to `/gallery`.
- **`frontend/src/app/onboarding/page.tsx`** *(new)*
  - Added 4-step onboarding flow with:
    - Step 1: `first_name`, `last_name`, `username`, `age`, identity, visual language
    - Step 2: occupation + body measurements
    - Step 3: buying/season/fit/color/activity preferences
    - Step 4: fit frustrations + review
  - Added **Skip for now** behavior (`onboarding_skipped=true`).
  - Added submit behavior (`onboarding_completed=true`).
- **`frontend/src/lib/user-types.ts`**
  - Extended `UserProfile` with onboarding columns.
  - Added shared `OnboardingAnswers` DTO.
- **`frontend/src/app/components/GalleryView.tsx`**
- **`frontend/src/app/components/ProfileView.tsx`**
  - Added auth-aware bootstrap + user load.
  - Redirects incomplete users to `/onboarding`.
- **`frontend/src/lib/supabase-server.ts`** *(new)*
  - Added missing server Supabase helper used by frontend API routes.

### Behavior changes

- New authenticated users are bootstrapped into `user-temp`.
- Incomplete users are redirected to `/onboarding`.
- Skipped/completed users continue to `/gallery`.
- `/api/users` now returns the **currently authenticated Clerk user** (no hardcoded user).

### Validation completed

- **Backend build:** `cd backend && go build ./...` passed.
- **Frontend build:** `cd frontend && npm run build` passed.

---

## Gender-Based Product Filtering

### What changed

**Problem:** The gallery showed all products regardless of the user's gender, displaying irrelevant items (e.g. women's clothing for a male user).

**Solution:** Added gender-based filtering to the products API. On gallery load, the user's `sex` field is fetched from the profile, mapped to the product gender convention (`male` -> `men`, `female` -> `women`), and passed as a query parameter. The backend filters products using a case-insensitive match to handle inconsistent DB casing (`Men`, `men`, `MAle`, etc.).

### Files modified

- **`backend/api.go`** — Added `gender` query param to `productsHandler`; applies PostgREST `ilike` filter for case-insensitive matching.
- **`frontend/src/app/api/products/route.ts`** — Added `gender` query param support with Supabase `.ilike("gender", gender)` filter.
- **`frontend/src/app/components/GalleryView.tsx`** — Fetches user profile on mount to resolve gender; maps `sex` values (`male`/`female`) to product gender values (`men`/`women`); passes gender param to products API; gates product fetching until gender is resolved. Reads from `data.user.sex` to match the `{ user: { ... } }` response shape.
- **`frontend/src/lib/gallery-types.ts`** — Added `gender: string | null` to `ProductCardItem`.

### Notes

- If the user has no gender set, all products are shown (no filter applied).
- The mapping handles the mismatch between user `sex` values (`male`/`female`) and product `gender` values (`Men`/`Women`).

---

## Product Metadata + Card UI Refresh

### What changed

**Problem:** Gallery cards only surfaced a product title, and `/api/products` did not return brand or price fields needed for a richer storefront-style card.

**Solution:** Extended the frontend product model and products API response to include `brand` and `price`, then updated card presentation to show brand/title/price persistently with a cleaner selected state indicator.

### Files modified

- **`frontend/src/app/api/products/route.ts`** — Expanded Supabase select to `id,image_url,title,brand,price,created_at`; mapped `brand` as nullable string and `price` as nullable number.
- **`frontend/src/lib/gallery-types.ts`** — Added `brand` and `price` to `ProductCardItem`.
- **`frontend/src/app/components/ProductCard.tsx`** — Refactored card UI:
  - Added INR price formatter (`Intl.NumberFormat`).
  - Switched to a fixed 4:5 media area with persistent metadata section.
  - Displayed optional brand label and optional price text.
  - Kept selection behavior but moved to a stronger top-right check badge.
- **`frontend/src/app/components/GalleryView.tsx`** — Updated loading skeleton card height from `300px` to `360px` to better match new card proportions during fetch states.

### Notes

- This update is frontend-only and does not change backend Go handlers.
- Existing gallery selection/lightbox flow remains intact; this pass focuses on metadata flow + visual card polish.

---

## Backend-Only Refactor + Canonical Frontend Move

### What changed

**Problem:** The repo had two frontend source trees (`src/` and `frontend/src/`) and backend logic split across Next.js route handlers and Go handlers, which caused drift and build/runtime confusion.

**Solution:** Consolidated to a single frontend source tree (`frontend/src`) and moved all runtime backend APIs/services into the Go backend. Frontend now renders UI only and calls Go APIs directly through `NEXT_PUBLIC_BACKEND_API_BASE_URL`.

### Files modified

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

### Files removed / migrated

- **Removed frontend Next API routes:** `frontend/src/app/api/*` (products/scrape/tryon).
- **Retired old root frontend tree:** `src/app/*` and `src/lib/*`.
- **Canonical frontend location is now:** `frontend/src/app` and `frontend/src/lib`.

### Validation completed

- **Backend build:** `cd backend && go build ./...` passed.
- **Frontend build:** `cd frontend && npm run build` passed.
- **Root wrapper build:** `npm run build` passed (delegates to frontend).
- **Backend smoke tests (localhost):**
  - `GET /api/products` -> 200
  - `GET /api/users` -> 200
  - `POST /api/tryon`, `POST /api/pose-transfer`, `POST /api/generate-video` -> correct validation/error responses for test payloads
  - `POST /api/scrape` reached backend path and returned upstream/fallback error shape as expected for test URL.

---

## Multi-Image Product Support

### What changed

**Problem:** The app only displayed a single `image_url` per product, ignoring the `all_image_urls` array column in the database.

**Solution:** Products now fetch and render all available images with carousel navigation.

### Files modified

- **`src/lib/gallery-types.ts`** — Added `all_image_urls` field to `ProductCardItem` and a `resolveImages()` helper that falls back to `[image_url]` when the array is empty/null.
- **`src/app/api/products/route.ts`** — Added `all_image_urls` to the Supabase select query and response mapping.
- **`backend/api.go`** — Added `AllImageURLs` to Go product structs and the Supabase REST query.
- **`src/app/components/ProductCard.tsx`** *(new)* — Extracted card rendering into its own component with a per-card image carousel: left/right chevrons on hover, dot indicators, and isolated state so cycling images only re-renders that card.
- **`src/app/components/GalleryView.tsx`** — Replaced inline card markup with `<ProductCard>`. Lightbox now receives `initialIndex` from the card's active image.
- **`src/app/components/GalleryLightbox.tsx`** — Added multi-image navigation: left/right arrow buttons, keyboard arrow keys, image counter ("2 / 5"), and adjacent image preloading.

### No changes needed

- `TryOnModal` and `GarmentInput` — they already work with a single selected image URL, which the caller now passes from the active carousel image.

---

## Background Try-On with Notification

### What changed

**Problem:** The virtual try-on feature blocked the user in a full-screen modal for 10-20 seconds while Google Vertex AI processed the image. Users could not browse the gallery during this time.

**Solution:** Try-on now runs in the background. After submitting, the modal closes and a floating notification tracks progress. When the result is ready, the notification pings and offers a "View" button to open the result.

### Files created

- **`src/app/hooks/useTryOnTask.ts`** — Custom hook that owns the background try-on state and fetch logic. Manages `processing` / `done` / `error` status, uses `AbortController` for cancellation if a new try-on starts, and cleans up on unmount.
- **`src/app/components/TryOnNotification.tsx`** — Floating pill fixed at bottom-right of the viewport. Shows an amber spinner while processing, switches to an emerald "Try-on ready!" pill with a ping animation on success, or a red error state with a dismiss button on failure.
- **`src/app/components/TryOnResultModal.tsx`** — Lightweight 3-column result viewer (person | garment | result) with a download button. Opens when the user clicks "View" on the notification.

### Files modified

- **`src/app/components/TryOnModal.tsx`** — Added optional `onTryOnSubmit` prop. When provided, clicking "Try On" delegates the API call to the parent and closes the modal immediately instead of blocking with a spinner.
- **`src/app/components/GalleryView.tsx`** — Wired the `useTryOnTask` hook, passes `onTryOnSubmit` to `TryOnModal`, renders `TryOnNotification` and `TryOnResultModal`. One new state variable (`showTryOnResult`).
- **`src/app/globals.css`** — Added `slideUp` and `ping-once` keyframe animations for the notification entry and success ping.

### No changes needed

- API routes (`/api/tryon`) — the endpoint is unchanged; only the client-side calling pattern moved from inside the modal to the background hook.
- `GarmentInput`, `GalleryLightbox`, `ProductCard` — unaffected.

---

## User Profile Page

### What changed

**Problem:** Users had no way to view their own profile information or showcase their visual content.

**Solution:** Added a complete profile page that displays user information, hero visuals, contact details, and a visual gallery of their uploaded images.

### Files created

- **`src/app/api/users/route.ts`** — New API route that fetches user profile data from Supabase by first/last name (hardcoded for Aditya Bhandari).
- **`src/app/components/ProfileView.tsx`** — Main profile page component with loading states, error handling, and skeleton UI.
- **`src/app/components/ProfileHeader.tsx`** — Profile header with avatar, name, username, bio, and action buttons (share/edit).
- **`src/app/components/HeroVisuals.tsx`** — Hero section displaying front/back profile images in a grid layout.
- **`src/app/components/InformationGrid.tsx`** — Contact details and stats grid with icons for email, location, phone, gender, height.
- **`src/app/components/VisualGallery.tsx`** — Image gallery component showing user's uploaded images with overflow indicator.
- **`src/app/profile/page.tsx`** — Profile page route with dynamic rendering.
- **`src/lib/user-types.ts`** — TypeScript interface defining the UserProfile structure.

### Files modified

- **`src/app/layout.tsx`** — Added Manrope font import and profile navigation link in header.
- **`backend/api.go`** — Added clarifying comment about Google Vertex AI virtual try-on model.

---

## Pose Transfer Module

### What changed

**Problem:** After a virtual try-on, the result image was locked to the original person's pose. Users had no way to see how the garment would look in a different pose (e.g. walking, arms raised, sitting).

**Solution:** Added an optional pose transfer step after try-on. Users paste a URL to a pose reference image, and the system uses Gemini 3.1 Flash Image Preview to generate a new image preserving the person's identity and garment from the try-on result but adopting the pose from the reference image.

### Files created

- **`src/app/api/pose-transfer/route.ts`** — New API route that accepts the try-on result image (base64) and a pose reference URL. Fetches the pose image server-side, sends both images with a detailed pose transfer prompt to the Gemini `generateContent` API, parses the response for the generated image, and returns it as a data URL. Uses the same conventions as the tryon route (60s max duration, 50s abort timeout, consistent error shape).

### Files modified

- **`src/app/components/TryOnResultModal.tsx`** — Added pose transfer UI to the background try-on result modal. After viewing a completed try-on, a "Pose Transfer" section appears below the 3-column grid with a URL input and "Transfer Pose" button. The Result column toggles between the original try-on and pose-transferred output via a pill switcher. Download button dynamically points to whichever result is currently displayed. Error state shown inline.
- **`src/app/components/TryOnModal.tsx`** — Added the same pose transfer UI in the inline try-on result view, with matching state, handler, toggle, and download behavior. "Try Another" resets all pose state.

### No changes needed

- API routes (`/api/tryon`) — the try-on endpoint is unchanged; pose transfer is a separate downstream step.
- `TryOnNotification`, `GalleryView` — unaffected.
- `.env` — `GEMINI_API_KEY` and `GEMINI_MODEL` were already configured.

---

## Google Cloud Storage Integration

### What changed

**Problem:** All try-on and pose transfer images were processed entirely in-memory as base64 strings and never persisted. Users had no way to retrieve past results, and there was no per-user storage for uploaded images.

**Solution:** Integrated Google Cloud Storage (bucket: `tryown-media`) using raw HTTP calls to the GCS JSON API. Each user gets a folder structure in the bucket, and all images (inputs, try-on results, pose transfers) are automatically stored when a `user_id` is present. Reuses the existing Google service account OAuth flow (`getAccessToken`) — no new credentials or SDK dependencies needed.

### Per-user folder structure

```
tryown-media/users/{user_id}/
  ├── input/{input_id}.png        # user-uploaded source images
  ├── tryon/{tryon_id}.png        # generated try-on outputs
  ├── pose/{pose_id}.png          # pose transfer outputs
  ├── info/{image_id}.txt         # metadata file per image
  └── profile.md                  # auto-created on first interaction
```

### Files created

- **`backend/gcs.go`** — All GCS logic (~450 lines):
  - **GCS operations:** `gcsUpload`, `gcsRead`, `gcsDelete`, `gcsListPrefix` — raw HTTP calls to `storage.googleapis.com` JSON API with bearer token auth.
  - **Helpers:** `generateImageID` (timestamp + random hex), `decodeBase64Image` (strips data URL prefix + decodes), `contentTypeToExt`, `gcsObjectPath`, `gcsUserPrefix`.
  - **User management:** `gcsCheckAccess` (write/read/delete health check), `gcsInitUserFolder` (creates `profile.md` on first interaction), `gcsWriteInfoFile` (creates `info/{id}.txt` metadata per image).
  - **Duplicate detection:** Upload-input handler compares incoming image size against existing `input/` objects; skips re-upload if a match is found.
  - **HTTP handlers:**
    - `GET /api/gcs-health` — verifies read/write/delete access to the bucket.
    - `POST /api/upload-input` — stores user-uploaded images in `input/`, creates corresponding `info/{id}.txt`, detects duplicates.
    - `GET /api/user-images?user_id=xxx&category=tryon` — lists stored objects for a user, filterable by category (`input`, `tryon`, `pose`, `info`).

### Files modified

- **`backend/main.go`** — Added `GCSBucket` and `GCSBasePath` fields to `AppConfig`; loads from `GCS_BUCKET` and `GCS_BASE_PATH` env vars; registered three new routes (`/api/gcs-health`, `/api/upload-input`, `/api/user-images`).
- **`backend/api.go`** — Modified `tryOnHandler` and `poseTransferHandler`:
  - Added `user_id` field to `tryOnRequest` and `poseTransferRequest` structs.
  - Added `stored_path` and `stored_url` fields to `tryOnResponse`.
  - After successful image generation, if `user_id` is present, the result is synchronously uploaded to GCS (`tryon/` or `pose/` folder), an `info/{id}.txt` is written in the background, and `stored_path`/`stored_url` are included in the API response.
- **`frontend/src/app/hooks/useTryOnTask.ts`** — Extended `TryOnTaskInput` with optional `userId`; sends `user_id` in the request body when present; surfaces `storedPath` and `storedUrl` from the response in `TryOnTask` state.
- **`frontend/src/app/components/TryOnResultModal.tsx`** — Accepts optional `userId` prop; passes `user_id` in the pose-transfer fetch call so pose results are stored to GCS.
- **`frontend/src/app/components/GalleryView.tsx`** — Extracts `user_id` from the `/api/users` response and stores it in component state; passes it to `startTryOn` and `TryOnResultModal` so all generated images are automatically persisted.
- **`.env`** — Added `GCS_BUCKET=tryown-media` and `GCS_BASE_PATH=` (empty, files go directly under `users/` in the bucket root).

### Design decisions

- **No SDK, raw HTTP:** The GCS JSON API is called directly via `net/http`, consistent with the existing Vertex AI and Gemini integrations. Keeps the backend at zero external Go dependencies.
- **PNG format:** Images are stored in their native format (PNG from Vertex AI, PNG/JPEG from Gemini). No WebP conversion — avoids CGo/platform-dependent dependencies.
- **Synchronous upload:** GCS upload completes before the API response is sent (~200-500ms overhead on top of 10-55s generation time). Storage URL is returned in the response. Upload failure is logged but never blocks the image result.
- **Automatic storage:** No opt-in toggle — images are stored whenever a `user_id` is present in the request. The frontend sends `user_id` automatically when the user profile is loaded.
- **Duplicate detection:** Input image uploads are checked against existing files by size; duplicates return the existing object path without re-uploading.

### Validation completed

- **Backend build:** `cd backend && go build ./...` passed (zero external deps).
- **Frontend TypeScript:** `npx tsc --noEmit` passed for all modified files.
- **GCS health check:** `GET /api/gcs-health` returned `{ ok: true }` — confirmed read/write/delete access.
- **Upload + dedup:** Uploaded a test image via `POST /api/upload-input`; re-uploading the same image returned `{ duplicate: true }` without creating a new object.
- **List images:** `GET /api/user-images` correctly lists objects per category; validates category names; returns empty list for non-existent users.
- **End-to-end:** Try-on results for the real user (`user_393o0b5tH35nhDaMofldcbKBrgA`) were confirmed stored in `tryown-media/users/{user_id}/tryon/` with corresponding `info/` metadata files.

---

## Homepage Re-Scope: Marketplace + Try-On + Pose Transfer

### What changed

**Problem:** The homepage messaging had grown broad and included non-core narratives (community/forum, roadmap, brand-investor framing, profile-led promotion) that did not match the current product scope.

**Solution:** Rebuilt the homepage as a lean 5-section flow focused only on shipped value:

1. Hero
2. Problem framing
3. 3 product pillars
4. How it works
5. Final CTA

Copy and visual framing now center on three active surfaces only: **Marketplace**, **Virtual Try-On**, and **Pose Transfer**.

### Files modified

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

### Public behavior notes

- Route structure is unchanged: `/`, `/gallery`, `/profile` still exist.
- User-facing surface naming now prefers **Marketplace** while still routing to `/gallery`.
- Profile remains implemented but is no longer promoted on the homepage.

### Validation completed

- Content checks confirmed homepage copy no longer includes non-core narratives (forum/community/roadmap/profile-demo).
- CTA and anchor checks:
  - Hero primary CTA -> `/gallery`
  - Final CTA -> `/gallery`
  - Secondary CTA anchors to `#how-it-works`
- Frontend build command was run (`cd frontend && npm run build`) and failed due to a pre-existing unrelated issue:
  - `Module not found: Can't resolve '@/lib/supabase-server'` in `frontend/src/app/api/products/route.ts`.
