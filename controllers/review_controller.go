package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
)

// ==================== REVIEW ====================

// CreateReview — thêm đánh giá (customer, mỗi user 1 review/sách)
func CreateReview(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "customer" && role != "seller" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ người mua hàng mới được đánh giá"})
		return
	}

	userID, _ := c.Get("user_id")
	bookID := c.Param("id")

	// Kiểm tra sách tồn tại
	var book models.Book
	if result := config.DB.First(&book, bookID); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy sách"})
		return
	}

	// Kiểm tra user đã review sách này chưa
	var existing models.Review
	if result := config.DB.Where("user_id = ? AND book_id = ?", userID, bookID).First(&existing); result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Bạn đã đánh giá sách này rồi"})
		return
	}

	var input struct {
		Rating  int    `json:"rating" binding:"required,min=1,max=5"`
		Comment string `json:"comment" binding:"max=500"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	review := models.Review{
		UserID:  userID.(uint),
		BookID:  book.ID,
		Rating:  input.Rating,
		Comment: input.Comment,
	}
	config.DB.Create(&review)
	config.DB.Preload("User").First(&review, review.ID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Đánh giá thành công!",
		"data":    review,
	})
}

// GetBookReviews — xem tất cả review của 1 sách (public)
func GetBookReviews(c *gin.Context) {
	bookID := c.Param("id")

	var reviews []models.Review
	config.DB.Preload("User").
		Where("book_id = ?", bookID).
		Order("created_at DESC").
		Find(&reviews)

	c.JSON(http.StatusOK, gin.H{"data": reviews})
}

// DeleteReview — xoá review (chủ nhân review)
func DeleteReview(c *gin.Context) {
	userID, _ := c.Get("user_id")
	reviewID := c.Param("id")

	var review models.Review
	if result := config.DB.First(&review, reviewID); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đánh giá"})
		return
	}

	// Chỉ chủ nhân review hoặc admin mới được xoá
	role, _ := c.Get("role")
	if review.UserID != userID.(uint) && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Bạn không có quyền xoá đánh giá này"})
		return
	}

	config.DB.Delete(&review)
	c.JSON(http.StatusOK, gin.H{"message": "Đã xoá đánh giá!"})
}