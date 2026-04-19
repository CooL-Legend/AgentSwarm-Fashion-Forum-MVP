package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const userInputImagesTablePath = "user_input_images"

type userInputImageRow struct {
	ID          string  `json:"id"`
	UserID      string  `json:"user_id"`
	GCSURL      string  `json:"gcs_url"`
	Description *string `json:"description"`
	ViewType    any     `json:"view_type"` // Supabase may return int or string depending on column type
	Hash        string  `json:"hash"`
	CreatedAt   string  `json:"created_at"`
}

func userInputImagesEndpoint(cfg AppConfig) string {
	return strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/" + userInputImagesTablePath
}

// findUserInputImageByHash returns the existing row for (user_id, hash) or nil if not present.
func findUserInputImageByHash(ctx context.Context, cfg AppConfig, userID, hash string) (*userInputImageRow, error) {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return nil, fmt.Errorf("supabase not configured")
	}

	endpoint, err := url.Parse(userInputImagesEndpoint(cfg))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	q.Set("select", "*")
	q.Set("user_id", "eq."+strings.TrimSpace(userID))
	q.Set("hash", "eq."+strings.TrimSpace(hash))
	q.Set("limit", "1")
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", cfg.SupabaseAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("user-input-images lookup failed: status=%d body=%s", resp.StatusCode, string(b))
	}

	var rows []userInputImageRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// insertUserInputImage creates a new row and returns the inserted row (including the generated id).
// Expected payload keys: user_id, gcs_url, hash, view_type (optional).
func insertUserInputImage(ctx context.Context, cfg AppConfig, payload map[string]any) (*userInputImageRow, error) {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return nil, fmt.Errorf("supabase not configured")
	}

	body, err := json.Marshal([]map[string]any{payload})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, userInputImagesEndpoint(cfg), strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", cfg.SupabaseAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)
	req.Header.Set("Prefer", "return=representation")

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("user-input-images insert failed: status=%d body=%s", resp.StatusCode, string(b))
	}

	var rows []userInputImageRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("user-input-images insert returned no rows")
	}
	return &rows[0], nil
}

// updateUserInputImageEnrichment patches the description and view_type on an existing row in one round-trip.
func updateUserInputImageEnrichment(ctx context.Context, cfg AppConfig, id, description string, viewType int) error {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return fmt.Errorf("supabase not configured")
	}
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("id is required")
	}

	endpoint, err := url.Parse(userInputImagesEndpoint(cfg))
	if err != nil {
		return err
	}
	q := endpoint.Query()
	q.Set("id", "eq."+strings.TrimSpace(id))
	endpoint.RawQuery = q.Encode()

	body, err := json.Marshal(map[string]any{
		"description": description,
		"view_type":   viewType,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint.String(), strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", cfg.SupabaseAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)
	req.Header.Set("Prefer", "return=minimal")

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("user-input-images update failed: status=%d body=%s", resp.StatusCode, string(b))
	}
	return nil
}
