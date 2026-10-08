package payments

import (
	"os"
	"strings"
)

// PaypalConfig — cấu hình kết nối tới PayPal REST API (giống cách GetMomoConfig)
type PaypalConfig struct {
	ClientID string // public, dùng ở cả frontend (VITE_PAYPAL_CLIENT_ID)
	Secret   string // RIÊNG TƯ — chỉ nằm trên server (Render env PAYPAL_SECRET)
	Mode     string // sandbox | live
}

// GetPaypalConfig — đọc cấu hình từ biến môi trường
func GetPaypalConfig() PaypalConfig {
	return PaypalConfig{
		ClientID: strings.TrimSpace(os.Getenv("PAYPAL_CLIENT_ID")),
		Secret:   strings.TrimSpace(os.Getenv("PAYPAL_SECRET")),
		Mode:     strings.ToLower(strings.TrimSpace(os.Getenv("PAYPAL_MODE"))),
	}
}

// IsLive — true khi chạy tiền thật, mặc định sandbox để test an toàn
func (c PaypalConfig) IsLive() bool { return c.Mode == "live" }

// BaseURL — endpoint PayPal theo môi trường
func (c PaypalConfig) BaseURL() string {
	if c.IsLive() {
		return "https://api-m.paypal.com"
	}
	return "https://api-m.sandbox.paypal.com"
}

// ==================== CÁC STRUCT GIAO TIẾP VỚI PAYPAL ====================

// PaypalAmount — số tiền USD (PayPal không hỗ trợ VND nên quy đổi ở service)
type PaypalAmount struct {
	CurrencyCode string `json:"currency_code"`
	Value        string `json:"value"`
}

// PaypalCreateOrderResponse — kết quả tạo đơn từ PayPal API
type PaypalCreateOrderResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Links  []struct {
		Href   string `json:"href"`
		Rel    string `json:"rel"`
		Method string `json:"method"`
	} `json:"links"`
}

// ApproveURL — link paypal.com để user duyệt thanh toán (rel=approve)
func (r *PaypalCreateOrderResponse) ApproveURL() string {
	for _, l := range r.Links {
		if l.Rel == "approve" {
			return l.Href
		}
	}
	return ""
}

// PaypalCaptureInfo — thông tin khoản thu sau capture (để controller đối chiếu + lưu)
type PaypalCaptureInfo struct {
	OrderID   string
	CaptureID string
	Status    string // COMPLETED khi tiền về thành công
	Currency  string
	Value     float64
}

// PaypalOrderStatus — trạng thái đơn PayPal khi tra cứu (CREATED | APPROVED | COMPLETED...)
type PaypalOrderStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}
