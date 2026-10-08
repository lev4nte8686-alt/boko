package controllers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// ===== MoMo test credentials (PUBLIC, do MoMo công bố trong sample code chính chủ).
// Chỉ dùng để test. Key thật lấy ở business.momo.vn rồi set qua env
// MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY trên Render. =====
const (
	momoTestPartnerCode = "MOMOIQA420180417"
	momoTestAccessKey   = "SvDmj2cOTYZmQQ3H"
	momoTestSecretKey   = "PPuDXq1KowPT1ftR8DvlQTHhC03aul17"
	momoTestEndpoint    = "https://test-payment.momo.vn/v2/gateway/api/create"
)

func momoConf(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func momoPartnerCode() string { return momoConf("MOMO_PARTNER_CODE", momoTestPartnerCode) }
func momoAccessKey() string   { return momoConf("MOMO_ACCESS_KEY", momoTestAccessKey) }
func momoSecretKey() string   { return momoConf("MOMO_SECRET_KEY", momoTestSecretKey) }
func momoEndpoint() string    { return momoConf("MOMO_ENDPOINT", momoTestEndpoint) }
func momoIPNURL() string {
	return momoConf("MOMO_IPN_URL", "https://boko-api.onrender.com/api/momo/ipn")
}

// momoSign — HMAC-SHA256 hex theo đúng thứ tự field của MoMo
func momoSign(raw, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}

// MomoCreate — POST /api/momo/create
// Tạo đơn pending trên Neon trước, rồi xin MoMo payUrl. Frontend redirect sang payUrl.
func MomoCreate(c *gin.Context) {
	var input struct {
		TotalVND        float64 `json:"total_vnd" binding:"required"`
		ShippingAddress string  `json:"shipping_address" binding:"required"`
		Phone           string  `json:"phone" binding:"required"`
		RedirectURL     string  `json:"redirect_url"` // trang web nhận kết quả sau thanh toán
		Items           []struct {
			Title    string  `json:"title" binding:"required"`
			Price    float64 `json:"price" binding:"required"`
			Quantity int     `json:"quantity" binding:"required"`
		} `json:"items" binding:"required,dive"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.TotalVND <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	// 1. Xin MoMo payUrl TRƯỚC (tránh lưu đơn rác khi MoMo từ chối).
	// orderId duy nhất theo thời gian (gắn vào đơn sau khi MoMo chấp nhận)
	partnerCode, accessKey, secret := momoPartnerCode(), momoAccessKey(), momoSecretKey()
	now := time.Now().Unix()
	orderID := fmt.Sprintf("BOKO%d-%d", now%100000000, now%100000)
	requestID := fmt.Sprintf("%s-%d", orderID, time.Now().UnixNano()%100000)
	amount := fmt.Sprintf("%.0f", input.TotalVND)
	orderInfo := "Boko thanh toan don hang"
	redirectURL := strings.TrimSpace(input.RedirectURL)
	if redirectURL == "" {
		redirectURL = momoConf("MOMO_REDIRECT_URL", "https://app-eight-murex-41.vercel.app/payment-result")
	}
	extraData := ""
	requestType := "captureWallet"

	raw := fmt.Sprintf("accessKey=%s&amount=%s&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s&requestType=%s",
		accessKey, amount, extraData, momoIPNURL(), orderID, orderInfo, partnerCode, redirectURL, requestID, requestType)
	signature := momoSign(raw, secret)

	payload, _ := json.Marshal(map[string]string{
		"partnerCode": partnerCode, "accessKey": accessKey, "requestId": requestID,
		"amount": amount, "orderId": orderID, "orderInfo": orderInfo,
		"redirectUrl": redirectURL, "ipnUrl": momoIPNURL(), "extraData": extraData,
		"requestType": requestType, "signature": signature, "lang": "vi",
	})
	resp, err := http.Post(momoEndpoint(), "application/json", bytes.NewReader(payload))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Không kết nối được MoMo: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		ResultCode int    `json:"resultCode"`
		Message    string `json:"message"`
		PayURL     string `json:"payUrl"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.ResultCode != 0 || out.PayURL == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "MoMo từ chối tạo giao dịch: " + string(body)})
		return
	}

	// 2. MoMo đã chấp nhận → lưu đơn pending + gắn mã MoMo để IPN đối chiếu
	var order models.Order
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		order = models.Order{
			UserID:          optionalUserID(c),
			Total:           input.TotalVND,
			Status:          "pending",
			ShippingAddress: models.EncryptedString(input.ShippingAddress),
			Phone:           models.EncryptedString(input.Phone),
			PaymentMethod:   "momo",
			PaymentRef:      orderID,
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		for _, it := range input.Items {
			if err := tx.Create(&models.OrderItem{OrderID: order.ID, Title: it.Title, Price: it.Price, Quantity: it.Quantity}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không lưu được đơn: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Tạo link MoMo thành công!", "order_id": order.ID,
		"momo_order_id": orderID, "pay_url": out.PayURL,
	})
}

// MomoIPN — POST /api/momo/ipn (MoMo gọi ngược sau khi user trả tiền)
func MomoIPN(c *gin.Context) {
	var p struct {
		PartnerCode string `json:"partnerCode"`
		OrderID     string `json:"orderId"`
		RequestID   string `json:"requestId"`
		Amount      int64  `json:"amount"`
		OrderInfo   string `json:"orderInfo"`
		TransID     int64  `json:"transId"`
		ResultCode  int    `json:"resultCode"`
		Message     string `json:"message"`
		ExtraData   string `json:"extraData"`
		RequestType string `json:"requestType"`
		ResponseT   int64  `json:"responseTime"`
		Signature   string `json:"signature"`
	}
	if err := c.ShouldBindJSON(&p); err != nil || p.OrderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IPN không hợp lệ"})
		return
	}
	raw := fmt.Sprintf("accessKey=%s&amount=%d&extraData=%s&message=%s&orderId=%s&partnerCode=%s&requestId=%s&requestType=%s&responseTime=%d&resultCode=%d&transId=%d",
		momoAccessKey(), p.Amount, p.ExtraData, p.Message, p.OrderID, p.PartnerCode, p.RequestID, p.RequestType, p.ResponseT, p.ResultCode, p.TransID)
	if momoSign(raw, momoSecretKey()) != strings.ToLower(p.Signature) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sai chữ ký IPN"})
		return
	}
	if p.ResultCode == 0 {
		config.DB.Model(&models.Order{}).Where("payment_ref = ?", p.OrderID).Update("status", "confirmed")
	}
	c.JSON(http.StatusOK, gin.H{"message": "IPN received"})
}

// MomoResult — GET /api/momo/result?orderId=... (public, cho trang kết quả tra cứu)
func MomoResult(c *gin.Context) {
	oid := strings.TrimSpace(c.Query("orderId"))
	if oid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thiếu orderId"})
		return
	}
	var order models.Order
	if err := config.DB.Where("payment_ref = ?", oid).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"order_id": order.ID, "total": order.Total,
		"status": order.Status, "payment_method": order.PaymentMethod,
	})
}
