package controllers

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// ==================== ORDER ====================

// CreateOrder — tạo đơn hàng từ giỏ hàng (dùng transaction)
func CreateOrder(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input struct {
		ShippingAddress string `json:"shipping_address" binding:"required"`
		Phone           string `json:"phone" binding:"required"`
		PaymentMethod   string `json:"payment_method"` // cod | momo
		CouponCode      string `json:"coupon_code"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	if input.PaymentMethod == "" {
		input.PaymentMethod = "cod"
	}

	// ===== TRANSACTION =====
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// 1. Lấy giỏ hàng
		type cartItem struct {
			CartID   uint
			BookID   uint
			Title    string
			Price    float64
			Quantity int
			Stock    int
			SellerID uint
		}

		var cartItems []cartItem
		tx.Table("carts").
			Select("carts.id as cart_id, carts.book_id, books.title, books.price, carts.quantity, books.stock, books.user_id as seller_id").
			Joins("join books on books.id = carts.book_id").
			Where("carts.user_id = ?", userID).
			Scan(&cartItems)

		if len(cartItems) == 0 {
			return errors.New("Giỏ hàng trống")
		}

		// 2. Kiểm tra tồn kho
		var total float64
		for _, item := range cartItems {
			if item.Quantity > item.Stock {
				return errors.New("Sách \"" + item.Title + "\" không đủ tồn kho")
			}
			total += item.Price * float64(item.Quantity)
		}

		// 3. Kiểm tra & áp dụng coupon nếu có
		discountPercent := 0
		if input.CouponCode != "" {
			var coupon models.Coupon
			if result := tx.Where("code = ? AND is_active = ?", input.CouponCode, true).First(&coupon); result.Error != nil {
				return errors.New("Mã giảm giá không hợp lệ")
			}
			if time.Now().After(coupon.ExpiresAt) {
				return errors.New("Mã giảm giá đã hết hạn")
			}
			if coupon.UsedCount >= coupon.MaxUses {
				return errors.New("Mã giảm giá đã hết lượt sử dụng")
			}
			discountPercent = coupon.DiscountPercent

			// Tăng UsedCount
			tx.Model(&coupon).Update("used_count", coupon.UsedCount+1)
		}

		// Tính tổng sau giảm giá
		finalTotal := total * (100 - float64(discountPercent)) / 100

		// 4. Tạo đơn hàng
		order := models.Order{
			UserID:          userID.(uint),
			Total:           finalTotal,
			Status:          "pending",
			ShippingAddress: input.ShippingAddress,
			Phone:           input.Phone,
			PaymentMethod:   input.PaymentMethod,
			CouponCode:      input.CouponCode,
			DiscountPercent: discountPercent,
			CreatedAt:       time.Now(),
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}

		// 5. Tạo OrderItem + trừ stock
		for _, item := range cartItems {
			orderItem := models.OrderItem{
				OrderID:  order.ID,
				BookID:   item.BookID,
				Title:    item.Title,
				Price:    item.Price,
				Quantity: item.Quantity,
			}
			if err := tx.Create(&orderItem).Error; err != nil {
				return err
			}

			// Trừ tồn kho
			if err := tx.Model(&models.Book{}).Where("id = ?", item.BookID).
				Update("stock", gorm.Expr("stock - ?", item.Quantity)).Error; err != nil {
				return err
			}
		}

		// 6. Xoá giỏ hàng
		if err := tx.Where("user_id = ?", userID).Delete(&models.Cart{}).Error; err != nil {
			return err
		}

		return nil
	})
	// ===== END TRANSACTION =====

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Lấy đơn vừa tạo
	var order models.Order
	config.DB.Preload("Items").Where("user_id = ?", userID).Order("id desc").First(&order)

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Đặt hàng thành công!",
		"order_id": order.ID,
		"total":    order.Total,
		"status":   order.Status,
	})
}

// GetMyOrders — lịch sử đơn hàng của user
func GetMyOrders(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var orders []models.Order
	config.DB.Preload("Items").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&orders)

	c.JSON(http.StatusOK, gin.H{"data": orders})
}

// GetOrderDetail — chi tiết 1 đơn hàng
func GetOrderDetail(c *gin.Context) {
	userID, _ := c.Get("user_id")
	orderID := c.Param("id")

	var order models.Order
	if result := config.DB.Preload("Items").
		Where("id = ? AND user_id = ?", orderID, userID).
		First(&order); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": order})
}

// CancelOrder — huỷ đơn hàng (chỉ khi pending, hoàn lại stock)
func CancelOrder(c *gin.Context) {
	userID, _ := c.Get("user_id")
	orderID := c.Param("id")

	var order models.Order
	if result := config.DB.Where("id = ? AND user_id = ?", orderID, userID).First(&order); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	if order.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Chỉ có thể huỷ đơn hàng đang ở trạng thái chờ xử lý"})
		return
	}

	// Transaction: huỷ đơn + hoàn stock
	config.DB.Transaction(func(tx *gorm.DB) error {
		// Hoàn stock
		var items []models.OrderItem
		tx.Where("order_id = ?", order.ID).Find(&items)
		for _, item := range items {
			tx.Model(&models.Book{}).Where("id = ?", item.BookID).
				Update("stock", gorm.Expr("stock + ?", item.Quantity))
		}

		// Cập nhật trạng thái
		tx.Model(&order).Update("status", "cancelled")
		return nil
	})

	c.JSON(http.StatusOK, gin.H{"message": "Đã huỷ đơn hàng!"})
}