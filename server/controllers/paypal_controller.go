package controllers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// VND_PER_USD — tỷ giá quy đổi khi thu PayPal (PayPal không hỗ trợ VND nên
// frontend charge USD = totalVND / tỷ giá này). Giữ cùng hằng số 2 phía.
const vndPerUSD = 25000.0

func paypalBaseURL() string {
	if strings.ToLower(os.Getenv("PAYPAL_MODE")) == "live" {
		return "https://api-m.paypal.com"
	}
	return "https://api-m.sandbox.paypal.com"
}

func paypalCredentials() (id, secret string, err error) {
	id = strings.TrimSpace(os.Getenv("PAYPAL_CLIENT_ID"))
	secret = strings.TrimSpace(os.Getenv("PAYPAL_SECRET"))
	if id == "" || secret == "" {
		return "", "", errors.New("chưa cấu hình PAYPAL_CLIENT_ID / PAYPAL_SECRET")
	}
	return id, secret, nil
}

// paypalAccessToken — lấy Bearer token server-to-server (client_credentials)
func paypalAccessToken() (string, error) {
	id, secret, err := paypalCredentials()
	if err != nil {
		return "", err
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	req, _ := http.NewRequest("POST", paypalBaseURL()+"/v1/oauth2/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(id+":"+secret)))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("paypal auth failed: %s", string(body))
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.AccessToken == "" {
		return "", errors.New("không đọc được paypal access token")
	}
	return out.AccessToken, nil
}

type paypalCaptureResult struct {
	Status   string
	Currency string
	Value    float64
	Capture  string
}

// paypalCapture — capture order đã được user approve, trả về trạng thái + số tiền thực thu
func paypalCapture(orderID, accessToken string) (*paypalCaptureResult, error) {
	req, _ := http.NewRequest("POST", paypalBaseURL()+"/v2/checkout/orders/"+orderID+"/capture", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("paypal capture failed: %s", string(body))
	}
	var out struct {
		Status string `json:"status"`
		PurchaseUnits []struct {
			Payments struct {
				Captures []struct {
					ID     string `json:"id"`
					Status string `json:"status"`
					Amount struct {
						CurrencyCode string `json:"currency_code"`
						Value        string `json:"value"`
					} `json:"amount"`
				} `json:"captures"`
			} `json:"payments"`
		} `json:"purchase_units"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, errors.New("không đọc được kết quả capture")
	}
	if len(out.PurchaseUnits) == 0 || len(out.PurchaseUnits[0].Payments.Captures) == 0 {
		return nil, errors.New("paypal chưa ghi nhận khoản thu (chưa có capture)")
	}
	cap := out.PurchaseUnits[0].Payments.Captures[0]
	var value float64
	fmt.Sscanf(cap.Amount.Value, "%f", &value)
	return &paypalCaptureResult{Status: cap.Status, Currency: cap.Amount.CurrencyCode, Value: value, Capture: cap.ID}, nil
}

// PaypalCapture — POST /api/paypal/capture
// Frontend gửi paypal_order_id (đã approve) + thông tin đơn. Backend capture,
// đối chiếu số tiền USD ~ totalVND/25000 rồi mới lưu đơn (status=confirmed = đã thanh toán).
func PaypalCapture(c *gin.Context) {
	var input struct {
		PaypalOrderID   string `json:"paypal_order_id" binding:"required"`
		ShippingAddress string `json:"shipping_address" binding:"required"`
		Phone           string `json:"phone" binding:"required"`
		Items           []struct {
			Title    string  `json:"title" binding:"required"`
			Price    float64 `json:"price" binding:"required"` // VND
			Quantity int     `json:"quantity" binding:"required"`
		} `json:"items" binding:"required,dive"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// Tổng VND phía server (không tin total từ client)
	var totalVND float64
	for _, it := range input.Items {
		totalVND += it.Price * float64(it.Quantity)
	}
	expectedUSD := math.Round(totalVND/vndPerUSD*100) / 100

	token, err := paypalAccessToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	cap, err := paypalCapture(input.PaypalOrderID, token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if cap.Status != "COMPLETED" || cap.Currency != "USD" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thanh toán PayPal chưa hoàn tất"})
		return
	}
	if math.Abs(cap.Value-expectedUSD) > 0.05 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số tiền PayPal không khớp đơn hàng"})
		return
	}

	// Lưu đơn đã thanh toán
	var orderID uint
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		order := models.Order{
			UserID:          optionalUserID(c),
			Total:           totalVND,
			Status:          "confirmed", // đã thu tiền
			ShippingAddress: models.EncryptedString(input.ShippingAddress),
			Phone:           models.EncryptedString(input.Phone),
			PaymentMethod:   "paypal",
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		for _, it := range input.Items {
			if err := tx.Create(&models.OrderItem{OrderID: order.ID, Title: it.Title, Price: it.Price, Quantity: it.Quantity}).Error; err != nil {
				return err
			}
		}
		orderID = order.ID
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Tiền đã thu nhưng lưu đơn thất bại, liên hệ shop: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Thanh toán PayPal thành công!",
		"order_id": orderID, "total": totalVND, "status": "confirmed",
		"paypal_capture_id": cap.Capture,
	})
}
