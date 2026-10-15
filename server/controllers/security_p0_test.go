package controllers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// security_p0_test.go — Chứng minh các vá bảo mật P0 (fail-closed) ở tầng handler.
// Các test này KHÔNG cần DB vì mọi guard đều chạy TRƯỚC khi truy vấn dữ liệu.
// ============================================================================

func newTestRouter(routes func(*gin.Engine)) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	routes(r)
	return r
}

// P0-1: simulator-ipn (lỗ hổng đã khai thác live) phải bị chặn khi tắt mock.
func TestP0_SimulatorIpn_BlockedWhenMockDisabled(t *testing.T) {
	t.Setenv("ALLOW_MOCK_PAYMENT", "false")

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/payment/momo/simulator-ipn", MomoSimulatorIPN) })
	req, _ := http.NewRequest("POST", "/api/payment/momo/simulator-ipn", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("Mong đợi 403 khi tắt mock, nhận được %d", w.Code)
	}
}

// P0-3: luồng OTP ATM sandbox (OTP cố định 123456) phải tắt ở môi trường thật.
func TestP0_AtmOtp_BlockedWhenMockDisabled(t *testing.T) {
	t.Setenv("ALLOW_MOCK_PAYMENT", "false")

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/payment/atm/verify-otp", VerifyAtmOtpPayment) })
	payload := map[string]interface{}{
		"shipping_address": "123 Test",
		"phone":            "0900000000",
		"otp":              "123456",
		"items":            []map[string]interface{}{{"book_id": 1, "quantity": 1}},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/payment/atm/verify-otp", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("Mong đợi 503 khi tắt mock ở luồng ATM, nhận được %d", w.Code)
	}
}

// P0: webhook GHN phải fail-closed khi chưa cấu hình secret (chống giả mạo sự kiện).
func TestP0_GhnWebhook_RequiresSecret(t *testing.T) {
	t.Setenv("GHN_WEBHOOK_SECRET", "")

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/ghn/webhook", GHNWebhook) })
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ghn/webhook", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("Mong đợi 503 khi thiếu secret webhook, nhận được %d", w.Code)
	}
}

// P0: webhook GHN với secret sai phải bị 401.
func TestP0_GhnWebhook_WrongSecret(t *testing.T) {
	t.Setenv("GHN_WEBHOOK_SECRET", "super-secret")

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/ghn/webhook", GHNWebhook) })
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ghn/webhook", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GHN-Webhook-Secret", "sai-secret")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Mong đợi 401 khi secret sai, nhận được %d", w.Code)
	}
}

// GHN webhook: chấp nhận secret đặt trong ĐƯỜNG DẪN (GHN không gửi được
// header/query tuỳ biến). Secret sai ở đường dẫn vẫn phải 401 (fail-closed).
func TestP0_GhnWebhook_PathSecretValidated(t *testing.T) {
	t.Setenv("GHN_WEBHOOK_SECRET", "super-secret")

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/ghn/webhook/:secret", GHNWebhook) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ghn/webhook/sai-secret", bytes.NewBufferString("{}"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("secret sai trong đường dẫn phải 401, nhận %d", w.Code)
	}

	// Secret đúng: guard qua -> handler chạm DB (nil trong test) nên ta chỉ cần
	// chắc chắn KHÔNG còn là 401 nữa (bị chặn ở tầng secret).
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/ghn/webhook/super-secret", bytes.NewBufferString("{}"))
	req2.Header.Set("Content-Type", "application/json")
	func() {
		defer func() { _ = recover() }() // DB nil có thể panic; bỏ qua
		r.ServeHTTP(w2, req2)
	}()
	if w2.Code == http.StatusUnauthorized {
		t.Fatalf("secret đúng trong đường dẫn không được trả 401")
	}
}

// P0-2: tạo phiên VNPAY phải fail-closed khi thiếu credential thật (mock tắt).
func TestP0_CreateVnPay_BlockedWithoutCredentials(t *testing.T) {
	t.Setenv("ALLOW_MOCK_PAYMENT", "false")
	t.Setenv("VNPAY_TMN_CODE", "")
	t.Setenv("VNPAY_HASH_SECRET", "")

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/payment/vnpay/create", CreateVnPayPayment) })
	body, _ := json.Marshal(map[string]interface{}{"amount": 50000})
	req, _ := http.NewRequest("POST", "/api/payment/vnpay/create", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("Mong đợi 503 khi thiếu credential VNPAY, nhận được %d", w.Code)
	}
}

// P0-2: IPN VNPAY phải fail-closed khi thiếu credential (không verify bằng secret rỗng).
func TestP0_VnPayIpn_BlockedWithoutCredentials(t *testing.T) {
	t.Setenv("ALLOW_MOCK_PAYMENT", "false")
	t.Setenv("VNPAY_TMN_CODE", "")
	t.Setenv("VNPAY_HASH_SECRET", "")

	r := newTestRouter(func(r *gin.Engine) { r.GET("/api/payment/vnpay/ipn", VnPayIPN) })
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/payment/vnpay/ipn?vnp_TxnRef=BOKO_1_1", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Mong đợi 200 (kèm RspCode lỗi) khi thiếu credential, nhận được %d", w.Code)
	}
	if got := w.Body.String(); !bytes.Contains([]byte(got), []byte("99")) {
		t.Fatalf("Mong đợi RspCode=99 (not configured), nhận được: %s", got)
	}
}
