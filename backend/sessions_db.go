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

type tryonGenerationRow struct {
	ID                 string  `json:"id"`
	UserID             string  `json:"user_id"`
	ProductID          *string `json:"product_id"`
	GCSURL             *string `json:"gcs_url"`
	PersonImgURL       *string `json:"person_img_url"`
	SignedURL          *string `json:"signed_url"`
	PersonImgSignedURL *string `json:"person_img_signed_url"`
	Description        *string `json:"description"`
	CreatedAt          string  `json:"created_at"`
}

// fetchTryonsByUserID returns all try-on generations for a user, newest first.
func fetchTryonsByUserID(ctx context.Context, cfg AppConfig, userID string) ([]tryonGenerationRow, error) {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return nil, fmt.Errorf("supabase not configured")
	}

	endpoint, err := url.Parse(tryonGenerationsEndpoint(cfg))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	q.Set("select", "*")
	q.Set("user_id", "eq."+strings.TrimSpace(userID))
	q.Set("order", "created_at.desc")
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
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("tryon_generations list failed: status=%d body=%s", resp.StatusCode, string(body))
	}

	var rows []tryonGenerationRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}

const tryonGenerationsTablePath = "tryon_generations"

func tryonGenerationsEndpoint(cfg AppConfig) string {
	return strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/" + tryonGenerationsTablePath
}

// insertTryonGeneration records a successful try-on API call.
// Expected payload keys: user_id, product_id, gcs_url, person_image_url, description (optional).
func insertTryonGeneration(ctx context.Context, cfg AppConfig, payload map[string]any) error {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return fmt.Errorf("supabase not configured")
	}

	body, err := json.Marshal([]map[string]any{payload})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tryonGenerationsEndpoint(cfg), strings.NewReader(string(body)))
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
		return fmt.Errorf("tryon-generations insert failed: status=%d body=%s", resp.StatusCode, string(b))
	}
	return nil
}
