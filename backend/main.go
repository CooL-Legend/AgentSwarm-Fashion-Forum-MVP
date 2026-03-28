package main

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	startPersistenceWorker()
	defer stopPersistenceWorker()

	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	api := r.Group("/api")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", registerUser)
			auth.GET("/users", getUsers)
		}

		posts := api.Group("/posts")
		{
			posts.GET("", getPosts)
			posts.POST("", createPost)
			posts.GET("/:id", getPostByID)
		}

		comments := api.Group("/comments")
		{
			comments.GET("", getComments)
			comments.POST("", createComment)
		}

		api.POST("/interact", addInteraction)
	}

	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// ---- Handlers ----

// Auth
func registerUser(c *gin.Context) {
	var req struct {
		Username     string `json:"username" binding:"required"`
		Bio          string `json:"bio"`
		PersonaStyle string `json:"persona_style"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dbMutex.Lock()

	user := User{
		ID:           db.NextID.Users,
		Username:     req.Username,
		Bio:          req.Bio,
		PersonaStyle: req.PersonaStyle,
	}
	db.Users = append(db.Users, user)
	db.NextID.Users++
	dbMutex.Unlock()

	requestPersist()

	c.JSON(http.StatusCreated, user)
}

func getUsers(c *gin.Context) {
	dbMutex.RLock()
	users := append([]User(nil), db.Users...)
	dbMutex.RUnlock()

	c.JSON(http.StatusOK, users)
}

// Posts
func getPosts(c *gin.Context) {
	// Optionally filter by category if provided as query param
	category := c.Query("category")

	dbMutex.RLock()
	var result []Post
	if category == "" {
		result = append([]Post(nil), db.Posts...)
		dbMutex.RUnlock()
		c.JSON(http.StatusOK, result)
		return
	}

	indexes := postIndexesByCategory[category]
	result = make([]Post, 0, len(indexes))
	for _, idx := range indexes {
		if idx >= 0 && idx < len(db.Posts) {
			result = append(result, db.Posts[idx])
		}
	}
	dbMutex.RUnlock()

	c.JSON(http.StatusOK, result)
}

func createPost(c *gin.Context) {
	var req struct {
		UserID   int    `json:"userId" binding:"required"`
		Title    string `json:"title" binding:"required"`
		Content  string `json:"content" binding:"required"`
		Category string `json:"category"`
		ImageURL string `json:"imageUrl"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dbMutex.Lock()

	post := Post{
		ID:        db.NextID.Posts,
		UserID:    req.UserID,
		Title:     req.Title,
		Content:   req.Content,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		Category:  req.Category,
		ImageURL:  req.ImageURL,
	}
	postIdx := len(db.Posts)
	db.Posts = append(db.Posts, post)
	indexPost(post, postIdx)
	db.NextID.Posts++
	dbMutex.Unlock()

	requestPersist()

	c.JSON(http.StatusCreated, post)
}

func getPostByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	dbMutex.RLock()
	idx, ok := postIndexByID[id]
	if ok && idx >= 0 && idx < len(db.Posts) {
		post := db.Posts[idx]
		dbMutex.RUnlock()
		c.JSON(http.StatusOK, post)
		return
	}
	dbMutex.RUnlock()

	c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
}

// Comments
func getComments(c *gin.Context) {
	postIDStr := c.Query("postId")

	dbMutex.RLock()
	if postIDStr == "" {
		comments := append([]Comment(nil), db.Comments...)
		dbMutex.RUnlock()
		c.JSON(http.StatusOK, comments)
		return
	}

	postID, err := strconv.Atoi(postIDStr)
	if err != nil {
		dbMutex.RUnlock()
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid postId"})
		return
	}

	indexes := commentIndexesByPost[postID]
	result := make([]Comment, 0, len(indexes))
	for _, idx := range indexes {
		if idx >= 0 && idx < len(db.Comments) {
			result = append(result, db.Comments[idx])
		}
	}
	dbMutex.RUnlock()

	c.JSON(http.StatusOK, result)
}

func createComment(c *gin.Context) {
	var req struct {
		PostID  int    `json:"postId" binding:"required"`
		UserID  int    `json:"userId" binding:"required"`
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dbMutex.Lock()

	comment := Comment{
		ID:        db.NextID.Comments,
		PostID:    req.PostID,
		UserID:    req.UserID,
		Content:   req.Content,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}
	commentIdx := len(db.Comments)
	db.Comments = append(db.Comments, comment)
	indexComment(comment, commentIdx)
	db.NextID.Comments++
	dbMutex.Unlock()

	requestPersist()

	c.JSON(http.StatusCreated, comment)
}

// Interactions
// Weight calculation:
// - Post Likes: 1.0 (Strong explicit signal)
// - Image Likes: 1.0 (Strong explicit signal)
// - Image Views: 0.2 to 0.5 (Implicit signal - longer views get higher weight)
func addInteraction(c *gin.Context) {
	var req struct {
		UserID   int     `json:"userId" binding:"required"`
		ItemID   int     `json:"itemId" binding:"required"`
		ItemType string  `json:"itemType" binding:"required"` // "POST" or "IMAGE"
		Type     string  `json:"type" binding:"required"`     // "LIKE" or "VIEW"
		Duration float64 `json:"duration"`                    // View duration in seconds (for VIEW interactions)
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Calculate weight based on interaction type
	weight := 0.0
	switch req.Type {
	case "LIKE":
		weight = 1.0 // Strong explicit signal
	case "VIEW":
		if req.ItemType == "IMAGE" {
			// Image views: 0.2 to 0.5 based on duration
			if req.Duration < 2.0 {
				weight = 0.2
			} else if req.Duration < 5.0 {
				weight = 0.35
			} else if req.Duration < 10.0 {
				weight = 0.45
			} else {
				weight = 0.5 // Longer views = higher interest
			}
		} else {
			weight = 0.1 // Post views are weaker signals
		}
	}

	dbMutex.Lock()

	interaction := Interaction{
		ID:        db.NextID.Interactions,
		UserID:    req.UserID,
		ItemID:    req.ItemID,
		ItemType:  req.ItemType,
		Type:      req.Type,
		Weight:    weight,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}
	db.Interactions = append(db.Interactions, interaction)
	db.NextID.Interactions++
	dbMutex.Unlock()

	requestPersist()

	c.JSON(http.StatusCreated, interaction)
}
