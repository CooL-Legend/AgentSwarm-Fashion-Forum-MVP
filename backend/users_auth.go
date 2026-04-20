package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const usersTablePath = "users"

var errUserNotFound = errors.New("user not found")

type appUserProfile struct {
	ID                    string       `json:"id"`
	FirstName             *string      `json:"first_name"`
	LastName              *string      `json:"last_name"`
	Username              *string      `json:"username"`
	Bio                   *string      `json:"bio"`
	Email                 *string      `json:"email"`
	PhoneNumber           *string      `json:"phone_number"`
	PhoneVerified         *bool        `json:"phone_verified,omitempty"`
	Location              *string      `json:"location"`
	GenderIdentity        *string      `json:"gender_identity"`
	DateOfBirth           *string      `json:"date_of_birth"`
	ClerkImageURL         *string      `json:"clerk_image_url,omitempty"`
	AuthProvider          *string      `json:"auth_provider,omitempty"`
	CreatedAt             *string      `json:"created_at"`
	UpdatedAt             *string      `json:"updated_at"`
	DeletedAt             *string      `json:"deleted_at,omitempty"`
	ProfileVector         any          `json:"user_profile_vector,omitempty"`
	OnboardingCompleted   *bool        `json:"onboarding_completed"`
	OnboardingSkipped     *bool        `json:"onboarding_skipped"`
	OnboardingCompletedAt *string      `json:"onboarding_completed_at"`

	Occupation          *string      `json:"occupation"`
	HeightCM            *float64     `json:"height_cm"`
	ShoulderWidthCM     *float64     `json:"shoulder_width_cm"`
	ChestBustCM         *float64     `json:"chest_bust_cm"`
	ArmLengthCM         *float64     `json:"arm_length_cm"`
	WaistCM             *float64     `json:"waist_cm"`
	ThighCM             *float64     `json:"thigh_cm"`
	InseamCM            *float64     `json:"inseam_cm"`
	VisualLanguage      *string      `json:"visual_language"`
	MajorBuys           imageURLList `json:"major_buys"`
	SeasonalPreferences imageURLList `json:"seasonal_preferences"`
	TshirtFit           *string      `json:"tshirt_fit"`
	JeansFit            *string      `json:"jeans_fit"`
	ColorFamilies       imageURLList `json:"color_families"`
	ActivityProfiles    imageURLList `json:"activity_profiles"`
	FitFrustrations     imageURLList `json:"fit_frustrations"`
}

// currentUserID returns the single-user-mode Clerk id configured via
// CURRENT_USER_ID. Every handler that used to derive user from a JWT now calls
// this instead. Returns an error only if config loaded without one (which
// loadConfig already guards against, so this is defensive).
func currentUserID(cfg AppConfig) (string, error) {
	id := strings.TrimSpace(cfg.CurrentUserID)
	if id == "" {
		return "", errors.New("CURRENT_USER_ID not configured")
	}
	return id, nil
}

func currentUserHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		userID, err := currentUserID(cfg)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		user, err := fetchUserByID(r.Context(), cfg, userID)
		if err != nil {
			if errors.Is(err, errUserNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "User not found."})
				return
			}
			log.Printf("[api/users] fetch_failed userId=%s err=%v", userID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Users API unavailable."})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": user})
	}
}

func usersTableEndpoint(cfg AppConfig) string {
	return strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/" + usersTablePath
}

func fetchUserByID(ctx context.Context, cfg AppConfig, userID string) (*appUserProfile, error) {
	endpoint, err := url.Parse(usersTableEndpoint(cfg))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	q.Set("select", "*")
	q.Set("id", "eq."+strings.TrimSpace(userID))
	q.Set("deleted_at", "is.null")
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
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("supabase users fetch failed: status=%d body=%s", resp.StatusCode, string(body))
	}

	var rows []appUserProfile
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errUserNotFound
	}
	user := rows[0]
	return &user, nil
}
