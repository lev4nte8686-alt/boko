package payments

import (
	"os"
	"strings"
)

// MomoConfig — cấu hình kết nối tới MoMo Sandbox
type MomoConfig struct {
	PartnerCode string
	AccessKey   string
	SecretKey   string
	Endpoint    string
	QueryURL    string
	RedirectURL string
	IpnURL      string
}

// SandboxCredentialsAllowed — chỉ cho phép dùng credential Sandbox công khai khi
// bật ALLOW_MOCK_PAYMENT=true (môi trường local/test). Production bắt buộc set
// biến môi trường thật (fail-closed) để không dùng secret đã công khai trên GitHub.
func SandboxCredentialsAllowed() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("ALLOW_MOCK_PAYMENT")), "true")
}

// secretEnv — đọc secret từ env; nếu thiếu thì chỉ fallback về giá trị Sandbox
// công khai khi được phép chạy mock, ngược lại trả chuỗi rỗng (fail-closed).
func secretEnv(key, sandboxFallback string) string {
	if val, ok := os.LookupEnv(key); ok && strings.TrimSpace(val) != "" {
		return strings.TrimSpace(val)
	}
	if SandboxCredentialsAllowed() {
		return sandboxFallback
	}
	return ""
}

// GetMomoConfig — đọc cấu hình từ biến môi trường. Partner/Access/Secret Key
// KHÔNG còn fallback công khai ngoài môi trường mock (xem secretEnv).
func GetMomoConfig() MomoConfig {
	return MomoConfig{
		PartnerCode: secretEnv("MOMO_PARTNER_CODE", "MOMOBKUN20180529"),
		AccessKey:   secretEnv("MOMO_ACCESS_KEY", "klm05TvNBzhg7h7j"),
		SecretKey:   secretEnv("MOMO_SECRET_KEY", "at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa"),
		Endpoint:    getEnv("MOMO_ENDPOINT", "https://test-payment.momo.vn/v2/gateway/api/create"),
		QueryURL:    getEnv("MOMO_QUERY_URL", "https://test-payment.momo.vn/v2/gateway/api/query"),
		RedirectURL: getEnv("MOMO_REDIRECT_URL", "http://localhost:3000/payment/momo-callback"),
		IpnURL:      getEnv("MOMO_IPN_URL", "http://localhost:8080/api/payment/momo/ipn"),
	}
}

// IsConfigured — true khi đã có đủ credential để gọi MoMo (env thật hoặc sandbox mock).
func (c MomoConfig) IsConfigured() bool {
	return c.PartnerCode != "" && c.AccessKey != "" && c.SecretKey != ""
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}

// ==================== CÁC STRUCT GIAO TIẾP VỚI MOMO ====================

// MomoCreatePaymentRequest — payload gửi sang MoMo API Create
type MomoCreatePaymentRequest struct {
	PartnerCode string `json:"partnerCode"`
	PartnerName string `json:"partnerName"`
	StoreID     string `json:"storeId"`
	RequestID   string `json:"requestId"`
	Amount      int64  `json:"amount"`
	OrderID     string `json:"orderId"`
	OrderInfo   string `json:"orderInfo"`
	RedirectURL string `json:"redirectUrl"`
	IpnURL      string `json:"ipnUrl"`
	Lang        string `json:"lang"`
	ExtraData   string `json:"extraData"`
	RequestType string `json:"requestType"`
	Signature   string `json:"signature"`
}

// MomoCreatePaymentResponse — kết quả trả về từ MoMo API Create
type MomoCreatePaymentResponse struct {
	PartnerCode  string `json:"partnerCode"`
	OrderID      string `json:"orderId"`
	RequestID    string `json:"requestId"`
	Amount       int64  `json:"amount"`
	ResponseTime int64  `json:"responseTime"`
	Message      string `json:"message"`
	ResultCode   int    `json:"resultCode"`
	PayURL       string `json:"payUrl"`
	Deeplink     string `json:"deeplink"`
	QrCodeURL    string `json:"qrCodeUrl"`
	Applink      string `json:"applink"`
	Signature    string `json:"signature"`
}

// MomoIpnRequest — payload webhook mà máy chủ MoMo gửi về ipnUrl
type MomoIpnRequest struct {
	PartnerCode  string `json:"partnerCode"`
	OrderID      string `json:"orderId"`
	RequestID    string `json:"requestId"`
	Amount       int64  `json:"amount"`
	OrderInfo    string `json:"orderInfo"`
	OrderType    string `json:"orderType"`
	TransID      int64  `json:"transId"`
	ResultCode   int    `json:"resultCode"`
	Message      string `json:"message"`
	PayType      string `json:"payType"`
	ResponseTime int64  `json:"responseTime"`
	ExtraData    string `json:"extraData"`
	Signature    string `json:"signature"`
}

// MomoQueryRequest — payload tra cứu trạng thái giao dịch
type MomoQueryRequest struct {
	PartnerCode string `json:"partnerCode"`
	RequestID   string `json:"requestId"`
	OrderID     string `json:"orderId"`
	Lang        string `json:"lang"`
	Signature   string `json:"signature"`
}

// MomoQueryResponse — kết quả tra cứu từ MoMo API Query
type MomoQueryResponse struct {
	PartnerCode  string `json:"partnerCode"`
	OrderID      string `json:"orderId"`
	RequestID    string `json:"requestId"`
	Amount       int64  `json:"amount"`
	TransID      int64  `json:"transId"`
	PayType      string `json:"payType"`
	ResultCode   int    `json:"resultCode"`
	Message      string `json:"message"`
	ResponseTime int64  `json:"responseTime"`
	ExtraData    string `json:"extraData"`
}
