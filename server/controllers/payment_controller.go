package controllers

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
	"boko/payments"
	"boko/services"
)

// mockPaymentEnabled — cờ ALLOW_MOCK_PAYMENT có đang bật không (không ghi response).
func mockPaymentEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("ALLOW_MOCK_PAYMENT")), "true")
}

// mockPaymentAllowed — mock gateway chỉ mở khi ALLOW_MOCK_PAYMENT=true (local/test).
// Production luôn 403 để không ai tự đánh dấu đơn đã trả tiền.
func mockPaymentAllowed(c *gin.Context) bool {
	if !mockPaymentEnabled() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Mock payment đã bị tắt ở môi trường này"})
		return false
	}
	return true
}

// authorizeOrderStatus — ai được đọc trạng thái đơn hàng?
//   - Đã đăng nhập: chỉ chủ đơn (lọc theo user_id).
//   - Khách vãng lai: phải có ?key= trùng PaymentOrderID (mã gateway) HOẶC
//     TrackingToken (mã tra cứu 256-bit cấp lúc tạo đơn). Sai/thiếu -> 401, cố
//     tình trả 404 nếu đơn không tồn tại để chống enumerate ID.
func authorizeOrderStatus(c *gin.Context, orderID uint) (models.Order, bool) {
	var order models.Order
	if userID, exists := c.Get("user_id"); exists {
		if err := config.DB.Where("id = ? AND user_id = ?", orderID, userID).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
			return order, false
		}
		return order, true
	}
	if err := config.DB.First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return order, false
	}
	key := strings.TrimSpace(c.Query("key"))
	if key == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Thiếu mã xác thực tra cứu đơn hàng"})
		return order, false
	}
	// Chấp nhận mã thanh toán (PaymentOrderID) HOẶC mã tra cứu đơn (TrackingToken).
	matches := (order.PaymentOrderID != "" && subtle.ConstantTimeCompare([]byte(key), []byte(order.PaymentOrderID)) == 1) ||
		(order.TrackingToken != "" && subtle.ConstantTimeCompare([]byte(key), []byte(order.TrackingToken)) == 1)
	if !matches {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Mã xác thực tra cứu đơn hàng không đúng"})
		return order, false
	}
	return order, true
}

// ==================== PAYMENT CONTROLLER ====================

// CreateMomoPayment — Tạo yêu cầu thanh toán MoMo cho một đơn hàng (Phương án A)
func CreateMomoPayment(c *gin.Context) {
	var input struct {
		OrderID         uint    `json:"order_id"`
		Amount          float64 `json:"amount"`
		ShippingAddress string  `json:"shipping_address"`
		Phone           string  `json:"phone"`
		Email           string  `json:"email"`
		RedirectURL     string  `json:"redirect_url"`
		RequestType     string  `json:"request_type"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// Fail-closed: không có credential MoMo (env thật hoặc sandbox khi bật mock) thì từ chối.
	if !payments.GetMomoConfig().IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MoMo chưa được cấu hình ở môi trường này"})
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
		// Bảo mật (chống IDOR): chỉ chủ đơn ĐÃ ĐĂNG NHẬP mới được thanh toán cho
		// order_id có sẵn. Khách vãng lai phải tạo đơn mới qua amount.
		val, authed := c.Get("user_id")
		if !authed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Vui lòng đăng nhập để thanh toán cho đơn hàng đã tạo"})
			return
		}
		if err := config.DB.Where("id = ? AND user_id = ?", input.OrderID, val.(uint)).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập"})
			return
		}
	} else if input.Amount >= 1000 {
		order = models.Order{
			UserID:          currentUserID,
			Total:           input.Amount,
			Subtotal:        input.Amount,
			Status:          "pending",
			PaymentStatus:   "unpaid",
			PaymentMethod:   "momo",
			ShippingAddress: input.ShippingAddress,
			Phone:           input.Phone,
			TrackingToken:   generateTrackingToken(),
			CreatedAt:       time.Now(),
		}
		if err := config.DB.Create(&order).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tạo đơn hàng: " + err.Error()})
			return
		}
		// Tự động chuyển cho GHN quản lý vận chuyển (nền, không chặn phản hồi)
		go autoHandoverToGHNAsync(order.ID)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng cung cấp order_id hoặc số tiền amount hợp lệ (>= 1,000 VND)"})
		return
	}

	// 2. Kiểm tra nếu đơn đã thanh toán rồi
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Đơn hàng này đã được thanh toán thành công trước đó"})
		return
	}

	// 3. Gọi MoMo Service để tạo URL thanh toán
	reqType := input.RequestType
	if reqType == "" {
		reqType = "payWithMethod"
	}
	momoResp, err := services.CreateMomoPaymentUrl(&order, input.RedirectURL, reqType)
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
	// Fail-closed: thiếu credential thì không xác thực/thay đổi đơn (tránh ký bằng secret rỗng).
	if !payments.GetMomoConfig().IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MoMo chưa được cấu hình ở môi trường này"})
		return
	}
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

	// 3b. Đối soát số tiền (chống IPN hợp lệ-chữ-ký nhưng sai số tiền)
	if ipnReq.ResultCode == 0 && ipnReq.Amount > 0 && int64(order.Total) != ipnReq.Amount {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số tiền thanh toán không khớp với đơn hàng"})
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
		notifyOrderEmail(order.ID, "[Boko] Thanh toán thành công",
			"Thanh toán thành công",
			"Boko đã nhận được thanh toán MoMo cho đơn hàng của bạn.")
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
// GetPaymentStatus — Lấy thông tin trạng thái thanh toán đơn hàng (hỗ trợ cả Callback & User Profile)
func GetPaymentStatus(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseUint(orderIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID đơn hàng không hợp lệ"})
		return
	}

	order, ok := authorizeOrderStatus(c, uint(orderID))
	if !ok {
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
	if !mockPaymentAllowed(c) {
		return
	}
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

// MomoSimulatorIPN — Xử lý thanh toán từ Cổng Giả Lập MoMo Sandbox với ký số HMAC-SHA256 đầy đủ.
// CHỈ mở khi ALLOW_MOCK_PAYMENT=true (local/test); production trả 403 để không ai
// tự lật đơn sang "đã thanh toán".
func MomoSimulatorIPN(c *gin.Context) {
	if !mockPaymentAllowed(c) {
		return
	}
	if !payments.GetMomoConfig().IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MoMo chưa được cấu hình ở môi trường này"})
		return
	}
	var input struct {
		OrderID         string `json:"order_id"`
		ResultCode      int    `json:"result_code"`
		PayType         string `json:"pay_type"`
		TamperSignature bool   `json:"tamper_signature"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// 1. Tìm đơn hàng
	var order models.Order
	if err := config.DB.Where("payment_order_id = ?", input.OrderID).First(&order).Error; err != nil {
		var id uint
		if n, _ := fmt.Sscanf(input.OrderID, "BOKO_%d_", &id); n == 1 {
			config.DB.Where("id = ?", id).First(&order)
		} else if numID, errParse := strconv.ParseUint(input.OrderID, 10, 32); errParse == nil {
			config.DB.Where("id = ?", uint(numID)).First(&order)
		}
	}

	if order.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng tương ứng"})
		return
	}

	cfg := payments.GetMomoConfig()
	timestamp := time.Now().UnixMilli()
	transID := timestamp

	momoOrderID := order.PaymentOrderID
	if momoOrderID == "" {
		momoOrderID = fmt.Sprintf("BOKO_%d_%d", order.ID, timestamp)
	}
	momoRequestID := order.PaymentRequestID
	if momoRequestID == "" {
		momoRequestID = fmt.Sprintf("REQ_%d_%d", order.ID, timestamp)
	}

	payType := input.PayType
	if payType == "" {
		payType = "credit"
	}

	message := "Thành công."
	if input.ResultCode != 0 {
		message = "Giao dịch bị từ chối hoặc bị hủy bởi khách hàng."
	}

	// 2. Tạo chuỗi ký HMAC-SHA256 chuẩn MoMo
	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%d&resultCode=%d&transId=%d",
		cfg.AccessKey, int64(order.Total), "", message, momoOrderID,
		fmt.Sprintf("Thanh toan don hang Boko #%d", order.ID), "momo_wallet",
		cfg.PartnerCode, payType, momoRequestID, timestamp, input.ResultCode, transID,
	)

	validSignature := services.CreateHmacSha256(rawSignature, cfg.SecretKey)

	submittedSignature := validSignature
	if input.TamperSignature {
		submittedSignature = "TAMPERED_INVALID_SIG_" + validSignature[:16]
	}

	ipnReq := payments.MomoIpnRequest{
		PartnerCode:  cfg.PartnerCode,
		OrderID:      momoOrderID,
		RequestID:    momoRequestID,
		Amount:       int64(order.Total),
		OrderInfo:    fmt.Sprintf("Thanh toan don hang Boko #%d", order.ID),
		OrderType:    "momo_wallet",
		TransID:      transID,
		ResultCode:   input.ResultCode,
		Message:      message,
		PayType:      payType,
		ResponseTime: timestamp,
		ExtraData:    "",
		Signature:    submittedSignature,
	}

	// 3. Kiểm tra tính toàn vẹn và xác thực chữ ký số bằng thuật toán crypto của hệ thống
	isSignatureValid := services.VerifyMomoIpnSignature(&ipnReq)
	if !isSignatureValid {
		c.JSON(http.StatusForbidden, gin.H{
			"success":         false,
			"security_status": "BLOCKED_TAMPERING_DETECTED",
			"error":           "CẢNH BÁO AN TOÀN TMĐT: Chữ ký số HMAC-SHA256 không hợp lệ hoặc gói tin đã bị can thiệp! Hệ thống từ chối cập nhật đơn hàng.",
			"tampered":        true,
		})
		return
	}

	// 4. Cơ chế Idempotency
	if order.PaymentStatus == "paid" && input.ResultCode == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success":          true,
			"message":          "Đơn hàng này đã được thanh toán từ trước (Idempotency Safe).",
			"order_id":         order.ID,
			"payment_order_id": momoOrderID,
			"redirect_url": fmt.Sprintf("/payment/momo-callback?orderId=%s&resultCode=0&message=%s&transId=%s&amount=%d",
				momoOrderID, message, order.PaymentTransID, int64(order.Total)),
		})
		return
	}

	// 5. Cập nhật trạng thái đơn hàng
	if input.ResultCode == 0 {
		config.DB.Model(&order).Updates(map[string]interface{}{
			"payment_status":     "paid",
			"status":             "confirmed",
			"payment_trans_id":   strconv.FormatInt(transID, 10),
			"payment_method":     "momo",
			"payment_order_id":   momoOrderID,
			"payment_request_id": momoRequestID,
		})
	} else {
		config.DB.Model(&order).Updates(map[string]interface{}{
			"payment_status": "failed",
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"security_status":  "SIGNATURE_VERIFIED_HMAC_SHA256",
		"message":          "Xác thực chữ ký điện tử HMAC-SHA256 thành công. Giao dịch đã được cập nhật an toàn.",
		"order_id":         order.ID,
		"payment_order_id": momoOrderID,
		"trans_id":         strconv.FormatInt(transID, 10),
		"amount":           order.Total,
		"result_code":      input.ResultCode,
		"redirect_url": fmt.Sprintf("/payment/momo-callback?orderId=%s&resultCode=%d&message=%s&transId=%d&amount=%d",
			momoOrderID, input.ResultCode, message, transID, int64(order.Total)),
	})
}

// ==================== PAYPAL CONTROLLER (giống cấu trúc MoMo/VNPay phía trên) ====================

// resolvePaypalUserID — xác định user cho đơn PayPal: ưu tiên JWT đã xác thực,
// nếu không có thì liên kết qua email, cuối cùng tạo khách vãng lai (giống VNPay)
func resolvePaypalUserID(c *gin.Context, email string) uint {
	if val, exists := c.Get("user_id"); exists {
		if uid, ok := val.(uint); ok && uid != 0 {
			return uid
		}
	}
	targetEmail := strings.TrimSpace(email)
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
	return user.ID
}

// CreatePaypalPayment — Tạo đơn PayPal (dùng được cho cả user đăng nhập và khách)
func CreatePaypalPayment(c *gin.Context) {
	var input struct {
		OrderID         uint    `json:"order_id"`
		Amount          float64 `json:"amount"`
		ShippingAddress string  `json:"shipping_address"`
		Phone           string  `json:"phone"`
		Email           string  `json:"email"`
		RedirectURL     string  `json:"redirect_url"` // web nhận kết quả sau khi duyệt (luồng redirect)
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	currentUserID := resolvePaypalUserID(c, input.Email)

	// 1. Tìm đơn hàng có sẵn hoặc tạo đơn hàng mới nếu truyền amount
	var order models.Order
	if input.OrderID > 0 {
		// Bảo mật (chống IDOR): chỉ chủ đơn ĐÃ ĐĂNG NHẬP mới dùng order_id có sẵn.
		val, authed := c.Get("user_id")
		if !authed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Vui lòng đăng nhập để thanh toán cho đơn hàng đã tạo"})
			return
		}
		if err := config.DB.Where("id = ? AND user_id = ?", input.OrderID, val.(uint)).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập"})
			return
		}
	} else if input.Amount >= 1000 {
		order = models.Order{
			UserID:          currentUserID,
			Total:           input.Amount,
			Subtotal:        input.Amount,
			Status:          "pending",
			PaymentStatus:   "unpaid",
			PaymentMethod:   "paypal",
			ShippingAddress: input.ShippingAddress,
			Phone:           input.Phone,
			TrackingToken:   generateTrackingToken(),
			CreatedAt:       time.Now(),
		}
		if err := config.DB.Create(&order).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tạo đơn hàng: " + err.Error()})
			return
		}
		// Tự động chuyển cho GHN quản lý vận chuyển (nền, không chặn phản hồi)
		go autoHandoverToGHNAsync(order.ID)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số tiền thanh toán PayPal tối thiểu là 1,000 VND"})
		return
	}

	// 2. Kiểm tra nếu đơn đã thanh toán rồi
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Đơn hàng này đã được thanh toán thành công trước đó"})
		return
	}

	// 3. Gọi PayPal Service để tạo đơn (quy đổi VND sang USD trong service).
	// Có redirect_url thì PayPal redirect về sau khi duyệt (kiểu VNPay/MoMo),
	// không có thì dùng popup SDK rồi gọi capture sau.
	returnURL, cancelURL := strings.TrimSpace(input.RedirectURL), ""
	if returnURL != "" {
		cancelURL = returnURL
	}
	paypalResp, err := services.CreatePaypalOrder(order.Total, returnURL, cancelURL)
	if err != nil {
		if strings.Contains(err.Error(), "chưa cấu hình") || strings.Contains(err.Error(), "PayPal chưa được cấu hình") {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	// 4. Lưu lại mã đơn PayPal vào database
	config.DB.Model(&order).Updates(map[string]interface{}{
		"payment_method":   "paypal",
		"payment_order_id": paypalResp.ID,
	})

	c.JSON(http.StatusOK, gin.H{
		"message":         "Khởi tạo giao dịch PayPal thành công",
		"order_id":        order.ID,
		"amount":          order.Total,
		"amount_usd":      services.ConvertVNDToUSD(order.Total),
		"paypal_order_id": paypalResp.ID,
		"approve_url":     paypalResp.ApproveURL(),
		"tracking_token":  order.TrackingToken,
	})
}

// CapturePaypalPayment — Thu tiền đơn PayPal đã được user approve
func CapturePaypalPayment(c *gin.Context) {
	var input struct {
		PaypalOrderID string `json:"paypal_order_id" binding:"required"`
		TrackingToken string `json:"tracking_token"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// 1. Tìm đơn hàng theo mã đơn PayPal (kèm user nếu đã đăng nhập).
	// Khách vãng lai BẮT BUỘC kèm tracking_token (mã 256-bit cấp lúc tạo đơn) để
	// chứng minh quyền sở hữu — chống IDOR nếu paypal_order_id bị lộ/đoán.
	var order models.Order
	if val, exists := c.Get("user_id"); exists {
		if err := config.DB.Where("payment_order_id = ? AND user_id = ?", input.PaypalOrderID, val.(uint)).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng tương ứng"})
			return
		}
	} else {
		if err := config.DB.Where("payment_order_id = ?", input.PaypalOrderID).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng tương ứng"})
			return
		}
		if order.TrackingToken == "" || subtle.ConstantTimeCompare([]byte(order.TrackingToken), []byte(strings.TrimSpace(input.TrackingToken))) != 1 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng tương ứng"})
			return
		}
	}

	// 2. Cơ chế Idempotency: Nếu đơn đã thanh toán rồi, không capture lại
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusOK, gin.H{
			"message":  "Đơn hàng đã được thanh toán trước đó",
			"order_id": order.ID, "payment_status": "paid", "status": order.Status,
		})
		return
	}

	// 3. Capture + đối chiếu số tiền trong service
	cap, err := services.CapturePaypalOrder(input.PaypalOrderID, order.Total)
	if err != nil {
		config.DB.Model(&order).Updates(map[string]interface{}{"payment_status": "failed"})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 4. Đánh dấu đã thanh toán (giống IPN MoMo)
	config.DB.Model(&order).Updates(map[string]interface{}{
		"payment_status":   "paid",
		"status":           "confirmed",
		"payment_trans_id": cap.CaptureID,
		"payment_method":   "paypal",
	})

	notifyOrderEmail(order.ID, "[Boko] Thanh toán thành công",
		"Thanh toán thành công",
		"Boko đã nhận được thanh toán PayPal cho đơn hàng của bạn.")

	c.JSON(http.StatusOK, gin.H{
		"message":  "Thanh toán PayPal thành công!",
		"order_id": order.ID, "total": order.Total,
		"payment_status": "paid", "status": "confirmed",
		"payment_trans_id": cap.CaptureID,
	})
}

// GetPaypalPaymentStatus — Kiểm tra trạng thái thanh toán PayPal của đơn hàng (có tự động sync Gateway)
func GetPaypalPaymentStatus(c *gin.Context) {
	orderIDStr := c.Param("id")
	orderID, err := strconv.ParseUint(orderIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID đơn hàng không hợp lệ"})
		return
	}

	order, ok := authorizeOrderStatus(c, uint(orderID))
	if !ok {
		return
	}

	// Tự động đồng bộ với PayPal nếu đơn đang unpaid mà đã có mã PayPal Order
	if order.PaymentStatus != "paid" && order.PaymentOrderID != "" {
		if st, err := services.QueryPaypalOrder(order.PaymentOrderID); err == nil && st.Status == "COMPLETED" {
			config.DB.Model(&order).Updates(map[string]interface{}{
				"payment_status":   "paid",
				"status":           "confirmed",
				"payment_trans_id": st.ID,
				"payment_method":   "paypal",
			})
			order.PaymentStatus = "paid"
			order.Status = "confirmed"
			order.PaymentTransID = st.ID
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

// MockPaypalCapture — API tiện ích cho lập trình viên test giả lập capture thành công nội bộ
func MockPaypalCapture(c *gin.Context) {
	if !mockPaymentAllowed(c) {
		return
	}
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

	mockTransID := fmt.Sprintf("MOCK_PAYPAL_%d", time.Now().UnixMilli())
	config.DB.Model(&order).Updates(map[string]interface{}{
		"payment_status":   "paid",
		"status":           "confirmed",
		"payment_trans_id": mockTransID,
		"payment_method":   "paypal",
	})

	c.JSON(http.StatusOK, gin.H{
		"message":          "✅ Giả lập capture PayPal thành công!",
		"order_id":         order.ID,
		"payment_status":   "paid",
		"status":           "confirmed",
		"payment_trans_id": mockTransID,
	})
}
