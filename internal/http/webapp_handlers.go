package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
)

func resolveWebAppDir() string {
	candidates := []string{
		"webapp",
		"server/webapp",
	}
	for _, dir := range candidates {
		indexPath := filepath.Join(dir, "index.html")
		info, err := os.Stat(indexPath)
		if err == nil && !info.IsDir() {
			return dir
		}
	}
	return ""
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
