package main

import (
<<<<<<< HEAD
	"context"
	"crypto/rand"
=======
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
<<<<<<< HEAD
	"log"
	"net/http"
	"net/url"
=======
	"net/http"
	"net/url"
	"sort"
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
	"strings"
	"time"
)

<<<<<<< HEAD
// ── Helpers ──────────────────────────────────────────────────

// generateImageID returns a collision-resistant ID: {unix_millis}_{6_hex_chars}.
func generateImageID() string {
	b := make([]byte, 3)
	rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

// gcsUserPrefix returns the GCS prefix for a user's folder (with trailing slash).
func gcsUserPrefix(cfg AppConfig, userID string) string {
	if cfg.GCSBasePath == "" {
		return fmt.Sprintf("users/%s/", userID)
	}
	return fmt.Sprintf("%s/users/%s/", cfg.GCSBasePath, userID)
}

// gcsObjectPath builds the full GCS object path for a user asset.
// category is one of "input", "tryon", "pose", "info".
func gcsObjectPath(cfg AppConfig, userID, category, filename string) string {
	if cfg.GCSBasePath == "" {
		return fmt.Sprintf("users/%s/%s/%s", userID, category, filename)
	}
	return fmt.Sprintf("%s/users/%s/%s/%s", cfg.GCSBasePath, userID, category, filename)
}

// ── GCS JSON API operations ──────────────────────────────────

// gcsUpload uploads raw bytes to a GCS object via the JSON API simple upload.
// Returns the public mediaLink on success.
func gcsUpload(ctx context.Context, cfg AppConfig, objectPath string, data []byte, contentType string) (string, error) {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return "", fmt.Errorf("gcs auth: %w", err)
	}

	uploadURL := fmt.Sprintf(
		"https://storage.googleapis.com/upload/storage/v1/b/%s/o?uploadType=media&name=%s",
		url.PathEscape(cfg.GCSBucket),
		url.QueryEscape(objectPath),
	)

	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, uploadURL, strings.NewReader(string(data)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", contentType)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", fmt.Errorf("gcs upload request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("gcs upload %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		MediaLink string `json:"mediaLink"`
		Name      string `json:"name"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("gcs upload response parse: %w", err)
	}

	return result.MediaLink, nil
}

// gcsRead downloads the contents of a GCS object.
func gcsRead(ctx context.Context, cfg AppConfig, objectPath string) ([]byte, error) {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("gcs auth: %w", err)
	}

	readURL := fmt.Sprintf(
		"https://storage.googleapis.com/storage/v1/b/%s/o/%s?alt=media",
		url.PathEscape(cfg.GCSBucket),
		url.PathEscape(objectPath),
	)

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, readURL, nil)
=======
const gcsBucket = "agent_swarm"

// gcsUpload writes raw bytes to gs://agent_swarm/{objectPath} using the service account OAuth token.
func gcsUpload(ctx context.Context, cfg AppConfig, objectPath, mimeType string, data []byte) error {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return fmt.Errorf("gcs oauth: %w", err)
	}

	endpoint := fmt.Sprintf(
		"https://storage.googleapis.com/upload/storage/v1/b/%s/o?uploadType=media&name=%s",
		gcsBucket,
		url.QueryEscape(objectPath),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("gcs build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", mimeType)

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("gcs upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("gcs upload status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// gcsUploadBase64 decodes a data URL or raw base64 string and uploads it.
func gcsUploadBase64(ctx context.Context, cfg AppConfig, objectPath, mimeType, b64 string) error {
	raw, err := base64.StdEncoding.DecodeString(stripDataURL(b64))
	if err != nil {
		return fmt.Errorf("decode base64: %w", err)
	}
	return gcsUpload(ctx, cfg, objectPath, mimeType, raw)
}

// gcsDownload fetches an object's content using the service account OAuth token.
func gcsDownload(ctx context.Context, cfg AppConfig, objectPath string) ([]byte, error) {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"https://storage.googleapis.com/storage/v1/b/%s/o/%s?alt=media",
		gcsBucket,
		url.PathEscape(objectPath),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

<<<<<<< HEAD
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("gcs read request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 20<<20)) // 20 MB max
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("gcs read %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// gcsDelete removes a GCS object.
func gcsDelete(ctx context.Context, cfg AppConfig, objectPath string) error {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return fmt.Errorf("gcs auth: %w", err)
	}

	delURL := fmt.Sprintf(
		"https://storage.googleapis.com/storage/v1/b/%s/o/%s",
		url.PathEscape(cfg.GCSBucket),
		url.PathEscape(objectPath),
	)

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodDelete, delURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return fmt.Errorf("gcs delete request: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 400 && resp.StatusCode != 404 {
		return fmt.Errorf("gcs delete %d", resp.StatusCode)
	}
	return nil
}

// gcsListPrefix lists object names under a given prefix.
func gcsListPrefix(ctx context.Context, cfg AppConfig, prefix string) ([]gcsObject, error) {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("gcs auth: %w", err)
	}

	listURL := fmt.Sprintf(
		"https://storage.googleapis.com/storage/v1/b/%s/o?prefix=%s&maxResults=500",
		url.PathEscape(cfg.GCSBucket),
		url.QueryEscape(prefix),
	)

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, listURL, nil)
=======
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("gcs download status %d: %s", resp.StatusCode, string(body))
	}
	return io.ReadAll(io.LimitReader(resp.Body, 30*1024*1024))
}

// gcsObject is a single object returned from the list API.
type gcsObject struct {
	Name    string `json:"name"`
	Size    string `json:"size"`
	Updated string `json:"updated"`
}

// gcsList returns all objects under a given prefix.
func gcsList(ctx context.Context, cfg AppConfig, prefix string) ([]gcsObject, error) {
	token, err := getAccessToken(ctx, cfg)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"https://storage.googleapis.com/storage/v1/b/%s/o?prefix=%s&maxResults=500",
		gcsBucket,
		url.QueryEscape(prefix),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

<<<<<<< HEAD
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("gcs list request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("gcs list %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Items []gcsObject `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("gcs list parse: %w", err)
	}

	return result.Items, nil
}

type gcsObject struct {
	Name      string `json:"name"`
	MediaLink string `json:"mediaLink"`
	Size      string `json:"size"`
	Updated   string `json:"updated"`
}

// gcsCheckAccess verifies read/write/delete access by round-tripping a small test object.
func gcsCheckAccess(ctx context.Context, cfg AppConfig) error {
	testPath := ".healthcheck"
	if cfg.GCSBasePath != "" {
		testPath = cfg.GCSBasePath + "/.healthcheck"
	}

	// Write
	if _, err := gcsUpload(ctx, cfg, testPath, []byte("ok"), "text/plain"); err != nil {
		return fmt.Errorf("write check failed: %w", err)
	}
	// Read
	data, err := gcsRead(ctx, cfg, testPath)
	if err != nil {
		return fmt.Errorf("read check failed: %w", err)
	}
	if string(data) != "ok" {
		return fmt.Errorf("read check mismatch: got %q", string(data))
	}
	// Delete
	if err := gcsDelete(ctx, cfg, testPath); err != nil {
		return fmt.Errorf("delete check failed: %w", err)
	}
	return nil
}

// gcsWriteInfoFile creates an info/{id}.txt metadata file for a newly stored image.
func gcsWriteInfoFile(ctx context.Context, cfg AppConfig, userID, imageID, category, ext string) {
	content := fmt.Sprintf(
		"image_id: %s\ncategory: %s\nextension: %s\nuser_id: %s\ncreated_at: %s\n",
		imageID, category, ext, userID, time.Now().UTC().Format(time.RFC3339),
	)
	infoPath := gcsObjectPath(cfg, userID, "info", imageID+".txt")
	if _, err := gcsUpload(ctx, cfg, infoPath, []byte(content), "text/plain"); err != nil {
		log.Printf("[gcs] failed to write info file for %s/%s: %v", userID, imageID, err)
	}
}

// gcsUserExists checks whether a user folder already has any objects.
func gcsUserExists(ctx context.Context, cfg AppConfig, userID string) bool {
	prefix := gcsUserPrefix(cfg, userID)
	objects, err := gcsListPrefix(ctx, cfg, prefix)
	return err == nil && len(objects) > 0
}

// gcsInitUserFolder creates the initial folder structure for a new user.
// GCS doesn't have real directories, so we create placeholder objects.
func gcsInitUserFolder(ctx context.Context, cfg AppConfig, userID string) {
	if gcsUserExists(ctx, cfg, userID) {
		return
	}

	log.Printf("[gcs] initializing folder structure for user %s", userID)

	content := fmt.Sprintf("# User %s\n\nCreated: %s\n", userID, time.Now().UTC().Format(time.RFC3339))
	profilePath := gcsUserPrefix(cfg, userID) + "profile.md"
	if _, err := gcsUpload(ctx, cfg, profilePath, []byte(content), "text/markdown"); err != nil {
		log.Printf("[gcs] failed to create profile.md for user %s: %v", userID, err)
	}
}

// decodeBase64Image strips data URL prefix and decodes base64 image bytes.
// Returns the raw bytes and a best-guess content type.
func decodeBase64Image(input string) ([]byte, string, error) {
	contentType := "image/png"
	raw := input

	// Extract content type from data URL if present
	if strings.HasPrefix(raw, "data:") {
		if idx := strings.Index(raw, ";base64,"); idx != -1 {
			contentType = raw[5:idx] // between "data:" and ";base64,"
			raw = raw[idx+8:]
		}
	}

	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		// Try with padding removed (some encoders emit RawStdEncoding)
		decoded, err = base64.RawStdEncoding.DecodeString(raw)
		if err != nil {
			return nil, "", fmt.Errorf("base64 decode: %w", err)
		}
	}

	return decoded, contentType, nil
}

// contentTypeToExt maps a content type to a file extension.
func contentTypeToExt(ct string) string {
	switch ct {
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".png"
	}
}

// ── HTTP Handlers ────────────────────────────────────────────

// gcsHealthHandler verifies that the backend can read/write to the configured GCS bucket.
func gcsHealthHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if cfg.GCSBucket == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"ok":    false,
				"error": "GCS_BUCKET not configured",
			})
			return
		}

		if err := gcsCheckAccess(r.Context(), cfg); err != nil {
			log.Printf("[api/gcs-health] check_failed: %v", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"ok":    false,
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"bucket":   cfg.GCSBucket,
			"basePath": cfg.GCSBasePath,
		})
	}
}

// gcsUploadInputHandler stores a user-uploaded input image in GCS.
//
//	POST /api/upload-input
//	Body: { "user_id": "...", "image_base64": "data:image/png;base64,..." }
func gcsUploadInputHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var input struct {
			UserID      string `json:"user_id"`
			ImageBase64 string `json:"image_base64"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		if strings.TrimSpace(input.UserID) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_id is required"})
			return
		}
		if strings.TrimSpace(input.ImageBase64) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "image_base64 is required"})
			return
		}

		imgBytes, contentType, err := decodeBase64Image(input.ImageBase64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to decode image: " + err.Error()})
			return
		}

		// Check for duplicate: compare size against existing input images
		imgSize := fmt.Sprintf("%d", len(imgBytes))
		inputPrefix := gcsUserPrefix(cfg, input.UserID) + "input/"
		existing, _ := gcsListPrefix(r.Context(), cfg, inputPrefix)
		for _, obj := range existing {
			if obj.Size == imgSize {
				// Same size — likely a duplicate, skip upload
				writeJSON(w, http.StatusOK, map[string]any{
					"success":     true,
					"duplicate":   true,
					"object_path": obj.Name,
					"url":         obj.MediaLink,
				})
				return
			}
		}

		// Ensure user folder exists
		go gcsInitUserFolder(context.Background(), cfg, input.UserID)

		imgID := generateImageID()
		ext := contentTypeToExt(contentType)
		objPath := gcsObjectPath(cfg, input.UserID, "input", imgID+ext)

		mediaLink, err := gcsUpload(r.Context(), cfg, objPath, imgBytes, contentType)
		if err != nil {
			log.Printf("[api/upload-input] gcs_upload_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to upload to storage"})
			return
		}

		// Write info file for this image
		go gcsWriteInfoFile(context.Background(), cfg, input.UserID, imgID, "input", ext)

		writeJSON(w, http.StatusOK, map[string]any{
			"success":     true,
			"image_id":    imgID,
			"object_path": objPath,
			"url":         mediaLink,
		})
	}
}

// gcsListUserImagesHandler lists stored images for a user under a given category.
//
//	GET /api/user-images?user_id=xxx&category=tryon
func gcsListUserImagesHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
		if userID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_id query parameter is required"})
			return
		}

		category := strings.TrimSpace(r.URL.Query().Get("category"))
		validCategories := map[string]bool{"input": true, "tryon": true, "pose": true, "info": true}
		if category != "" && !validCategories[category] {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category must be one of: input, tryon, pose, info"})
			return
		}

		var prefix string
		if category != "" {
			prefix = gcsUserPrefix(cfg, userID) + category + "/"
		} else {
			prefix = gcsUserPrefix(cfg, userID)
		}

		objects, err := gcsListPrefix(r.Context(), cfg, prefix)
		if err != nil {
			log.Printf("[api/user-images] gcs_list_failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to list images"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"user_id": userID,
			"images":  objects,
			"count":   len(objects),
		})
	}
=======
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("gcs list status %d: %s", resp.StatusCode, string(body))
	}

	var payload struct {
		Items []gcsObject `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Items, nil
}

// gcsSignedURL generates a V4 signed GET URL (RFC draft, GCS V4 signing) using the service
// account's private key. Self-contained — no dependency on cloud.google.com/go/storage.
// Reference: https://cloud.google.com/storage/docs/access-control/signing-urls-manually
func gcsSignedURL(cfg AppConfig, objectPath string, ttl time.Duration) (string, error) {
	if ttl <= 0 || ttl > 7*24*time.Hour {
		ttl = 1 * time.Hour
	}

	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	timestamp := now.Format("20060102T150405Z")
	credentialScope := fmt.Sprintf("%s/auto/storage/goog4_request", dateStamp)
	credential := fmt.Sprintf("%s/%s", cfg.GoogleClientEmail, credentialScope)

	host := "storage.googleapis.com"
	canonicalURI := "/" + gcsBucket + "/" + pathEscapeGCS(objectPath)

	// Query params (sorted, canonically-encoded)
	params := url.Values{}
	params.Set("X-Goog-Algorithm", "GOOG4-RSA-SHA256")
	params.Set("X-Goog-Credential", credential)
	params.Set("X-Goog-Date", timestamp)
	params.Set("X-Goog-Expires", fmt.Sprintf("%d", int(ttl.Seconds())))
	params.Set("X-Goog-SignedHeaders", "host")

	canonicalQuery := canonicalV4Query(params)
	canonicalHeaders := "host:" + host + "\n"
	signedHeaders := "host"

	canonicalRequest := strings.Join([]string{
		"GET",
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	}, "\n")

	hashed := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"GOOG4-RSA-SHA256",
		timestamp,
		credentialScope,
		hex.EncodeToString(hashed[:]),
	}, "\n")

	signature, err := rsaSignSHA256([]byte(stringToSign), cfg.GooglePrivateKey)
	if err != nil {
		return "", err
	}

	signedURL := fmt.Sprintf("https://%s%s?%s&X-Goog-Signature=%s",
		host,
		canonicalURI,
		canonicalQuery,
		hex.EncodeToString(signature),
	)
	return signedURL, nil
}

// canonicalV4Query builds the canonical query string per GCS V4 spec: sorted by key,
// with RFC 3986 encoding (uppercase hex, spaces as %20, no '+').
func canonicalV4Query(params url.Values) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteString("&")
		}
		b.WriteString(v4Escape(k))
		b.WriteString("=")
		b.WriteString(v4Escape(params.Get(k)))
	}
	return b.String()
}

// v4Escape implements RFC 3986 unreserved-only encoding required by GCS V4 signing.
func v4Escape(s string) string {
	const unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if strings.IndexByte(unreserved, c) >= 0 {
			b.WriteByte(c)
		} else {
			b.WriteString(fmt.Sprintf("%%%02X", c))
		}
	}
	return b.String()
}

// pathEscapeGCS escapes an object name for use in a URL path — same rules as v4Escape
// but preserves '/' separators.
func pathEscapeGCS(p string) string {
	parts := strings.Split(p, "/")
	for i, part := range parts {
		parts[i] = v4Escape(part)
	}
	return strings.Join(parts, "/")
}

// rsaSignSHA256 signs data with an RSA private key provided in PEM form.
// Reuses cleanPrivateKey + parseRSAPrivateKey from api.go so quoting/escaping
// in the .env file is handled the same way as the JWT signer.
func rsaSignSHA256(data []byte, pemKey string) ([]byte, error) {
	key, err := parseRSAPrivateKey(cleanPrivateKey(pemKey))
	if err != nil {
		return nil, err
	}
	h := sha256.Sum256(data)
	return rsa.SignPKCS1v15(nil, key, crypto.SHA256, h[:])
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
}
