package services

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
	"strings"
	"time"

	"boko/payments"
)

// VNDPerUSD — tỷ giá quy đổi khi thu PayPal (PayPal không hỗ trợ VND)
const VNDPerUSD = 25000.0

// ConvertVNDToUSD — quy đổi tổng VND sang USD làm tròn 2 chữ số thập phân
func ConvertVNDToUSD(totalVND float64) float64 {
	return math.Round(totalVND/VNDPerUSD*100) / 100
}

// paypalClient — HTTP client dùng chung cho PayPal API
func paypalClient() *http.Client {
	return &http.Client{Timeout: 15 * time.Second}
}

// GetPaypalAccessToken — lấy Bearer token server-to-server (client_credentials)
func GetPaypalAccessToken() (string, error) {
	cfg := payments.GetPaypalConfig()
	if cfg.ClientID == "" || cfg.Secret == "" {
		return "", errors.New("chưa cấu hình PAYPAL_CLIENT_ID / PAYPAL_SECRET")
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	req, _ := http.NewRequest("POST", cfg.BaseURL()+"/v1/oauth2/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(cfg.ClientID+":"+cfg.Secret)))

	resp, err := paypalClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("không thể kết nối tới PayPal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("PayPal từ chối cấp token: %s", string(body))
	}

	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.AccessToken == "" {
		return "", errors.New("không đọc được PayPal access token")
	}
	return out.AccessToken, nil
}

// CreatePaypalOrder — tạo đơn PayPal (intent CAPTURE) với số tiền USD đã quy đổi
func CreatePaypalOrder(totalVND float64) (*payments.PaypalCreateOrderResponse, error) {
	if totalVND <= 0 {
		return nil, errors.New("tổng tiền không hợp lệ")
	}
	amount := fmt.Sprintf("%.2f", ConvertVNDToUSD(totalVND))

	token, err := GetPaypalAccessToken()
	if err != nil {
		return nil, err
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"intent": "CAPTURE",
		"purchase_units": []map[string]interface{}{
			{
				"description": "Boko Bookstore order",
				"amount":      map[string]string{"currency_code": "USD", "value": amount},
			},
		},
	})
	cfg := payments.GetPaypalConfig()
	req, _ := http.NewRequest("POST", cfg.BaseURL()+"/v2/checkout/orders", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := paypalClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối tới PayPal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("PayPal từ chối tạo đơn: %s", string(body))
	}

	var out payments.PaypalCreateOrderResponse
	if err := json.Unmarshal(body, &out); err != nil || out.ID == "" {
		return nil, errors.New("không đọc được đơn PayPal")
	}
	return &out, nil
}

// VerifyPaypalCapture — kiểm tra khoản thu có hợp lệ không (thuần logic, dễ unit test):
// đúng tiền tệ USD, trạng thái COMPLETED và số tiền khớp tổng đơn (sai số < $0.05)
func VerifyPaypalCapture(currency, status string, value, expectedUSD float64) bool {
	if status != "COMPLETED" || currency != "USD" {
		return false
	}
	return math.Abs(value-expectedUSD) <= 0.05
}

// CapturePaypalOrder — capture đơn đã được user approve, trả về thông tin khoản thu
func CapturePaypalOrder(paypalOrderID string, totalVND float64) (*payments.PaypalCaptureInfo, error) {
	if paypalOrderID == "" {
		return nil, errors.New("thiếu mã đơn PayPal")
	}
	token, err := GetPaypalAccessToken()
	if err != nil {
		return nil, err
	}

	cfg := payments.GetPaypalConfig()
	req, _ := http.NewRequest("POST", cfg.BaseURL()+"/v2/checkout/orders/"+paypalOrderID+"/capture", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := paypalClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối tới PayPal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("PayPal từ chối capture: %s", string(body))
	}

	var out struct {
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
		return nil, errors.New("PayPal chưa ghi nhận khoản thu (chưa có capture)")
	}
	cap := out.PurchaseUnits[0].Payments.Captures[0]
	var value float64
	fmt.Sscanf(cap.Amount.Value, "%f", &value)

	info := &payments.PaypalCaptureInfo{
		OrderID: paypalOrderID, CaptureID: cap.ID,
		Status: cap.Status, Currency: cap.Amount.CurrencyCode, Value: value,
	}
	if !VerifyPaypalCapture(info.Currency, info.Status, info.Value, ConvertVNDToUSD(totalVND)) {
		return nil, errors.New("số tiền PayPal không khớp đơn hàng")
	}
	return info, nil
}

// QueryPaypalOrder — tra cứu trạng thái đơn PayPal (đồng bộ khi IPN/capture về chậm)
func QueryPaypalOrder(paypalOrderID string) (*payments.PaypalOrderStatus, error) {
	if paypalOrderID == "" {
		return nil, errors.New("thiếu mã đơn PayPal")
	}
	token, err := GetPaypalAccessToken()
	if err != nil {
		return nil, err
	}

	cfg := payments.GetPaypalConfig()
	req, _ := http.NewRequest("GET", cfg.BaseURL()+"/v2/checkout/orders/"+paypalOrderID, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := paypalClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối tới PayPal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("PayPal từ chối tra cứu: %s", string(body))
	}

	var out payments.PaypalOrderStatus
	if err := json.Unmarshal(body, &out); err != nil || out.ID == "" {
		return nil, errors.New("không đọc được trạng thái đơn PayPal")
	}
	return &out, nil
}
