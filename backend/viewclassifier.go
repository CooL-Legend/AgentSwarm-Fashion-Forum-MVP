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

type classifyResponse struct {
	IsFront int `json:"is_front"`
}

// classifyViewType posts the image URL to the HF front/back classifier Space
// and returns 0 (back) or 1 (front). Returns an error on network / status failures;
// callers should fall back to 1 on error.
func classifyViewType(ctx context.Context, cfg AppConfig, imageURL string) (int, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.ViewClassifierURL), "/")
	if base == "" {
		return 1, fmt.Errorf("view classifier url not configured")
	}
	if strings.TrimSpace(imageURL) == "" {
		return 1, fmt.Errorf("empty image url")
	}

	body, err := json.Marshal(map[string]string{"image_url": imageURL})
	if err != nil {
		return 1, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/classify", strings.NewReader(string(body)))
	if err != nil {
		return 1, err
	}
	req.Header.Set("Content-Type", "application/json")
	if tok := strings.TrimSpace(cfg.HFToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return 1, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return 1, fmt.Errorf("classify failed: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var parsed classifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return 1, err
	}
	if parsed.IsFront != 0 && parsed.IsFront != 1 {
		return 1, fmt.Errorf("unexpected is_front value: %d", parsed.IsFront)
	}
	return parsed.IsFront, nil
}
