package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

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
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

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
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

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
}
