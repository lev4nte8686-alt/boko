package controllers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"boko/payments"
	"boko/services"
)

func setupTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.POST("/api/payment/momo/ipn", MomoIPN)
	return r
}

// TestMomoIPN_InvalidSignature — Đảm bảo chữ ký giả mạo bị từ chối với 400 Bad Request
func TestMomoIPN_InvalidSignature(t *testing.T) {
	r := setupTestRouter()

	fakePayload := payments.MomoIpnRequest{
		PartnerCode:  "MOMOBKUN20180529",
		OrderID:      "BOKO_TEST_1",
		RequestID:    "REQ_TEST_1",
		Amount:       50000,
		ResultCode:   0,
		Message:      "Thành công.",
		Signature:    "fake_invalid_signature_hex_12345",
		ResponseTime: time.Now().UnixMilli(),
	}

	body, _ := json.Marshal(fakePayload)
	req, _ := http.NewRequest("POST", "/api/payment/momo/ipn", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Mong đợi mã lỗi 400 Bad Request cho chữ ký giả mạo, nhưng nhận được: %d", w.Code)
	}

	t.Logf("✅ Đã chặn thành công request có chữ ký giả mạo (HTTP %d)", w.Code)
}

// TestMomoIPN_SignatureGenerationVerification — Đảm bảo chuỗi ký chuẩn của IPN được tạo và xác thực thành công
func TestMomoIPN_SignatureGenerationVerification(t *testing.T) {
	cfg := payments.GetMomoConfig()

	reqData := payments.MomoIpnRequest{
		PartnerCode:  cfg.PartnerCode,
		OrderID:      "BOKO_9999_TEST",
		RequestID:    "REQ_9999_TEST",
		Amount:       100000,
		OrderInfo:    "Thanh toan test Boko",
		OrderType:    "momo_wallet",
		TransID:      1234567890,
		ResultCode:   0,
		Message:      "Thành công.",
		PayType:      "qr",
		ResponseTime: 1710000000000,
		ExtraData:    "",
	}

	rawSignature := "accessKey=" + cfg.AccessKey +
		"&amount=100000" +
		"&extraData=" +
		"&message=" + reqData.Message +
		"&orderId=" + reqData.OrderID +
		"&orderInfo=" + reqData.OrderInfo +
		"&orderType=" + reqData.OrderType +
		"&partnerCode=" + cfg.PartnerCode +
		"&payType=" + reqData.PayType +
		"&requestId=" + reqData.RequestID +
		"&responseTime=1710000000000" +
		"&resultCode=0" +
		"&transId=1234567890"

	reqData.Signature = services.CreateHmacSha256(rawSignature, cfg.SecretKey)

	if !services.VerifyMomoIpnSignature(&reqData) {
		t.Fatalf("Lỗi: VerifyMomoIpnSignature phải trả về true cho chữ ký hợp lệ")
	}

	t.Logf("✅ Chữ ký IPN hợp lệ đã được xác thực thành công!")
}
