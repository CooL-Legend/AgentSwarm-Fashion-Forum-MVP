# Fashion MVP - Technical Documentation

> Onboarding guide for engineers joining the project. Everything in this document is derived directly from the source code.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Frontend Documentation](#2-frontend-documentation)
3. [Backend Documentation](#3-backend-documentation)
4. [Function-Level Explanation](#4-function-level-explanation)
5. [Frontend-Backend Interaction](#5-frontend-backend-interaction)
6. [End-to-End Flows](#6-end-to-end-flows)
7. [Code Quality Observations](#7-code-quality-observations)

---

## 1. Project Overview

### 1.1 Purpose

Fashion MVP (named `fashion-forum` in `package.json`) is a fashion inspiration and virtual try-on platform. Users browse a gallery of fashion products sourced from a Supabase PostgreSQL database, select garments via multiple input methods (search, upload, or URL scraping), and use Google Vertex AI to virtually "try on" garments by compositing them onto uploaded person photos.

### 1.2 High-Level Architecture

```
+--------------------------+
|   Next.js 16 Frontend    |    (React 19, App Router, Tailwind CSS 4)
|   Port 3000 (default)    |
+------+---+---+-----------+
       |   |   |
       |   |   +---- /api/products ------> Supabase REST API (PostgreSQL)
       |   |   +---- /api/scrape --------> HuggingFace Scraper Space
       |   |   +---- /api/tryon ---------> Google Vertex AI (VTON)
       |   |   +---- /api/generate-video -> HuggingFace Gradio (Wan2)
       |   |
+------+---+---+-----------+
|   Go HTTP Backend        |    (stdlib-only, zero dependencies)
|   Port 8080 (default)    |
+------+---+---+-----------+
       |   |   |
       |   |   +---- /api/products ------> Supabase REST API (PostgREST)
       |   |   +---- /api/scrape --------> HuggingFace Scraper + HTML fallback
       |   +-------- /api/tryon ---------> Google Vertex AI (VTON)
       +------------ /healthz -----------> Health check
```

**Key architectural detail:** Both the Next.js API routes and the Go backend expose the same three core endpoints (`/api/products`, `/api/scrape`, `/api/tryon`). The frontend currently calls its own Next.js API routes (via relative URLs), not the Go backend directly. The Go backend serves as an independent, deployable API that could replace the Next.js API routes or serve other clients. The `backendApiUrl()` helper in the frontend simply normalizes paths and does **not** point to the Go backend.

### 1.3 Main Modules and Responsibilities

| Module | Technology | Responsibility |
|--------|-----------|----------------|
| **Frontend UI** | Next.js 16 / React 19 / Tailwind CSS 4 | Gallery display, garment selection, try-on UI, virtual scrolling |
| **Next.js API Routes** | TypeScript, Supabase JS client | Server-side data fetching, scraper proxy, VTON proxy, video generation |
| **Go Backend** | Go 1.25, stdlib only | Alternative REST API with identical endpoints, HTML fallback scraper |
| **Supabase** | PostgreSQL (hosted) | Product data storage (id, image_url, all_image_urls, title, created_at) |
| **Google Vertex AI** | Cloud API | Virtual try-on image generation (model: `virtual-try-on-001`) |
| **HuggingFace Spaces** | External services | Product image scraping, video generation |

### 1.4 Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI Library | React | 19.2.4 |
| Language | TypeScript (strict mode) | 5.9.3 |
| Styling | Tailwind CSS + PostCSS | 4.2.0 |
| Database Client | @supabase/supabase-js | 2.97.0 |
| AI Inference | @gradio/client | 2.1.0 |
| Backend | Go (stdlib) | 1.25.0 |
| Database | Supabase PostgreSQL | Hosted |

---

## 2. Frontend Documentation

### 2.1 Folder Structure

```
src/
 app/
  api/
   generate-video/
    route.ts          # POST - AI video generation via Gradio
   products/
    route.ts          # GET  - Paginated product listing from Supabase
   scrape/
    route.ts          # POST - Product page image scraping proxy
   tryon/
    route.ts          # POST - Virtual try-on via Google Vertex AI
  components/
   GalleryLightbox.tsx # Full-screen image viewer with multi-image navigation
   GalleryView.tsx     # Main gallery page component (virtual scroll, search, modals)
   GarmentInput.tsx    # Multi-mode garment selection (search, upload, link)
   ProductCard.tsx     # Individual product grid item
   TryOnModal.tsx      # Virtual try-on UI with person upload and result display
  gallery/
   page.tsx            # /gallery route - renders GalleryView
  globals.css          # Tailwind CSS import
  layout.tsx           # Root layout with header
  page.tsx             # / route (home) - renders GalleryView
 lib/
  backend-api.ts       # URL path normalizer
  gallery-types.ts     # Shared TypeScript interfaces
  supabase-server.ts   # Server-side Supabase client singleton
```

### 2.2 Pages and Routing

The app uses the Next.js App Router. Both routes render the same component:

| Route | File | Component | Rendering |
|-------|------|-----------|-----------|
| `/` | `src/app/page.tsx` | `<GalleryView />` | `force-dynamic` (no SSG) |
| `/gallery` | `src/app/gallery/page.tsx` | `<GalleryView />` | `force-dynamic` (no SSG) |

**Root Layout** (`src/app/layout.tsx`):
- Sets `<html lang="en" className="dark">` for dark mode
- Renders a sticky header with the "inspirationboard" logo/branding
- Includes a "live" status badge
- Applies global styles: `bg-zinc-950`, `text-zinc-100`, `antialiased`

### 2.3 Components

#### 2.3.1 GalleryView (`src/app/components/GalleryView.tsx`)

The central orchestrator component. Manages the entire gallery experience.

**State variables (17 total):**

| State | Type | Purpose |
|-------|------|---------|
| `images` | `ProductCardItem[]` | Accumulated product list |
| `loading` | `boolean` | Initial load spinner |
| `loadingMore` | `boolean` | Infinite scroll load spinner |
| `error` | `string \| null` | Error message display |
| `search` | `string` | Raw search input value |
| `debouncedSearch` | `string` | Search value after 350ms debounce |
| `lightbox` | `{ item, initialIndex } \| null` | Currently open lightbox |
| `garmentSelection` | `GarmentSelection \| null` | Selected garment for try-on |
| `tryOnImage` | `string \| null` | Image URL passed to TryOnModal |
| `nextCursor` | `string \| null` | Pagination cursor |
| `hasMore` | `boolean` | Whether more pages exist |
| `total` | `number \| null` | Total count (always null currently) |
| `viewportHeight` | `number` | Window inner height |
| `viewportWidth` | `number` | Window inner width |
| `scrollY` | `number` | Current scroll position |
| `gridTop` | `number` | Grid element's top offset |

**Refs (4 total):**

| Ref | Purpose |
|-----|---------|
| `gridRef` | DOM reference to the grid container (for virtual scroll offset calculation) |
| `sentinelRef` | DOM reference to the intersection observer sentinel element |
| `inFlightRef` | Boolean flag to prevent concurrent fetches |
| `abortRef` | Holds the current `AbortController` for request cancellation |
| `requestIdRef` | Auto-incrementing counter for stale response detection |

**Key features:**
- **Virtual scrolling**: Only renders visible rows plus 5 overscan rows above/below. Row height is fixed at 320px. Renders spacer `<div>`s above and below the visible window to maintain correct scroll height.
- **Responsive grid**: 2 columns (<640px), 3 (640-1023px), 4 (1024-1279px), 5 (>=1280px)
- **Infinite scroll**: Uses `IntersectionObserver` with `1000px` top and `700px` bottom root margins on a sentinel `<div>` to trigger the next page fetch before the user scrolls to the end.
- **Request deduplication**: Prevents concurrent fetches via `inFlightRef`. If a new search resets the page, the in-flight request is aborted via `AbortController`.
- **Debounced search**: 350ms delay between typing and API call.
- **Deduplication on merge**: New items are merged into existing items using a `Map` keyed by `id`, preventing duplicates.

**Renders:**
1. Hero section with gradient background, garment input, and selected garment bar
2. Loading skeleton grid (12 placeholder cards)
3. Error state with icon
4. Empty state (no results vs. no products)
5. Virtual-scrolled product grid with `ProductCard` items
6. "Loaded X products" status bar
7. `GalleryLightbox` modal (conditional)
8. `TryOnModal` modal (conditional)

---

#### 2.3.2 GalleryLightbox (`src/app/components/GalleryLightbox.tsx`)

Full-screen modal for viewing product images at full size.

**Props:**

| Prop | Type | Purpose |
|------|------|---------|
| `image` | `ProductCardItem` | The product being viewed |
| `initialIndex` | `number` (default 0) | Starting image index in multi-image products |
| `onClose` | `() => void` | Close callback |
| `onSelect` | `(imageUrl: string) => void` | Select image as garment |
| `onTryOn` | `(imageUrl: string) => void` | Open try-on with this image |

**Features:**
- Multi-image navigation via left/right arrow buttons and keyboard arrows
- Wrapping navigation (last image -> first image and vice versa)
- Image preloading: preloads the next and previous images on index change
- Keyboard shortcuts: `Escape` (close), `ArrowLeft` (prev), `ArrowRight` (next)
- Locks `document.body.style.overflow = "hidden"` while open
- Click-outside-to-close on the backdrop
- Bottom bar shows product title, date, image counter ("2 / 5"), and action buttons

---

#### 2.3.3 GarmentInput (`src/app/components/GarmentInput.tsx`)

Multi-mode garment selection component with three tabs.

**Props:**

| Prop | Type | Purpose |
|------|------|---------|
| `search` | `string` | Current search text (controlled) |
| `onSearchChange` | `(val: string) => void` | Search text change handler |
| `onGarmentSelect` | `(selection: GarmentSelection) => void` | Garment selection callback |

**Tab modes:**

1. **Local Search** - Text input that filters products in the gallery grid. The search value is lifted to GalleryView which passes it to the API.
2. **Upload Image** - Drag-and-drop or file browser for image upload. Creates a local object URL for preview. Validates MIME type (`image/*`).
3. **Paste Link** - URL input for direct image links or product page URLs.
   - If the URL ends in an image extension (`.jpg`, `.png`, `.webp`, `.avif`, `.gif`), it's used directly.
   - Otherwise, sends a POST to `/api/scrape` to extract product images from the page.
   - Shows up to 3 scraped images in a grid for the user to choose from.
   - Displays the scraped site name as a badge.

**Exported interface:**
```typescript
interface GarmentSelection {
    mode: "local" | "upload" | "link";
    imageUrl?: string;
    file?: File;
    localProduct?: { id: number | string; title?: string; image_url: string };
}
```

---

#### 2.3.4 ProductCard (`src/app/components/ProductCard.tsx`)

Individual product tile in the gallery grid.

**Props:**

| Prop | Type | Purpose |
|------|------|---------|
| `item` | `ProductCardItem` | Product data |
| `isSelected` | `boolean` | Whether this product is the selected garment |
| `altIndex` | `number` | 1-based index for alt text accessibility |
| `onClick` | `() => void` | Click handler (opens lightbox) |

**Features:**
- Fixed 300px height with `object-cover` image fill
- Lazy loading via `loading="lazy"`
- Hover: 1.5% scale-up on image, gradient overlay with title appears
- Selected state: amber border with ring-2 glow, checkmark badge in top-right corner

---

#### 2.3.5 TryOnModal (`src/app/components/TryOnModal.tsx`)

Virtual try-on modal with two views: input and result.

**Props:**

| Prop | Type | Purpose |
|------|------|---------|
| `garmentImageUrl` | `string` | URL of the selected garment image |
| `onClose` | `() => void` | Close callback |

**Input view (before try-on):**
- 2-column grid showing: garment image (left) + person upload area (right)
- Person upload supports drag-and-drop and file browser
- Reads file as base64 data URL via `FileReader.readAsDataURL()`

**Processing state:**
- Animated spinner with "Generating try-on..." text
- "This may take 10-20 seconds" hint

**Result view (after try-on):**
- 3-column grid showing: person photo, garment image, try-on result
- Result column has emerald/green accent styling
- Footer shows "Try Another" (reset) and "Download" (saves result as PNG)

---

### 2.4 State Management

There is **no global state management library**. All state is managed via React's `useState` and `useRef` hooks at the component level:

- `GalleryView` is the state owner for products, search, garment selection, and modal visibility
- State flows downward via props
- Events flow upward via callback props (`onSearchChange`, `onGarmentSelect`, `onClose`, `onSelect`, `onTryOn`)

**Data flow diagram:**

```
GalleryView (owns: images, search, garmentSelection, lightbox, tryOnImage)
 |
 +-- GarmentInput (receives: search; emits: onSearchChange, onGarmentSelect)
 |
 +-- ProductCard[] (receives: item, isSelected; emits: onClick)
 |
 +-- GalleryLightbox (receives: image; emits: onClose, onSelect, onTryOn)
 |
 +-- TryOnModal (receives: garmentImageUrl; emits: onClose)
```

### 2.5 Hooks, Helpers, and Utilities

#### Hooks (all React built-ins, no custom hooks)

| Hook | Usage Location | Purpose |
|------|---------------|---------|
| `useState` | All components | Component state |
| `useCallback` | GalleryView, GalleryLightbox, TryOnModal, GarmentInput | Memoized callbacks |
| `useMemo` | GalleryView | Virtual scroll range, visible images slice, column count |
| `useRef` | GalleryView, GarmentInput, TryOnModal | DOM refs, request tracking |
| `useEffect` | All components | Side effects (fetch, event listeners, timers) |

#### Utility Functions

| Function | File | Purpose |
|----------|------|---------|
| `backendApiUrl(path)` | `src/lib/backend-api.ts` | Normalizes path to start with `/`. Currently a simple passthrough - returns the path itself. |
| `resolveImages(item)` | `src/lib/gallery-types.ts` | Resolves multi-image data from a `ProductCardItem`. Handles three formats: string array, pipe-delimited string, and single image fallback. |
| `resolveColumns(width)` | `src/app/components/GalleryView.tsx` | Maps viewport width to column count (2-5). |
| `columnsClass(columns)` | `src/app/components/GalleryView.tsx` | Maps column count to Tailwind class string. |
| `formatFileSize(bytes)` | `src/app/components/GarmentInput.tsx` | Formats byte count to human-readable (B, KB, MB). |
| `TabIcon({ type })` | `src/app/components/GarmentInput.tsx` | SVG icon component for the three garment input tabs. |

### 2.6 API Calling Logic

All API calls use the browser-native `fetch` API. There is no axios, SWR, or React Query.

| Component | Endpoint | Method | Trigger |
|-----------|----------|--------|---------|
| `GalleryView.fetchProducts` | `/api/products` | GET | Initial load, search change, infinite scroll |
| `GarmentInput.handleLinkSubmit` | `/api/scrape` | POST | User submits a product page URL |
| `TryOnModal.handleTryOn` | `/api/tryon` | POST | User clicks "Try On" with both images ready |

**Fetch patterns:**
- `GalleryView` uses `AbortController` for request cancellation and `requestIdRef` for stale response detection
- `GarmentInput` does not use AbortController; repeat clicks could race
- All API calls use `cache: "no-store"` (products) or default caching (scrape, tryon)
- Error handling: all calls extract error messages from JSON response bodies with fallback messages

### 2.7 Important User Interactions and UI Flows

1. **Search products**: Type in "Local Search" tab -> 350ms debounce -> resets gallery -> fetches filtered results
2. **Upload garment**: Switch to "Upload Image" tab -> drag-drop or browse -> garment selection bar appears with "Try On" button
3. **Paste link**: Switch to "Paste Link" tab -> paste URL -> if direct image URL, select immediately; if product page, scrape and show grid of up to 3 images to choose from
4. **Browse gallery**: Scroll down -> IntersectionObserver triggers -> loads next 100 products -> merged and deduped
5. **View image**: Click product card -> lightbox opens -> navigate images with arrows -> "Select" or "Try On"
6. **Try on**: With garment selected, click "Try On" -> upload person photo -> click "Try On" button -> wait 10-20s -> view 3-column result -> download

---

## 3. Backend Documentation

### 3.1 Folder Structure

```
backend/
 api.go                    # All HTTP handlers, middleware, utility functions (~960 lines)
 env.go                    # .env file loader and getenv helper (~87 lines)
 main.go                   # Server setup, config loading, route registration (~101 lines)
 go.mod                    # Module definition (zero external dependencies)
 fashion-forum-backend     # Compiled binary (gitignored)
 scraper/                  # Auxiliary Python scraper (not part of Go build)
  main.py
  main1.py
  requirements.txt
```

### 3.2 Architecture Pattern

The Go backend follows a **flat handler architecture** with no framework:

- **No external dependencies** - everything uses the Go standard library
- **No layered architecture** (no separate service/repository layers) - handlers talk directly to Supabase REST API
- **Single-file handlers** - all business logic in `api.go`
- **Closure-based dependency injection** - handlers receive `AppConfig` via closure, e.g. `productsHandler(cfg)`
- **Middleware as function wrappers** - `withCORS(cfg, handler)` returns a wrapped `http.HandlerFunc`

### 3.3 Routes and Endpoints

Defined in `backend/main.go:76-86`:

| Method | Path | Handler | Middleware | Description |
|--------|------|---------|-----------|-------------|
| GET | `/healthz` | inline | CORS | Returns `{"ok": true}` |
| GET | `/api/products` | `productsHandler(cfg)` | CORS | Paginated product query |
| POST | `/api/scrape` | `scrapeHandler(cfg)` | CORS | Product image scraping with fallback |
| POST | `/api/tryon` | `tryOnHandler(cfg)` | CORS | Virtual try-on via Google Vertex AI |

All routes additionally pass through `loggingMiddleware` which wraps the entire `ServeMux`.

### 3.4 Middleware

#### CORS Middleware (`withCORS` - `backend/api.go:51-64`)

```go
func withCORS(cfg AppConfig, next http.HandlerFunc) http.HandlerFunc
```

- Sets `Access-Control-Allow-Origin` from `cfg.CORSOrigin` (default: `*`)
- Allows methods: `GET, POST, OPTIONS`
- Allows headers: `Content-Type, Authorization, X-Requested-With`
- Handles OPTIONS preflight with 204 No Content
- Applied per-route (wraps each handler individually)

#### Logging Middleware (`loggingMiddleware` - `backend/api.go:66-72`)

```go
func loggingMiddleware(next http.Handler) http.Handler
```

- Wraps the entire mux
- Logs: `METHOD PATH DURATION` (e.g., `GET /api/products 45ms`)
- Applied once at the server level

### 3.5 Handlers

#### Products Handler (`backend/api.go:148-258`)

Fetches paginated products from Supabase via its PostgREST API.

**Query parameters:**

| Param | Type | Default | Max | Description |
|-------|------|---------|-----|-------------|
| `q` | string | "" | - | Case-insensitive search on `title` |
| `cursor` | string | null | - | Product ID for keyset pagination |
| `limit` | int | 100 | 200 | Items per page |

**Supabase query construction:**
- Builds URL: `{SUPABASE_URL}/rest/v1/products`
- Selects: `id, image_url, all_image_urls, title, created_at`
- Filters: `image_url` not null
- Orders: `id` descending
- Pagination: `id.lt.{cursor}` (keyset)
- Search: `title=ilike.*{escaped_query}*`
- Limit: requests `limit + 1` rows to detect `hasMore`
- Authentication: `apikey` and `Authorization: Bearer` headers

**Response:** `productsPageResponse` with `items`, `nextCursor`, `hasMore`, `total` (always null).

#### Scrape Handler (`backend/api.go:260-339`)

Proxies scrape requests to an upstream HuggingFace Space, with automatic HTML fallback.

**Request body:**
```json
{ "url": "https://...", "max_images": 20 }
```

**Flow:**
1. Validate URL (must be http/https)
2. Proxy to upstream: `{SCRAPER_URL}/api/scrape`
3. If upstream fails or returns 4xx/5xx -> **fallback to `fallbackScrape()`**
4. Return upstream response or fallback result

**Fallback scraper** (`fallbackScrape` - `backend/api.go:355-376`):
1. Fetches HTML from the product page
2. Extracts images from 4 layers (in priority order):
   - `<meta>` tags: og:image, twitter:image variants
   - `<img>` tags: src and srcset attributes
   - `<source>` tags: srcset attribute
   - Raw URL matching: regex for http(s) image URLs in HTML
3. Filters non-product images (favicons, sprites, tracking pixels, 1x1 spacers)
4. Normalizes relative URLs to absolute
5. Deduplicates by normalized URL

#### Try-On Handler (`backend/api.go:630-765`)

Orchestrates virtual try-on via Google Vertex AI.

**Request body:**
```json
{
  "person_image": "data:image/jpeg;base64,...",
  "cloth_image": "base64-string",       // optional, either this or cloth_image_url
  "cloth_image_url": "https://..."      // optional, fetched and base64-encoded
}
```

**Flow:**
1. Validate Google credentials exist in config
2. Parse request body
3. If `cloth_image_url` provided, fetch binary and base64-encode
4. Strip data URL prefixes from both images
5. Create Google service account JWT
6. Exchange JWT for OAuth 2.0 access token
7. Call Vertex AI VTON endpoint with 55-second timeout
8. Extract `bytesBase64Encoded` from predictions response
9. Return as `data:image/png;base64,...`

### 3.6 Models and Entities

Defined in `backend/api.go`:

```go
// Raw row from Supabase (line 102-108)
type productRow struct {
    ID           productID `json:"id"`         // Custom type: handles both UUID and numeric
    ImageURL     string    `json:"image_url"`
    AllImageURLs []string  `json:"all_image_urls"`
    Title        *string   `json:"title"`
    CreatedAt    *string   `json:"created_at"`
}

// API response item (line 110-116)
type productCardItem struct {
    ID           string   `json:"id"`
    ImageURL     string   `json:"image_url"`
    AllImageURLs []string `json:"all_image_urls"`
    Title        *string  `json:"title"`
    CreatedAt    *string  `json:"created_at"`
}

// Paginated response (line 118-123)
type productsPageResponse struct {
    Items      []productCardItem `json:"items"`
    NextCursor *string           `json:"nextCursor"`
    HasMore    bool              `json:"hasMore"`
    Total      *int              `json:"total"`
}

// Custom ID type (line 126-146)
type productID string  // UnmarshalJSON handles both "uuid-string" and 123

// Scrape types (line 341-345)
type scrapedImage struct {
    Src string `json:"src"`
    Alt string `json:"alt"`
    Tag string `json:"tag"`
}

// Try-on types (line 618-628)
type tryOnRequest struct {
    PersonImage   string `json:"person_image"`
    ClothImage    string `json:"cloth_image"`
    ClothImageURL string `json:"cloth_image_url"`
}

type tryOnResponse struct {
    Success bool `json:"success"`
    Image   any  `json:"image"`
    Raw     any  `json:"raw,omitempty"`
}
```

### 3.7 Configuration

Defined in `backend/main.go:11-20`:

```go
type AppConfig struct {
    Port              string  // BACKEND_PORT, default "8080"
    CORSOrigin        string  // BACKEND_CORS_ORIGIN, default "*"
    SupabaseURL       string  // SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (required)
    SupabaseAPIKey    string  // SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY (required)
    ScraperURL        string  // SCRAPER_URL, default HuggingFace Space
    GoogleClientEmail string  // GOOGLE_CLIENT_EMAIL (optional, for VTON)
    GooglePrivateKey  string  // GOOGLE_PRIVATE_KEY (optional, for VTON)
    GoogleProjectID   string  // GOOGLE_PROJECT_ID (optional, for VTON)
}
```

**Startup validation:** The server panics (`log.Fatalf`) if `SupabaseURL` or `SupabaseAPIKey` is empty. Google credentials are optional -- the `/api/tryon` handler returns a 500 if they're missing at request time.

### 3.8 Environment Loading (`backend/env.go`)

- Checks `ENV_FILE` env var first, then `.env`, then `../.env`
- Skips blank lines and comments (`#`)
- Strips `export` prefix
- **Does not overwrite** existing environment variables
- Strips surrounding single/double quotes from values
- Converts escaped `\n` and `\r` to real newlines

### 3.9 Validation

| Endpoint | Validation |
|----------|-----------|
| Products | Method must be GET; limit clamped 1-200; cursor and search are trimmed |
| Scrape | Method must be POST; URL required and must be http/https; max_images defaults to 20 if <= 0 |
| Try-On | Method must be POST; Google credentials must be configured; person_image required; cloth_image or cloth_image_url required |

### 3.10 Authentication

**No user authentication.** The API is open. There are Clerk environment variables in `.env` (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_*`) but no Clerk middleware or auth checks exist in the code.

**Service-to-service auth:**
- **Supabase**: API key passed as `apikey` header and `Authorization: Bearer` header
- **Google Vertex AI**: OAuth 2.0 service account flow with RS256-signed JWT

### 3.11 External Integrations

| Service | Purpose | Auth Method | Timeout |
|---------|---------|-------------|---------|
| Supabase REST API | Product data | API key header | 20s |
| HuggingFace Scraper Space | Product image extraction | None | 60s |
| Google OAuth | Access token for Vertex AI | JWT (RS256) | 20s |
| Google Vertex AI | Virtual try-on | OAuth Bearer token | 55s |
| HuggingFace Gradio (Next.js only) | Video generation | HF_TOKEN | 300s |

### 3.12 Background Jobs

None. All processing is synchronous within request handlers.

### 3.13 Size Limits and Timeouts

| Constant | Value | Location |
|----------|-------|----------|
| `defaultProductsLimit` | 100 | `api.go:28` |
| `maxProductsLimit` | 200 | `api.go:29` |
| `maxScrapeResponseLen` | 2 MB | `api.go:30` |
| `maxPageHTMLBytes` | 4 MB | `api.go:31` |
| Max garment image download | 20 MB | `api.go:791` |
| Server ReadTimeout | 15s | `main.go:91` |
| Server WriteTimeout | 70s | `main.go:92` |
| Server IdleTimeout | 60s | `main.go:93` |

---

## 4. Function-Level Explanation

### 4.1 Frontend Functions

---

#### `fetchProducts`
- **File:** `src/app/components/GalleryView.tsx:68-153`
- **Purpose:** Fetches a page of products from the Next.js API route.
- **Inputs:** `{ cursor: string | null, reset: boolean }` - cursor for pagination, reset flag for fresh fetch
- **Outputs:** Updates `images`, `nextCursor`, `hasMore`, `loading`, `loadingMore`, `error` state
- **Internal steps:**
  1. Check `inFlightRef` - if request in flight and `reset=true`, abort it; if not reset, return early
  2. Set loading states and increment `requestIdRef`
  3. Build URL: `/api/products?limit=100&cursor=...&q=...`
  4. Fetch with `AbortController` signal and `cache: "no-store"`
  5. Parse response as `ProductsPageResponse`
  6. If `requestId` is stale (superseded by newer request), discard
  7. Merge items into existing state using a `Map` (deduplication by id)
  8. On error: if reset, clear all data; display error message
  9. Finally: reset loading flags, clear abort reference
- **Dependencies:** `backendApiUrl`, `debouncedSearch` (in closure)
- **Side effects:** Sets 7 different state variables
- **Called by:** `useEffect` on `debouncedSearch` change (reset=true), IntersectionObserver callback (reset=false)

---

#### `resolveImages`
- **File:** `src/lib/gallery-types.ts:9-18`
- **Purpose:** Extracts all image URLs from a product item, handling multiple storage formats.
- **Inputs:** `item: ProductCardItem`
- **Outputs:** `string[]` - array of image URLs (at least one)
- **Internal steps:**
  1. If `all_image_urls` is an array with elements, return it
  2. If `all_image_urls` is a pipe-delimited string, split and return
  3. Fallback: return `[item.image_url]`
- **Dependencies:** None
- **Called by:** `GalleryLightbox` (to get all images for navigation)

---

#### `handleLinkSubmit`
- **File:** `src/app/components/GarmentInput.tsx:86-132`
- **Purpose:** Processes a pasted URL - either uses it directly (if image URL) or scrapes it.
- **Inputs:** None (reads `linkUrl` from component state)
- **Outputs:** Updates `linkPreview`, `scrapedImages`, `scrapedSite`, `linkError`, `scraping` state; calls `onGarmentSelect`
- **Internal steps:**
  1. Validate URL with `new URL()`
  2. Check if direct image URL via `isDirectImageUrl()` (regex test for image extensions)
  3. If direct: set preview and call `onGarmentSelect`
  4. If product page: POST to `/api/scrape` with `{ url, max_images: 3 }`
  5. On success: populate `scrapedImages` grid
  6. On failure: show error
- **Dependencies:** `backendApiUrl`, `isDirectImageUrl`
- **Side effects:** Network request to scrape API
- **Called by:** "Fetch" button click, Enter key in URL input

---

#### `handleTryOn`
- **File:** `src/app/components/TryOnModal.tsx:53-85`
- **Purpose:** Sends person + garment images to the try-on API and displays the result.
- **Inputs:** None (reads `personBase64` and `garmentImageUrl` from state/props)
- **Outputs:** Updates `resultImage`, `error`, `processing` state
- **Internal steps:**
  1. Set processing state
  2. POST to `/api/tryon` with `{ person_image: base64DataUrl, cloth_image_url: url }`
  3. On success: extract `data.image` and display
  4. On failure: show error
- **Dependencies:** `backendApiUrl`
- **Side effects:** Network request; changes modal from input to result view
- **Called by:** "Try On" button click in TryOnModal footer

---

#### Virtual Scroll Calculation (`useMemo`)
- **File:** `src/app/components/GalleryView.tsx:234-263`
- **Purpose:** Calculates which rows are visible and the spacer heights for virtual scrolling.
- **Inputs:** `images.length`, `viewportHeight`, `columns`, `scrollY`, `gridTop`
- **Outputs:** `{ startIndex, endIndex, topSpacerHeight, bottomSpacerHeight }`
- **Internal steps:**
  1. Calculate total rows: `ceil(images.length / columns)`
  2. Calculate relative scroll within grid: `max(scrollY - gridTop, 0)`
  3. Determine visible start row: `floor(relativeScroll / 320) - 5` (overscan)
  4. Determine visible end row: `ceil((relativeScroll + viewportHeight) / 320) + 5`
  5. Convert row range to item indices
  6. Calculate spacer heights from row offsets * 320px
- **Called by:** React render cycle (recalculated when dependencies change)

---

### 4.2 Backend Functions (Go)

---

#### `productsHandler`
- **File:** `backend/api.go:148-258`
- **Purpose:** HTTP handler for paginated product queries against Supabase.
- **Inputs:** HTTP request with query params `q`, `cursor`, `limit`
- **Outputs:** JSON response `productsPageResponse`
- **Internal steps:**
  1. Enforce GET method
  2. Parse and clamp `limit` (default 100, max 200)
  3. Build Supabase REST URL with PostgREST query syntax
  4. Add cursor filter (`id.lt.{cursor}`) if present
  5. Add search filter (`title=ilike.*{escaped}*`) if present
  6. Execute HTTP GET with API key auth headers
  7. Decode JSON response into `[]productRow`
  8. Detect `hasMore` (fetched limit+1 rows, slice to limit)
  9. Convert to `[]productCardItem`, skipping rows with empty id or image_url
  10. Set `nextCursor` from last item's ID if hasMore
  11. Write JSON response
- **Dependencies:** `cfg.SupabaseURL`, `cfg.SupabaseAPIKey`, `clampLimit`, `escapePostgrestLike`
- **Side effects:** Logs timing and result info

---

#### `scrapeHandler`
- **File:** `backend/api.go:260-339`
- **Purpose:** Proxies scrape requests to upstream with automatic HTML fallback.
- **Inputs:** HTTP POST with JSON body `{ url, max_images }`
- **Outputs:** JSON response with scraped images
- **Internal steps:**
  1. Enforce POST method
  2. Decode and validate request body
  3. Forward to upstream: `{ScraperURL}/api/scrape`
  4. If upstream fails (network error or 4xx/5xx) -> try `fallbackScrape()`
  5. If fallback succeeds, return fallback result
  6. If both fail, return 502
- **Dependencies:** `cfg.ScraperURL`, `fallbackScrape`, `normalizeScraperURL`

---

#### `fallbackScrape`
- **File:** `backend/api.go:355-376`
- **Purpose:** Extracts product images from raw HTML when the upstream scraper is unavailable.
- **Inputs:** `ctx context.Context`, `pageURL string`, `maxImages int`
- **Outputs:** `(map[string]any, error)` - scrape result payload or error
- **Internal steps:**
  1. Fetch HTML document (`fetchHTMLDocument`)
  2. Extract images (`extractFallbackImages`)
  3. If no images found, return error
  4. Build response with site name, method="html_fallback", timing info
- **Dependencies:** `fetchHTMLDocument`, `extractFallbackImages`, `fallbackSiteName`

---

#### `extractFallbackImages`
- **File:** `backend/api.go:419-475`
- **Purpose:** Parses HTML document to find product images using regex patterns.
- **Inputs:** `document string`, `baseURL *url.URL`, `maxImages int`
- **Outputs:** `[]scrapedImage`
- **Internal steps:**
  1. Initialize seen map and image slice
  2. Extract from `<meta>` tags (og:image, twitter:image variants)
  3. Extract from `<img>` tags (src and srcset attributes)
  4. Extract from `<source>` tags (srcset attribute)
  5. Extract from raw URL pattern matches in HTML
  6. Each candidate: normalize URL, check if likely product image, deduplicate
- **Dependencies:** Compiled regex patterns (`metaTagPattern`, `imgTagPattern`, `sourceTagPattern`, `httpImageURLPattern`), `normalizeImageURL`, `isLikelyProductImage`, `parseTagAttributes`

---

#### `tryOnHandler`
- **File:** `backend/api.go:630-765`
- **Purpose:** Orchestrates the Google Vertex AI virtual try-on pipeline.
- **Inputs:** HTTP POST with JSON body `tryOnRequest`
- **Outputs:** JSON response `tryOnResponse`
- **Internal steps:**
  1. Enforce POST method
  2. Validate Google credentials exist
  3. Decode request body
  4. If cloth_image_url provided, fetch and base64-encode garment image
  5. Strip data URL prefixes
  6. Get Google OAuth access token (`getAccessToken`)
  7. Build Vertex AI request payload
  8. POST to Google VTON endpoint with 55s timeout
  9. Extract base64 image from predictions response
  10. Return as data URL
- **Dependencies:** `fetchBinary`, `stripDataURL`, `getAccessToken`, `extractPredictionImage`, Google credentials in config

---

#### `getAccessToken`
- **File:** `backend/api.go:821-867`
- **Purpose:** Gets a Google OAuth 2.0 access token via service account JWT assertion.
- **Inputs:** `ctx context.Context`, `cfg AppConfig`
- **Outputs:** `(string, error)` - access token or error
- **Internal steps:**
  1. Create JWT with `createServiceAccountJWT`
  2. POST to `https://oauth2.googleapis.com/token` with JWT as assertion
  3. Parse response for `access_token` field
- **Dependencies:** `createServiceAccountJWT`, Google credentials from config

---

#### `createServiceAccountJWT`
- **File:** `backend/api.go:869-899`
- **Purpose:** Creates an RS256-signed JWT for Google service account authentication.
- **Inputs:** `email string`, `rawKey string`
- **Outputs:** `(string, error)` - signed JWT string or error
- **Internal steps:**
  1. Clean and parse private key PEM
  2. Create JWT header (alg=RS256, typ=JWT)
  3. Create JWT payload (iss, scope, aud, iat, exp)
  4. Base64url-encode header and payload
  5. Sign with RSA PKCS1v15 using SHA256
  6. Concatenate: `header.payload.signature`
- **Dependencies:** `cleanPrivateKey`, `parseRSAPrivateKey`, `crypto/rsa`, `crypto/sha256`

---

#### `cleanPrivateKey`
- **File:** `backend/api.go:920-950`
- **Purpose:** Normalizes a Google service account private key from various formats into valid PEM.
- **Inputs:** `raw string` - key in various formats (escaped newlines, with/without headers, quoted)
- **Outputs:** `string` - clean PEM-formatted key
- **Internal steps:**
  1. Replace escaped `\n` and `\r` with real newlines
  2. Strip PEM headers/footers (both PKCS1 and PKCS8 variants)
  3. Filter to only base64 characters
  4. Reconstruct PEM with 64-char line wrapping
- **Called by:** `createServiceAccountJWT`

---

#### `normalizeImageURL`
- **File:** `backend/api.go:519-551`
- **Purpose:** Converts relative/malformed image URLs to absolute, validated URLs.
- **Inputs:** `rawURL string`, `baseURL *url.URL`
- **Outputs:** `string` - normalized absolute URL, or empty string if invalid
- **Internal steps:**
  1. Unescape HTML entities, trim quotes
  2. Reject `data:` and `javascript:` URLs
  3. Convert protocol-relative URLs (`//`) to absolute
  4. Resolve relative URLs against base URL
  5. Reject non-http(s) schemes
  6. Strip fragment
- **Called by:** `extractFallbackImages`

---

#### `escapePostgrestLike`
- **File:** `backend/api.go:952-958`
- **Purpose:** Escapes PostgREST LIKE special characters in user search input.
- **Inputs:** `input string`
- **Outputs:** `string` with `*`, `%`, `_` escaped
- **Called by:** `productsHandler`

---

### 4.3 Next.js API Route Functions

---

#### `GET /api/products`
- **File:** `src/app/api/products/route.ts:13-92`
- **Purpose:** Paginated product fetch from Supabase using the JS client library.
- **Inputs:** Query params: `q`, `cursor`, `limit`
- **Outputs:** `ProductsPageResponse` JSON
- **Internal steps:**
  1. Parse and clamp limit (1-200, default 100)
  2. Build Supabase query chain: select, filter not-null image_url, order by created_at desc + id desc
  3. Add cursor filter (`lt("id", cursor)`) if present
  4. Add search filter (`ilike("title", `%${q}%`)`) if present
  5. Fetch limit+1 rows to detect hasMore
  6. Slice, map to `ProductCardItem[]`, compute nextCursor
- **Key difference from Go backend:** Uses `created_at` desc as primary sort (Go uses `id` desc). The Go backend also escapes LIKE special characters while the Next.js route does not.

---

#### `POST /api/scrape`
- **File:** `src/app/api/scrape/route.ts:7-51`
- **Purpose:** Proxies scrape requests to the upstream HuggingFace scraper.
- **Inputs:** JSON body `{ url, max_images }`
- **Outputs:** Upstream scraper response (passthrough)
- **Internal steps:**
  1. Validate URL is present and is a string
  2. Forward to `{SCRAPER_URL}/api/scrape` with 55s timeout
  3. Return upstream response or 502 with error
- **Key difference from Go backend:** No fallback scraper. If upstream fails, returns error directly.

---

#### `POST /api/tryon`
- **File:** `src/app/api/tryon/route.ts:60-155`
- **Purpose:** Virtual try-on via Google Vertex AI.
- **Inputs:** JSON body `{ person_image, cloth_image, cloth_image_url }`
- **Outputs:** `{ success, image }` or `{ error }`
- **Internal steps:** Same flow as Go backend tryOnHandler (JWT creation, OAuth token exchange, Vertex AI call)
- **Key difference from Go backend:** Uses Node.js `crypto.createSign` instead of Go's `crypto/rsa`. Has its own `cleanPrivateKey` and `createJWT` implementations.

---

#### `POST /api/generate-video`
- **File:** `src/app/api/generate-video/route.ts:6-70`
- **Purpose:** Generates a 360-degree rotation video from a fashion image using AI.
- **Inputs:** JSON body `{ image_base64, gender }`
- **Outputs:** `{ video: "data:video/mp4;base64,..." }`
- **Internal steps:**
  1. Validate `image_base64` and `HF_TOKEN`
  2. Convert base64 to Blob
  3. Connect to Gradio model `zerogpu-aoti/wan2-2-fp8da-aoti-faster`
  4. Call `/generate_video` with prompt, image, and generation parameters
  5. Fetch result video from returned URL
  6. Convert to base64 data URL
- **Dependencies:** `@gradio/client`
- **Note:** This endpoint has no corresponding Go backend handler. It also has no frontend UI that calls it (the component that would use it is not present in the current codebase). **Its maxDuration is 300 seconds (5 minutes)**, the longest of any route.

---

## 5. Frontend-Backend Interaction

### 5.1 Which Frontend Functions Call Which Endpoints

| Frontend Function | Component | Endpoint | Method | Trigger |
|-------------------|-----------|----------|--------|---------|
| `fetchProducts` | GalleryView | `/api/products` | GET | Page load, search change, scroll |
| `handleLinkSubmit` | GarmentInput | `/api/scrape` | POST | URL submit button / Enter key |
| `handleTryOn` | TryOnModal | `/api/tryon` | POST | "Try On" button click |

All three call **Next.js API routes** (relative paths), not the Go backend.

### 5.2 Request/Response Lifecycle

#### Products Request Lifecycle

```
User types search
    |
    v
[350ms debounce timer]
    |
    v
debouncedSearch updates -> useEffect fires
    |
    v
fetchProducts({ cursor: null, reset: true })
    |
    +-- Aborts in-flight request if any
    +-- Sets loading=true
    |
    v
GET /api/products?limit=100&q=shoes
    |
    v
Next.js route handler (src/app/api/products/route.ts)
    |
    +-- supabaseServer.from("products").select(...).ilike("title", "%shoes%")
    |
    v
Supabase REST API -> PostgreSQL
    |
    v
Response: { items: [...], nextCursor: "abc", hasMore: true, total: null }
    |
    v
fetchProducts merges items into state (Map-based dedup)
    |
    v
React re-render -> virtual scroll recalculates -> visible ProductCards render
```

#### Scrape Request Lifecycle

```
User pastes URL "https://zara.com/jacket" and clicks Fetch
    |
    v
handleLinkSubmit()
    |
    +-- isDirectImageUrl() returns false (no image extension)
    |
    v
POST /api/scrape { url: "https://zara.com/jacket", max_images: 3 }
    |
    v
Next.js route handler (src/app/api/scrape/route.ts)
    |
    +-- Forwards to SCRAPER_URL/api/scrape with 55s timeout
    |
    v
HuggingFace Scraper Space
    |
    v
Response: { images: [{src, alt, tag}, ...], site: "zara.com", count: 3 }
    |
    v
GarmentInput shows 3-card grid of scraped images
    |
    v
User clicks one -> onGarmentSelect({ mode: "link", imageUrl: "https://..." })
    |
    v
GalleryView shows selected garment bar with "Try On" button
```

#### Try-On Request Lifecycle

```
User clicks "Try On" in garment bar
    |
    v
GalleryView sets tryOnImage -> TryOnModal opens
    |
    v
User uploads person photo (drag-drop or browse)
    |
    +-- FileReader.readAsDataURL() -> personBase64 set
    |
    v
User clicks "Try On" button
    |
    v
handleTryOn()
    |
    v
POST /api/tryon {
    person_image: "data:image/jpeg;base64,...",
    cloth_image_url: "https://..."
}
    |
    v
Next.js route handler (src/app/api/tryon/route.ts)
    |
    +-- Fetches garment image from URL -> base64
    +-- createJWT() with Google service account
    +-- POST to https://oauth2.googleapis.com/token -> access_token
    +-- POST to Google Vertex AI virtual-try-on-001:predict
    |
    v
Google Vertex AI processes (10-20 seconds)
    |
    v
Response: { predictions: [{ bytesBase64Encoded: "..." }] }
    |
    v
Route returns: { success: true, image: "data:image/png;base64,..." }
    |
    v
TryOnModal switches to result view (3-column: person, garment, result)
```

### 5.3 Payload Structures

#### Products API

**Request:** `GET /api/products?limit=100&cursor=abc123&q=jacket`

**Response:**
```json
{
    "items": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "image_url": "https://example.com/image.jpg",
            "all_image_urls": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
            "title": "Blue Denim Jacket",
            "created_at": "2025-01-15T10:30:00.000Z"
        }
    ],
    "nextCursor": "550e8400-e29b-41d4-a716-446655440001",
    "hasMore": true,
    "total": null
}
```

#### Scrape API

**Request:**
```json
{ "url": "https://zara.com/product/123", "max_images": 3 }
```

**Response:**
```json
{
    "site": "zara.com",
    "product_name": "Cropped Jacket",
    "images": [
        { "src": "https://static.zara.net/img.jpg", "alt": "Cropped Jacket", "tag": "meta" }
    ],
    "count": 1
}
```

#### Try-On API

**Request:**
```json
{
    "person_image": "data:image/jpeg;base64,/9j/4AAQ...",
    "cloth_image_url": "https://example.com/garment.jpg"
}
```

**Response:**
```json
{
    "success": true,
    "image": "data:image/png;base64,iVBORw0KGgo..."
}
```

### 5.4 Auth/Session/Token Handling

- **No user authentication** is enforced. All API routes are open.
- Clerk environment variables exist but no Clerk middleware or checks are in the code.
- The Supabase client uses a **service role key** (full database access), not a user-scoped anon key.
- Google OAuth tokens are created per-request (not cached); each try-on request creates a new JWT and exchanges it for an access token.

### 5.5 Error Handling Across Layers

| Layer | Error Handling |
|-------|---------------|
| **Frontend fetch** | `try/catch` around fetch; checks `response.ok`; extracts `body.error` from JSON; falls back to generic message |
| **Next.js routes** | `try/catch` wrapping entire handler; returns JSON `{ error: "..." }` with appropriate HTTP status |
| **Go handlers** | Checks HTTP method, validates inputs; returns JSON `{ error: "..." }` with status codes (400, 405, 500, 502) |
| **Upstream failures** | Go backend falls back to HTML scraper; Next.js scrape route does not |

**Error status codes used:**
- `400` - Bad request (missing/invalid params)
- `405` - Method not allowed (Go backend)
- `500` - Internal error, missing credentials, no results
- `502` - Upstream service failure (Supabase, scraper, Google API)

### 5.6 State Updates After API Success/Failure

| Event | State Change |
|-------|-------------|
| Products fetch success | `images` merged (deduped), `nextCursor`/`hasMore` updated, `loading`/`loadingMore` cleared |
| Products fetch error (reset) | `images` cleared, `hasMore=false`, `nextCursor=null`, `error` set |
| Products fetch error (pagination) | `error` set, existing images preserved |
| Scrape success | `scrapedImages` populated, `scrapedSite` set |
| Scrape error | `linkError` message shown |
| Try-on success | `resultImage` set, modal switches to result view |
| Try-on error | `error` message shown, modal stays in input view |

---

## 6. End-to-End Flows

### 6.1 Page Load

1. **User navigates to `/` or `/gallery`**
2. **Next.js renders** `RootLayout` (server component) -> sticky header
3. **`page.tsx`** renders `<GalleryView />` (client component with `force-dynamic`)
4. **GalleryView mounts** -> `useState` initializes all state, `useRef` creates refs
5. **Viewport measurement** (`useEffect` at line 175): attaches scroll/resize listeners, measures `viewportHeight`, `viewportWidth`, `scrollY`, `gridTop`
6. **Search debounce** (`useEffect` at line 155): `debouncedSearch` set to `""` after 350ms
7. **Data fetch** (`useEffect` at line 162): `debouncedSearch` changed -> `fetchProducts({ cursor: null, reset: true })`
8. **Loading state**: Renders 12 skeleton cards in responsive grid
9. **API call**: `GET /api/products?limit=100`
10. **Supabase query**: `products` table, 101 rows, ordered by created_at desc + id desc, image_url not null
11. **Response**: 100 items + hasMore=true + nextCursor
12. **State update**: `images` set, `loading=false`, grid renders
13. **Virtual scroll**: `useMemo` calculates visible range, only ~15-25 cards render depending on viewport
14. **Intersection observer** (`useEffect` at line 213): attaches to sentinel div with 1000px margin

### 6.2 Search Products

1. **User types "leather jacket"** in Local Search tab
2. **GarmentInput** calls `onSearchChange("leather jacket")` on each keystroke
3. **GalleryView** sets `search="leather jacket"`
4. **Debounce effect** (line 155): 350ms timer starts, resets on each keystroke
5. **After 350ms**: `debouncedSearch="leather jacket"`
6. **Fetch effect** (line 162): clears `images`, `hasMore`, `nextCursor`; calls `fetchProducts({ cursor: null, reset: true })`
7. **fetchProducts**: aborts any in-flight request, creates new AbortController
8. **API call**: `GET /api/products?limit=100&q=leather%20jacket`
9. **Supabase query**: `.ilike("title", "%leather jacket%")`
10. **Response**: filtered items
11. **UI update**: Grid shows only matching products, "Loaded X products" updates

### 6.3 Infinite Scroll (Fetch More Products)

1. **User scrolls down** past visible products
2. **Scroll listener** updates `scrollY` via `requestAnimationFrame`
3. **Virtual scroll `useMemo`** recalculates: renders new rows, adds/removes spacers
4. **Sentinel `<div>`** approaches viewport (1000px root margin)
5. **IntersectionObserver callback** fires: checks `!loading && !loadingMore && hasMore && nextCursor`
6. **`fetchProducts({ cursor: nextCursor, reset: false })`**
7. **API call**: `GET /api/products?limit=100&cursor=abc123`
8. **Supabase query**: `.lt("id", "abc123")` added
9. **Response**: next 100 items
10. **Merge**: items added to existing set via Map-based dedup
11. **Scroll continues** seamlessly

### 6.4 Garment Selection via URL Scraping

1. **User switches to "Paste Link" tab** in GarmentInput
2. **Pastes `https://zara.com/us/en/jacket-p123.html`**
3. **Presses Enter or clicks "Fetch"**
4. **`handleLinkSubmit()`**: validates URL, checks `isDirectImageUrl()` -> false (not an image file)
5. **Sets `scraping=true`**, shows spinner
6. **POST `/api/scrape`**: `{ url: "https://zara.com/...", max_images: 3 }`
7. **Next.js route**: forwards to HuggingFace Scraper Space with 55s timeout
8. **Scraper extracts images** from the product page
9. **Response**: `{ images: [{src, alt, tag}, {src, alt, tag}, {src, alt, tag}], site: "zara.com" }`
10. **GarmentInput**: renders 3 image cards with "Select" hover badge
11. **User clicks one**
12. **`selectScrapedImage(img)`**: calls `onGarmentSelect({ mode: "link", imageUrl: img.src })`
13. **GalleryView**: shows amber garment selection bar with preview, title "Garment via link", "Try On" button

### 6.5 Virtual Try-On (Full Flow)

1. **Garment is selected** (via any of the three input modes)
2. **User clicks "Try On"** in garment selection bar
3. **GalleryView**: `setTryOnImage(garmentSelection.imageUrl)` -> TryOnModal mounts
4. **TryOnModal renders**: 2-column layout with garment image (left) and upload area (right)
5. **User drags a full-body photo** onto the upload zone
6. **`handleDrop`** -> `processFile()` -> `FileReader.readAsDataURL()` -> `personBase64` set
7. **Preview shows** person photo with clear button
8. **User clicks "Try On" button**
9. **`handleTryOn()`**: sets `processing=true`, shows spinner
10. **POST `/api/tryon`**: `{ person_image: "data:image/jpeg;base64,...", cloth_image_url: "https://..." }`
11. **Next.js route handler**:
    - Fetches garment image from URL -> base64
    - Strips data URL prefix from person image
    - Creates JWT: `{ iss: email, scope: "cloud-platform", aud: "oauth2.googleapis.com/token", iat, exp }`
    - Signs JWT with RSA-SHA256 using service account private key
    - POST to Google OAuth -> access token
    - POST to Google Vertex AI: `virtual-try-on-001:predict` with person + garment images
12. **Google processes** (10-20 seconds)
13. **Response**: `{ predictions: [{ bytesBase64Encoded: "..." }] }`
14. **Route returns**: `{ success: true, image: "data:image/png;base64,..." }`
15. **TryOnModal**: `resultImage` set, view switches to 3-column result (person | garment | result)
16. **User can**: Download result or "Try Another"

### 6.6 Garment Selection from Gallery

1. **User clicks a product card** in the gallery grid
2. **GalleryView**: `setLightbox({ item: img, initialIndex: 0 })`
3. **GalleryLightbox mounts**: resolves all images via `resolveImages(image)`
4. **User browses images** with arrows (if multi-image product)
5. **Preloading**: adjacent images preloaded on each navigation
6. **User clicks "Select"**: `onSelect(images[currentIndex])` fires
7. **GalleryView**: `setGarmentSelection({ mode: "local", imageUrl, localProduct: {...} })`
8. **Lightbox closes**, garment selection bar appears
9. **Or user clicks "Try On" directly**: `onTryOn(images[currentIndex])` fires
10. **GalleryView**: `setTryOnImage(imageUrl)`, lightbox closes, TryOnModal opens

---

## 7. Code Quality Observations

### 7.1 Coupling

| Observation | Impact |
|-------------|--------|
| **GalleryView is a monolithic orchestrator** - manages 17 state variables and coordinates all child components | Difficult to test in isolation; any change risks regressions across the gallery, search, selection, and modal systems |
| **Duplicate API implementations** - Both Next.js routes and Go backend implement the same three endpoints with subtly different behavior | Divergence risk (e.g., different sort orders, different LIKE escaping) |
| **Tight coupling to Supabase schema** - Column names are hardcoded in API routes and type definitions | Schema changes require updates in 4+ files |

### 7.2 Duplication

| What | Where |
|------|-------|
| **Products fetching logic** | `src/app/api/products/route.ts` and `backend/api.go:148-258` |
| **Scrape proxy logic** | `src/app/api/scrape/route.ts` and `backend/api.go:260-339` |
| **Try-on with JWT creation** | `src/app/api/tryon/route.ts` (createJWT, cleanPrivateKey, getAccessToken) and `backend/api.go:821-950` (same functions in Go) |
| **Loading spinners** | Identical SVG spinner markup repeated in GalleryView, GarmentInput, and TryOnModal |
| **Close button markup** | Similar close button pattern in GalleryLightbox and TryOnModal |
| **Drag-and-drop logic** | Similar drag/drop handlers in GarmentInput and TryOnModal |

### 7.3 Fragile Areas

| Area | Concern |
|------|---------|
| **Google private key parsing** (`cleanPrivateKey` in both TS and Go) | Complex string manipulation of PEM keys; stripping headers, filtering base64 chars, re-wrapping. Silent failures possible if key format changes. |
| **Virtual scroll height assumptions** | `VIRTUAL_ROW_HEIGHT = 320` is hardcoded but actual card height is `h-[300px]` plus gap. Mismatch could cause jumpy scrolling. |
| **Sort order divergence** | Next.js route sorts by `created_at desc, id desc`. Go backend sorts by `id desc` only. Clients could see different orderings depending on which backend they hit. |
| **LIKE injection in Next.js route** | The Next.js `/api/products` route does **not** escape LIKE special characters (`%`, `_`) in search queries, while the Go backend does (`escapePostgrestLike`). A search for `%` or `_` would match more broadly than intended in the Next.js route. |
| **No request timeout in GarmentInput scrape** | `handleLinkSubmit` has no `AbortController` or timeout. If the scrape endpoint hangs, the UI spinner runs indefinitely. |
| **OAuth tokens not cached** | Each try-on request creates a new JWT and exchanges it for an access token. Under load, this means redundant OAuth calls. |

### 7.4 Confusing Naming

| Name | Confusion | Suggestion |
|------|-----------|------------|
| `backendApiUrl(path)` | Implies it returns a URL to the Go backend, but it just normalizes a path (adds leading `/`). The frontend never calls the Go backend. | Rename to `normalizeApiPath` or inline it. |
| `images` state in GalleryView | Contains `ProductCardItem[]`, not image URLs. | Rename to `products`. |
| `tryOnImage` in GalleryView | Stores the garment image URL for the try-on modal, not the try-on result. | Rename to `tryOnGarmentUrl`. |
| `lightbox.item.initialIndex` | The `initialIndex` is on the lightbox state, not on the item. This is correct but could confuse readers. | The naming is fine but could benefit from a comment. |
| `productID` type (Go) | A string type that handles JSON unmarshaling of both strings and numbers. Non-obvious behavior. | Add a doc comment explaining the dual-format support. |

### 7.5 Possible Bugs

| Issue | Location | Details |
|-------|----------|---------|
| **Memory leak on unmount** | `GarmentInput.tsx:60-61` | `URL.createObjectURL(file)` is called but only revoked in `clearUpload()`. If the component unmounts with an active preview, the object URL leaks. |
| **Stale closure in handleFileDrop** | `GarmentInput.tsx:46-56` | `handleFileDrop` is wrapped in `useCallback([], [])` (empty deps) but calls `processFile` which is not memoized. Since `processFile` calls `onGarmentSelect` from props, changes to `onGarmentSelect` won't be picked up by the drop handler. In practice this is fine because the parent doesn't change the callback identity. |
| **No image format validation in TryOnModal** | `TryOnModal.tsx:33-44` | Only checks `file.type.startsWith("image/")` but doesn't validate the image is valid (e.g., corrupt file). The base64 would be sent to the API which would fail at the Google Vertex AI level. |
| **Race condition in link tab** | `GarmentInput.tsx:86-132` | If user rapidly clicks "Fetch" multiple times, multiple scrape requests fire. No deduplication or abort logic. Responses could arrive out of order, with an older result overwriting a newer one. |

### 7.6 Refactor Suggestions

| Suggestion | Rationale |
|------------|-----------|
| **Extract a custom `useProducts` hook** from GalleryView | Separates data fetching logic (fetch, pagination, search, dedup) from rendering logic. Reduces GalleryView from ~480 lines. |
| **Choose one backend and remove the other** | Having both Next.js API routes and a Go backend for the same endpoints creates maintenance overhead and divergence risk. Pick one as the canonical API. |
| **Add LIKE escaping to Next.js products route** | Match the Go backend's behavior to prevent unexpected search results with `%` or `_` characters. |
| **Cache Google OAuth tokens** | Store the access token with its expiry (1 hour) and reuse it across try-on requests. Eliminates a ~200ms+ latency overhead per request. |
| **Extract shared spinner component** | The SVG spinner is duplicated 3+ times. A single `<Spinner />` component would reduce markup duplication. |
| **Add AbortController to scrape and try-on calls** | The GarmentInput scrape call and TryOnModal try-on call have no cancellation mechanism. Users can navigate away while these long-running requests are pending. |
| **Unify sort order** | Both backends should sort identically. Choose either `created_at desc, id desc` or `id desc` and apply it consistently. |
| **Add `useEffect` cleanup for object URLs** | In GarmentInput, revoke object URLs on component unmount to prevent memory leaks. |

---

## Appendix: Environment Variables

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Next.js, Go | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Next.js, Go | Full database access key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback | Next.js, Go | Limited database access key |
| `GOOGLE_CLIENT_EMAIL` | For VTON | Next.js, Go | Service account email |
| `GOOGLE_PRIVATE_KEY` | For VTON | Next.js, Go | Service account RSA key |
| `GOOGLE_PROJECT_ID` | For VTON | Next.js, Go | Google Cloud project ID |
| `SCRAPER_URL` | No (has default) | Next.js, Go | HuggingFace scraper endpoint |
| `HF_TOKEN` | For video | Next.js | HuggingFace API token |
| `BACKEND_PORT` | No (default 8080) | Go | Server listen port |
| `BACKEND_CORS_ORIGIN` | No (default *) | Go | CORS origin header |
| `CLERK_SECRET_KEY` | No | Unused | Clerk auth (not implemented) |
| `NEXT_PUBLIC_CLERK_*` | No | Unused | Clerk auth (not implemented) |
| `AWS_S3_*` | No | Unused | S3 uploads (not implemented) |
| `CLOUDINARY_*` | No | Unused | Cloudinary (not implemented) |
| `OPENROUTER_*` | No | Unused | OpenRouter AI (not implemented) |
| `REPLICATE_API_TOKEN` | No | Unused | Replicate AI (not implemented) |
| `DATABASE_URL` | No | Unused | Direct PostgreSQL (not used) |
