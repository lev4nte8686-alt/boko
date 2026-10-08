package controllers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"boko/config"
	"boko/middleware"
	"boko/models"
)

// optionalUserID — đọc Bearer token nếu có để gắn đơn vào user,
// trả về nil cho guest (không token/token sai) để tránh FK violation user_id=0
func optionalUserID(c *gin.Context) *uint {
	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return nil
	}
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("sai phương thức ký")
		}
		return middleware.JwtSecret, nil
	})
	if err != nil || !token.Valid {
		return nil
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil
	}
	uidFloat, ok := claims["user_id"].(float64)
	if !ok {
		return nil
	}
	uid := uint(uidFloat)
	return &uid
}

// ==================== ORDER ====================

// GuestCheckout — tạo đơn ngay từ danh sách sản phẩm frontend gửi lên (không cần giỏ hàng DB)
func GuestCheckout(c *gin.Context) {
	var input struct {
		ShippingAddress string `json:"shipping_address" binding:"required"`
		Phone           string `json:"phone" binding:"required"`
		PaymentMethod   string `json:"payment_method"`
		Items           []struct {
			Title    string  `json:"title" binding:"required"`
			Price    float64 `json:"price" binding:"required"`
			Quantity int     `json:"quantity" binding:"required"`
		} `json:"items" binding:"required,dive"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = "cod"
	}
	var total float64
	for _, it := range input.Items {
		total += it.Price * float64(it.Quantity)
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		order := models.Order{
			UserID:          optionalUserID(c), // gắn user nếu đã đăng nhập, nil nếu guest
			Total:           total,
			Status:          "pending",
			ShippingAddress: models.EncryptedString(input.ShippingAddress),
			Phone:           models.EncryptedString(input.Phone),
			PaymentMethod:   input.PaymentMethod,
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		for _, it := range input.Items {
			item := models.OrderItem{
				OrderID:  order.ID,
				Title:    it.Title,
				Price:    it.Price,
				Quantity: it.Quantity,
			}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var order models.Order
	config.DB.Preload("Items").Order("id desc").First(&order)
	c.JSON(http.StatusCreated, gin.H{"message": "Đặt hàng thành công!", "order_id": order.ID, "total": order.Total, "status": order.Status})
}

// CreateOrder — tạo đơn hàng từ giỏ hàng (dùng transaction)
func CreateOrder(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input struct {
		ShippingAddress string `json:"shipping_address" binding:"required"`
		Phone           string `json:"phone" binding:"required"`
		PaymentMethod   string `json:"payment_method"` // cod | paypal | card | bank | zalopay
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
		uid := userID.(uint)
		order := models.Order{
			UserID:          &uid,
			Total:           finalTotal,
			Status:          "pending",
			ShippingAddress: models.EncryptedString(input.ShippingAddress),
			Phone:           models.EncryptedString(input.Phone),
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
		"message":        "Đặt hàng thành công!",
		"order_id":       order.ID,
		"total":          order.Total,
		"status":         order.Status,
		"payment_method": order.PaymentMethod,
		"payment_status": order.PaymentStatus,
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
