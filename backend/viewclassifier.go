package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// view_type stored in user_input_images is a Postgres enum (`image_view_type`)
// with two valid values: "front" and "back". The HF classifier Space returns
// is_front as 0/1; we map that to the enum string here so the DB column never
// sees a raw integer from the upstream API.
const (
	viewTypeFront = "front"
	viewTypeBack  = "back"
)

type classifyResponse struct {
	IsFront int `json:"is_front"`
}

// mapIsFrontToViewType converts the classifier's is_front flag into the DB
// view_type enum value. 1 (is_front=true) → "front"; 0 → "back".
func mapIsFrontToViewType(isFront int) string {
	if isFront == 1 {
		return viewTypeFront
	}
	return viewTypeBack
}

// classifyViewType posts the image URL to the HF front/back classifier Space
// and returns the DB-ready view_type: "front" or "back". Returns an error
// on network / status failures; callers should fall back to viewTypeFront on error.
func classifyViewType(ctx context.Context, cfg AppConfig, imageURL string) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.ViewClassifierURL), "/")
	if base == "" {
		return viewTypeFront, fmt.Errorf("view classifier url not configured")
	}
	if strings.TrimSpace(imageURL) == "" {
		return viewTypeFront, fmt.Errorf("empty image url")
	}

	body, err := json.Marshal(map[string]string{"image_url": imageURL})
	if err != nil {
		return viewTypeFront, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/classify", strings.NewReader(string(body)))
	if err != nil {
		return viewTypeFront, err
	}
	req.Header.Set("Content-Type", "application/json")
	if tok := strings.TrimSpace(cfg.HFToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return viewTypeFront, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return viewTypeFront, fmt.Errorf("classify failed: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var parsed classifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return viewTypeFront, err
	}
	if parsed.IsFront != 0 && parsed.IsFront != 1 {
		return viewTypeFront, fmt.Errorf("unexpected is_front value: %d", parsed.IsFront)
	}
	return mapIsFrontToViewType(parsed.IsFront), nil
}
