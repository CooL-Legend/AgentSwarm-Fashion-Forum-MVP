# TRY-OWN Onboarding v2 — Schema Consolidation, 3-Phase Wizard, Authed Image Endpoints

## What changed

**Problem:** The deployed Supabase DDL had consolidated the user profile onto `public.users` (PK `id`, `gender_identity`, `date_of_birth`) and added `public.user_input_images`, but backend code still read/wrote `public."user-temp"` with `user_id`/`sex`/`age` columns. Onboarding was a 4-step single-PATCH wizard with no image upload. `/api/upload-asset` and `/api/user-assets` accepted a `user_id` body/query param with no Clerk auth — a user could read or write another user's assets. `onboarding_completed` and `onboarding_skipped` were treated as mutually exclusive, blocking the v2 semantics where a user completes required+images and then skips only the optional phase.

**Solution:** Migrated all user profile reads/writes to `public.users`, restructured onboarding as three persisted phases (required → images → optional), enforced Clerk JWT on image endpoints, and decoupled the completed/skipped flags with an invariant check. Clerk webhooks and account deletion were intentionally deferred — self-heal via `bootstrapUserHandler` still covers provisioning.

### Schema + DB helpers

- **`backend/users_db.go`** *(removed)* — legacy single-helper file targeting the pre-consolidation `public.users` shape with `user_id` PK. Obsolete after the DDL redeploy.
- **`backend/users_auth.go`** — constant `userTempTablePath = "user-temp"` → `usersTablePath = "users"`. Helpers renamed and retargeted:
  - `userTempEndpoint` → `usersTableEndpoint`
  - `fetchUserTempByID` → `fetchUserByID` (now filters `deleted_at=is.null`, queries `id=eq.`)
  - `upsertUserTemp` → `upsertUser`, `upsertUserTempWithConflict` → `upsertUserWithConflict` (`on_conflict=id`)
  - `updateUserTempByID` → `updateUserByID`, `insertUserTemp` → `insertUser`
- All payloads now key on `"id"` instead of `"user_id"`, `"gender_identity"` instead of `"sex"`, `"date_of_birth"` instead of `"age"`, `"email"` instead of `"email_id"`.

### `appUserProfile` struct (`backend/users_auth.go`)

Renamed to match `public.users` columns: `UserID` → `ID`, `Sex` → `GenderIdentity`, replaced `Age` with `DateOfBirth`, added `Email`, `ClerkImageURL`, `AuthProvider`, `PhoneVerified`, `DeletedAt`. `EmailID` kept as legacy-only `omitempty` field for transitional compatibility.

### Phase-based `onboardingUserHandler`

Accepts `{ phase: "required" | "images_done" | "optional_save" | "optional_skip" }`:

- **`required`** — validates `username`, `date_of_birth` (ISO-8601, age 10–120), `gender_identity`, `visual_language`; persists those fields but does **not** flip `onboarding_completed`.
- **`images_done`** — calls the new `countUserInputImages` helper; rejects with 400 if the user has 0 rows in `user_input_images`; otherwise sets `onboarding_completed=true`.
- **`optional_save`** — writes optional profile fields; leaves flags alone.
- **`optional_skip`** — sets `onboarding_skipped=true`. Enforces the invariant `completed=true` before allowing skip (cannot end up in the illegal `completed=false, skipped=true` state).

Legacy `{ skip: true }` and empty-phase clients are mapped to `optional_skip` / `optional_save` with the prior single-PATCH semantics so the old 4-step wizard keeps working during rollout.

`validateRequiredOnboarding` now parses `date_of_birth` instead of checking `Age`, and validates `gender_identity` instead of `sex`. New `applyRequiredFields` helper writes only the Phase-1 subset.

### `countUserInputImages` helper (`backend/user_images_db.go`)

New `countUserInputImages(ctx, cfg, userID)` returns the number of rows in `user_input_images` for a user. Uses PostgREST `Prefer: count=exact` with `Range: 0-0` to avoid pulling the full row set. Called from the `images_done` phase and from the 5-image cap check in `uploadAssetHandler`.

### Authed image endpoints (`backend/api.go`)

- **`uploadAssetHandler`** — now calls `authenticatedClerkUserID` on entry and 401s on failure. Body `user_id` is ignored; the Clerk sub is authoritative. Added: 5MB size cap, mime allowlist (`image/jpeg`, `image/png`, `image/webp`), per-user 5-image cap via `countUserInputImages` (dedup hits don't count).
- **`userAssetsHandler`** — now calls `authenticatedClerkUserID`; query `user_id` is ignored. Users can only list their own assets.
- New constant `maxInputImagesPerUser = 5`.

### Route aliases (`backend/main.go`)

Registered `/api/images` (GET → `userAssetsHandler`) and `/api/images/upload` (POST → `uploadAssetHandler`) alongside the legacy `/api/user-assets` and `/api/upload-asset`. The frontend uses the new paths; legacy remain for one release cycle.

### GCS bucket rename (`backend/gcs.go`)

- `const gcsBucket = "agent_swarm"` → `"refleckt-media"` (separate bucket, multi-region `asia`; note the `ck` spelling — see the follow-up section below for the diagnosis). All helpers (`gcsPublicURL`, `gcsUpload`, `gcsSignedURL`, etc.) pick up the new name via the constant. Per-user folder layout under the bucket is unchanged. Existing try-on/pose paths stay under `gs://agent_swarm/users/...` for now since their DB rows already reference that bucket — only new onboarding input uploads land in `refleckt-media`.

### Frontend

- **`frontend/src/lib/user-types.ts`** — `UserProfile` renamed: `user_id` → `id`, `sex` → `gender_identity`, `age` → `date_of_birth`, `email_id` → `email`; added `clerk_image_url`, `auth_provider`. Split `OnboardingAnswers` into `OnboardingRequiredFields` (username, date_of_birth, gender_identity, visual_language) and `OnboardingOptionalFields` (everything else).
- **`frontend/src/app/onboarding/page.tsx`** *(rewritten)* — 4-step wizard replaced with a 3-phase state machine:
  - **Phase 1**: single-page required form.
  - **Phase 2**: drag-drop / file picker up to 5 images, uploads immediately via `POST /api/images/upload` (multipart-free, base64 JSON body consistent with existing handler), polls `GET /api/images` every 3s while any upload is in-flight, Continue disabled until ≥1 image.
  - **Phase 3**: optional fields + measurements with **Save Preferences** and **Skip for now** buttons.
  - On mount, resolves starting phase from server state (null required fields → Phase 1; no images → Phase 2; else Phase 3). Users who already have `onboarding_completed=true` are redirected straight to `/gallery`.
- **`frontend/src/app/components/ProfileView.tsx`** — Bootstrap body now sends `email` (not `email_id`). Completion gate tightened from `(completed || skipped)` to `completed` alone.
- **`frontend/src/app/components/GalleryView.tsx`** — Same gate change; reads `appUser.id` instead of `appUser.user_id`; reads `gender_identity` instead of `sex` for the gender-filtered product feed.
- **`frontend/src/app/components/InformationGrid.tsx`** — Display fields updated (`user.email`, `user.gender_identity`, height derived from `user.height_cm`).
- **`frontend/src/app/hooks/useImageEnrichment.ts`** — Now pulls a Clerk token via `useAuth().getToken()` and sends `Authorization: Bearer` on `/api/upload-asset`; stopped sending `user_id` in the body.

## Scope explicitly deferred

Per user direction to keep the delta minimal:

- Clerk webhooks (`/api/webhooks/clerk`) — self-heal via `bootstrapUserHandler` still covers provisioning.
- Account deletion + 30-day hard-delete job + `DELETE /api/users`.
- Dropping the `user-temp` table (leave in place until prod soak confirms nothing reads it).
- `onboarding_step` resume column (resume is inferred from which required fields are null).
- Signed upload URLs (Pattern B) — backend-mediated uploads are sufficient at current scale.

## Files modified

- `backend/gcs.go` — bucket rename
- `backend/users_auth.go` — struct, handlers, validator, helpers retargeted to `public.users`; phase-based onboarding
- `backend/users_db.go` *(removed)*
- `backend/user_images_db.go` — added `countUserInputImages`
- `backend/api.go` — JWT auth on upload + list handlers, 5MB/mime/5-image caps
- `backend/main.go` — registered `/api/images` and `/api/images/upload` aliases
- `frontend/src/lib/user-types.ts` — field renames, split types
- `frontend/src/app/onboarding/page.tsx` — 3-phase rewrite
- `frontend/src/app/components/ProfileView.tsx` — email rename + gate tightening
- `frontend/src/app/components/GalleryView.tsx` — `id` / `gender_identity` reads, gate tightening
- `frontend/src/app/components/InformationGrid.tsx` — display field renames
- `frontend/src/app/hooks/useImageEnrichment.ts` — Bearer auth, no more `user_id` in body

## Validation completed

- **Backend build:** `cd backend && go build ./...` passed.
- **Frontend type check:** `cd frontend && npx tsc --noEmit` passed.

## End-to-end tests (pending manual run)

- New Clerk sign-up → `/onboarding` Phase 1 → row in `public.users` with `date_of_birth`, `gender_identity`, `visual_language` populated and `onboarding_completed=false`.
- Phase 2 with 0 images → Continue rejected with 400 "at least one image is required"; with 1 image → advance flips `onboarding_completed=true`; 6th upload → 400 "image limit reached (max 5)".
- Phase 3 "Skip for now" → `onboarding_skipped=true` while `onboarding_completed` stays `true`; redirect to `/gallery`.
- `curl -X POST /api/images/upload` without Bearer → 401; with a Bearer for user A and `user_id: "user_B"` in the body → row written under user A's id, not B's.
- `SELECT id FROM users WHERE onboarding_completed=false AND onboarding_skipped=true` returns 0 rows.
- New upload lands at `gs://refleckt-media/users/{uid}/input/{image_uuid}.{ext}`.

---

# v2 Onboarding — Follow-up Fixes (post-merge)

## What changed

A set of corrections discovered while running the v2 onboarding end-to-end against the real Supabase + GCS. Three distinct issues, all in the code path the v2 migration touched.

### 1. `onboarding_version` column doesn't exist on `public.users`

**Symptom:** Every `POST /api/users/bootstrap` and `PATCH /api/users/onboarding` returned
```
PGRST204 — Could not find the 'onboarding_version' column of 'users' in the schema cache
```

**Root cause:** `onboarding_version` was a carryover column on `public."user-temp"` (added in the earlier "Clerk Google Sign-In + Onboarding on `user-temp`" migration). The consolidated `public.users` DDL never defined it, but the v2 payload builder was still writing it.

**Fix:**
- **`backend/users_auth.go`** — removed `payload["onboarding_version"] = onboardingVersion` from both `bootstrapUserHandler` (the fresh-row branch) and `onboardingUserHandler` (the phase-based payload). Dropped the unused `onboardingVersion = 1` constant and the `OnboardingVersion *int` struct field on `appUserProfile`.
- **`frontend/src/lib/user-types.ts`** — removed `onboarding_version: number | null` from `UserProfile`.

Result: bootstraps and onboarding PATCHes now succeed against the live `public.users`.

### 2. Bucket name typo — `reflect-media` → `refleckt-media`

**Symptom:** `GET /api/user-assets` and any upload returned
```
gcs list status 404: "The specified bucket does not exist."
```

**Root cause:** The actual bucket in GCP is spelled `refleckt-media` (with `ck`), not `reflect-media` as the PDF spec had transcribed. Confirmed against the GCS console listing — bucket is multi-region `asia`, storage class Standard. A brief intermediate attempt to prefix the old `agent_swarm` bucket with `reflect-media/` was discarded once it was clarified that `refleckt-media` is a genuinely separate bucket.

**Fix:**
- **`backend/gcs.go`** — `const gcsBucket = "refleckt-media"`.

Result: uploads land in the right bucket; list/signed-URL calls resolve.

### 3. Switched `gcs_url` storage from https public URL → `gs://` URI, UUID filenames

**Problem:** Previously `user_input_images.gcs_url` stored the canonical `https://storage.googleapis.com/refleckt-media/...` public URL. That URL is permanent but relies on the bucket being publicly readable to actually serve content — our bucket is private, so those URLs always 403 in a browser. The consumer (frontend) needs a signed URL minted on each read; storing a value that *looks* like a display URL but can't be used as one is a foot-gun.

Separately, input filenames were timestamp + random hex (`20260420_921663842a0da157.webp`), which is not round-trippable from a DB row to a GCS object without an explicit column mapping.

**Fix:**
- **`backend/gcs.go`** — new helpers:
  - `gcsGSURI(objectPath)` returns `gs://refleckt-media/{path}` — the canonical DB-persisted pointer.
  - `parseGCSURL(raw)` accepts `gs://bucket/path`, `https://storage.googleapis.com/bucket/path`, and bare `bucket/path`. Enables back-compat for rows inserted before the switch.
  - `newUUIDv4()` generates an RFC 4122 v4 UUID string (no external dep; `crypto/rand`-based).
- **`backend/api.go` `uploadAssetHandler`** (input kind):
  - Pre-generate a v4 UUID used as both the `user_input_images.id` and the GCS filename.
  - New object path: `users/{clerkID}/input/{uuid}{.ext}` (was `users/{uid}/inputs/{timestamp_random}.{ext}`).
  - `gcs_url` is now written as `gs://refleckt-media/users/{clerkID}/input/{uuid}{.ext}`.
  - Dedup-hit response uses `parseGCSURL` to derive the object path from whatever format the existing row has, then mints a fresh 1-hour signed URL.
  - Upload response now always includes `signed_url` for immediate display (no separate sign step needed on the frontend).
- **`backend/caption.go` `enrichUserInputImage`** — replaced the string-trimming-the-https-prefix trick with `parseGCSURL`, so the enrichment worker works with both new `gs://` rows and legacy `https://` rows.

### 4. `view_type` is a Postgres enum (`image_view_type`), not an integer

**Symptom:** First input upload against the live Supabase returned
```
22P02 — invalid input value for enum image_view_type: "1"
```

**Root cause:** The earlier "DB-Backed User Input Images" section had assumed `view_type` was a `smallint` column defaulting to `1=front`. The real column on `public.user_input_images` is an enum `image_view_type` with two valid values: `'front'` and `'back'`. The worker and initial insert were both passing `1`/`0` integers.

**Fix:**
- **`backend/viewclassifier.go`** — changed the constants from `int` → `string`:
  - `viewTypeFront = "front"`, `viewTypeBack = "back"`.
  - `classifyViewType` now returns `(string, error)` and all fallback paths return `viewTypeFront`.
  - `mapIsFrontToViewType(isFront int) string` converts the HF classifier's `is_front` (0/1) into the enum string at the DB boundary. The HF API still returns 0/1, so the mapping is explicit and any future label-shape change (e.g. classifier returning `{"label":"front"}`) only touches this one function.
- **`backend/user_images_db.go` `updateUserInputImageEnrichment`** — signature changed to `viewType string`.
- **`backend/caption.go`** — `viewType` local var typed `string`, default `viewTypeFront`.
- **`backend/api.go` `uploadAssetHandler`** — initial insert writes `"view_type": viewTypeFront` (provisional; the enrichment worker may PATCH to `viewTypeBack` after classification).

### 5. `public.users` has no `onboarding_skipped_at` column

**Symptom:** `PATCH /api/users/onboarding` with `phase=optional_skip` returned
```
PGRST204 — Could not find the 'onboarding_skipped_at' column of 'users' in the schema cache
```

**Root cause:** The consolidated `public.users` DDL only tracks `onboarding_completed_at`; the `_skipped_at` timestamp was a `user-temp`-era column that didn't make it into the new table. The phase handler was still writing it.

**Fix:**
- **`backend/users_auth.go`** — removed the `payload["onboarding_skipped_at"] = now` write from the `optional_skip` branch. The `OnboardingSkippedAt` struct field is kept as `omitempty` so the struct still decodes cleanly when PostgREST doesn't populate it.

### 6. Choice-array values didn't match the live CHECK constraints

**Symptom:** Pending — would have surfaced as a PostgREST 400 on the first `optional_save` PATCH with non-empty choice arrays. Caught proactively after the user shared the real DDL.

**Root cause:** The validator option sets in `backend/users_auth.go` and the picker labels in `frontend/src/app/onboarding/page.tsx` were written against the PDF spec, which used longer descriptive slugs. The actual CHECK constraints on `public.users` use shorter canonical forms.

**Fix** — aligned both backend validators and frontend pickers to the DDL `CHECK (<field> <@ ARRAY[...])` lists:

| Field | Old slug | New slug (matches DDL) |
|---|---|---|
| `major_buys` | `tshirts` | `tshirts_shirts` |
| `seasonal_preferences` | `summer_breathable_linen` | `summer_breathable` |
| `seasonal_preferences` | `tech_wear` | `summer_techwear` |
| `seasonal_preferences` | `sharp_overcoats` | `winter_sharp_overcoats` |
| `color_families` | `neutrals_concrete_sand` | `neutrals` |
| `color_families` | `voids_black_charcoal` | `voids` |
| `color_families` | `earth_olive_rust` | `earth` |
| `color_families` | `vibrants_neons` | `vibrants` |
| `fit_frustrations` | `arm_bicep_trap` | `bicep_trap` |
| `fit_frustrations` | `bust_fit_tension` | `bust_gape` |
| `fit_frustrations` | *(absent)* | `tall_sleeve` (added) |

Files touched: `backend/users_auth.go` (`majorBuysOptions`, `seasonalOptions`, `colorFamilyOptions`, `fitFrustrationOptions`), `frontend/src/app/onboarding/page.tsx` (`MAJOR_BUYS`, `SEASONAL`, `COLOR_FAMILIES`, `FIT_FRUSTRATIONS` constants). Display labels kept human-readable; only the `value` sent over the wire changed.

### 7. New DB-backed `GET /api/images` (replaces GCS-list for the onboarding poll)

**Problem:** `/api/images` was previously an alias for `userAssetsHandler`, which calls `gcsList` under a `users/{uid}/` prefix and then classifies each object path. That conflated input/tryon/pose listings, required a client-side filter, and was a latency hit every time the onboarding wizard polled.

**Fix:**
- **`backend/user_images_db.go`** — new `listUserInputImages(ctx, cfg, userID)` that SELECTs `user_input_images` rows for a user, ordered by `created_at.desc`.
- **`backend/api.go`** — new `listUserInputImagesHandler`:
  - Clerk-authed; pulls rows only for the authenticated user.
  - For each row, `parseGCSURL(row.gcs_url)` → object path → `gcsSignedURL(path, 1h)`.
  - Derives `status` from enrichment state: `completed` when `description` is populated, else `pending`.
  - Returns `{ assets: [...], images: [...] }` (both keys populated identically for transitional compatibility with the current frontend filter).
- **`backend/main.go`** — `/api/images` now points at the new handler; `/api/user-assets` still points at the GCS-list-based `userAssetsHandler` for legacy callers that expect mixed input/tryon/pose listings.

## Files modified

- `backend/gcs.go` — bucket name fix, `gcsGSURI`, `parseGCSURL`, `newUUIDv4`
- `backend/api.go` — upload path uses UUID + gs:// URI, dedup-hit uses parser, new DB-backed list handler
- `backend/user_images_db.go` — new `listUserInputImages`
- `backend/caption.go` — enrichment worker uses `parseGCSURL` for backwards compatibility
- `backend/users_auth.go` — dropped `onboarding_version` from payloads/struct/constants
- `backend/main.go` — `/api/images` rewired to the DB-backed handler
- `frontend/src/lib/user-types.ts` — dropped `onboarding_version`

## Unrelated environment note

The backend initially failed to start with `missing SUPABASE_URL ... and/or SUPABASE_SERVICE_ROLE_KEY`. Root cause was the `.env` file using `:` as the key/value separator; `backend/env.go` only parses `KEY=VALUE` lines and silently skipped everything. Fix was to rewrite separators to `=`. No code change.

## Validation completed

- **Backend build:** `cd backend && go build ./...` passed after every change above.
- **Frontend type check:** `cd frontend && npx tsc --noEmit` passed.
- **Live smoke:** bootstrap + onboarding PATCH (phase: required) against the real `public.users` now return 200 instead of PGRST204. Image upload hits `gs://refleckt-media/users/{uid}/input/...`.

## Behaviour notes

- **Legacy rows:** existing `user_input_images` rows with `https://storage.googleapis.com/...` in `gcs_url` continue to work because `parseGCSURL` handles both URL shapes. No data migration required.
- **Signed URL TTL:** 1 hour, minted on every list response. Never persisted to the DB.
- **GCS paths:** onboarding inputs land at `refleckt-media/users/{uid}/input/{uuid}.{ext}`. Try-on and pose generations still write to `agent_swarm` via the older `saveTryOnSession` / `savePoseTransferSession` helpers; migrating those to `refleckt-media` is a separate follow-up.

---

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
