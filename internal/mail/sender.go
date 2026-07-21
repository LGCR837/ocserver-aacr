package mail

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func SendCode(toEmail, code string) error {
	script, err := mailScriptPath()
	if err != nil {
		return err
	}
	cmd := exec.Command("python3", script, toEmail, code)
	cmd.Dir = filepath.Dir(script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("mail failed: %v (%s)", err, string(out))
	}
	return nil
}

func mailScriptPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	base := filepath.Dir(exe)
	script := filepath.Join(base, "mail_project", "send_code.py")
	if _, err := os.Stat(script); err == nil {
		return script, nil
	}
	alt := filepath.Join(base, "..", "mail_project", "send_code.py")
	if _, err := os.Stat(alt); err == nil {
		return alt, nil
	}
	return "", fmt.Errorf("send_code.py not found")
}
