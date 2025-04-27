package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	// Directory where JSON files are stored
	dataDir = "./data"
	// Server port
	port = 8080
	// Directory where backups are stored
	backupDir = "./data/backups"
	// Default max number of backups to keep
	defaultMaxBackups = 10
)

func main() {
	// Create data directory if it doesn't exist
	if _, err := os.Stat(dataDir); os.IsNotExist(err) {
		if err := os.MkdirAll(dataDir, 0755); err != nil {
			log.Fatalf("Failed to create data directory: %v", err)
		}
	}

	// Create backup directory if it doesn't exist
	if _, err := os.Stat(backupDir); os.IsNotExist(err) {
		if err := os.MkdirAll(backupDir, 0755); err != nil {
			log.Printf("Creating backup directory: %s", backupDir)
			if err := os.MkdirAll(backupDir, 0755); err != nil {
				log.Fatalf("Failed to create backup directory: %v", err)
			}
		}
	}

	// File server for static files (HTML, CSS, JS)
	fs := http.FileServer(http.Dir("./static"))

	// Register handlers
	http.Handle("/", fs)
	http.HandleFunc("/api/employees.json", handleEmployees)
	http.HandleFunc("/api/daysOff.json", handleDaysOff)
	http.HandleFunc("/api/holidays.json", handleHolidays)

	// Add new handlers for backup management
	http.HandleFunc("/api/backups", handleBackups)
	http.HandleFunc("/api/backup-settings", handleBackupSettings)

	// Setup logger middleware
	loggedRouter := logMiddleware(http.DefaultServeMux)

	// Start the server
	serverAddr := fmt.Sprintf(":%d", port)
	log.Printf("Starting server on %s", serverAddr)
	log.Fatal(http.ListenAndServe(serverAddr, loggedRouter))
}

// Logger middleware
func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.RequestURI, time.Since(start))
	})
}

// Handle employees.json
func handleEmployees(w http.ResponseWriter, r *http.Request) {
	filePath := filepath.Join(dataDir, "employees.json")

	switch r.Method {
	case http.MethodGet:
		serveJSONFile(w, filePath)
	case http.MethodPost:
		updateJSONFile(w, r, filePath)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Handle daysOff.json
func handleDaysOff(w http.ResponseWriter, r *http.Request) {
	filePath := filepath.Join(dataDir, "daysOff.json")

	switch r.Method {
	case http.MethodGet:
		serveJSONFile(w, filePath)
	case http.MethodPost:
		// Parse max backups from the request header
		maxBackupsStr := r.Header.Get("X-Max-Backups")
		maxBackups := defaultMaxBackups
		if maxBackupsStr != "" {
			if val, err := strconv.Atoi(maxBackupsStr); err == nil && val > 0 {
				maxBackups = val
			}
		}
		updateJSONFileWithBackup(w, r, filePath, maxBackups)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Handle holidays.json
func handleHolidays(w http.ResponseWriter, r *http.Request) {
	filePath := filepath.Join(dataDir, "holidays.json")

	switch r.Method {
	case http.MethodGet:
		serveJSONFile(w, filePath)
	case http.MethodPost:
		// Parse max backups from the request header
		maxBackupsStr := r.Header.Get("X-Max-Backups")
		maxBackups := defaultMaxBackups
		if maxBackupsStr != "" {
			if val, err := strconv.Atoi(maxBackupsStr); err == nil && val > 0 {
				maxBackups = val
			}
		}
		updateJSONFileWithBackup(w, r, filePath, maxBackups)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Handle backups API
func handleBackups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// List backups for a file
		filePrefix := r.URL.Query().Get("prefix")
		if filePrefix == "" {
			http.Error(w, "Missing 'prefix' parameter", http.StatusBadRequest)
			return
		}

		backups, err := listBackups(filePrefix)
		if err != nil {
			http.Error(w, fmt.Sprintf("Error listing backups: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(backups)

	case http.MethodDelete:
		// Delete a specific backup
		var requestData struct {
			Filename string `json:"filename"`
		}

		err := json.NewDecoder(r.Body).Decode(&requestData)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if requestData.Filename == "" {
			http.Error(w, "Missing filename", http.StatusBadRequest)
			return
		}

		// Sanitize filename to prevent directory traversal
		filename := filepath.Base(requestData.Filename)
		filePath := filepath.Join(backupDir, filename)

		if err := os.Remove(filePath); err != nil {
			http.Error(w, fmt.Sprintf("Error deleting backup: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success": true, "message": "Backup deleted successfully"}`))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Handle backup settings
func handleBackupSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Return current backup settings
		settings := map[string]interface{}{
			"maxBackups": defaultMaxBackups,
			"backupDir":  backupDir,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Serve a JSON file
func serveJSONFile(w http.ResponseWriter, filePath string) {
	// If file doesn't exist, return an empty JSON object
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
		return
	}

	// Read and serve the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error reading file: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// Update a JSON file with data from POST request
func updateJSONFile(w http.ResponseWriter, r *http.Request, filePath string) {
	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Validate that it's valid JSON
	var jsonData interface{}
	if err := json.Unmarshal(body, &jsonData); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Pretty print the JSON
	prettyJSON, err := json.MarshalIndent(jsonData, "", "  ")
	if err != nil {
		http.Error(w, "Error formatting JSON", http.StatusInternalServerError)
		return
	}

	// Create a backup of the existing file if it exists
	if _, err := os.Stat(filePath); err == nil {
		backupPath := filePath + ".bak." + time.Now().Format("20060102-150405")
		if err := os.Rename(filePath, backupPath); err != nil {
			log.Printf("Warning: could not create backup of %s: %v", filePath, err)
		}
	}

	// Write the new JSON to file
	if err := os.WriteFile(filePath, prettyJSON, 0644); err != nil {
		http.Error(w, "Error writing file", http.StatusInternalServerError)
		return
	}

	// Respond with success
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success": true, "message": "File updated successfully"}`))
}

// Update a JSON file with data from POST request and manage backups
func updateJSONFileWithBackup(w http.ResponseWriter, r *http.Request, filePath string, maxBackups int) {
	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Validate that it's valid JSON
	var jsonData interface{}
	if err := json.Unmarshal(body, &jsonData); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Pretty print the JSON
	prettyJSON, err := json.MarshalIndent(jsonData, "", "  ")
	if err != nil {
		http.Error(w, "Error formatting JSON", http.StatusInternalServerError)
		return
	}

	// Get the base filename without path
	baseFilename := filepath.Base(filePath)

	// Create a backup in the backups directory if file exists
	if _, err := os.Stat(filePath); err == nil {
		timestamp := time.Now().Format("20060102-150405")
		backupFilename := fmt.Sprintf("%s.%s.json", strings.TrimSuffix(baseFilename, ".json"), timestamp)
		backupPath := filepath.Join(backupDir, backupFilename)

		// Copy the original file to the backup (don't move it)
		origData, err := os.ReadFile(filePath)
		if err != nil {
			log.Printf("Warning: could not read original file for backup %s: %v", filePath, err)
		} else {
			if err := os.WriteFile(backupPath, origData, 0644); err != nil {
				log.Printf("Warning: could not create backup of %s: %v", filePath, err)
			} else {
				log.Printf("Created backup: %s", backupPath)

				// Clean up old backups
				if err := cleanupOldBackups(baseFilename, maxBackups); err != nil {
					log.Printf("Warning: error cleaning up old backups: %v", err)
				}
			}
		}
	}

	// Write the new JSON to file
	if err := os.WriteFile(filePath, prettyJSON, 0644); err != nil {
		http.Error(w, "Error writing file", http.StatusInternalServerError)
		return
	}

	// Respond with success
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success": true, "message": "File updated successfully with backup"}`))
}

// List backups for a specific file prefix
func listBackups(filePrefix string) ([]string, error) {
	files, err := os.ReadDir(backupDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read backup directory: %w", err)
	}

	var backups []string
	for _, file := range files {
		if !file.IsDir() && strings.HasPrefix(file.Name(), filePrefix) {
			backups = append(backups, file.Name())
		}
	}

	return backups, nil
}

// Clean up old backups, keeping only the newest maxBackups
func cleanupOldBackups(baseFilename string, maxBackups int) error {
	// Strip .json extension if present
	baseFilename = strings.TrimSuffix(baseFilename, ".json")

	// List all backups for this file
	backups, err := listBackups(baseFilename)
	if err != nil {
		return err
	}

	// If we don't have more than maxBackups, no need to delete any
	if len(backups) <= maxBackups {
		return nil
	}

	// Sort backups by timestamp (newest first)
	sort.Slice(backups, func(i, j int) bool {
		// Extract timestamps from filenames (format: filename.YYYYMMDD-HHMMSS.json)
		partsI := strings.Split(backups[i], ".")
		partsJ := strings.Split(backups[j], ".")

		// Ensure we have enough parts
		if len(partsI) < 3 || len(partsJ) < 3 {
			return backups[i] > backups[j] // fallback to string comparison
		}

		// Compare the timestamp parts
		return partsI[1] > partsJ[1]
	})

	// Delete all backups beyond maxBackups (keep newest ones)
	for i := maxBackups; i < len(backups); i++ {
		backupPath := filepath.Join(backupDir, backups[i])
		log.Printf("Deleting old backup: %s", backupPath)

		if err := os.Remove(backupPath); err != nil {
			return fmt.Errorf("failed to delete backup %s: %w", backupPath, err)
		}
	}

	return nil
}
