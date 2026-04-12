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
