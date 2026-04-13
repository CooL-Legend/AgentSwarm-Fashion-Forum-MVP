package main

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
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
	ID           productID `json:"id"`
	ImageURL     string    `json:"image_url"`
	AllImageURLs []string  `json:"all_image_urls"`
	Title        *string   `json:"title"`
	CreatedAt    *string   `json:"created_at"`
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
			writeJSON(w, http.StatusOK, tryOnResponse{
				Success: true,
				Image:   "data:image/png;base64," + outputImage,
			})
			return
		}

		writeJSON(w, http.StatusOK, tryOnResponse{
			Success: true,
			Image:   nil,
			Raw:     firstPrediction,
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

func escapePostgrestLike(input string) string {
	replacer := strings.NewReplacer(
		"*", `\*`,
		"%", `\%`,
		"_", `\_`,
	)
	return replacer.Replace(input)
}
