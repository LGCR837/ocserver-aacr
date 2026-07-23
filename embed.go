package metrochat

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
)

//go:embed all:webapp
var WebappFS embed.FS

//go:embed all:ooldchat-web/assets
var LandingAssetsFS embed.FS

// ExtractDir walks an embedded FS and writes files that don't exist on disk.
// Already-existing files are preserved (allows user overrides).
func ExtractDir(efs fs.FS, srcRoot, dest string) error {
	return fs.WalkDir(efs, srcRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(srcRoot, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if _, err := os.Stat(target); err == nil {
			return nil
		}
		data, err := fs.ReadFile(efs, path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
}
