package main

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	userTempTablePath = "user-temp"
	onboardingVersion = 1
)

var (
	errUserNotFound = errors.New("user not found")

	visualLanguageOptions = setOf(
		"minimalist_monochromatic",
		"raw_industrial_brutalist",
		"avant_garde_dramatic",
		"classic_high_fashion",
	)
	sexOptions       = setOf("male", "female", "non_binary", "prefer_not_to_say")
	tshirtFitOptions = setOf("oversized", "relaxed", "slim_fit")
	jeansFitOptions  = setOf("oversized_baggy", "relaxed_straight", "slim_tapered")

	majorBuysOptions = setOf("tshirts", "jackets_outerwear", "jeans_trousers")
	seasonalOptions  = setOf(
		"summer_breathable_linen",
		"tech_wear",
		"winter_heavy_layering",
		"sharp_overcoats",
	)
	colorFamilyOptions = setOf(
		"neutrals_concrete_sand",
		"voids_black_charcoal",
		"earth_olive_rust",
		"vibrants_neons",
	)
	activityOptions = setOf(
		"strength_training",
		"football_basketball",
		"yoga_running",
		"creative_photography",
	)
	fitFrustrationOptions = setOf(
		"shoulder_pinch",
		"tent_effect",
		"arm_bicep_trap",
		"quad_struggle",
		"torso_crop",
		"waist_gap",
		"bust_fit_tension",
		"hip_constraint",
		"rise_struggle",
		"petite_tall_sleeve",
	)
)

type appUserProfile struct {
	UserID                string   `json:"user_id"`
	FirstName             *string  `json:"first_name"`
	LastName              *string  `json:"last_name"`
	Username              *string  `json:"username"`
	Bio                   *string  `json:"bio"`
	EmailID               *string  `json:"email_id"`
	PhoneNumber           *string  `json:"phone_number"`
	Location              *string  `json:"location"`
	Sex                   *string  `json:"sex"`
	Height                *string  `json:"height"`
	FrontImage            *string  `json:"front_image"`
	BackImage             *string  `json:"back_image"`
	Images                []string `json:"images"`
	CreatedAt             *string  `json:"created_at"`
	UpdatedAt             *string  `json:"updated_at"`
	ProfileVector         any      `json:"profile_vector"`
	OnboardingCompleted   *bool    `json:"onboarding_completed"`
	OnboardingSkipped     *bool    `json:"onboarding_skipped"`
	OnboardingVersion     *int     `json:"onboarding_version"`
	OnboardingCompletedAt *string  `json:"onboarding_completed_at"`
	OnboardingSkippedAt   *string  `json:"onboarding_skipped_at"`

	Age                 *int     `json:"age"`
	Occupation          *string  `json:"occupation"`
	HeightCM            *float64 `json:"height_cm"`
	ShoulderWidthCM     *float64 `json:"shoulder_width_cm"`
	ChestBustCM         *float64 `json:"chest_bust_cm"`
	ArmLengthCM         *float64 `json:"arm_length_cm"`
	WaistCM             *float64 `json:"waist_cm"`
	ThighCM             *float64 `json:"thigh_cm"`
	InseamCM            *float64 `json:"inseam_cm"`
	VisualLanguage      *string  `json:"visual_language"`
	MajorBuys           []string `json:"major_buys"`
	SeasonalPreferences []string `json:"seasonal_preferences"`
	TshirtFit           *string  `json:"tshirt_fit"`
	JeansFit            *string  `json:"jeans_fit"`
	ColorFamilies       []string `json:"color_families"`
	ActivityProfiles    []string `json:"activity_profiles"`
	FitFrustrations     []string `json:"fit_frustrations"`
}

type bootstrapUserRequest struct {
	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
	Username  *string `json:"username"`
	EmailID   *string `json:"email_id"`
	Age       *int    `json:"age"`
}

type onboardingUserRequest struct {
	Skip bool `json:"skip"`

	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
	Username  *string `json:"username"`
	Age       *int    `json:"age"`
	Sex       *string `json:"sex"`

	VisualLanguage *string `json:"visual_language"`
	Occupation     *string `json:"occupation"`

	HeightCM        *float64 `json:"height_cm"`
	ShoulderWidthCM *float64 `json:"shoulder_width_cm"`
	ChestBustCM     *float64 `json:"chest_bust_cm"`
	ArmLengthCM     *float64 `json:"arm_length_cm"`
	WaistCM         *float64 `json:"waist_cm"`
	ThighCM         *float64 `json:"thigh_cm"`
	InseamCM        *float64 `json:"inseam_cm"`

	MajorBuys           []string `json:"major_buys"`
	SeasonalPreferences []string `json:"seasonal_preferences"`
	TshirtFit           *string  `json:"tshirt_fit"`
	JeansFit            *string  `json:"jeans_fit"`
	ColorFamilies       []string `json:"color_families"`
	ActivityProfiles    []string `json:"activity_profiles"`
	FitFrustrations     []string `json:"fit_frustrations"`
}

func currentUserHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID, err := authenticatedClerkUserID(r.Context(), cfg, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}

		user, err := fetchUserTempByID(r.Context(), cfg, userID)
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

func bootstrapUserHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID, err := authenticatedClerkUserID(r.Context(), cfg, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}

		var input bootstrapUserRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil && !errors.Is(err, io.EOF) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		// Step 1: ensure a row exists in public.users for this Clerk identity.
		// public.users.user_id (text PK) stores the Clerk id directly. Everything
		// else in this handler is best-effort; if this fails the user cannot be
		// gated into the app.
		provisionFields := map[string]any{}
		if v := cleanOptionalString(input.FirstName); v != nil {
			provisionFields["first_name"] = *v
		}
		if v := cleanOptionalString(input.LastName); v != nil {
			provisionFields["last_name"] = *v
		}
		if v := cleanOptionalString(input.Username); v != nil {
			provisionFields["username"] = *v
		}
		if v := cleanOptionalString(input.EmailID); v != nil {
			provisionFields["email_id"] = *v
		}
		if err := upsertUserByClerkID(r.Context(), cfg, userID, provisionFields); err != nil {
			log.Printf("[api/users/bootstrap] provision_failed userId=%s err=%v", userID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error": "User provisioning failed",
				"code":  "provision_failed",
			})
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		payload := map[string]any{
			"user_id":    userID,
			"updated_at": now,
		}
		if value := cleanOptionalString(input.FirstName); value != nil {
			payload["first_name"] = *value
		}
		if value := cleanOptionalString(input.LastName); value != nil {
			payload["last_name"] = *value
		}
		if value := cleanOptionalString(input.Username); value != nil {
			payload["username"] = *value
		}
		if value := cleanOptionalString(input.EmailID); value != nil {
			payload["email_id"] = *value
		}
		if input.Age != nil && *input.Age > 0 {
			payload["age"] = *input.Age
		}

		existing, err := fetchUserTempByID(r.Context(), cfg, userID)
		if err != nil && !errors.Is(err, errUserNotFound) {
			log.Printf("[api/users/bootstrap] fetch_failed userId=%s err=%v", userID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to access user table."})
			return
		}

		if err == nil {
			if len(payload) == 2 { // user_id + updated_at only
				writeJSON(w, http.StatusOK, map[string]any{
					"user":                existing,
					"requires_onboarding": requiresOnboarding(existing),
				})
				return
			}

			updated, upsertErr := upsertUserTemp(r.Context(), cfg, payload)
			if upsertErr != nil {
				log.Printf("[api/users/bootstrap] update_failed userId=%s err=%v", userID, upsertErr)
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to bootstrap user."})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"user":                updated,
				"requires_onboarding": requiresOnboarding(updated),
			})
			return
		}

		payload["onboarding_completed"] = false
		payload["onboarding_skipped"] = false
		payload["onboarding_version"] = onboardingVersion
		applyBootstrapDefaults(payload, userID)

		created, err := upsertUserTemp(r.Context(), cfg, payload)
		if err != nil {
			// Backward-compatible retry for environments where newer onboarding columns
			// may not exist yet on "user-temp".
			legacyPayload := map[string]any{
				"user_id":    payload["user_id"],
				"updated_at": payload["updated_at"],
				"first_name": payload["first_name"],
				"last_name":  payload["last_name"],
				"username":   payload["username"],
				"email_id":   payload["email_id"],
			}
			created, err = upsertUserTemp(r.Context(), cfg, legacyPayload)
			if err != nil {
				log.Printf("[api/users/bootstrap] upsert_failed userId=%s err=%v", userID, err)
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to bootstrap user."})
				return
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"user":                created,
			"requires_onboarding": requiresOnboarding(created),
		})
	}
}

func onboardingUserHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID, err := authenticatedClerkUserID(r.Context(), cfg, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}

		var input onboardingUserRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		payload := map[string]any{
			"user_id":            userID,
			"onboarding_version": onboardingVersion,
			"updated_at":         now,
		}

		if input.Skip {
			if err := applyOptionalProfileFields(payload, input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			payload["onboarding_completed"] = false
			payload["onboarding_skipped"] = true
			payload["onboarding_completed_at"] = nil
			payload["onboarding_skipped_at"] = now

			user, err := upsertUserTemp(r.Context(), cfg, payload)
			if err != nil {
				log.Printf("[api/users/onboarding] skip_upsert_failed userId=%s err=%v", userID, err)
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to update onboarding status."})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"user": user})
			return
		}

		if err := validateRequiredOnboarding(input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if err := applyOptionalProfileFields(payload, input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		payload["onboarding_completed"] = true
		payload["onboarding_skipped"] = false
		payload["onboarding_completed_at"] = now
		payload["onboarding_skipped_at"] = nil

		user, err := upsertUserTemp(r.Context(), cfg, payload)
		if err != nil {
			log.Printf("[api/users/onboarding] upsert_failed userId=%s err=%v", userID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Failed to save onboarding preferences."})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": user})
	}
}

func validateRequiredOnboarding(input onboardingUserRequest) error {
	if cleanOptionalString(input.FirstName) == nil {
		return errors.New("first_name is required")
	}
	if cleanOptionalString(input.LastName) == nil {
		return errors.New("last_name is required")
	}
	if cleanOptionalString(input.Username) == nil {
		return errors.New("username is required")
	}
	if input.Age == nil || *input.Age < 10 || *input.Age > 120 {
		return errors.New("age must be between 10 and 120")
	}
	if value := cleanOptionalString(input.VisualLanguage); value == nil {
		return errors.New("visual_language is required")
	}
	if value := cleanOptionalString(input.Sex); value == nil {
		return errors.New("sex is required")
	}
	return nil
}

func applyOptionalProfileFields(payload map[string]any, input onboardingUserRequest) error {
	if value := cleanOptionalString(input.FirstName); value != nil {
		payload["first_name"] = *value
	}
	if value := cleanOptionalString(input.LastName); value != nil {
		payload["last_name"] = *value
	}
	if value := cleanOptionalString(input.Username); value != nil {
		payload["username"] = *value
	}
	if input.Age != nil {
		if *input.Age < 0 || *input.Age > 120 {
			return errors.New("age must be between 0 and 120")
		}
		payload["age"] = *input.Age
	}
	if value := cleanOptionalString(input.Sex); value != nil {
		normalized := strings.ToLower(*value)
		if _, ok := sexOptions[normalized]; !ok {
			return fmt.Errorf("invalid sex value: %s", *value)
		}
		payload["sex"] = normalized
	}
	if value := cleanOptionalString(input.VisualLanguage); value != nil {
		normalized := strings.ToLower(*value)
		if _, ok := visualLanguageOptions[normalized]; !ok {
			return fmt.Errorf("invalid visual_language value: %s", *value)
		}
		payload["visual_language"] = normalized
	}
	if value := cleanOptionalString(input.Occupation); value != nil {
		payload["occupation"] = *value
	}
	if input.HeightCM != nil {
		if *input.HeightCM <= 0 {
			return errors.New("height_cm must be > 0")
		}
		payload["height_cm"] = *input.HeightCM
		payload["height"] = fmt.Sprintf("%.0f cm", *input.HeightCM)
	}
	if input.ShoulderWidthCM != nil {
		if *input.ShoulderWidthCM <= 0 {
			return errors.New("shoulder_width_cm must be > 0")
		}
		payload["shoulder_width_cm"] = *input.ShoulderWidthCM
	}
	if input.ChestBustCM != nil {
		if *input.ChestBustCM <= 0 {
			return errors.New("chest_bust_cm must be > 0")
		}
		payload["chest_bust_cm"] = *input.ChestBustCM
	}
	if input.ArmLengthCM != nil {
		if *input.ArmLengthCM <= 0 {
			return errors.New("arm_length_cm must be > 0")
		}
		payload["arm_length_cm"] = *input.ArmLengthCM
	}
	if input.WaistCM != nil {
		if *input.WaistCM <= 0 {
			return errors.New("waist_cm must be > 0")
		}
		payload["waist_cm"] = *input.WaistCM
	}
	if input.ThighCM != nil {
		if *input.ThighCM <= 0 {
			return errors.New("thigh_cm must be > 0")
		}
		payload["thigh_cm"] = *input.ThighCM
	}
	if input.InseamCM != nil {
		if *input.InseamCM <= 0 {
			return errors.New("inseam_cm must be > 0")
		}
		payload["inseam_cm"] = *input.InseamCM
	}

	if len(input.MajorBuys) > 0 {
		validated, err := validateChoiceArray(input.MajorBuys, majorBuysOptions, "major_buys")
		if err != nil {
			return err
		}
		payload["major_buys"] = validated
	}
	if len(input.SeasonalPreferences) > 0 {
		validated, err := validateChoiceArray(input.SeasonalPreferences, seasonalOptions, "seasonal_preferences")
		if err != nil {
			return err
		}
		payload["seasonal_preferences"] = validated
	}
	if value := cleanOptionalString(input.TshirtFit); value != nil {
		normalized := strings.ToLower(*value)
		if _, ok := tshirtFitOptions[normalized]; !ok {
			return fmt.Errorf("invalid tshirt_fit value: %s", *value)
		}
		payload["tshirt_fit"] = normalized
	}
	if value := cleanOptionalString(input.JeansFit); value != nil {
		normalized := strings.ToLower(*value)
		if _, ok := jeansFitOptions[normalized]; !ok {
			return fmt.Errorf("invalid jeans_fit value: %s", *value)
		}
		payload["jeans_fit"] = normalized
	}
	if len(input.ColorFamilies) > 0 {
		validated, err := validateChoiceArray(input.ColorFamilies, colorFamilyOptions, "color_families")
		if err != nil {
			return err
		}
		payload["color_families"] = validated
	}
	if len(input.ActivityProfiles) > 0 {
		validated, err := validateChoiceArray(input.ActivityProfiles, activityOptions, "activity_profiles")
		if err != nil {
			return err
		}
		payload["activity_profiles"] = validated
	}
	if len(input.FitFrustrations) > 0 {
		validated, err := validateChoiceArray(input.FitFrustrations, fitFrustrationOptions, "fit_frustrations")
		if err != nil {
			return err
		}
		payload["fit_frustrations"] = validated
	}

	return nil
}

func cleanOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func applyBootstrapDefaults(payload map[string]any, userID string) {
	if _, exists := payload["first_name"]; !exists {
		payload["first_name"] = "New"
	}
	if _, exists := payload["last_name"]; !exists {
		payload["last_name"] = "User"
	}
	if _, exists := payload["username"]; exists {
		return
	}

	if emailRaw, ok := payload["email_id"].(string); ok {
		email := strings.TrimSpace(emailRaw)
		if email != "" {
			parts := strings.SplitN(email, "@", 2)
			username := strings.TrimSpace(parts[0])
			if username != "" {
				payload["username"] = username
				return
			}
		}
	}

	cleanUserID := strings.TrimSpace(strings.TrimPrefix(userID, "user_"))
	cleanUserID = strings.ToLower(cleanUserID)
	if len(cleanUserID) > 16 {
		cleanUserID = cleanUserID[:16]
	}
	if cleanUserID == "" {
		cleanUserID = "newuser"
	}
	payload["username"] = "user_" + cleanUserID
}

func validateChoiceArray(values []string, allowed map[string]struct{}, fieldName string) ([]string, error) {
	cleaned := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if normalized == "" {
			continue
		}
		if _, ok := allowed[normalized]; !ok {
			return nil, fmt.Errorf("invalid %s value: %s", fieldName, value)
		}
		if _, already := seen[normalized]; already {
			continue
		}
		seen[normalized] = struct{}{}
		cleaned = append(cleaned, normalized)
	}
	return cleaned, nil
}

func requiresOnboarding(user *appUserProfile) bool {
	if user == nil {
		return true
	}
	completed := user.OnboardingCompleted != nil && *user.OnboardingCompleted
	skipped := user.OnboardingSkipped != nil && *user.OnboardingSkipped
	return !completed && !skipped
}

func userTempEndpoint(cfg AppConfig) string {
	return strings.TrimRight(cfg.SupabaseURL, "/") + "/rest/v1/" + userTempTablePath
}

func fetchUserTempByID(ctx context.Context, cfg AppConfig, userID string) (*appUserProfile, error) {
	endpoint, err := url.Parse(userTempEndpoint(cfg))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	q.Set("select", "*")
	q.Set("user_id", "eq."+strings.TrimSpace(userID))
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
	user := normalizeUserProfile(rows[0])
	return &user, nil
}

func upsertUserTemp(ctx context.Context, cfg AppConfig, payload map[string]any) (*appUserProfile, error) {
	// Primary path: true upsert when user_id has a unique/exclusion constraint.
	user, err := upsertUserTempWithConflict(ctx, cfg, payload)
	if err == nil {
		return user, nil
	}

	// Fallback path: supports environments where user_id is not a unique key and
	// on_conflict cannot be used.
	userIDRaw, ok := payload["user_id"].(string)
	if !ok {
		return nil, err
	}
	userID := strings.TrimSpace(userIDRaw)
	if userID == "" {
		return nil, err
	}

	updated, updateErr := updateUserTempByID(ctx, cfg, userID, payload)
	if updateErr == nil {
		return updated, nil
	}
	if !errors.Is(updateErr, errUserNotFound) {
		return nil, fmt.Errorf("%v; fallback update failed: %w", err, updateErr)
	}

	created, createErr := insertUserTemp(ctx, cfg, payload)
	if createErr != nil {
		return nil, fmt.Errorf("%v; fallback insert failed: %w", err, createErr)
	}
	return created, nil
}

func upsertUserTempWithConflict(ctx context.Context, cfg AppConfig, payload map[string]any) (*appUserProfile, error) {
	endpoint, err := url.Parse(userTempEndpoint(cfg))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	q.Set("on_conflict", "user_id")
	endpoint.RawQuery = q.Encode()

	body, err := json.Marshal([]map[string]any{payload})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", cfg.SupabaseAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		payloadBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("supabase users upsert failed: status=%d body=%s", resp.StatusCode, string(payloadBody))
	}

	var rows []appUserProfile
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errors.New("upsert returned no rows")
	}
	user := normalizeUserProfile(rows[0])
	return &user, nil
}

func updateUserTempByID(ctx context.Context, cfg AppConfig, userID string, payload map[string]any) (*appUserProfile, error) {
	endpoint, err := url.Parse(userTempEndpoint(cfg))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	q.Set("user_id", "eq."+strings.TrimSpace(userID))
	endpoint.RawQuery = q.Encode()

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint.String(), strings.NewReader(string(body)))
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
		payloadBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("supabase users update failed: status=%d body=%s", resp.StatusCode, string(payloadBody))
	}

	var rows []appUserProfile
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errUserNotFound
	}
	user := normalizeUserProfile(rows[0])
	return &user, nil
}

func insertUserTemp(ctx context.Context, cfg AppConfig, payload map[string]any) (*appUserProfile, error) {
	endpoint, err := url.Parse(userTempEndpoint(cfg))
	if err != nil {
		return nil, err
	}

	body, err := json.Marshal([]map[string]any{payload})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), strings.NewReader(string(body)))
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
		payloadBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("supabase users insert failed: status=%d body=%s", resp.StatusCode, string(payloadBody))
	}

	var rows []appUserProfile
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errors.New("insert returned no rows")
	}
	user := normalizeUserProfile(rows[0])
	return &user, nil
}

func normalizeUserProfile(user appUserProfile) appUserProfile {
	if user.Images == nil {
		user.Images = []string{}
	}
	if user.MajorBuys == nil {
		user.MajorBuys = []string{}
	}
	if user.SeasonalPreferences == nil {
		user.SeasonalPreferences = []string{}
	}
	if user.ColorFamilies == nil {
		user.ColorFamilies = []string{}
	}
	if user.ActivityProfiles == nil {
		user.ActivityProfiles = []string{}
	}
	if user.FitFrustrations == nil {
		user.FitFrustrations = []string{}
	}
	return user
}

func setOf(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

type clerkJWTHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Typ string `json:"typ"`
}

type clerkJWTClaims struct {
	Subject   string `json:"sub"`
	Issuer    string `json:"iss"`
	Expiry    int64  `json:"exp"`
	NotBefore int64  `json:"nbf"`
	IssuedAt  int64  `json:"iat"`
}

type clerkJWK struct {
	KID string `json:"kid"`
	KTY string `json:"kty"`
	ALG string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
	Use string `json:"use"`
}

type clerkJWKSResponse struct {
	Keys []clerkJWK `json:"keys"`
}

type clerkJWKSCache struct {
	mu        sync.RWMutex
	keysByKid map[string]clerkJWK
	expiresAt time.Time
}

var globalClerkJWKSCache clerkJWKSCache

func authenticatedClerkUserID(ctx context.Context, cfg AppConfig, r *http.Request) (string, error) {
	token := strings.TrimSpace(r.Header.Get("Authorization"))
	if token == "" {
		return "", errors.New("missing authorization header")
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(strings.ToLower(token), strings.ToLower(prefix)) {
		return "", errors.New("invalid authorization format")
	}
	token = strings.TrimSpace(token[len(prefix):])
	if token == "" {
		return "", errors.New("empty bearer token")
	}

	claims, err := verifyClerkSessionToken(ctx, cfg, token)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return "", errors.New("token missing subject")
	}
	if !strings.HasPrefix(claims.Subject, "user_") {
		return "", errors.New("token subject is not a Clerk user")
	}
	return claims.Subject, nil
}

func verifyClerkSessionToken(ctx context.Context, cfg AppConfig, token string) (*clerkJWTClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token shape")
	}

	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("invalid token header")
	}
	var header clerkJWTHeader
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, errors.New("invalid token header payload")
	}
	if strings.TrimSpace(header.Kid) == "" {
		return nil, errors.New("token missing kid")
	}
	if !strings.EqualFold(strings.TrimSpace(header.Alg), "RS256") {
		return nil, errors.New("unsupported token algorithm")
	}

	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("invalid token payload")
	}
	var claims clerkJWTClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, errors.New("invalid token claims")
	}

	now := time.Now().Unix()
	if claims.Expiry == 0 || now >= claims.Expiry {
		return nil, errors.New("session token expired")
	}
	if claims.NotBefore > 0 && now+10 < claims.NotBefore {
		return nil, errors.New("session token not active yet")
	}

	jwk, err := getClerkJWKByKid(ctx, cfg, header.Kid)
	if err != nil {
		return nil, err
	}
	publicKey, err := clerkJWKToRSAPublicKey(jwk)
	if err != nil {
		return nil, err
	}

	signingInput := parts[0] + "." + parts[1]
	hash := sha256.Sum256([]byte(signingInput))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, errors.New("invalid token signature")
	}
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hash[:], signature); err != nil {
		return nil, errors.New("signature verification failed")
	}

	return &claims, nil
}

func getClerkJWKByKid(ctx context.Context, cfg AppConfig, kid string) (clerkJWK, error) {
	if key, ok := globalClerkJWKSCache.lookup(kid); ok {
		return key, nil
	}

	if err := globalClerkJWKSCache.refresh(ctx, cfg); err != nil {
		return clerkJWK{}, err
	}
	if key, ok := globalClerkJWKSCache.lookup(kid); ok {
		return key, nil
	}

	return clerkJWK{}, fmt.Errorf("jwks does not contain kid %s", kid)
}

func (c *clerkJWKSCache) lookup(kid string) (clerkJWK, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if time.Now().After(c.expiresAt) {
		return clerkJWK{}, false
	}
	key, ok := c.keysByKid[kid]
	return key, ok
}

func (c *clerkJWKSCache) refresh(ctx context.Context, cfg AppConfig) error {
	if strings.TrimSpace(cfg.ClerkSecretKey) == "" {
		return errors.New("CLERK_SECRET_KEY is required")
	}

	requestCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, "https://api.clerk.com/v1/jwks", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.ClerkSecretKey)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("failed to fetch clerk jwks: status=%d body=%s", resp.StatusCode, string(body))
	}

	var payload clerkJWKSResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return err
	}
	if len(payload.Keys) == 0 {
		return errors.New("clerk jwks response is empty")
	}

	keys := make(map[string]clerkJWK, len(payload.Keys))
	for _, key := range payload.Keys {
		if strings.TrimSpace(key.KID) == "" {
			continue
		}
		keys[key.KID] = key
	}
	if len(keys) == 0 {
		return errors.New("clerk jwks missing valid keys")
	}

	c.mu.Lock()
	c.keysByKid = keys
	c.expiresAt = time.Now().Add(10 * time.Minute)
	c.mu.Unlock()

	return nil
}

func clerkJWKToRSAPublicKey(jwk clerkJWK) (*rsa.PublicKey, error) {
	if !strings.EqualFold(jwk.KTY, "RSA") {
		return nil, errors.New("unsupported jwk key type")
	}
	nBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(jwk.N))
	if err != nil {
		return nil, errors.New("invalid jwk modulus")
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(jwk.E))
	if err != nil {
		return nil, errors.New("invalid jwk exponent")
	}
	if len(eBytes) == 0 {
		return nil, errors.New("invalid jwk exponent length")
	}

	eInt := 0
	for _, b := range eBytes {
		eInt = (eInt << 8) | int(b)
	}
	if eInt <= 0 {
		return nil, errors.New("invalid jwk exponent value")
	}

	pub := &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: eInt,
	}
	if pub.N.Sign() <= 0 {
		return nil, errors.New("invalid jwk modulus value")
	}
	return pub, nil
}
