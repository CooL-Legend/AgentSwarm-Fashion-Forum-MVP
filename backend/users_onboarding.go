package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// -----------------------------------------------------------------------------
// POST /api/user/{userId}/onboarding
// -----------------------------------------------------------------------------

type onboardingRequest struct {
	UserID              string   `json:"userId"`
	DisplayName         string   `json:"displayName"`
	Username            string   `json:"username"`
	AvatarURL           *string  `json:"avatarUrl"`
	VisualLanguage      *string  `json:"visualLanguage"`
	Gender              *string  `json:"gender"`
	Age                 *string  `json:"age"`
	Occupation          *string  `json:"occupation"`
	Height              *string  `json:"height"`
	ShoulderWidth       *string  `json:"shoulderWidth"`
	Chest               *string  `json:"chest"`
	ArmLength           *string  `json:"armLength"`
	Waist               *string  `json:"waist"`
	Thigh               *string  `json:"thigh"`
	Inseam              *string  `json:"inseam"`
	MajorBuys           []string `json:"majorBuys"`
	SeasonalPreferences []string `json:"seasonalPreferences"`
	TshirtFit           *string  `json:"tshirtFit"`
	JeansFit            *string  `json:"jeansFit"`
	ColorFamily         *string  `json:"colorFamily"`
	Activities          []string `json:"activities"`
	FitFrustrations     []string `json:"fitFrustrations"`
}

func saveOnboardingHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clerkID, err := authenticatedClerkUserID(r.Context(), cfg, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}
		pathUserID := strings.TrimSpace(r.PathValue("userId"))
		if pathUserID != clerkID {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "user id mismatch"})
			return
		}

		var req onboardingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
			return
		}

		now := time.Now().UTC().Format(time.RFC3339)
		patch := map[string]any{
			"onboarding_completed":    true,
			"onboarding_completed_at": now,
			"updated_at":              now,
		}
		if s := strings.TrimSpace(req.Username); s != "" {
			patch["username"] = s
		}
		if req.Gender != nil && strings.TrimSpace(*req.Gender) != "" {
			patch["gender_identity"] = strings.TrimSpace(*req.Gender)
		}
		if req.Occupation != nil && strings.TrimSpace(*req.Occupation) != "" {
			patch["occupation"] = strings.TrimSpace(*req.Occupation)
		}
		if req.VisualLanguage != nil && strings.TrimSpace(*req.VisualLanguage) != "" {
			patch["visual_language"] = strings.TrimSpace(*req.VisualLanguage)
		}
		if req.TshirtFit != nil && strings.TrimSpace(*req.TshirtFit) != "" {
			patch["tshirt_fit"] = strings.TrimSpace(*req.TshirtFit)
		}
		if req.JeansFit != nil && strings.TrimSpace(*req.JeansFit) != "" {
			patch["jeans_fit"] = strings.TrimSpace(*req.JeansFit)
		}
		if v, ok := parseMeasurementCM(req.Height); ok {
			patch["height_cm"] = v
		}
		if v, ok := parseMeasurementCM(req.ShoulderWidth); ok {
			patch["shoulder_width_cm"] = v
		}
		if v, ok := parseMeasurementCM(req.Chest); ok {
			patch["chest_bust_cm"] = v
		}
		if v, ok := parseMeasurementCM(req.ArmLength); ok {
			patch["arm_length_cm"] = v
		}
		if v, ok := parseMeasurementCM(req.Waist); ok {
			patch["waist_cm"] = v
		}
		if v, ok := parseMeasurementCM(req.Thigh); ok {
			patch["thigh_cm"] = v
		}
		if v, ok := parseMeasurementCM(req.Inseam); ok {
			patch["inseam_cm"] = v
		}
		if req.MajorBuys != nil {
			patch["major_buys"] = req.MajorBuys
		}
		if req.SeasonalPreferences != nil {
			patch["seasonal_preferences"] = req.SeasonalPreferences
		}
		if req.Activities != nil {
			patch["activity_profiles"] = req.Activities
		}
		if req.FitFrustrations != nil {
			patch["fit_frustrations"] = req.FitFrustrations
		}
		if req.ColorFamily != nil && strings.TrimSpace(*req.ColorFamily) != "" {
			patch["color_families"] = []string{strings.TrimSpace(*req.ColorFamily)}
		}

		if ok := patchUserByID(r.Context(), cfg, clerkID, patch); !ok {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "failed to persist onboarding"})
			return
		}

		log.Printf("[api/user/onboarding] ok user=%s fields=%d", clerkID, len(patch))
		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}

// parseMeasurementCM interprets freeform measurement strings entered in the
// wizard and normalizes to centimeters. Accepts:
//   - "175" / "175cm" / "175 cm"       → 175
//   - "68in" / "68 inches" / `68"`     → 68 * 2.54
//   - `5'9"` / `5'9`                   → (5*12 + 9) * 2.54
// Returns (0, false) when the input is empty or unparseable; the handler
// then skips the field rather than patching NULL.
func parseMeasurementCM(s *string) (float64, bool) {
	if s == nil {
		return 0, false
	}
	raw := strings.TrimSpace(*s)
	if raw == "" {
		return 0, false
	}
	lower := strings.ToLower(raw)

	if i := strings.Index(lower, "'"); i > 0 {
		feetPart := strings.TrimSpace(lower[:i])
		rest := strings.TrimSpace(lower[i+1:])
		rest = strings.TrimSuffix(rest, `"`)
		rest = strings.TrimSuffix(rest, "in")
		rest = strings.TrimSpace(rest)
		feet, errF := strconv.ParseFloat(feetPart, 64)
		inches := 0.0
		if rest != "" {
			if v, errI := strconv.ParseFloat(rest, 64); errI == nil {
				inches = v
			}
		}
		if errF == nil {
			return (feet*12 + inches) * 2.54, true
		}
	}

	isInches := strings.Contains(lower, "in") || strings.Contains(lower, `"`)
	cleaned := lower
	for _, suf := range []string{"cm", "inches", "inch", "in", `"`} {
		cleaned = strings.ReplaceAll(cleaned, suf, "")
	}
	cleaned = strings.TrimSpace(cleaned)
	v, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return 0, false
	}
	if isInches {
		return v * 2.54, true
	}
	return v, true
}

// -----------------------------------------------------------------------------
// GET /api/user/{userId}/onboarding-status
// -----------------------------------------------------------------------------

func onboardingStatusHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clerkID, err := authenticatedClerkUserID(r.Context(), cfg, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}
		pathUserID := strings.TrimSpace(r.PathValue("userId"))
		if pathUserID != clerkID {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "user id mismatch"})
			return
		}

		user, err := fetchUserByID(r.Context(), cfg, clerkID)
		if err != nil {
			if errors.Is(err, errUserNotFound) {
				writeJSON(w, http.StatusOK, map[string]any{"onboarding_completed": false})
				return
			}
			log.Printf("[api/user/onboarding-status] fetch_failed user=%s err=%v", clerkID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "lookup failed"})
			return
		}
		completed := user.OnboardingCompleted != nil && *user.OnboardingCompleted
		writeJSON(w, http.StatusOK, map[string]any{"onboarding_completed": completed})
	}
}

// -----------------------------------------------------------------------------
// POST /api/user/upload-media
// -----------------------------------------------------------------------------

const uploadMediaMaxBytes = 10 * 1024 * 1024

func uploadMediaHandler(cfg AppConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clerkID, err := authenticatedClerkUserID(r.Context(), cfg, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, uploadMediaMaxBytes+1024)
		if err := r.ParseMultipartForm(uploadMediaMaxBytes); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart form"})
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file field is required"})
			return
		}
		defer file.Close()

		if header.Size > uploadMediaMaxBytes {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file exceeds 10MB limit"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(file, uploadMediaMaxBytes+1))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "failed to read file"})
			return
		}
		if len(raw) > uploadMediaMaxBytes {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file exceeds 10MB limit"})
			return
		}
		if len(raw) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file is empty"})
			return
		}

		mimeType, ext, ok := sniffImageType(raw, header.Filename)
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "mime must be jpeg, png, or webp"})
			return
		}

		viewType := strings.TrimSpace(r.FormValue("view_type"))
		if viewType != viewTypeFront && viewType != viewTypeBack {
			viewType = viewTypeFront
		}

		sum := sha256.Sum256(raw)
		hashHex := hex.EncodeToString(sum[:])

		if existing, lookupErr := findUserInputImageByHash(r.Context(), cfg, clerkID, hashHex); lookupErr != nil {
			log.Printf("[api/user/upload-media] dedup_lookup_failed user=%s err=%v", clerkID, lookupErr)
		} else if existing != nil {
			_, existingObjectPath, parseErr := parseGCSURL(existing.GCSURL)
			if parseErr != nil {
				log.Printf("[api/user/upload-media] dedup_parse_failed id=%s err=%v", existing.ID, parseErr)
			}
			signedURL, _ := gcsSignedURL(cfg, existingObjectPath, time.Hour)
			writeJSON(w, http.StatusOK, map[string]any{
				"url":         signedURL,
				"signed_url":  signedURL,
				"object_path": existingObjectPath,
				"gs_uri":      gcsGSURI(existingObjectPath),
				"gcs_url":     existing.GCSURL,
				"duplicate":   true,
				"id":          existing.ID,
			})
			return
		}

		if count, cErr := countUserInputImages(r.Context(), cfg, clerkID); cErr == nil {
			if count >= maxInputImagesPerUser {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "image limit reached (max 5)"})
				return
			}
		} else {
			log.Printf("[api/user/upload-media] count_failed user=%s err=%v", clerkID, cErr)
		}

		imageID, uuidErr := newUUIDv4()
		if uuidErr != nil {
			log.Printf("[api/user/upload-media] uuid_failed user=%s err=%v", clerkID, uuidErr)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "id generation failed"})
			return
		}
		objectPath := fmt.Sprintf("users/%s/input/%s%s", clerkID, imageID, ext)
		if err := gcsUpload(r.Context(), cfg, objectPath, mimeType, raw); err != nil {
			log.Printf("[api/user/upload-media] upload_failed user=%s err=%v", clerkID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "storage upload failed"})
			return
		}

		gsURI := gcsGSURI(objectPath)
		row, insertErr := insertUserInputImage(r.Context(), cfg, map[string]any{
			"id":        imageID,
			"user_id":   clerkID,
			"gcs_url":   gsURI,
			"hash":      hashHex,
			"view_type": viewType,
		})
		if insertErr != nil {
			log.Printf("[api/user/upload-media] db_insert_failed user=%s err=%v", clerkID, insertErr)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "DB insert failed"})
			return
		}

		b64 := "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(raw)
		enrichUserInputImage(cfg, row.ID, gsURI, mimeType, b64)

		signedURL, signErr := gcsSignedURL(cfg, objectPath, time.Hour)
		if signErr != nil {
			log.Printf("[api/user/upload-media] sign_failed user=%s err=%v", clerkID, signErr)
		}
		log.Printf("[api/user/upload-media] ok user=%s path=%s", clerkID, objectPath)
		writeJSON(w, http.StatusOK, map[string]any{
			"url":         signedURL,
			"signed_url":  signedURL,
			"object_path": objectPath,
			"gs_uri":      gsURI,
			"gcs_url":     gsURI,
			"duplicate":   false,
			"id":          row.ID,
		})
	}
}

// sniffImageType inspects raw bytes (and filename fallback) to return
// (mimeType, extension, ok). Only jpeg/png/webp are accepted.
func sniffImageType(raw []byte, filename string) (string, string, bool) {
	detected := http.DetectContentType(raw)
	switch detected {
	case "image/jpeg":
		return "image/jpeg", ".jpg", true
	case "image/png":
		return "image/png", ".png", true
	case "image/webp":
		return "image/webp", ".webp", true
	}
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		return "image/jpeg", ".jpg", true
	case strings.HasSuffix(lower, ".png"):
		return "image/png", ".png", true
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp", ".webp", true
	}
	return "", "", false
}
