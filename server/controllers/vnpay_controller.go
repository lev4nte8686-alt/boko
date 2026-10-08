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

// ==================== VNPAY CONTROLLER ====================

// CreateVnPayPayment — Tạo yêu cầu thanh toán VNPAY cho đơn hàng
func CreateVnPayPayment(c *gin.Context) {
	var input struct {
		OrderID         uint    `json:"order_id"`
		Amount          float64 `json:"amount"`
		ShippingAddress string  `json:"shipping_address"`
		Phone           string  `json:"phone"`
		Email           string  `json:"email"`
		BankCode        string  `json:"bank_code"`
		RedirectURL     string  `json:"redirect_url"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// Xác định user_id: ưu tiên từ JWT token đã xác thực, nếu không có thì liên kết qua email hoặc tài khoản khách
	var currentUserID uint
	if val, exists := c.Get("user_id"); exists {
		if uid, ok := val.(uint); ok {
			currentUserID = uid
		}
	}

	if currentUserID == 0 {
		targetEmail := input.Email
		if targetEmail == "" {
			targetEmail = "guest@boko.com"
		}
		var user models.User
		if err := config.DB.Where("email = ?", targetEmail).First(&user).Error; err != nil {
			user = models.User{
				Email: targetEmail,
				Name:  "Khách mua hàng",
				Role:  "customer",
			}
			config.DB.Create(&user)
		}
		currentUserID = user.ID
	}

	// 1. Tìm đơn hàng có sẵn hoặc tạo đơn hàng mới nếu truyền amount
	var order models.Order
	if input.OrderID > 0 {
		var err error
		if val, exists := c.Get("user_id"); exists {
			err = config.DB.Where("id = ? AND user_id = ?", input.OrderID, val.(uint)).First(&order).Error
		} else {
			err = config.DB.First(&order, input.OrderID).Error
		}
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập"})
			return
		}
	} else if input.Amount >= 5000 {
		uid := currentUserID
		order = models.Order{
			UserID:          &uid,
			Total:           input.Amount,
			Status:          "pending",
			PaymentStatus:   "unpaid",
			PaymentMethod:   "vnpay",
			ShippingAddress: models.EncryptedString(input.ShippingAddress),
			Phone:           models.EncryptedString(input.Phone),
			CreatedAt:       time.Now(),
		}
		if err := config.DB.Create(&order).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tạo đơn hàng: " + err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số tiền thanh toán VNPAY tối thiểu là 5,000 VND"})
		return
	}

	// 2. Kiểm tra nếu đơn đã thanh toán rồi
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Đơn hàng này đã được thanh toán thành công trước đó"})
		return
	}

	// 3. Lấy IP khách hàng và tạo URL thanh toán VNPAY
	clientIP := c.ClientIP()
	paymentURL, txnRef, err := services.CreateVnPayPaymentUrl(&order, clientIP, input.BankCode, input.RedirectURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 4. Lưu lại mã tham chiếu VNPAY vào database
	config.DB.Model(&order).Updates(map[string]interface{}{
		"payment_method":   "vnpay",
		"payment_order_id": txnRef,
	})

	c.JSON(http.StatusOK, gin.H{
		"message":     "Khởi tạo giao dịch VNPAY thành công",
		"order_id":    order.ID,
		"amount":      order.Total,
		"payment_url": paymentURL,
		"txn_ref":     txnRef,
	})
}

// VnPayIPN — Webhook nhận thông báo kết quả thanh toán từ VNPAY Server (Server-to-Server, HTTP GET)
func VnPayIPN(c *gin.Context) {
	queryParams := c.Request.URL.Query()

	// 1. Xác thực chữ ký số HMAC-SHA512
	if !services.VerifyVnPaySignature(queryParams) {
		c.JSON(http.StatusOK, payments.VnPayIpnResponse{
			RspCode: "97",
			Message: "Invalid Checksum (Chữ ký không hợp lệ)",
		})
		return
	}

	txnRef := queryParams.Get("vnp_TxnRef")
	amountStr := queryParams.Get("vnp_Amount")
	responseCode := queryParams.Get("vnp_ResponseCode")
	transactionStatus := queryParams.Get("vnp_TransactionStatus")
	transactionNo := queryParams.Get("vnp_TransactionNo")

	// 2. Tìm đơn hàng theo payment_order_id hoặc parse từ txnRef (BOKO_<id>_<timestamp>)
	var order models.Order
	if err := config.DB.Where("payment_order_id = ?", txnRef).First(&order).Error; err != nil {
		var id uint
		if n, _ := fmt.Sscanf(txnRef, "BOKO_%d_", &id); n == 1 {
			config.DB.Where("id = ?", id).First(&order)
		}
	}

	if order.ID == 0 {
		c.JSON(http.StatusOK, payments.VnPayIpnResponse{
			RspCode: "01",
			Message: "Order not found (Không tìm thấy đơn hàng)",
		})
		return
	}

	// 3. Đối soát số tiền thanh toán (vnp_Amount / 100 == order.Total)
	vnpAmount, _ := strconv.ParseInt(amountStr, 10, 64)
	if vnpAmount/100 != int64(order.Total) {
		c.JSON(http.StatusOK, payments.VnPayIpnResponse{
			RspCode: "04",
			Message: "Invalid amount (Số tiền thanh toán không khớp)",
		})
		return
	}

	// 4. Cơ chế Idempotency: Nếu đơn đã thanh toán rồi, không cập nhật lại
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusOK, payments.VnPayIpnResponse{
			RspCode: "02",
			Message: "Order already confirmed (Đơn hàng đã được xác nhận trước đó)",
		})
		return
	}

	// 5. Cập nhật trạng thái đơn hàng dựa trên vnp_ResponseCode và vnp_TransactionStatus
	if responseCode == "00" && transactionStatus == "00" {
		// Thanh toán thành công
		config.DB.Model(&order).Updates(map[string]interface{}{
			"payment_status":   "paid",
			"status":           "confirmed",
			"payment_trans_id": transactionNo,
			"payment_method":   "vnpay",
		})
	} else {
		// Thanh toán thất bại hoặc người dùng hủy
		config.DB.Model(&order).Updates(map[string]interface{}{
			"payment_status": "failed",
		})
	}

	// Phản hồi HTTP 200 OK kèm mã RspCode 00 theo đúng chuẩn VNPAY
	c.JSON(http.StatusOK, payments.VnPayIpnResponse{
		RspCode: "00",
		Message: "Confirm Success",
	})
}

// GetVnPayPaymentStatus — Lấy thông tin trạng thái thanh toán đơn hàng VNPAY
func GetVnPayPaymentStatus(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseUint(orderIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID đơn hàng không hợp lệ"})
		return
	}

	var order models.Order
	var dbErr error
	if userID, exists := c.Get("user_id"); exists {
		dbErr = config.DB.Where("id = ? AND user_id = ?", uint(orderID), userID).First(&order).Error
	} else {
		dbErr = config.DB.First(&order, uint(orderID)).Error
	}

	if dbErr != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	// Nếu request mang các tham số xác thực từ VNPAY Return URL và chữ ký HMAC-SHA512 hợp lệ
	queryParams := c.Request.URL.Query()
	if queryParams.Get("vnp_SecureHash") != "" && services.VerifyVnPaySignature(queryParams) {
		responseCode := queryParams.Get("vnp_ResponseCode")
		transactionNo := queryParams.Get("vnp_TransactionNo")
		if responseCode == "00" && order.PaymentStatus != "paid" {
			config.DB.Model(&order).Updates(map[string]interface{}{
				"payment_status":   "paid",
				"status":           "confirmed",
				"payment_trans_id": transactionNo,
				"payment_method":   "vnpay",
			})
			order.PaymentStatus = "paid"
			order.Status = "confirmed"
			order.PaymentTransID = transactionNo
		}
	}

	// Tự động đối soát trực tiếp với VNPAY Gateway (querydr) nếu đơn chưa paid và đã có mã tham chiếu
	if order.PaymentStatus != "paid" && order.PaymentOrderID != "" {
		loc := time.FixedZone("ICT", 7*3600)
		transDate := order.CreatedAt.In(loc).Format("20060102150405")
		if queryResp, err := services.QueryVnPayTransaction(order.PaymentOrderID, transDate, c.ClientIP()); err == nil {
			if queryResp.ResponseCode == "00" && queryResp.TransactionStatus == "00" {
				config.DB.Model(&order).Updates(map[string]interface{}{
					"payment_status":   "paid",
					"status":           "confirmed",
					"payment_trans_id": queryResp.TransactionNo,
					"payment_method":   "vnpay",
				})
				order.PaymentStatus = "paid"
				order.Status = "confirmed"
				order.PaymentTransID = queryResp.TransactionNo
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
