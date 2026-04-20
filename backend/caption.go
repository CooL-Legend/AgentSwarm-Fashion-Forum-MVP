package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// enrichUserInputImage fires the caption (Gemini) + view-classify (HF) pair in parallel,
// then PATCHes description + view_type on the given row. Fire-and-forget; errors are logged.
func enrichUserInputImage(cfg AppConfig, id, gcsURL, mimeType, b64 string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()

		var (
			wg       sync.WaitGroup
			desc     string
			viewType string = viewTypeFront // default: front view if classifier fails
			descErr  error
		)
		wg.Add(2)
		go func() {
			defer wg.Done()
			d, err := captionUserImage(ctx, cfg, mimeType, b64)
			if err != nil {
				descErr = err
				return
			}
			desc = d
		}()
		go func() {
			defer wg.Done()
			// HF Space can't fetch from our private GCS bucket via the raw public URL,
			// so re-sign the object path with a short-lived signed URL. gcsURL may be
			// gs:// (new) or https://... (legacy); parseGCSURL handles both.
			urlForHF := gcsURL
			if _, objectPath, parseErr := parseGCSURL(gcsURL); parseErr == nil {
				if signed, sErr := gcsSignedURL(cfg, objectPath, time.Hour); sErr == nil {
					urlForHF = signed
				} else {
					log.Printf("[enrich] sign_for_classify_failed id=%s err=%v", id, sErr)
				}
			} else {
				log.Printf("[enrich] parse_url_failed id=%s err=%v", id, parseErr)
			}
			v, err := classifyViewType(ctx, cfg, urlForHF)
			if err != nil {
				log.Printf("[enrich] classify_failed id=%s err=%v", id, err)
				return
			}
			viewType = v
		}()
		wg.Wait()

		if descErr != nil {
			log.Printf("[enrich] caption_failed id=%s err=%v", id, descErr)
			if mErr := markUserInputImageFailed(ctx, cfg, id); mErr != nil {
				log.Printf("[enrich] mark_failed_patch_failed id=%s err=%v", id, mErr)
			}
			return
		}
		if err := updateUserInputImageEnrichment(ctx, cfg, id, desc, viewType); err != nil {
			log.Printf("[enrich] patch_failed id=%s err=%v", id, err)
		}
	}()
}

// captionUserImage calls Vertex AI Gemini with the embedded clinical user-info prompt
// and returns the full multi-section description as-is.
func captionUserImage(ctx context.Context, cfg AppConfig, mimeType, b64Image string) (string, error) {
	if cfg.GoogleClientEmail == "" || cfg.GooglePrivateKey == "" || cfg.GoogleProjectID == "" {
		return "", fmt.Errorf("google vertex ai not configured")
	}
	accessToken, err := getAccessToken(ctx, cfg)
	if err != nil {
		return "", fmt.Errorf("access_token: %w", err)
	}

	model := strings.TrimSpace(cfg.GeminiCaptionModel)
	if model == "" {
		model = "gemini-2.5-flash"
	}
	if strings.TrimSpace(mimeType) == "" {
		mimeType = "image/png"
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
					map[string]any{"text": userInfoPrompt},
					map[string]any{
						"inlineData": map[string]any{
							"mimeType": mimeType,
							"data":     stripDataURL(b64Image),
						},
					},
				},
			},
		},
		"generationConfig": map[string]any{
			"responseModalities": []string{"TEXT"},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("gemini caption failed: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	text := extractInlineText(result)
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("gemini caption returned no text")
	}
	return strings.TrimSpace(text), nil
}

// extractInlineText pulls the first non-empty text part from a Gemini generateContent response.
func extractInlineText(payload map[string]any) string {
	candidates, _ := payload["candidates"].([]any)
	for _, c := range candidates {
		cm, _ := c.(map[string]any)
		content, _ := cm["content"].(map[string]any)
		parts, _ := content["parts"].([]any)
		for _, p := range parts {
			pm, _ := p.(map[string]any)
			if t, ok := pm["text"].(string); ok && strings.TrimSpace(t) != "" {
				return t
			}
		}
	}
	return ""
}
