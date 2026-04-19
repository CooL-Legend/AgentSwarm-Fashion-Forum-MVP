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

const usersTablePath = "users"

// upsertUserByClerkID ensures a row exists in public.users for this Clerk identity.
// public.users.user_id (text) IS the Clerk subject id — there is no separate clerk_id column.
// Optional profile fields (first_name, last_name, username, email_id, etc.) are merged on conflict.
func upsertUserByClerkID(ctx context.Context, cfg AppConfig, clerkID string, fields map[string]any) error {
	clerkID = strings.TrimSpace(clerkID)
	if clerkID == "" {
		return fmt.Errorf("clerk id is required")
	}
	if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseAPIKey) == "" {
		return fmt.Errorf("supabase not configured")
	}

	payload := map[string]any{"user_id": clerkID}
	for k, v := range fields {
		if strings.TrimSpace(k) == "user_id" {
			continue
		}
		payload[k] = v
	}

	body, err := json.Marshal([]map[string]any{payload})
	if err != nil {
		return err
	}

	endpoint := strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/" + usersTablePath + "?on_conflict=user_id"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", cfg.SupabaseAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("users upsert failed: status=%d body=%s", resp.StatusCode, string(raw))
	}
	return nil
}
