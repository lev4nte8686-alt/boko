package controllers

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
	"boko/services"
)

// ============================================================================
// THÔNG BÁO / EMAIL
// ============================================================================

// notifyOrderEmail — gửi email cập nhật cho chủ đơn (best-effort, chạy nền).
// KHÔNG được gọi trong lúc transaction đang mở; chỉ gọi sau khi đã commit.
// Chạy goroutine để không làm chậm webhook/checkout; lỗi chỉ ghi log + email_logs.
func notifyOrderEmail(orderID uint, subject, heading, intro string) {
	if config.DB == nil || orderID == 0 {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("notify: panic khi gửi email đơn #%d: %v", orderID, r)
			}
		}()

		var order models.Order
		if err := config.DB.Preload("Items").First(&order, orderID).Error; err != nil {
			return
		}

		var user models.User
		if err := config.DB.First(&user, order.UserID).Error; err != nil {
			return
		}
		if strings.TrimSpace(user.Email) == "" {
			return
		}

		ctaURL := services.AppBaseURL() + "/orders"
		if err := services.SendOrderStatusEmail(user.Email, user.Name, subject, heading, intro, order, ctaURL); err != nil {
			log.Printf("notify: gửi email đơn #%d tới %s thất bại: %v", orderID, user.Email, err)
		}
	}()
}

// GetEmailLogs — danh sách email giao dịch gần đây (chỉ admin).
// Dùng để đối soát vận hành và kiểm thử local khi chưa cấu hình provider thật.
func GetEmailLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var logs []models.EmailLog
	config.DB.Order("id DESC").Limit(limit).Find(&logs)

	c.JSON(http.StatusOK, gin.H{"data": logs})
}
