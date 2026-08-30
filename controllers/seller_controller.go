package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
)

// ==================== SELLER DASHBOARD ====================

// SellerGetBooks — danh sách sách của seller đang đăng nhập
func SellerGetBooks(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới xem được"})
		return
	}

	userID, _ := c.Get("user_id")

	var books []models.Book
	query := config.DB.Preload("Category").Where("user_id = ?", userID)

	// Nếu admin → xem tất cả
	if role == "admin" {
		query = config.DB.Preload("Category")
	}

	query.Order("created_at DESC").Find(&books)

	c.JSON(http.StatusOK, gin.H{"data": books})
}

// SellerGetOrders — đơn hàng có chứa sách của seller
func SellerGetOrders(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới xem được"})
		return
	}

	userID, _ := c.Get("user_id")

	// Lấy danh sách order_id từ order_items có book_id thuộc về seller
	var orderIDs []uint
	if role == "admin" {
		config.DB.Model(&models.OrderItem{}).Distinct().Pluck("order_id", &orderIDs)
	} else {
		config.DB.Table("order_items").
			Joins("join books on books.id = order_items.book_id").
			Where("books.user_id = ?", userID).
			Distinct("order_items.order_id").
			Pluck("order_items.order_id", &orderIDs)
	}

	var orders []models.Order
	if len(orderIDs) > 0 {
		config.DB.Preload("Items").Preload("User").
			Where("id IN ?", orderIDs).
			Order("created_at DESC").
			Find(&orders)
	}

	c.JSON(http.StatusOK, gin.H{"data": orders})
}

// SellerUpdateOrderStatus — cập nhật trạng thái đơn hàng (seller)
func SellerUpdateOrderStatus(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới được cập nhật"})
		return
	}

	orderID := c.Param("id")

	var input struct {
		Status string `json:"status" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	// Chỉ cho phép các trạng thái hợp lệ
	validStatuses := map[string]bool{
		"confirmed": true,
		"shipping":  true,
		"completed": true,
		"cancelled": true,
	}
	if !validStatuses[input.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Trạng thái không hợp lệ"})
		return
	}

	var order models.Order
	if result := config.DB.First(&order, orderID); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	// Chỉ cho phép chuyển trạng thái theo thứ tự
	if role != "admin" {
		allowed := false
		switch order.Status {
		case "pending":
			allowed = input.Status == "confirmed" || input.Status == "cancelled"
		case "confirmed":
			allowed = input.Status == "shipping" || input.Status == "cancelled"
		case "shipping":
			allowed = input.Status == "completed"
		}
		if !allowed {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Không thể chuyển từ \"" + order.Status + "\" sang \"" + input.Status + "\"",
			})
			return
		}
	}

	config.DB.Model(&order).Update("status", input.Status)

	c.JSON(http.StatusOK, gin.H{
		"message": "Cập nhật trạng thái đơn hàng thành công!",
		"status":  input.Status,
	})
}