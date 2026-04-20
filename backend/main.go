package main

import (
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type AppConfig struct {
	Port              string
	CORSOrigin        string
	SupabaseURL       string
	SupabaseAPIKey    string
	ClerkSecretKey    string
	ScraperURL        string
	GoogleClientEmail string
	GooglePrivateKey  string
	GoogleProjectID   string
	GeminiModel       string
	HFToken           string
	VideoSpaceURL     string
	ViewClassifierURL string
	GCSBucket         string
	GCSBasePath       string
}

func loadConfig() (AppConfig, error) {
	cfg := AppConfig{
		Port:              getenv("BACKEND_PORT", "8080"),
		CORSOrigin:        getenv("BACKEND_CORS_ORIGIN", "*"),
		SupabaseURL:       getenv("SUPABASE_URL", getenv("NEXT_PUBLIC_SUPABASE_URL", "")),
		SupabaseAPIKey:    getenv("SUPABASE_SERVICE_ROLE_KEY", getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")),
		ClerkSecretKey:    stringsTrimQuotes(getenv("CLERK_SECRET_KEY", "")),
		ScraperURL:        normalizeScraperURL(getenv("SCRAPER_URL", "https://varun2808-product-image-scraper.hf.space")),
		GoogleClientEmail: stringsTrimQuotes(getenv("GOOGLE_CLIENT_EMAIL", "")),
		GooglePrivateKey:  getenv("GOOGLE_PRIVATE_KEY", ""),
		GoogleProjectID:   stringsTrimQuotes(getenv("GOOGLE_PROJECT_ID", "")),
		GeminiModel:       stringsTrimQuotes(getenv("GEMINI_MODEL", "gemini-3.1-flash-image-preview")),
		HFToken:           stringsTrimQuotes(getenv("HF_TOKEN", "")),
		VideoSpaceURL:     normalizeScraperURL(getenv("HF_VIDEO_SPACE_URL", "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space")),
		ViewClassifierURL: normalizeScraperURL(getenv("HF_VIEW_API_URL", "https://huggingface.co/spaces/CooLLegend/front-back-view-api")),
		GCSBucket:         getenv("GCS_BUCKET", "tryown-media"),
		GCSBasePath:       strings.TrimRight(getenv("GCS_BASE_PATH", ""), "/"),
	}

	if cfg.SupabaseURL == "" || cfg.SupabaseAPIKey == "" {
		return cfg, errConfig("missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback) and/or SUPABASE_SERVICE_ROLE_KEY")
	}

	return cfg, nil
}

func normalizeScraperURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return strings.TrimRight(trimmed, "/")
	}

	if strings.EqualFold(parsed.Hostname(), "huggingface.co") {
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) >= 3 && parts[0] == "spaces" {
			owner := strings.TrimSpace(parts[1])
			space := strings.TrimSpace(parts[2])
			if owner != "" && space != "" {
				return "https://" + owner + "-" + space + ".hf.space"
			}
		}
	}

	return strings.TrimRight(trimmed, "/")
}

func main() {
	if err := loadEnv(); err != nil {
		log.Printf("Warning: unable to load .env file: %v", err)
	}

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("Config error: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", withCORS(cfg, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))
	mux.HandleFunc("/api/products", withCORS(cfg, productsHandler(cfg)))
	mux.HandleFunc("/api/scrape", withCORS(cfg, scrapeHandler(cfg)))
	mux.HandleFunc("/api/tryon", withCORS(cfg, tryOnHandler(cfg)))
	mux.HandleFunc("/api/users", withCORS(cfg, currentUserHandler(cfg)))
	mux.HandleFunc("/api/users/bootstrap", withCORS(cfg, bootstrapUserHandler(cfg)))
	mux.HandleFunc("/api/users/onboarding", withCORS(cfg, onboardingUserHandler(cfg)))
	mux.HandleFunc("/api/pose-transfer", withCORS(cfg, poseTransferHandler(cfg)))
	mux.HandleFunc("/api/generate-video", withCORS(cfg, generateVideoHandler(cfg)))
	mux.HandleFunc("/api/upload-asset", withCORS(cfg, uploadAssetHandler(cfg)))
	mux.HandleFunc("/api/images/upload", withCORS(cfg, uploadAssetHandler(cfg)))
	mux.HandleFunc("/api/upload-profile", withCORS(cfg, uploadProfileHandler(cfg)))
	mux.HandleFunc("/api/user-assets", withCORS(cfg, userAssetsHandler(cfg)))
	mux.HandleFunc("/api/images", withCORS(cfg, listUserInputImagesHandler(cfg)))
	mux.HandleFunc("/api/tryons", withCORS(cfg, tryonsListHandler(cfg)))

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      loggingMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 70 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Go backend listening on :%s", cfg.Port)
	log.Printf("CORS origin: %s", cfg.CORSOrigin)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
