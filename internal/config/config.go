package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                      string
	DatabaseURL               string
	UploadDir                 string
	UpdateDir                 string
	PublicBaseURL             string
	DataServerBaseURL         string
	DataServerSyncToken       string
	AdminUser                 string
	AdminPassword             string
	JWTSecret                 []byte
	JWTIssuer                 string
	JWTIssuerLegacy           []string
	AccessTokenTTL            time.Duration
	RefreshTokenTTL           time.Duration
	ResourceQuota             int64
	RegistrationLimit         int
	VideoEnabled              bool
	MediaRateBytes            int64
	UpdateRateBytes           int64
	VideoRateBytes            int64
	MusicRateBytes            int64
	MediaDownloadConcurrency  int
	UpdateDownloadConcurrency int
	VideoDownloadConcurrency  int
	MusicDownloadConcurrency  int
	EmailVerifyEnabled        bool
}

func Load() (Config, error) {
	cfg := Config{}

	cfg.Port = getEnv("PORT", "8080")
	dbURL, dbURLSet := getEnvRaw("DATABASE_URL")
	if dbURL == "" {
		dbURL = "metrochat.db"
	}
	cfg.DatabaseURL = resolveDatabaseURL(dbURL, dbURLSet)
	cfg.UploadDir = getEnv("UPLOAD_DIR", "uploads")
	cfg.UpdateDir = getEnv("UPDATE_DIR", "update")
	cfg.PublicBaseURL = strings.TrimSpace(getEnv("PUBLIC_BASE_URL", ""))
	cfg.DataServerBaseURL = strings.TrimRight(strings.TrimSpace(getEnv("DATA_SERVER_BASE_URL", "")), "/")
	cfg.DataServerSyncToken = strings.TrimSpace(getEnv("DATA_SERVER_SYNC_TOKEN", ""))
	cfg.AdminUser = getEnv("ADMIN_USER", "admin")
	cfg.AdminPassword = getEnv("ADMIN_PASSWORD", "admin123456")
	cfg.ResourceQuota = 10 * 1024 * 1024 * 1024 // default 10GB
	cfg.MediaRateBytes = 5 << 20
	cfg.UpdateRateBytes = 5 << 20
	cfg.VideoRateBytes = 5 << 20
	cfg.MusicRateBytes = 5 << 20
	cfg.MediaDownloadConcurrency = 12
	cfg.UpdateDownloadConcurrency = 4
	cfg.VideoDownloadConcurrency = 2
	cfg.MusicDownloadConcurrency = 8

	settingsPath := getEnv("SETTINGS_JSON", "settings.json")
	settings, settingsOk := loadSettingsFromJSON(settingsPath)
	if settingsOk {
		if v := strings.TrimSpace(settings.PublicBaseURL); v != "" {
			cfg.PublicBaseURL = v
		}
		if v := strings.TrimRight(strings.TrimSpace(settings.DataServerBaseURL), "/"); v != "" {
			cfg.DataServerBaseURL = v
		}
		if v := strings.TrimSpace(settings.DataServerSyncToken); v != "" {
			cfg.DataServerSyncToken = v
		}
		if settings.ResourceQuotaBytes > 0 {
			cfg.ResourceQuota = settings.ResourceQuotaBytes
		}
		if settings.RegistrationLimit > 0 {
			cfg.RegistrationLimit = settings.RegistrationLimit
		}
		if settings.MediaRateBytes != nil && *settings.MediaRateBytes >= 0 {
			cfg.MediaRateBytes = *settings.MediaRateBytes
		}
		if settings.UpdateRateBytes != nil && *settings.UpdateRateBytes >= 0 {
			cfg.UpdateRateBytes = *settings.UpdateRateBytes
		}
		if settings.VideoRateBytes != nil && *settings.VideoRateBytes >= 0 {
			cfg.VideoRateBytes = *settings.VideoRateBytes
		}
		if settings.MusicRateBytes != nil && *settings.MusicRateBytes >= 0 {
			cfg.MusicRateBytes = *settings.MusicRateBytes
		}
		if settings.MediaDownloadConcurrency != nil && *settings.MediaDownloadConcurrency > 0 {
			cfg.MediaDownloadConcurrency = *settings.MediaDownloadConcurrency
		}
		if settings.UpdateDownloadConcurrency != nil && *settings.UpdateDownloadConcurrency > 0 {
			cfg.UpdateDownloadConcurrency = *settings.UpdateDownloadConcurrency
		}
		if settings.VideoDownloadConcurrency != nil && *settings.VideoDownloadConcurrency > 0 {
			cfg.VideoDownloadConcurrency = *settings.VideoDownloadConcurrency
		}
		if settings.MusicDownloadConcurrency != nil && *settings.MusicDownloadConcurrency > 0 {
			cfg.MusicDownloadConcurrency = *settings.MusicDownloadConcurrency
		}
	}

	if envQuota := getInt64Env("RESOURCE_QUOTA_BYTES", 0); envQuota > 0 {
		cfg.ResourceQuota = envQuota
	}
	if envLimit := getIntEnv("REGISTRATION_LIMIT", 0); envLimit > 0 {
		cfg.RegistrationLimit = envLimit
	}
	if v, ok := getInt64EnvAllowZero("MEDIA_TRANSFER_RATE_BYTES"); ok && v >= 0 {
		cfg.MediaRateBytes = v
	}
	if v, ok := getInt64EnvAllowZero("UPDATE_TRANSFER_RATE_BYTES"); ok && v >= 0 {
		cfg.UpdateRateBytes = v
	}
	if v, ok := getInt64EnvAllowZero("VIDEO_TRANSFER_RATE_BYTES"); ok && v >= 0 {
		cfg.VideoRateBytes = v
	}
	if v, ok := getInt64EnvAllowZero("MUSIC_TRANSFER_RATE_BYTES"); ok && v >= 0 {
		cfg.MusicRateBytes = v
	}
	if v, ok := getIntEnvAllowZero("MEDIA_DOWNLOAD_CONCURRENCY"); ok && v > 0 {
		cfg.MediaDownloadConcurrency = v
	}
	if v, ok := getIntEnvAllowZero("UPDATE_DOWNLOAD_CONCURRENCY"); ok && v > 0 {
		cfg.UpdateDownloadConcurrency = v
	}
	if v, ok := getIntEnvAllowZero("VIDEO_DOWNLOAD_CONCURRENCY"); ok && v > 0 {
		cfg.VideoDownloadConcurrency = v
	}
	if v, ok := getIntEnvAllowZero("MUSIC_DOWNLOAD_CONCURRENCY"); ok && v > 0 {
		cfg.MusicDownloadConcurrency = v
	}
	cfg.VideoEnabled = false
	cfg.EmailVerifyEnabled = true
	if settingsOk {
		cfg.VideoEnabled = settings.VideoEnabled
		cfg.EmailVerifyEnabled = settings.EmailVerifyEnabled
	}
	if raw, ok := getEnvRaw("VIDEO_ENABLED"); ok {
		cfg.VideoEnabled = parseBool(raw, cfg.VideoEnabled)
	}
	if raw, ok := getEnvRaw("EMAIL_VERIFY_ENABLED"); ok {
		cfg.EmailVerifyEnabled = parseBool(raw, cfg.EmailVerifyEnabled)
	}
	if raw, ok := getEnvRaw("PUBLIC_BASE_URL"); ok {
		cfg.PublicBaseURL = strings.TrimSpace(raw)
	}
	if raw, ok := getEnvRaw("DATA_SERVER_BASE_URL"); ok {
		cfg.DataServerBaseURL = strings.TrimRight(strings.TrimSpace(raw), "/")
	}
	if raw, ok := getEnvRaw("DATA_SERVER_SYNC_TOKEN"); ok {
		cfg.DataServerSyncToken = strings.TrimSpace(raw)
	}

	secret, secretSet := getEnvRaw("JWT_SECRET")
	if secret == "" {
		if settingsOk && strings.TrimSpace(settings.JWTSecret) != "" {
			secret = strings.TrimSpace(settings.JWTSecret)
		} else {
			secret = "default-secret-at-least-32-characters-long"
		}
	}
	if len(secret) < 32 {
		return cfg, errors.New("JWT_SECRET must be at least 32 bytes")
	}
	cfg.JWTSecret = []byte(secret)
	if !secretSet && (settings.JWTSecret == "") && settingsPath != "" {
		persistJWTSecret(settingsPath, settings, secret)
	}

	cfg.JWTIssuer = getEnv("JWT_ISSUER", "metrochat")
	if legacy := strings.TrimSpace(getEnv("JWT_ISSUER_LEGACY", "")); legacy != "" {
		for _, item := range strings.Split(legacy, ",") {
			trimmed := strings.TrimSpace(item)
			if trimmed != "" {
				cfg.JWTIssuerLegacy = append(cfg.JWTIssuerLegacy, trimmed)
			}
		}
	}
	cfg.AccessTokenTTL = getDurationEnv("ACCESS_TOKEN_TTL", 0)
	cfg.RefreshTokenTTL = getDurationEnv("REFRESH_TOKEN_TTL", 30*24*time.Hour)

	return cfg, nil
}

func getEnv(key, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	return v
}

func getEnvRaw(key string) (string, bool) {
	v, ok := os.LookupEnv(key)
	return v, ok
}

func resolveDatabaseURL(value string, explicit bool) string {
	if value == "" {
		return value
	}
	if explicit {
		return value
	}
	// If default relative path doesn't exist, try common locations.
	if looksLikeURL(value) || filepath.IsAbs(value) {
		return value
	}
	if fileExists(value) {
		return value
	}
	if fileExists(filepath.Join("server", value)) {
		return filepath.Join("server", value)
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidate := filepath.Join(exeDir, value)
		if fileExists(candidate) {
			return candidate
		}
	}
	return value
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func looksLikeURL(value string) bool {
	return strings.Contains(value, "://")
}

func getInt64Env(key string, def int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	val, err := strconv.ParseInt(v, 10, 64)
	if err != nil || val <= 0 {
		return def
	}
	return val
}

func getInt64EnvAllowZero(key string) (int64, bool) {
	v, ok := os.LookupEnv(key)
	if !ok {
		return 0, false
	}
	v = strings.TrimSpace(v)
	if v == "" {
		return 0, false
	}
	val, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, false
	}
	return val, true
}

func getIntEnvAllowZero(key string) (int, bool) {
	v, ok := os.LookupEnv(key)
	if !ok {
		return 0, false
	}
	v = strings.TrimSpace(v)
	if v == "" {
		return 0, false
	}
	val, err := strconv.Atoi(v)
	if err != nil {
		return 0, false
	}
	return val, true
}

func getIntEnv(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	val, err := strconv.Atoi(v)
	if err != nil || val <= 0 {
		return def
	}
	return val
}

func parseBool(raw string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(raw))
	if v == "1" || v == "true" || v == "yes" || v == "on" {
		return true
	}
	if v == "0" || v == "false" || v == "no" || v == "off" {
		return false
	}
	return def
}

type quotaSettings struct {
	ResourceQuotaBytes int64 `json:"resource_quota_bytes"`
	RegistrationLimit  int   `json:"registration_limit"`
}

type settingsFile struct {
	ResourceQuotaBytes        int64  `json:"resource_quota_bytes"`
	RegistrationLimit         int    `json:"registration_limit"`
	PublicBaseURL             string `json:"public_base_url"`
	DataServerBaseURL         string `json:"data_server_base_url"`
	DataServerSyncToken       string `json:"data_server_sync_token"`
	JWTSecret                 string `json:"jwt_secret"`
	VideoEnabled              bool   `json:"video_enabled"`
	MediaRateBytes            *int64 `json:"media_transfer_rate_bytes"`
	UpdateRateBytes           *int64 `json:"update_transfer_rate_bytes"`
	VideoRateBytes            *int64 `json:"video_transfer_rate_bytes"`
	MusicRateBytes            *int64 `json:"music_transfer_rate_bytes"`
	MediaDownloadConcurrency  *int   `json:"media_download_concurrency"`
	UpdateDownloadConcurrency *int   `json:"update_download_concurrency"`
	VideoDownloadConcurrency  *int   `json:"video_download_concurrency"`
	MusicDownloadConcurrency  *int   `json:"music_download_concurrency"`
	EmailVerifyEnabled        bool   `json:"email_verify_enabled"`
}

func loadSettingsFromJSON(path string) (settingsFile, bool) {
	if path == "" {
		return settingsFile{}, false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return settingsFile{}, false
	}
	var cfg settingsFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		return settingsFile{}, false
	}
	return cfg, true
}

func persistJWTSecret(path string, settings settingsFile, secret string) {
	if path == "" || secret == "" {
		return
	}
	if settings.JWTSecret != "" {
		return
	}
	settings.JWTSecret = secret
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, data, 0644)
}

func loadQuotaFromJSON(path string) int64 {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	var cfg quotaSettings
	if err := json.Unmarshal(data, &cfg); err != nil {
		return 0
	}
	if cfg.ResourceQuotaBytes > 0 {
		return cfg.ResourceQuotaBytes
	}
	return 0
}

func loadRegistrationLimitFromJSON(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	var cfg quotaSettings
	if err := json.Unmarshal(data, &cfg); err != nil {
		return 0
	}
	if cfg.RegistrationLimit > 0 {
		return cfg.RegistrationLimit
	}
	return 0
}

func getDurationEnv(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	secs, err := strconv.Atoi(v)
	if err != nil || secs <= 0 {
		return def
	}
	return time.Duration(secs) * time.Second
}
