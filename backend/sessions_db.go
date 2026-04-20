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

const tryonGenerationsTablePath = "tryon_generations"

func tryonGenerationsEndpoint(cfg AppConfig) string {
	return strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/" + tryonGenerationsTablePath
}

// tryonGenerationRow mirrors the columns on public.tryon_generations.
type tryonGenerationRow struct {
	ID                      string  `json:"id"`
	UserID                  string  `json:"user_id"`
	ProductID               string  `json:"product_id"`
	UserInputImageID        string  `json:"user_input_image_id"`
	OutputGCSURL            *string `json:"output_gcs_url"`
	Status                  string  `json:"status"`
	ProcessingStartedAt     *string `json:"processing_started_at"`
	ProcessingCompletedAt   *string `json:"processing_completed_at"`
	ProcessingDurationMs    *int    `json:"processing_duration_ms"`
	ErrorMessage            *string `json:"error_message"`
	FeedbackScore           *int    `json:"feedback_score"`
	FeedbackText            *string `json:"feedback_text"`
	FeedbackSubmittedAt     *string `json:"feedback_submitted_at"`
	CreatedAt               string  `json:"created_at"`
	UpdatedAt               string  `json:"updated_at"`
	DeletedAt               *string `json:"deleted_at"`
}

// fetchTryonsByUserID returns the user's completed, not-soft-deleted generations
// ordered newest first. Used by GET /api/tryons.
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
	q.Set("status", "eq.completed")
	q.Set("deleted_at", "is.null")
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

// insertTryonGenerationProcessing creates a new generation row with status='processing'
// and processing_started_at=now(). Returns the generated id so subsequent PATCH calls
// can address the row.
func insertTryonGenerationProcessing(ctx context.Context, cfg AppConfig, userID, productID, inputImageID string) (*tryonGenerationRow, error) {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return nil, fmt.Errorf("supabase not configured")
	}

	payload := map[string]any{
		"user_id":                 strings.TrimSpace(userID),
		"product_id":              strings.TrimSpace(productID),
		"user_input_image_id":     strings.TrimSpace(inputImageID),
		"status":                  "processing",
		"processing_started_at":   time.Now().UTC().Format(time.RFC3339Nano),
	}

	body, err := json.Marshal([]map[string]any{payload})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tryonGenerationsEndpoint(cfg), strings.NewReader(string(body)))
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
		return nil, fmt.Errorf("tryon_generations insert failed: status=%d body=%s", resp.StatusCode, string(b))
	}

	var rows []tryonGenerationRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("tryon_generations insert returned no rows")
	}
	return &rows[0], nil
}

// markTryonCompleted PATCHes the row to status='completed' with the output URI and timing.
func markTryonCompleted(ctx context.Context, cfg AppConfig, id, outputGCSURL string, startedAt time.Time) error {
	now := time.Now().UTC()
	elapsedMs := int(now.Sub(startedAt) / time.Millisecond)
	return patchTryonGeneration(ctx, cfg, id, map[string]any{
		"status":                  "completed",
		"output_gcs_url":          outputGCSURL,
		"processing_completed_at": now.Format(time.RFC3339Nano),
		"processing_duration_ms":  elapsedMs,
		"updated_at":              now.Format(time.RFC3339Nano),
	})
}

// markTryonFailed PATCHes the row to status='failed' with the error message and timing.
func markTryonFailed(ctx context.Context, cfg AppConfig, id, errMsg string, startedAt time.Time) error {
	now := time.Now().UTC()
	elapsedMs := int(now.Sub(startedAt) / time.Millisecond)
	// Trim to a reasonable length — some upstream errors dump pages of JSON.
	if len(errMsg) > 2000 {
		errMsg = errMsg[:2000] + "…"
	}
	return patchTryonGeneration(ctx, cfg, id, map[string]any{
		"status":                  "failed",
		"error_message":           errMsg,
		"processing_completed_at": now.Format(time.RFC3339Nano),
		"processing_duration_ms":  elapsedMs,
		"updated_at":              now.Format(time.RFC3339Nano),
	})
}

func patchTryonGeneration(ctx context.Context, cfg AppConfig, id string, patch map[string]any) error {
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return fmt.Errorf("supabase not configured")
	}
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("id is required")
	}

	endpoint, err := url.Parse(tryonGenerationsEndpoint(cfg))
	if err != nil {
		return err
	}
	q := endpoint.Query()
	q.Set("id", "eq."+strings.TrimSpace(id))
	endpoint.RawQuery = q.Encode()

	body, err := json.Marshal(patch)
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
		return fmt.Errorf("tryon_generations patch failed: status=%d body=%s", resp.StatusCode, string(b))
	}
	return nil
}
