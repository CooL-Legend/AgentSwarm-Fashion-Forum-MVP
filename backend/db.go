package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
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
	ID        int     `json:"id"`
	UserID    int     `json:"userId"`
	ItemID    int     `json:"itemId"`
	ItemType  string  `json:"itemType"` // "POST" or "IMAGE"
	Type      string  `json:"type"`     // "LIKE" or "VIEW"
	Weight    float64 `json:"weight"`
	Timestamp string  `json:"timestamp"`
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

	postIndexByID         map[int]int
	postIndexesByCategory map[string][]int
	commentIndexesByPost  map[int][]int

	persistCh     chan struct{}
	stopPersistCh chan struct{}
	persistWG     sync.WaitGroup
	persistMu     sync.Mutex
)

const persistDebounce = 300 * time.Millisecond

func initDB() error {
	dataFilePath = getenv("BACKEND_DATA_FILE", dataFilePath)

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
			rebuildIndexes()
			return saveDB()
		}
		return fmt.Errorf("failed to read dev-data.json: %v", err)
	}

	if err := json.Unmarshal(file, &db); err != nil {
		return fmt.Errorf("failed to parse dev-data.json: %v", err)
	}

	rebuildIndexes()
	return nil
}

func saveDB() error {
	// Serialize disk writes to avoid overlapping writes from the flush worker.
	persistMu.Lock()
	defer persistMu.Unlock()

	snapshot := snapshotDB()

	file, err := json.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("failed to marshal db: %v", err)
	}

	if err := os.MkdirAll(filepath.Dir(dataFilePath), 0755); err != nil {
		return fmt.Errorf("failed to ensure data dir: %v", err)
	}

	tmpPath := dataFilePath + ".tmp"
	if err := os.WriteFile(tmpPath, file, 0644); err != nil {
		return fmt.Errorf("failed to write temp dev-data.json: %v", err)
	}

	if err := os.Rename(tmpPath, dataFilePath); err != nil {
		return fmt.Errorf("failed to write dev-data.json: %v", err)
	}
	return nil
}

func snapshotDB() Database {
	dbMutex.RLock()
	defer dbMutex.RUnlock()

	return Database{
		Users:        append([]User(nil), db.Users...),
		Posts:        append([]Post(nil), db.Posts...),
		Comments:     append([]Comment(nil), db.Comments...),
		Interactions: append([]Interaction(nil), db.Interactions...),
		NextID:       db.NextID,
	}
}

func rebuildIndexes() {
	postIndexByID = make(map[int]int, len(db.Posts))
	postIndexesByCategory = make(map[string][]int)
	commentIndexesByPost = make(map[int][]int)

	for i, post := range db.Posts {
		indexPost(post, i)
	}

	for i, comment := range db.Comments {
		indexComment(comment, i)
	}
}

func indexPost(post Post, idx int) {
	postIndexByID[post.ID] = idx
	postIndexesByCategory[post.Category] = append(postIndexesByCategory[post.Category], idx)
}

func indexComment(comment Comment, idx int) {
	commentIndexesByPost[comment.PostID] = append(commentIndexesByPost[comment.PostID], idx)
}

func startPersistenceWorker() {
	if persistCh != nil {
		return
	}

	persistCh = make(chan struct{}, 1)
	stopPersistCh = make(chan struct{})

	persistWG.Add(1)
	go func() {
		defer persistWG.Done()

		timer := time.NewTimer(time.Hour)
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}

		pendingWrite := false

		for {
			select {
			case <-persistCh:
				if !pendingWrite {
					pendingWrite = true
					timer.Reset(persistDebounce)
				}
			case <-timer.C:
				if pendingWrite {
					if err := saveDB(); err != nil {
						log.Printf("persistence error: %v", err)
					}
					pendingWrite = false
				}
			case <-stopPersistCh:
				if pendingWrite {
					if err := saveDB(); err != nil {
						log.Printf("final persistence error: %v", err)
					}
				}
				return
			}
		}
	}()
}

func stopPersistenceWorker() {
	if stopPersistCh == nil {
		return
	}

	close(stopPersistCh)
	persistWG.Wait()
	stopPersistCh = nil
	persistCh = nil
}

func requestPersist() {
	// Fallback for call sites that run before worker initialization.
	if persistCh == nil {
		if err := saveDB(); err != nil {
			log.Printf("sync persistence error: %v", err)
		}
		return
	}

	select {
	case persistCh <- struct{}{}:
	default:
	}
}
