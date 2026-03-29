package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func loadEnv() error {
	candidates := make([]string, 0, 3)
	if customPath := strings.TrimSpace(os.Getenv("ENV_FILE")); customPath != "" {
		candidates = append(candidates, customPath)
	}
	candidates = append(candidates, ".env", "../.env")

	var firstErr error
	for _, candidate := range candidates {
		if err := loadEnvFile(candidate); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			if firstErr == nil {
				firstErr = fmt.Errorf("load %s: %w", candidate, err)
			}
			continue
		}
		return nil
	}
	return firstErr
}

func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}

		if _, exists := os.LookupEnv(key); exists {
			continue
		}

		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		value = strings.ReplaceAll(value, `\n`, "\n")
		value = strings.ReplaceAll(value, `\r`, "\r")

		_ = os.Setenv(key, value)
	}

	return scanner.Err()
}

func getenv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
