package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// ==================== PUBLIC ====================

// GetBooks — danh sách sách (có phân trang, tìm kiếm, lọc, sắp xếp)
func GetBooks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))
	search := c.Query("search")
	categoryID := c.Query("category_id")
	sort := c.DefaultQuery("sort", "newest") // newest, price_asc, price_desc

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 12
	}

	offset := (page - 1) * limit

	query := config.DB.Model(&models.Book{}).Preload("Category")

	// Tìm kiếm theo tên sách hoặc tác giả
	if search != "" {
		searchTerm := "%" + search + "%"
		query = query.Where("title ILIKE ? OR author ILIKE ?", searchTerm, searchTerm)
	}

	// Lọc theo danh mục
	if categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	// Sắp xếp
	switch sort {
	case "price_asc":
		query = query.Order("price ASC")
	case "price_desc":
		query = query.Order("price DESC")
	default:
		query = query.Order("created_at DESC")
	}

	// Đếm tổng
	var total int64
	query.Count(&total)

	// Lấy dữ liệu
	var books []models.Book
	query.Offset(offset).Limit(limit).Find(&books)

	c.JSON(http.StatusOK, gin.H{
		"data":       books,
		"total":      total,
		"page":       page,
		"limit":      limit,
		"total_pages": (total + int64(limit) - 1) / int64(limit),
	})
}

// GetBook — chi tiết 1 sách + danh sách review
func GetBook(c *gin.Context) {
	id := c.Param("id")

	var book models.Book
	if result := config.DB.Preload("Category").Preload("User").First(&book, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy sách"})
		return
	}

	// Lấy reviews
	var reviews []models.Review
	config.DB.Preload("User").
		Where("book_id = ?", id).
		Order("created_at DESC").
		Find(&reviews)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"book":    book,
			"reviews": reviews,
		},
	})
}

// ==================== SELLER ONLY ====================

// CreateBook — thêm sách mới (seller)
func CreateBook(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới được thêm sách"})
		return
	}

	var input struct {
		Title       string  `json:"title" binding:"required"`
		Author      string  `json:"author" binding:"required"`
		Description string  `json:"description"`
		Price       float64 `json:"price" binding:"required,gt=0"`
		Stock       int     `json:"stock" binding:"required,gte=0"`
		ImageURL    string  `json:"image_url"`
		CategoryID  *uint   `json:"category_id"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	book := models.Book{
		Title:       input.Title,
		Author:      input.Author,
		Description: input.Description,
		Price:       input.Price,
		Stock:       input.Stock,
		ImageURL:    input.ImageURL,
		CategoryID:  input.CategoryID,
		UserID:      userID.(uint),
	}
	config.DB.Create(&book)

	config.DB.Preload("Category").First(&book, book.ID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Thêm sách thành công!",
		"data":    book,
	})
}

// UpdateBook — sửa sách (chỉ seller của sách đó)
func UpdateBook(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới được sửa sách"})
		return
	}

	id := c.Param("id")
	userID, _ := c.Get("user_id")

	var book models.Book
	if result := config.DB.First(&book, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy sách"})
		return
	}

	// Admin có quyền sửa tất cả
	if role != "admin" && book.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Bạn không có quyền sửa sách này"})
		return
	}

	var input struct {
		Title       *string  `json:"title"`
		Author      *string  `json:"author"`
		Description *string  `json:"description"`
		Price       *float64 `json:"price"`
		Stock       *int     `json:"stock"`
		ImageURL    *string  `json:"image_url"`
		CategoryID  *uint    `json:"category_id"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	updates := map[string]interface{}{}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.Author != nil {
		updates["author"] = *input.Author
	}
	if input.Description != nil {
		updates["description"] = *input.Description
	}
	if input.Price != nil {
		updates["price"] = *input.Price
	}
	if input.Stock != nil {
		updates["stock"] = *input.Stock
	}
	if input.ImageURL != nil {
		updates["image_url"] = *input.ImageURL
	}
	if input.CategoryID != nil {
		updates["category_id"] = *input.CategoryID
	}

	config.DB.Model(&book).Updates(updates)
	config.DB.Preload("Category").First(&book, id)

	c.JSON(http.StatusOK, gin.H{
		"message": "Cập nhật sách thành công!",
		"data":    book,
	})
}

// DeleteBook — xoá sách (chỉ seller của sách đó)
func DeleteBook(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới được xoá sách"})
		return
	}

	id := c.Param("id")
	userID, _ := c.Get("user_id")

	var book models.Book
	if result := config.DB.First(&book, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy sách"})
		return
	}

	if role != "admin" && book.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Bạn không có quyền xoá sách này"})
		return
	}

	config.DB.Delete(&book)
	c.JSON(http.StatusOK, gin.H{"message": "Xoá sách thành công!"})
}

// ==================== HELPER ====================

// Chỉ dùng trong package — tránh import cycle
func bookExists(db *gorm.DB, id uint) (*models.Book, bool) {
	var book models.Book
	if result := db.First(&book, id); result.Error != nil {
		return nil, false
	}
	return &book, true
}