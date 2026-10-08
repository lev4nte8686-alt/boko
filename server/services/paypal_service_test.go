package services

import (
	"testing"

	"boko/payments"
)

// TestConvertVNDToUSD — Đảm bảo quy đổi VND sang USD làm tròn đúng 2 chữ số thập phân
func TestConvertVNDToUSD(t *testing.T) {
	cases := []struct {
		vnd  float64
		want float64
	}{
		{25000, 1.00},
		{297000, 11.88},
		{1000, 0.04},
		{0, 0},
	}
	for _, c := range cases {
		if got := ConvertVNDToUSD(c.vnd); got != c.want {
			t.Fatalf("ConvertVNDToUSD(%v) = %v, mong đợi %v", c.vnd, got, c.want)
		}
	}
	t.Logf("✅ Quy đổi VND sang USD chính xác")
}

// TestVerifyPaypalCapture — Đảm bảo chỉ chấp nhận khoản thu COMPLETED + USD + khớp số tiền
func TestVerifyPaypalCapture(t *testing.T) {
	if !VerifyPaypalCapture("USD", "COMPLETED", 11.88, 11.88) {
		t.Fatalf("Mong đợi chấp nhận capture hợp lệ")
	}
	for _, tc := range []struct {
		name     string
		currency string
		status   string
		value    float64
		expected float64
	}{
		{"sai trạng thái", "USD", "PENDING", 11.88, 11.88},
		{"sai tiền tệ", "VND", "COMPLETED", 11.88, 11.88},
		{"lệch số tiền", "USD", "COMPLETED", 10.00, 11.88},
	} {
		if VerifyPaypalCapture(tc.currency, tc.status, tc.value, tc.expected) {
			t.Fatalf("Mong đợi từ chối capture: %s", tc.name)
		}
	}
	t.Logf("✅ Đã chặn các khoản thu PayPal không hợp lệ")
}

// TestGetPaypalConfig — Đảm bảo mặc định sandbox an toàn khi chưa set env
func TestGetPaypalConfig(t *testing.T) {
	cfg := payments.GetPaypalConfig()
	if cfg.IsLive() {
		t.Fatalf("Mặc định phải là sandbox, không được live khi chưa cấu hình")
	}
	if cfg.BaseURL() == "" {
		t.Fatalf("BaseURL không được rỗng")
	}
	t.Logf("✅ Cấu hình PayPal mặc định sandbox an toàn")
}
