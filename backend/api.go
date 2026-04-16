package main

import (
	"bufio"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultProductsLimit = 100
	maxProductsLimit     = 200
	maxScrapeResponseLen = 2 * 1024 * 1024
	maxPageHTMLBytes     = 4 * 1024 * 1024
	maxVideoResponseLen  = 80 * 1024 * 1024
)

type configError struct {
	msg string
}

func (e configError) Error() string {
	return e.msg
}

func errConfig(message string) error {
	return configError{msg: message}
}

func stringsTrimQuotes(value string) string {
	trimmed := strings.TrimSpace(value)
	return strings.Trim(trimmed, "\"")
}

func withCORS(cfg AppConfig, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", cfg.CORSOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next(w, r)
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func parsePositiveInt(input string) (int, bool) {
	if strings.TrimSpace(input) == "" {
		return 0, false
	}

	parsed, err := strconv.Atoi(input)
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return defaultProductsLimit
	}
	if limit > maxProductsLimit {
		return maxProductsLimit
	}
	return limit
}

type productRow struct {
	ID           productID    `json:"id"`
	ImageURL     string       `json:"image_url"`
	AllImageURLs imageURLList `json:"all_image_urls"`
	Title        *string      `json:"title"`
	CreatedAt    *string      `json:"created_at"`
}

type productCardItem struct {
	ID           string   `json:"id"`
	ImageURL     string   `json:"image_url"`
	AllImageURLs []string `json:"all_image_urls"`
	Title        *string  `json:"title"`
	CreatedAt    *string  `json:"created_at"`
}

type productsPageResponse struct {
	Items      []productCardItem `json:"items"`
	NextCursor *string           `json:"nextCursor"`
	HasMore    bool              `json:"hasMore"`
	Total      *int              `json:"total"`
}

// productID supports both UUID string ids and numeric ids from Supabase payloads.
type productID string

type imageURLList []string

func (id *productID) UnmarshalJSON(data []byte) error {
	var asString string
	if err := json.Unmarshal(data, &asString); err == nil {
		*id = productID(strings.TrimSpace(asString))
		return nil
	}

	var asNumber json.Number
	if err := json.Unmarshal(data, &asNumber); err == nil {
		*id = productID(asNumber.String())
		return nil
	}

	return fmt.Errorf("unsupported product id type: %s", string(data))
}

func (id productID) String() string {
	return strings.TrimSpace(string(id))
}

func (list *imageURLList) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "null" || trimmed == "" {
		*list = nil
		return nil
	}

	var asArray []string
	if err := json.Unmarshal(data, &asArray); err == nil {
		cleaned := make([]string, 0, len(asArray))
		for _, candidate := range asArray {
			candidate = strings.TrimSpace(candidate)
			if candidate != "" {
				cleaned = append(cleaned, candidate)
			}
		}
		*list = cleaned
		return nil
	}

	var asString string
	if err := json.Unmarshal(data, &asString); err == nil {
		asString = strings.TrimSpace(asString)
		if asString == "" {
			*list = nil
			return nil
		}

		parts := strings.Split(asString, "|")
		cleaned := make([]string, 0, len(parts))
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				cleaned = append(cleaned, part)
			}
		}
		*list = cleaned
		return nil
	}

	return fmt.Errorf("unsupported all_image_urls type: %s", trimmed)
}

func productsHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		startedAt := time.Now()
		query := r.URL.Query()
		search := strings.TrimSpace(query.Get("q"))
		cursor := strings.TrimSpace(query.Get("cursor"))
		hasCursor := cursor != ""
		limitValue, _ := parsePositiveInt(query.Get("limit"))
		limit := clampLimit(limitValue)

		u, err := url.Parse(strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/products")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Invalid Supabase URL"})
			return
		}

		q := u.Query()
		q.Set("select", "id,image_url,all_image_urls,title,created_at")
		q.Set("image_url", "not.is.null")
		q.Set("order", "id.desc")
		q.Set("limit", strconv.Itoa(limit+1))

		if hasCursor {
			q.Set("id", "lt."+cursor)
		}

		if search != "" {
			q.Set("title", "ilike.*"+escapePostgrestLike(search)+"*")
		}

		u.RawQuery = q.Encode()

		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, u.String(), nil)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build products request"})
			return
		}

		req.Header.Set("apikey", cfg.SupabaseAPIKey)
		req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)

		resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
		if err != nil {
			log.Printf("[api/products] supabase_request_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to fetch products"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			log.Printf("[api/products] supabase_error status=%d body=%s", resp.StatusCode, string(body))
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Supabase query failed"})
			return
		}

		var rows []productRow
		if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
			log.Printf("[api/products] decode_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Invalid response from Supabase"})
			return
		}

		hasMore := len(rows) > limit
		if hasMore {
			rows = rows[:limit]
		}

		items := make([]productCardItem, 0, len(rows))
		for _, row := range rows {
			id := row.ID.String()
			if id == "" || row.ImageURL == "" {
				continue
			}
			items = append(items, productCardItem{
				ID:           id,
				ImageURL:     row.ImageURL,
				AllImageURLs: row.AllImageURLs,
				Title:        row.Title,
				CreatedAt:    row.CreatedAt,
			})
		}

		var nextCursor *string
		if hasMore && len(items) > 0 {
			next := items[len(items)-1].ID
			nextCursor = &next
		}

		writeJSON(w, http.StatusOK, productsPageResponse{
			Items:      items,
			NextCursor: nextCursor,
			HasMore:    hasMore,
			Total:      nil,
		})

		log.Printf("[api/products] rows=%d hasMore=%t limit=%d cursor=%v qLen=%d durationMs=%d",
			len(items),
			hasMore,
			limit,
			hasCursor,
			len(search),
			time.Since(startedAt).Milliseconds(),
		)
	}
}

type userProfile struct {
	UserID              string   `json:"user_id"`
	FirstName           *string  `json:"first_name"`
	LastName            *string  `json:"last_name"`
	Username            *string  `json:"username"`
	Bio                 *string  `json:"bio"`
	EmailID             *string  `json:"email_id"`
	PhoneNumber         *string  `json:"phone_number"`
	Location            *string  `json:"location"`
	Sex                 *string  `json:"sex"`
	Height              *string  `json:"height"`
	FrontImage          *string  `json:"front_image"`
	BackImage           *string  `json:"back_image"`
	Images              []string `json:"images"`
	CreatedAt           *string  `json:"created_at"`
	UpdatedAt           *string  `json:"updated_at"`
	OnboardingCompleted *bool    `json:"onboarding_completed"`
}

func usersHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		startedAt := time.Now()
		u, err := url.Parse(strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/users")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Users API unavailable."})
			return
		}

		q := u.Query()
		q.Set("select", "user_id,first_name,last_name,username,bio,email_id,phone_number,location,sex,height,front_image,back_image,images,created_at,updated_at,onboarding_completed")
		q.Set("first_name", "eq.Aditya")
		q.Set("last_name", "eq.Bhandari")
		q.Set("limit", "1")
		u.RawQuery = q.Encode()

		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, u.String(), nil)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Users API unavailable."})
			return
		}
		req.Header.Set("apikey", cfg.SupabaseAPIKey)
		req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)

		resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
		if err != nil {
			log.Printf("[api/users] supabase_request_failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Users API unavailable."})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			log.Printf("[api/users] supabase_error status=%d body=%s", resp.StatusCode, string(body))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Users API unavailable."})
			return
		}

		var rows []userProfile
		if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
			log.Printf("[api/users] decode_failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Users API unavailable."})
			return
		}

		if len(rows) == 0 {
			log.Printf("[api/users] not_found durationMs=%d", time.Since(startedAt).Milliseconds())
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "User not found."})
			return
		}

		user := rows[0]
		if user.Images == nil {
			user.Images = []string{}
		}

		log.Printf("[api/users] ok userId=%s durationMs=%d", user.UserID, time.Since(startedAt).Milliseconds())
		writeJSON(w, http.StatusOK, map[string]any{"user": user})
	}
}

func scrapeHandler(cfg AppConfig) http.HandlerFunc {
	type scrapeRequest struct {
		URL       string `json:"url"`
		MaxImages int    `json:"max_images"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload scrapeRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		payload.URL = strings.TrimSpace(payload.URL)
		if payload.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL is required"})
			return
		}
		parsedURL, err := url.ParseRequestURI(payload.URL)
		if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL"})
			return
		}
		if payload.MaxImages <= 0 {
			payload.MaxImages = 20
		}

		body, err := json.Marshal(payload)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to encode request"})
			return
		}

		target := strings.TrimRight(cfg.ScraperURL, "/") + "/api/scrape"
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, strings.NewReader(string(body)))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build scraper request"})
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := (&http.Client{}).Do(req)
		if err != nil {
			log.Printf("[api/scrape] upstream_request_failed: %v", err)
			if fallbackPayload, fallbackErr := fallbackScrape(ctx, payload.URL, payload.MaxImages); fallbackErr == nil {
				writeJSON(w, http.StatusOK, fallbackPayload)
				return
			}
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Scraper service unavailable"})
			return
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxScrapeResponseLen))
		if resp.StatusCode >= 400 {
			log.Printf("[api/scrape] upstream_error status=%d body=%s", resp.StatusCode, truncateText(string(respBody), 300))
			if fallbackPayload, fallbackErr := fallbackScrape(ctx, payload.URL, payload.MaxImages); fallbackErr == nil {
				writeJSON(w, http.StatusOK, fallbackPayload)
				return
			}

			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error": upstreamScrapeErrorMessage(resp.StatusCode, respBody),
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(respBody)
	}
}

type scrapedImage struct {
	Src string `json:"src"`
	Alt string `json:"alt"`
	Tag string `json:"tag"`
}

var (
	metaTagPattern      = regexp.MustCompile(`(?is)<meta\b[^>]*>`)
	imgTagPattern       = regexp.MustCompile(`(?is)<img\b[^>]*>`)
	sourceTagPattern    = regexp.MustCompile(`(?is)<source\b[^>]*>`)
	attrPattern         = regexp.MustCompile(`(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
	httpImageURLPattern = regexp.MustCompile(`https?://[^\s"'<>]+(?:\.jpe?g|\.png|\.webp|\.gif|\.avif)(?:\?[^\s"'<>]*)?`)
)

func fallbackScrape(ctx context.Context, pageURL string, maxImages int) (map[string]any, error) {
	startedAt := time.Now()
	document, resolvedURL, err := fetchHTMLDocument(ctx, pageURL)
	if err != nil {
		return nil, err
	}

	images := extractFallbackImages(document, resolvedURL, maxImages)
	if len(images) == 0 {
		return nil, errors.New("no images found in fallback scraper")
	}

	return map[string]any{
		"site":         fallbackSiteName(resolvedURL),
		"product_name": "",
		"method":       "html_fallback",
		"layers":       []string{"meta", "img", "source", "url"},
		"images":       images,
		"count":        len(images),
		"timing_ms":    float64(time.Since(startedAt).Milliseconds()),
	}, nil
}

func fetchHTMLDocument(ctx context.Context, pageURL string) (string, *url.URL, error) {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(pageURL))
	if err != nil {
		return "", nil, err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", nil, errors.New("unsupported URL scheme")
	}

	requestCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", nil, fmt.Errorf("fallback fetch failed with status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxPageHTMLBytes))
	if err != nil {
		return "", nil, err
	}

	resolved := resp.Request.URL
	if resolved == nil {
		resolved = parsed
	}
	return string(body), resolved, nil
}

func extractFallbackImages(document string, baseURL *url.URL, maxImages int) []scrapedImage {
	if maxImages <= 0 {
		maxImages = 20
	}

	seen := make(map[string]struct{})
	images := make([]scrapedImage, 0, maxImages)
	addImage := func(rawURL, alt, tag string) {
		if len(images) >= maxImages {
			return
		}

		normalized := normalizeImageURL(rawURL, baseURL)
		if normalized == "" || !isLikelyProductImage(normalized) {
			return
		}
		if _, exists := seen[normalized]; exists {
			return
		}
		seen[normalized] = struct{}{}
		images = append(images, scrapedImage{
			Src: normalized,
			Alt: strings.TrimSpace(html.UnescapeString(alt)),
			Tag: tag,
		})
	}

	for _, tag := range metaTagPattern.FindAllString(document, -1) {
		attrs := parseTagAttributes(tag)
		key := strings.ToLower(strings.TrimSpace(attrs["property"]))
		if key == "" {
			key = strings.ToLower(strings.TrimSpace(attrs["name"]))
		}
		if !isImageMetaTag(key) {
			continue
		}
		addImage(attrs["content"], "", "meta")
	}

	for _, tag := range imgTagPattern.FindAllString(document, -1) {
		attrs := parseTagAttributes(tag)
		alt := attrs["alt"]
		addImage(attrs["src"], alt, "img")
		addImage(firstSrcsetURL(attrs["srcset"]), alt, "img")
	}

	for _, tag := range sourceTagPattern.FindAllString(document, -1) {
		attrs := parseTagAttributes(tag)
		addImage(firstSrcsetURL(attrs["srcset"]), "", "source")
	}

	for _, rawURL := range httpImageURLPattern.FindAllString(document, -1) {
		addImage(rawURL, "", "url")
	}

	return images
}

func parseTagAttributes(tag string) map[string]string {
	attrs := map[string]string{}
	for _, match := range attrPattern.FindAllStringSubmatch(tag, -1) {
		key := strings.ToLower(strings.TrimSpace(match[1]))
		if key == "" {
			continue
		}

		value := strings.TrimSpace(match[2])
		if value == "" && len(match) > 3 {
			value = strings.TrimSpace(match[3])
		}
		attrs[key] = html.UnescapeString(value)
	}
	return attrs
}

func isImageMetaTag(key string) bool {
	switch key {
	case "og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src":
		return true
	default:
		return false
	}
}

func firstSrcsetURL(srcset string) string {
	srcset = strings.TrimSpace(srcset)
	if srcset == "" {
		return ""
	}

	for _, candidate := range strings.Split(srcset, ",") {
		fields := strings.Fields(strings.TrimSpace(candidate))
		if len(fields) == 0 {
			continue
		}
		return fields[0]
	}
	return ""
}

func normalizeImageURL(rawURL string, baseURL *url.URL) string {
	value := strings.TrimSpace(html.UnescapeString(rawURL))
	value = strings.Trim(value, "'\"")
	if value == "" {
		return ""
	}
	lower := strings.ToLower(value)
	if strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "javascript:") {
		return ""
	}

	if strings.HasPrefix(value, "//") {
		scheme := "https"
		if baseURL != nil && baseURL.Scheme != "" {
			scheme = baseURL.Scheme
		}
		value = scheme + ":" + value
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}
	if baseURL != nil {
		parsed = baseURL.ResolveReference(parsed)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}

	parsed.Fragment = ""
	return parsed.String()
}

func isLikelyProductImage(imageURL string) bool {
	lower := strings.ToLower(imageURL)
	blockedTokens := []string{
		"favicon",
		"sprite",
		"spacer",
		"tracking",
		"pixel",
		"blank.gif",
		"1x1",
	}

	for _, token := range blockedTokens {
		if strings.Contains(lower, token) {
			return false
		}
	}
	return true
}

func fallbackSiteName(pageURL *url.URL) string {
	if pageURL == nil {
		return "generic"
	}
	host := strings.TrimSpace(strings.ToLower(pageURL.Hostname()))
	host = strings.TrimPrefix(host, "www.")
	if host == "" {
		return "generic"
	}
	return host
}

func upstreamScrapeErrorMessage(statusCode int, body []byte) string {
	defaultMessage := fmt.Sprintf("Scraper upstream failed (status %d)", statusCode)
	if len(body) == 0 {
		return defaultMessage
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err == nil {
		if value, ok := payload["error"].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
		if value, ok := payload["detail"].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}

	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return defaultMessage
	}
	return defaultMessage + ": " + truncateText(trimmed, 220)
}

func truncateText(input string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	if len(input) <= maxLen {
		return input
	}
	return input[:maxLen] + "..."
}

type tryOnRequest struct {
	PersonImage   string `json:"person_image"`
	ClothImage    string `json:"cloth_image"`
	ClothImageURL string `json:"cloth_image_url"`
	UserID        string `json:"user_id"`
	GarmentID     string `json:"garment_id"`
}

type tryOnResponse struct {
	Success bool `json:"success"`
	Image   any  `json:"image"`
	Raw     any  `json:"raw,omitempty"`
}

func tryOnHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if cfg.GoogleClientEmail == "" || cfg.GooglePrivateKey == "" || cfg.GoogleProjectID == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Missing Google VTO credentials"})
			return
		}

		var input tryOnRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		if strings.TrimSpace(input.PersonImage) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Person image is required"})
			return
		}

		clothBase64 := strings.TrimSpace(input.ClothImage)
		if clothBase64 == "" && strings.TrimSpace(input.ClothImageURL) != "" {
			imageBytes, err := fetchBinary(r.Context(), input.ClothImageURL, 20*time.Second)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to fetch garment image"})
				return
			}
			clothBase64 = base64.StdEncoding.EncodeToString(imageBytes)
		}

		if clothBase64 == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Garment image is required"})
			return
		}

		personBase64 := stripDataURL(input.PersonImage)
		clothClean := stripDataURL(clothBase64)

		accessToken, err := getAccessToken(r.Context(), cfg)
		if err != nil {
			log.Printf("[api/tryon] access_token_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "OAuth token request failed"})
			return
		}

		endpoint := fmt.Sprintf(
			"https://us-central1-aiplatform.googleapis.com/v1/projects/%s/locations/us-central1/publishers/google/models/virtual-try-on-001:predict", // No gemini call in this -> google virtual tryon model
			cfg.GoogleProjectID,
		)

		payload := map[string]any{
			"instances": []any{
				map[string]any{
					"personImage": map[string]any{
						"image": map[string]any{
							"bytesBase64Encoded": personBase64,
						},
					},
					"productImages": []any{
						map[string]any{
							"image": map[string]any{
								"bytesBase64Encoded": clothClean,
							},
						},
					},
				},
			},
			"parameters": map[string]any{
				"sampleCount":      1,
				"personGeneration": "allow_adult",
			},
		}

		requestBody, err := json.Marshal(payload)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build VTO request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(requestBody)))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build VTO request"})
			return
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := (&http.Client{}).Do(req)
		if err != nil {
			log.Printf("[api/tryon] upstream_request_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Try-on service unavailable"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
			writeJSON(w, resp.StatusCode, map[string]string{"error": "VTON API error: " + string(body)})
			return
		}

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Invalid response from VTON API"})
			return
		}

		predictions, _ := result["predictions"].([]any)
		if len(predictions) == 0 {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "No result generated"})
			return
		}

		firstPrediction := predictions[0]
		outputImage := extractPredictionImage(firstPrediction)
		if outputImage != "" {
			resultDataURL := "data:image/png;base64," + outputImage
			writeJSON(w, http.StatusOK, tryOnResponse{
				Success: true,
				Image:   resultDataURL,
			})
			saveTryOnSession(cfg, input.UserID, input.GarmentID, input.PersonImage, outputImage, "google/virtual-try-on-001")
			return
		}

		writeJSON(w, http.StatusOK, tryOnResponse{
			Success: true,
			Image:   nil,
			Raw:     firstPrediction,
		})
	}
}

const poseTransferPrompt = `You are given two input images:

- Image 1 (Ground Truth / Source Image): the authoritative source for the person's identity, face, body shape, skin tone, hairstyle, and the exact garment appearance.
- Image 2 (Pose Reference Image): use this image only for the target pose, body orientation, arm placement, leg placement, camera framing, and overall composition.

## Task
Generate a new image where:
- the person and garment come from Image 1
- the pose and body arrangement come from Image 2

## Strict constraints
1. Preserve identity from Image 1
   - keep the same face
   - keep the same hairstyle, skin tone, body proportions, and overall appearance
   - do not change the person into someone else

2. Preserve garment from Image 1 exactly
   - keep the same garment type
   - keep the same color
   - keep the same print/pattern
   - keep the same texture/material appearance
   - keep the same fit, length, silhouette, sleeves, neckline, and garment details
   - do not redesign, restyle, embellish, simplify, or replace the garment

3. Use Image 2 only for pose
   - transfer only the pose, body posture, limb placement, and viewpoint/composition
   - do not copy the identity, face, hair, clothing, or background from Image 2

4. Output requirements
   - generate a realistic single-person image
   - maintain natural anatomy
   - maintain correct garment drape under the new pose
   - preserve folds and tension in a realistic way
   - avoid deformation, duplication of limbs, warped hands, broken garment edges, or inconsistent sleeves
   - no extra garments, no accessories unless already present in Image 1
   - no extra people

5. Background behavior
   - keep background clean and neutral unless explicitly instructed otherwise
   - do not copy distracting background elements from either input unless required

## Priority order
If there is any conflict, follow this order:
1. identity from Image 1
2. garment fidelity from Image 1
3. pose from Image 2
4. clean realistic composition

## Negative instructions
Do not:
- change the garment design
- change garment colors
- mix clothing from the two images
- copy face/identity from Image 2
- generate multiple people
- crop out important garment regions
- hallucinate unseen garment features unless absolutely required for pose realism

## Final output
Return one realistic pose-transferred image of the same person from Image 1 wearing the same garment from Image 1, but posed according to Image 2.`

type poseTransferRequest struct {
	ResultImage string `json:"result_image"`
	PoseImage   string `json:"pose_image"`
	UserID      string `json:"user_id"`
}

func poseTransferHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if cfg.GoogleClientEmail == "" || cfg.GooglePrivateKey == "" || cfg.GoogleProjectID == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Missing Google credentials"})
			return
		}

		var input poseTransferRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		if strings.TrimSpace(input.ResultImage) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Result image is required"})
			return
		}
		if strings.TrimSpace(input.PoseImage) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Pose image is required"})
			return
		}

		accessToken, err := getAccessToken(r.Context(), cfg)
		if err != nil {
			log.Printf("[api/pose-transfer] access_token_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "OAuth token request failed"})
			return
		}

		model := strings.TrimSpace(cfg.GeminiModel)
		if model == "" {
			model = "gemini-3.1-flash-image-preview"
		}

		endpoint := fmt.Sprintf(
			"https://aiplatform.googleapis.com/v1/projects/%s/locations/global/publishers/google/models/%s:generateContent",
			cfg.GoogleProjectID,
			model,
		)

		payload := map[string]any{
			"contents": []any{
				map[string]any{
					"role": "user",
					"parts": []any{
						map[string]any{
							"inlineData": map[string]any{
								"mimeType": "image/png",
								"data":     stripDataURL(input.ResultImage),
							},
						},
						map[string]any{
							"inlineData": map[string]any{
								"mimeType": "image/png",
								"data":     stripDataURL(input.PoseImage),
							},
						},
						map[string]any{
							"text": poseTransferPrompt,
						},
					},
				},
			},
			"generationConfig": map[string]any{
				"responseModalities": []string{"IMAGE", "TEXT"},
			},
		}

		requestBody, err := json.Marshal(payload)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build pose transfer request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(requestBody)))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build pose transfer request"})
			return
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := (&http.Client{}).Do(req)
		if err != nil {
			log.Printf("[api/pose-transfer] upstream_request_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Pose transfer service unavailable"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
			writeJSON(w, resp.StatusCode, map[string]string{"error": "Gemini API error: " + string(body)})
			return
		}

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Invalid response from Gemini API"})
			return
		}

		mimeType, encodedImage := extractInlineGeneratedImage(result)
		if strings.TrimSpace(encodedImage) == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "No image generated by model"})
			return
		}
		if strings.TrimSpace(mimeType) == "" {
			mimeType = "image/png"
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"image":   fmt.Sprintf("data:%s;base64,%s", mimeType, encodedImage),
		})

		savePoseTransferSession(cfg, input.UserID, input.PoseImage, encodedImage, mimeType, model)
	}
}

type generateVideoRequest struct {
	ImageBase64 string `json:"image_base64"`
	Gender      string `json:"gender"`
}

func generateVideoHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var input generateVideoRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}
		if strings.TrimSpace(input.ImageBase64) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "image_base64 is required"})
			return
		}
		if strings.TrimSpace(cfg.HFToken) == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "HF_TOKEN not configured"})
			return
		}

		pronoun := "she"
		if strings.EqualFold(strings.TrimSpace(input.Gender), "male") {
			pronoun = "he"
		}

		prompt := fmt.Sprintf(
			"Using the provided image as the starting frame, the subject performs a slow, perfectly smooth 360-degree rotation on a studio turntable. Action: The subject performs a slow, deliberate, and complete 360-degree pivot on the spot, showing the front, profile, and exact back of the outfit. Upon returning to the 0-degree front-facing position, %s fluidly transitions into dynamic fashion poses including a runway walk and a hand-on-hip stance. The garments are locked; the clothing features zero texture popping, zero morphing, and remains 100%% physically consistent from all angles. Camera: Locked-off, static tripod shot, eye-level. Environment: Infinite white cyc-wall studio with bright, softbox lighting. Highly detailed, photorealistic, flawless temporal consistency.",
			pronoun,
		)

		startPayload := map[string]any{
			"data": []any{
				map[string]any{
					"path":      nil,
					"url":       normalizeImageDataURL(input.ImageBase64),
					"orig_name": "input.png",
					"mime_type": "image/png",
					"is_stream": false,
					"meta": map[string]any{
						"_type": "gradio.FileData",
					},
				},
				prompt,
				6,
				"色调艳丽, 过曝, 静态, 细节模糊不清, 字幕, 风格, 作品, 画作, 画面, 静止, 整体发灰, 最差质量, 低质量, JPEG压缩残留, 丑陋的, 残缺的, 多余的手指, 画得不好的手部, 画得不好的脸部, 畸形的, 毁容的, 形态畸形的肢体, 手指融合, 静止不动的画面, 杂乱的背景, 三条腿, 背景人很多, 倒着走",
				5,
				1,
				1,
				42,
				true,
			},
		}

		ctx, cancel := context.WithTimeout(r.Context(), 295*time.Second)
		defer cancel()

		eventID, err := startGradioVideoQueue(ctx, cfg, startPayload)
		if err != nil {
			log.Printf("[api/generate-video] queue_start_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}

		videoURL, err := waitForGradioVideoURL(ctx, cfg, eventID)
		if err != nil {
			log.Printf("[api/generate-video] queue_wait_failed eventId=%s err=%v", eventID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}

		videoBytes, err := fetchBinary(ctx, videoURL, 120*time.Second)
		if err != nil {
			log.Printf("[api/generate-video] fetch_video_failed url=%s err=%v", videoURL, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to fetch generated video"})
			return
		}

		videoBase64 := base64.StdEncoding.EncodeToString(videoBytes)
		writeJSON(w, http.StatusOK, map[string]string{
			"video": "data:video/mp4;base64," + videoBase64,
		})
	}
}

func fetchBinary(ctx context.Context, targetURL string, timeout time.Duration) ([]byte, error) {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(targetURL))
	if err != nil {
		return nil, err
	}

	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, errors.New("non-2xx response")
	}

	return io.ReadAll(io.LimitReader(resp.Body, 20*1024*1024))
}

func extractPredictionImage(prediction any) string {
	predictionMap, ok := prediction.(map[string]any)
	if !ok {
		return ""
	}

	if value, ok := predictionMap["bytesBase64Encoded"].(string); ok && value != "" {
		return value
	}

	if imageMap, ok := predictionMap["image"].(map[string]any); ok {
		if value, ok := imageMap["bytesBase64Encoded"].(string); ok && value != "" {
			return value
		}
	}

	return ""
}

func stripDataURL(input string) string {
	trimmed := strings.TrimSpace(input)
	if idx := strings.Index(trimmed, ","); idx >= 0 {
		return trimmed[idx+1:]
	}
	return trimmed
}

func getAccessToken(ctx context.Context, cfg AppConfig) (string, error) {
	jwtToken, err := createServiceAccountJWT(cfg.GoogleClientEmail, cfg.GooglePrivateKey)
	if err != nil {
		return "", err
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", jwtToken)

	requestCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(
		requestCtx,
		http.MethodPost,
		"https://oauth2.googleapis.com/token",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("oauth failed: %s", string(body))
	}

	var payload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", errors.New("oauth response missing access_token")
	}

	return payload.AccessToken, nil
}

func createServiceAccountJWT(email string, rawKey string) (string, error) {
	privateKey, err := parseRSAPrivateKey(cleanPrivateKey(rawKey))
	if err != nil {
		return "", err
	}

	headerJSON, _ := json.Marshal(map[string]any{
		"alg": "RS256",
		"typ": "JWT",
	})
	header := base64.RawURLEncoding.EncodeToString(headerJSON)

	now := time.Now().Unix()
	payloadJSON, _ := json.Marshal(map[string]any{
		"iss":   email,
		"scope": "https://www.googleapis.com/auth/cloud-platform",
		"aud":   "https://oauth2.googleapis.com/token",
		"iat":   now,
		"exp":   now + 3600,
	})
	payload := base64.RawURLEncoding.EncodeToString(payloadJSON)

	signInput := header + "." + payload
	hash := sha256.Sum256([]byte(signInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}

	return signInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func parseRSAPrivateKey(pemString string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemString))
	if block == nil {
		return nil, errors.New("invalid private key PEM")
	}

	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
	}

	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	return nil, errors.New("unsupported private key format")
}

func cleanPrivateKey(raw string) string {
	key := strings.ReplaceAll(raw, "\"", "")
	key = strings.ReplaceAll(key, `\n`, "\n")
	key = strings.ReplaceAll(key, `\r`, "\r")
	key = strings.ReplaceAll(key, "-----BEGIN PRIVATE KEY-----", "")
	key = strings.ReplaceAll(key, "-----END PRIVATE KEY-----", "")
	key = strings.ReplaceAll(key, "-----BEGIN RSA PRIVATE KEY-----", "")
	key = strings.ReplaceAll(key, "-----END RSA PRIVATE KEY-----", "")

	var filtered strings.Builder
	for _, ch := range key {
		if (ch >= 'A' && ch <= 'Z') ||
			(ch >= 'a' && ch <= 'z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '+' || ch == '/' || ch == '=' {
			filtered.WriteRune(ch)
		}
	}

	clean := filtered.String()
	var pemBuilder strings.Builder
	pemBuilder.WriteString("-----BEGIN PRIVATE KEY-----\n")
	for i := 0; i < len(clean); i += 64 {
		end := int(math.Min(float64(i+64), float64(len(clean))))
		pemBuilder.WriteString(clean[i:end])
		pemBuilder.WriteString("\n")
	}
	pemBuilder.WriteString("-----END PRIVATE KEY-----\n")

	return pemBuilder.String()
}

func extractInlineGeneratedImage(payload map[string]any) (mimeType string, encoded string) {
	candidates, _ := payload["candidates"].([]any)
	for _, candidate := range candidates {
		candidateMap, _ := candidate.(map[string]any)
		contentMap, _ := candidateMap["content"].(map[string]any)
		parts, _ := contentMap["parts"].([]any)
		for _, part := range parts {
			partMap, _ := part.(map[string]any)
			inlineData, _ := partMap["inlineData"].(map[string]any)
			mime, _ := inlineData["mimeType"].(string)
			data, _ := inlineData["data"].(string)
			if strings.HasPrefix(strings.ToLower(strings.TrimSpace(mime)), "image/") && strings.TrimSpace(data) != "" {
				return mime, data
			}
		}
	}
	return "", ""
}

func normalizeImageDataURL(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(trimmed), "data:image/") {
		return trimmed
	}
	return "data:image/png;base64," + stripDataURL(trimmed)
}

func startGradioVideoQueue(ctx context.Context, cfg AppConfig, payload map[string]any) (string, error) {
	baseURL := strings.TrimRight(cfg.VideoSpaceURL, "/")
	endpoint := baseURL + "/gradio_api/call/generate_video"

	requestBody, err := json.Marshal(payload)
	if err != nil {
		return "", errors.New("failed to encode video request")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(requestBody)))
	if err != nil {
		return "", errors.New("failed to build video queue request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.HFToken)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", errors.New("video queue unavailable")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = "video queue request failed"
		}
		return "", errors.New(truncateText(msg, 260))
	}

	var queuePayload struct {
		EventID string `json:"event_id"`
	}
	if err := json.Unmarshal(body, &queuePayload); err != nil {
		return "", errors.New("invalid response from video queue")
	}
	if strings.TrimSpace(queuePayload.EventID) == "" {
		return "", errors.New("video queue did not return event_id")
	}
	return queuePayload.EventID, nil
}

func waitForGradioVideoURL(ctx context.Context, cfg AppConfig, eventID string) (string, error) {
	baseURL := strings.TrimRight(cfg.VideoSpaceURL, "/")
	endpoint := fmt.Sprintf("%s/gradio_api/call/generate_video/%s", baseURL, url.PathEscape(strings.TrimSpace(eventID)))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", errors.New("failed to build video queue status request")
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", "Bearer "+cfg.HFToken)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", errors.New("video queue status unavailable")
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = fmt.Sprintf("video queue status failed (%d)", resp.StatusCode)
		}
		return "", errors.New(truncateText(msg, 260))
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	currentEvent := ""

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "event:") {
			currentEvent = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}

		if currentEvent == "error" {
			if payload == "null" {
				return "", errors.New("video generation failed")
			}
			return "", errors.New("video generation failed: " + truncateText(payload, 220))
		}

		if videoURL := extractVideoURLFromGradioEvent(payload, baseURL); videoURL != "" {
			return videoURL, nil
		}
	}

	if err := scanner.Err(); err != nil {
		return "", err
	}

	return "", errors.New("video generation stream ended without output")
}

func extractVideoURLFromGradioEvent(raw string, baseURL string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "null" {
		return ""
	}

	var payload any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return normalizePossibleVideoURL(trimmed, baseURL)
	}

	return findVideoURLInAny(payload, baseURL)
}

func findVideoURLInAny(value any, baseURL string) string {
	switch typed := value.(type) {
	case map[string]any:
		preferred := []string{"url", "video", "output", "value", "path"}
		for _, key := range preferred {
			if nested, exists := typed[key]; exists {
				if found := findVideoURLInAny(nested, baseURL); found != "" {
					return found
				}
			}
		}
		for _, nested := range typed {
			if found := findVideoURLInAny(nested, baseURL); found != "" {
				return found
			}
		}
	case []any:
		for _, nested := range typed {
			if found := findVideoURLInAny(nested, baseURL); found != "" {
				return found
			}
		}
	case string:
		return normalizePossibleVideoURL(typed, baseURL)
	}
	return ""
}

func normalizePossibleVideoURL(raw string, baseURL string) string {
	value := strings.TrimSpace(strings.Trim(raw, "\""))
	if value == "" {
		return ""
	}

	lower := strings.ToLower(value)
	if !strings.Contains(lower, ".mp4") && !strings.Contains(lower, "gradio_api/file=") {
		return ""
	}

	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return value
	}

	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return ""
	}
	relative, err := url.Parse(value)
	if err != nil {
		return ""
	}

	return base.ResolveReference(relative).String()
}

func escapePostgrestLike(input string) string {
	replacer := strings.NewReplacer(
		"*", `\*`,
		"%", `\%`,
		"_", `\_`,
	)
	return replacer.Replace(input)
}

// ─── GCS storage paths ────────────────────────────────────────────────────────

func userObjectPath(userID, kind, filename string) string {
	return fmt.Sprintf("users/%s/%s/%s", userID, kind, filename)
}

func userSessionPath(userID, sessionID, filename string) string {
	return fmt.Sprintf("users/%s/tryon/%s/%s", userID, sessionID, filename)
}

func newAssetFilename(ext string) string {
	return fmt.Sprintf("%s_%s%s", time.Now().UTC().Format("20060102"), randomID(), ext)
}

func randomID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

// ─── Upload asset endpoint (input / pose) ─────────────────────────────────────

type uploadAssetRequest struct {
	UserID    string `json:"user_id"`
	Kind      string `json:"kind"`
	Image     string `json:"image"`
	GarmentID string `json:"garment_id"`
}

func uploadAssetHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var input uploadAssetRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		input.UserID = strings.TrimSpace(input.UserID)
		input.Kind = strings.TrimSpace(input.Kind)
		if input.UserID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_id is required"})
			return
		}
		if input.Kind != "input" && input.Kind != "pose" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "kind must be 'input' or 'pose'"})
			return
		}
		if strings.TrimSpace(input.Image) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "image is required"})
			return
		}

		mimeType, ext := detectImageMimeAndExt(input.Image)
		objectPath := userObjectPath(input.UserID, input.Kind, newAssetFilename(ext))

		if err := gcsUploadBase64(r.Context(), cfg, objectPath, mimeType, input.Image); err != nil {
			log.Printf("[api/upload-asset] upload_failed user=%s kind=%s err=%v", input.UserID, input.Kind, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Storage upload failed"})
			return
		}

		log.Printf("[api/upload-asset] ok user=%s kind=%s path=%s", input.UserID, input.Kind, objectPath)
		writeJSON(w, http.StatusOK, map[string]string{
			"object_path": objectPath,
			"gs_uri":      "gs://" + gcsBucket + "/" + objectPath,
		})
	}
}

// ─── Upload profile.md endpoint ──────────────────────────────────────────────

type uploadProfileRequest struct {
	UserID  string `json:"user_id"`
	Content string `json:"content"`
}

func uploadProfileHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var input uploadProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		input.UserID = strings.TrimSpace(input.UserID)
		if input.UserID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_id is required"})
			return
		}
		if strings.TrimSpace(input.Content) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "content is required"})
			return
		}

		objectPath := fmt.Sprintf("users/%s/profile.md", input.UserID)
		if err := gcsUpload(r.Context(), cfg, objectPath, "text/markdown", []byte(input.Content)); err != nil {
			log.Printf("[api/upload-profile] upload_failed user=%s err=%v", input.UserID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Profile upload failed"})
			return
		}

		log.Printf("[api/upload-profile] ok user=%s path=%s", input.UserID, objectPath)
		writeJSON(w, http.StatusOK, map[string]string{
			"object_path": objectPath,
			"gs_uri":      "gs://" + gcsBucket + "/" + objectPath,
		})
	}
}

// ─── List user's assets with signed URLs ─────────────────────────────────────

type userAssetItem struct {
	ObjectPath string `json:"object_path"`
	Kind       string `json:"kind"`
	SessionID  string `json:"session_id,omitempty"`
	SignedURL  string `json:"signed_url"`
	UpdatedAt  string `json:"updated_at,omitempty"`
	Size       string `json:"size,omitempty"`
}

func userAssetsHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
		kindFilter := strings.TrimSpace(r.URL.Query().Get("kind"))
		if userID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_id is required"})
			return
		}

		prefix := fmt.Sprintf("users/%s/", userID)
		if kindFilter != "" {
			prefix = fmt.Sprintf("users/%s/%s/", userID, kindFilter)
		}

		objects, err := gcsList(r.Context(), cfg, prefix)
		if err != nil {
			log.Printf("[api/user-assets] list_failed user=%s err=%v", userID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to list assets"})
			return
		}

		items := make([]userAssetItem, 0, len(objects))
		for _, obj := range objects {
			kind, sessionID := classifyObjectPath(userID, obj.Name)
			signedURL, err := gcsSignedURL(cfg, obj.Name, time.Hour)
			if err != nil {
				log.Printf("[api/user-assets] sign_failed path=%s err=%v", obj.Name, err)
				continue
			}
			items = append(items, userAssetItem{
				ObjectPath: obj.Name,
				Kind:       kind,
				SessionID:  sessionID,
				SignedURL:  signedURL,
				UpdatedAt:  obj.Updated,
				Size:       obj.Size,
			})
		}

		log.Printf("[api/user-assets] ok user=%s kind=%s count=%d", userID, kindFilter, len(items))
		writeJSON(w, http.StatusOK, map[string]any{"assets": items})
	}
}

// classifyObjectPath parses "users/{uid}/{kind}/..." and returns (kind, sessionID).
func classifyObjectPath(userID, objectName string) (string, string) {
	prefix := "users/" + userID + "/"
	rest := strings.TrimPrefix(objectName, prefix)
	if rest == objectName {
		return "", ""
	}
	if rest == "profile.md" {
		return "profile", ""
	}
	parts := strings.SplitN(rest, "/", 3)
	if len(parts) == 0 {
		return "", ""
	}
	kind := parts[0]
	if kind == "tryon" && len(parts) >= 2 {
		return "tryon", parts[1]
	}
	return kind, ""
}

// ─── Auto-save helpers for tryon and pose-transfer sessions ──────────────────

// saveTryOnSession uploads the raw person image, the tryon result, and a meta.json
// into gs://agent_swarm/users/{uid}/tryon/{session_id}/ — fire-and-forget.
func saveTryOnSession(cfg AppConfig, userID, garmentID, personB64, resultB64, model string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	sessionID := randomID()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// Save input (raw person photo) — shared under input/ for this session reference
		inputPath := userObjectPath(userID, "input", newAssetFilename(".png"))
		if err := gcsUploadBase64(ctx, cfg, inputPath, "image/png", personB64); err != nil {
			log.Printf("[save/tryon] input_upload_failed user=%s err=%v", userID, err)
		}

		// Save try-on result under tryon/{session_id}/result.png
		resultPath := userSessionPath(userID, sessionID, "result.png")
		if err := gcsUploadBase64(ctx, cfg, resultPath, "image/png", resultB64); err != nil {
			log.Printf("[save/tryon] result_upload_failed user=%s session=%s err=%v", userID, sessionID, err)
			return
		}

		// Save meta.json
		meta := map[string]any{
			"user_id":      userID,
			"session_id":   sessionID,
			"kind":         "tryon",
			"garment_id":   garmentID,
			"model":        model,
			"input_path":   inputPath,
			"result_path":  resultPath,
			"created_at":   time.Now().UTC().Format(time.RFC3339),
		}
		metaBytes, _ := json.MarshalIndent(meta, "", "  ")
		metaPath := userSessionPath(userID, sessionID, "meta.json")
		if err := gcsUpload(ctx, cfg, metaPath, "application/json", metaBytes); err != nil {
			log.Printf("[save/tryon] meta_upload_failed user=%s session=%s err=%v", userID, sessionID, err)
		}
		log.Printf("[save/tryon] ok user=%s session=%s", userID, sessionID)
	}()
}

// savePoseTransferSession uploads the pose reference + final pose-transferred image
// plus a meta.json — fire-and-forget.
func savePoseTransferSession(cfg AppConfig, userID, poseB64, resultB64, mimeType, model string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	sessionID := randomID()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		posePath := userObjectPath(userID, "pose", newAssetFilename(".png"))
		if err := gcsUploadBase64(ctx, cfg, posePath, "image/png", poseB64); err != nil {
			log.Printf("[save/pose] pose_upload_failed user=%s err=%v", userID, err)
		}

		ext := ".png"
		if strings.EqualFold(mimeType, "image/jpeg") {
			ext = ".jpg"
		}
		resultPath := userSessionPath(userID, sessionID, "result"+ext)
		if err := gcsUploadBase64(ctx, cfg, resultPath, mimeType, resultB64); err != nil {
			log.Printf("[save/pose] result_upload_failed user=%s session=%s err=%v", userID, sessionID, err)
			return
		}

		meta := map[string]any{
			"user_id":     userID,
			"session_id":  sessionID,
			"kind":        "pose-transfer",
			"model":       model,
			"pose_path":   posePath,
			"result_path": resultPath,
			"created_at":  time.Now().UTC().Format(time.RFC3339),
		}
		metaBytes, _ := json.MarshalIndent(meta, "", "  ")
		metaPath := userSessionPath(userID, sessionID, "meta.json")
		if err := gcsUpload(ctx, cfg, metaPath, "application/json", metaBytes); err != nil {
			log.Printf("[save/pose] meta_upload_failed user=%s session=%s err=%v", userID, sessionID, err)
		}
		log.Printf("[save/pose] ok user=%s session=%s", userID, sessionID)
	}()
}

// detectImageMimeAndExt returns (mimeType, fileExtension) from a data URL or default PNG.
func detectImageMimeAndExt(b64data string) (string, string) {
	trimmed := strings.TrimSpace(b64data)
	if strings.HasPrefix(trimmed, "data:") {
		if end := strings.Index(trimmed, ";"); end > 5 {
			mime := trimmed[5:end]
			switch mime {
			case "image/jpeg":
				return mime, ".jpg"
			case "image/webp":
				return mime, ".webp"
			}
			return mime, ".png"
		}
	}
	return "image/png", ".png"
}
