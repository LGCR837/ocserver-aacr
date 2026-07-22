package httpapi

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	mc "metrochat"
)

// resolveWebAppDir finds webapp/ on disk, or extracts it from the embedded FS.
func resolveWebAppDir() string {
	// Check disk first (allows override)
	candidates := []string{"webapp", "server/webapp"}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "webapp"))
	}
	for _, dir := range candidates {
		if fileExists(filepath.Join(dir, "index.html")) {
			return dir
		}
	}

	// Not on disk — extract from embed
	target := "webapp"
	if exe, err := os.Executable(); err == nil {
		target = filepath.Join(filepath.Dir(exe), "webapp")
	}
	if err := mc.ExtractDir(mc.WebappFS, "webapp", target); err != nil {
		log.Printf("WARN: failed to extract webapp from embed: %v", err)
		return ""
	}
	if fileExists(filepath.Join(target, "index.html")) {
		return target
	}
	return ""
}

// resolveLandingAssetsDir finds ooldchat-web/assets/ on disk, or extracts from embed.
func resolveLandingAssetsDir() string {
	candidates := []string{"ooldchat-web/assets"}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "ooldchat-web/assets"))
	}
	for _, dir := range candidates {
		if isDir(dir) {
			return dir
		}
	}

	// Extract from embed
	target := "ooldchat-web/assets"
	if exe, err := os.Executable(); err == nil {
		target = filepath.Join(filepath.Dir(exe), "ooldchat-web/assets")
	}
	if err := mc.ExtractDir(mc.LandingAssetsFS, "ooldchat-web/assets", target); err != nil {
		log.Printf("WARN: failed to extract landing assets from embed: %v", err)
		return ""
	}
	if isDir(target) {
		return target
	}
	return ""
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func (a *API) handleWebApp(w http.ResponseWriter, r *http.Request) {
	if a.webAppDir == "" {
		a.handleLanding(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(a.webAppDir, "index.html"))
}

func (a *API) handleWebAppLogin(w http.ResponseWriter, r *http.Request) {
	if a.webAppDir == "" {
		http.Redirect(w, r, "/app", http.StatusFound)
		return
	}
	http.ServeFile(w, r, filepath.Join(a.webAppDir, "login.html"))
}

func (a *API) handleHomePage(w http.ResponseWriter, r *http.Request) {
	if a.webAppDir == "" {
		http.Redirect(w, r, "/shop", http.StatusFound)
		return
	}
	http.ServeFile(w, r, filepath.Join(a.webAppDir, "landing.html"))
}
