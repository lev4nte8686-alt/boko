package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
	"boko/payments"
	"boko/services"
)

// ==================== PAYMENT CONTROLLER ====================

// CreateMomoPayment — Tạo yêu cầu thanh toán MoMo cho một đơn hàng (Phương án A)
func CreateMomoPayment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Vui lòng đăng nhập"})
		return
	}

	var input struct {
		OrderID     uint   `json:"order_id" binding:"required"`
		RedirectURL string `json:"redirect_url"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// 1. Kiểm tra đơn hàng thuộc quyền sở hữu của user
	var order models.Order
	if err := config.DB.Where("id = ? AND user_id = ?", input.OrderID, userID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập"})
		return
	}

	// 2. Kiểm tra nếu đơn đã thanh toán rồi
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Đơn hàng này đã được thanh toán thành công trước đó"})
		return
	}

	// 3. Gọi MoMo Service để tạo URL thanh toán
	momoResp, err := services.CreateMomoPaymentUrl(&order, input.RedirectURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 4. Lưu lại mã phiên giao dịch MoMo vào database
	config.DB.Model(&order).Updates(map[string]interface{}{
		"payment_method":     "momo",
		"payment_order_id":   momoResp.OrderID,
		"payment_request_id": momoResp.RequestID,
	})

	c.JSON(http.StatusOK, gin.H{
		"message":       "Khởi tạo giao dịch MoMo thành công",
		"order_id":      order.ID,
		"amount":        order.Total,
		"momo_order_id": momoResp.OrderID,
		"pay_url":       momoResp.PayURL,
		"deeplink":      momoResp.Deeplink,
		"qr_code_url":   momoResp.QrCodeURL,
		"applink":       momoResp.Applink,
	})
}

// MomoIPN — Webhook nhận thông báo kết quả thanh toán từ MoMo Server (Server-to-Server)
func MomoIPN(c *gin.Context) {
	var ipnReq payments.MomoIpnRequest
	if err := c.ShouldBindJSON(&ipnReq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload không hợp lệ: " + err.Error()})
		return
	}

	// 1. Xác thực chữ ký số HMAC-SHA256 (Bảo mật chống giả mạo)
	if !services.VerifyMomoIpnSignature(&ipnReq) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid signature (Chữ ký không hợp lệ)"})
		return
	}

	// 2. Tìm đơn hàng theo payment_order_id hoặc parse từ OrderID (BOKO_<id>_<timestamp>)
	var order models.Order
	if err := config.DB.Where("payment_order_id = ?", ipnReq.OrderID).First(&order).Error; err != nil {
		var id uint
		if n, _ := fmt.Sscanf(ipnReq.OrderID, "BOKO_%d_", &id); n == 1 {
			config.DB.Where("id = ?", id).First(&order)
		}
	}

	if order.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng tương ứng"})
		return
	}

	// 3. Cơ chế Idempotency: Nếu đơn đã thanh toán rồi, không cập nhật lại, trả ngay 204
	if order.PaymentStatus == "paid" {
		c.Status(http.StatusNoContent)
		return
	}

	// 4. Cập nhật trạng thái đơn hàng dựa trên resultCode của MoMo
	if ipnReq.ResultCode == 0 {
		// Thanh toán thành công
		config.DB.Model(&order).Updates(map[string]interface{}{
			"payment_status":   "paid",
			"status":           "confirmed",
			"payment_trans_id": strconv.FormatInt(ipnReq.TransID, 10),
			"payment_method":   "momo",
		})
	} else {
		// Thanh toán thất bại hoặc người dùng hủy
		config.DB.Model(&order).Updates(map[string]interface{}{
			"payment_status": "failed",
		})
	}

	// Phản hồi HTTP 204 No Content theo đúng chuẩn MoMo Webhook
	c.Status(http.StatusNoContent)
}

// GetPaymentStatus — Kiểm tra trạng thái thanh toán của đơn hàng (có tự động sync Gateway)
func GetPaymentStatus(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Vui lòng đăng nhập"})
		return
	}

	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseUint(orderIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID đơn hàng không hợp lệ"})
		return
	}

	var order models.Order
	if err := config.DB.Where("id = ? AND user_id = ?", uint(orderID), userID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	// Tự động kiểm tra trực tiếp MoMo Gateway nếu đơn đang unpaid mà đã có mã MoMo Order
	if order.PaymentStatus != "paid" && order.PaymentOrderID != "" && order.PaymentRequestID != "" {
		if queryResp, err := services.QueryMomoTransaction(order.PaymentOrderID, order.PaymentRequestID); err == nil {
			if queryResp.ResultCode == 0 {
				config.DB.Model(&order).Updates(map[string]interface{}{
					"payment_status":   "paid",
					"status":           "confirmed",
					"payment_trans_id": strconv.FormatInt(queryResp.TransID, 10),
					"payment_method":   "momo",
				})
				order.PaymentStatus = "paid"
				order.Status = "confirmed"
				order.PaymentTransID = strconv.FormatInt(queryResp.TransID, 10)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"order_id":         order.ID,
		"total":            order.Total,
		"status":           order.Status,
		"payment_method":   order.PaymentMethod,
		"payment_status":   order.PaymentStatus,
		"payment_trans_id": order.PaymentTransID,
		"payment_order_id": order.PaymentOrderID,
		"updated_at":       order.UpdatedAt,
	})
}

// MockMomoIPN — API tiện ích cho lập trình viên test giả lập IPN thành công nội bộ
func MockMomoIPN(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseUint(orderIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID đơn hàng không hợp lệ"})
		return
	}

	var order models.Order
	if err := config.DB.Where("id = ?", uint(orderID)).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	mockTransID := fmt.Sprintf("MOCK_TRANS_%d", time.Now().UnixMilli())
	config.DB.Model(&order).Updates(map[string]interface{}{
		"payment_status":   "paid",
		"status":           "confirmed",
		"payment_trans_id": mockTransID,
		"payment_method":   "momo",
	})

	c.JSON(http.StatusOK, gin.H{
		"message":          "✅ Giả lập Webhook MoMo IPN thành công!",
		"order_id":         order.ID,
		"payment_status":   "paid",
		"status":           "confirmed",
		"payment_trans_id": mockTransID,
	})
}
