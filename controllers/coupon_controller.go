package controllers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
)

// ==================== COUPON ====================

// CreateCoupon — tạo mã giảm giá (seller/admin)
func CreateCoupon(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới được tạo mã giảm giá"})
		return
	}

	var input struct {
		Code            string `json:"code" binding:"required"`
		DiscountPercent int    `json:"discount_percent" binding:"required,min=1,max=100"`
		MaxUses         int    `json:"max_uses"`
		ExpiresAt       string `json:"expires_at" binding:"required"` // định dạng: "2006-01-02T15:04:05Z"
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	exp, err := time.Parse(time.RFC3339, input.ExpiresAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ngày hết hạn sai định dạng (cần ISO 8601)"})
		return
	}

	if input.MaxUses == 0 {
		input.MaxUses = 100
	}

	// Kiểm tra code tồn tại
	var existing models.Coupon
	if result := config.DB.Where("code = ?", input.Code).First(&existing); result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Mã giảm giá đã tồn tại"})
		return
	}

	coupon := models.Coupon{
		Code:            input.Code,
		DiscountPercent: input.DiscountPercent,
		MaxUses:         input.MaxUses,
		ExpiresAt:       exp,
		IsActive:        true,
	}
	config.DB.Create(&coupon)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Tạo mã giảm giá thành công!",
		"data":    coupon,
	})
}

// ApplyCoupon — kiểm tra mã giảm giá có hợp lệ không
func ApplyCoupon(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input struct {
		Code string `json:"code" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	var coupon models.Coupon
	if result := config.DB.Where("code = ? AND is_active = ?", input.Code, true).First(&coupon); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Mã giảm giá không hợp lệ"})
		return
	}

	// Kiểm tra hạn sử dụng
	if time.Now().After(coupon.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mã giảm giá đã hết hạn"})
		return
	}

	// Kiểm tra số lần sử dụng
	if coupon.UsedCount >= coupon.MaxUses {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mã giảm giá đã hết lượt sử dụng"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          "Mã giảm giá hợp lệ!",
		"code":             coupon.Code,
		"discount_percent": coupon.DiscountPercent,
		"expires_at":       coupon.ExpiresAt,
	})

	// Log user_id để biết ai đã check
	_ = userID
}

// GetCoupons — danh sách mã giảm giá (seller)
func GetCoupons(c *gin.Context) {
	var coupons []models.Coupon
	config.DB.Order("created_at DESC").Find(&coupons)

	c.JSON(http.StatusOK, gin.H{"data": coupons})
}

// DeleteCoupon — xoá mã giảm giá (seller/admin)
func DeleteCoupon(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới được xoá mã giảm giá"})
		return
	}

	id := c.Param("id")
	var coupon models.Coupon
	if result := config.DB.First(&coupon, id); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy mã giảm giá"})
		return
	}

	config.DB.Delete(&coupon)
	c.JSON(http.StatusOK, gin.H{"message": "Đã xoá mã giảm giá!"})
}