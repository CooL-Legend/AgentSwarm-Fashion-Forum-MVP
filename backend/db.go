package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

type User struct {
	ID           int    `json:"id"`
	Username     string `json:"username"`
	Bio          string `json:"bio"`
	PersonaStyle string `json:"persona_style"`
}

type Post struct {
	ID        int    `json:"id"`
	UserID    int    `json:"userId"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
	Category  string `json:"category"`
	ImageURL  string `json:"imageUrl,omitempty"`
}

type Comment struct {
	ID        int    `json:"id"`
	PostID    int    `json:"postId"`
	UserID    int    `json:"userId"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
}

type Interaction struct {
	ID        int    `json:"id"`
	UserID    int    `json:"userId"`
	ItemID    int    `json:"itemId"`
	ItemType  string `json:"itemType"` // "POST" or "IMAGE"
	Type      string `json:"type"`     // "LIKE" or "VIEW"
	Weight    float64 `json:"weight"`
	Timestamp string `json:"timestamp"`
}

type NextID struct {
	Users        int `json:"users"`
	Posts        int `json:"posts"`
	Comments     int `json:"comments"`
	Interactions int `json:"interactions"`
}

type Database struct {
	Users        []User        `json:"users"`
	Posts        []Post        `json:"posts"`
	Comments     []Comment     `json:"comments"`
	Interactions []Interaction `json:"interactions"`
	NextID       NextID        `json:"_nextId"`
}

var (
	dataFilePath = "data/dev-data.json"
	db           Database
	dbMutex      sync.RWMutex
)

func initDB() error {
	file, err := os.ReadFile(dataFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			// Initialize empty structure if it doesn't exist
			db = Database{
				Users:        []User{},
				Posts:        []Post{},
				Comments:     []Comment{},
				Interactions: []Interaction{},
				NextID: NextID{
					Users:        1,
					Posts:        1,
					Comments:     1,
					Interactions: 1,
				},
			}
			return saveDB()
		}
		return fmt.Errorf("failed to read dev-data.json: %v", err)
	}

	if err := json.Unmarshal(file, &db); err != nil {
		return fmt.Errorf("failed to parse dev-data.json: %v", err)
	}
	return nil
}

func saveDB() error {
	file, err := json.MarshalIndent(db, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal db: %v", err)
	}

	if err := os.WriteFile(dataFilePath, file, 0644); err != nil {
		return fmt.Errorf("failed to write dev-data.json: %v", err)
	}
	return nil
}
