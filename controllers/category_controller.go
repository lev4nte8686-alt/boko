package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// ==================== PUBLIC ====================

// GetCategories — danh sách danh mục
func GetCategories(c *gin.Context) {
	var categories []models.Category
	config.DB.Order("name ASC").Find(&categories)

	c.JSON(http.StatusOK, gin.H{"data": categories})
}

// GetCategory — chi tiết 1 danh mục + sách trong đó
func GetCategory(c *gin.Context) {
	id := c.Param("id")

	var category models.Category
	if result := config.DB.Preload("Books", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at DESC").Limit(10)
	}).First(&category, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy danh mục"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": category})
}

// ==================== ADMIN ONLY ====================

// CreateCategory — thêm danh mục (admin)
func CreateCategory(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ admin mới được thêm danh mục"})
		return
	}

	var input struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	// Kiểm tra tên danh mục đã tồn tại
	var existing models.Category
	if result := config.DB.Where("name = ?", input.Name).First(&existing); result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Danh mục đã tồn tại"})
		return
	}

	category := models.Category{
		Name:        input.Name,
		Description: input.Description,
	}
	config.DB.Create(&category)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Thêm danh mục thành công!",
		"data":    category,
	})
}

// UpdateCategory — sửa danh mục (admin)
func UpdateCategory(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ admin mới được sửa danh mục"})
		return
	}

	id := c.Param("id")
	var category models.Category
	if result := config.DB.First(&category, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy danh mục"})
		return
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}

	c.ShouldBindJSON(&input)

	updates := map[string]interface{}{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.Description != "" {
		updates["description"] = input.Description
	}

	config.DB.Model(&category).Updates(updates)
	c.JSON(http.StatusOK, gin.H{
		"message": "Cập nhật danh mục thành công!",
		"data":    category,
	})
}

// DeleteCategory — xoá danh mục (admin)
func DeleteCategory(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ admin mới được xoá danh mục"})
		return
	}

	id := c.Param("id")
	var category models.Category
	if result := config.DB.First(&category, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy danh mục"})
		return
	}

	// Set category_id = NULL cho các sách thuộc danh mục này
	config.DB.Model(&models.Book{}).Where("category_id = ?", id).Update("category_id", nil)

	config.DB.Delete(&category)
	c.JSON(http.StatusOK, gin.H{"message": "Xoá danh mục thành công!"})
}