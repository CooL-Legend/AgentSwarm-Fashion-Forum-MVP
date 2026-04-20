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

const usersTablePath = "users"

var errUserNotFound = errors.New("user not found")

type appUserProfile struct {
	ID                    string  `json:"id"`
	FirstName             *string `json:"first_name"`
	LastName              *string `json:"last_name"`
	Username              *string `json:"username"`
	Bio                   *string `json:"bio"`
	Email                 *string `json:"email"`
	PhoneNumber           *string `json:"phone_number"`
	PhoneVerified         *bool   `json:"phone_verified,omitempty"`
	Location              *string `json:"location"`
	GenderIdentity        *string `json:"gender_identity"`
	DateOfBirth           *string `json:"date_of_birth"`
	ClerkImageURL         *string `json:"clerk_image_url,omitempty"`
	AuthProvider          *string `json:"auth_provider,omitempty"`
	CreatedAt             *string `json:"created_at"`
	UpdatedAt             *string `json:"updated_at"`
	DeletedAt             *string `json:"deleted_at,omitempty"`
	ProfileVector         any     `json:"user_profile_vector,omitempty"`
	OnboardingCompleted   *bool   `json:"onboarding_completed"`
	OnboardingSkipped     *bool   `json:"onboarding_skipped"`
	OnboardingCompletedAt *string `json:"onboarding_completed_at"`

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

// -----------------------------------------------------------------------------
// Clerk JWT verification
// -----------------------------------------------------------------------------

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

// authenticatedClerkUserID extracts the Clerk user id from the Authorization
// header of the request, verifies the JWT against Clerk's JWKS, and ensures
// a matching public.users row exists (lazy upsert). Returns the Clerk sub.
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

	ensureUserRow(ctx, cfg, claims.Subject)
	log.Printf("[auth] authed user=%s %s %s", claims.Subject, r.Method, r.URL.Path)
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

// -----------------------------------------------------------------------------
// Lazy user upsert — creates a minimal public.users row on first authed request.
// -----------------------------------------------------------------------------

var (
	seenUsersMu sync.Mutex
	seenUsers   = map[string]time.Time{}
)

const seenUsersTTL = 5 * time.Minute

// ensureUserRow inserts a minimal row into public.users if one doesn't exist
// for the given Clerk id. Failures are logged but not returned — the request
// proceeds and the next one retries. Service-role key bypasses RLS.
func ensureUserRow(ctx context.Context, cfg AppConfig, userID string) {
	if strings.TrimSpace(userID) == "" {
		return
	}
	seenUsersMu.Lock()
	if seen, ok := seenUsers[userID]; ok && time.Since(seen) < seenUsersTTL {
		seenUsersMu.Unlock()
		return
	}
	seenUsersMu.Unlock()

	existing, err := fetchUserByID(ctx, cfg, userID)
	if err == nil && existing != nil {
		seenUsersMu.Lock()
		seenUsers[userID] = time.Now()
		seenUsersMu.Unlock()
		return
	}
	if err != nil && !errors.Is(err, errUserNotFound) {
		log.Printf("[auth] ensure_user_lookup_failed id=%s err=%v", userID, err)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	body, _ := json.Marshal([]map[string]any{{
		"id":         userID,
		"created_at": now,
		"updated_at": now,
	}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, usersTableEndpoint(cfg), strings.NewReader(string(body)))
	if err != nil {
		log.Printf("[auth] ensure_user_request_failed id=%s err=%v", userID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", cfg.SupabaseAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAPIKey)
	req.Header.Set("Prefer", "return=minimal,resolution=ignore-duplicates")

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		log.Printf("[auth] ensure_user_insert_failed id=%s err=%v", userID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusConflict {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		log.Printf("[auth] ensure_user_insert_bad_status id=%s status=%d body=%s", userID, resp.StatusCode, string(raw))
		return
	}
	seenUsersMu.Lock()
	seenUsers[userID] = time.Now()
	seenUsersMu.Unlock()
}

// -----------------------------------------------------------------------------
// Handler + helpers
// -----------------------------------------------------------------------------

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
