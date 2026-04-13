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
