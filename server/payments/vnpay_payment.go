package payments

// VnPayConfig — cấu hình kết nối tới VNPAY Sandbox
type VnPayConfig struct {
	TmnCode    string
	HashSecret string
	BaseURL    string
	APIURL     string
	ReturnURL  string
	IpnURL     string
}

// GetVnPayConfig — đọc cấu hình từ biến môi trường, có fallback về Sandbox Test Credentials chuẩn
func GetVnPayConfig() VnPayConfig {
	return VnPayConfig{
		TmnCode:    getEnv("VNPAY_TMN_CODE", "VWWK6YKC"),
		HashSecret: getEnv("VNPAY_HASH_SECRET", "GWGVHNWAWGMSFFWQSUIJNYZPKZPGKXQD"),
		BaseURL:    getEnv("VNPAY_BASE_URL", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),
		APIURL:     getEnv("VNPAY_API_URL", "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction"),
		ReturnURL:  getEnv("VNPAY_RETURN_URL", "http://localhost:3000/payment/vnpay-callback"),
		IpnURL:     getEnv("VNPAY_IPN_URL", "http://localhost:8080/api/payment/vnpay/ipn"),
	}
}

// VnPayIpnResponse — phản hồi bắt buộc cho máy chủ VNPAY khi nhận Webhook IPN
type VnPayIpnResponse struct {
	RspCode string `json:"RspCode"`
	Message string `json:"Message"`
}

// VnPayQueryRequest — payload tra cứu trạng thái giao dịch (querydr)
type VnPayQueryRequest struct {
	RequestID       string `json:"vnp_RequestId"`
	Version         string `json:"vnp_Version"`
	Command         string `json:"vnp_Command"`
	TmnCode         string `json:"vnp_TmnCode"`
	TxnRef          string `json:"vnp_TxnRef"`
	OrderInfo       string `json:"vnp_OrderInfo"`
	TransactionDate string `json:"vnp_TransactionDate"`
	CreateDate      string `json:"vnp_CreateDate"`
	IpAddr          string `json:"vnp_IpAddr"`
	SecureHash      string `json:"vnp_SecureHash"`
}

// VnPayQueryResponse — kết quả tra cứu từ VNPAY API
type VnPayQueryResponse struct {
	ResponseCode      string `json:"vnp_ResponseCode"`
	TransactionStatus string `json:"vnp_TransactionStatus"`
	TxnRef            string `json:"vnp_TxnRef"`
	Amount            string `json:"vnp_Amount"`
	OrderInfo         string `json:"vnp_OrderInfo"`
	BankCode          string `json:"vnp_BankCode"`
	TransactionNo     string `json:"vnp_TransactionNo"`
	PayDate           string `json:"vnp_PayDate"`
	Message           string `json:"vnp_Message"`
	SecureHash        string `json:"vnp_SecureHash"`
}
