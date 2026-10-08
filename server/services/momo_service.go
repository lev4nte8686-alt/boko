package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"boko/models"
	"boko/payments"
)

// CreateHmacSha256 — thuật toán băm chuỗi dữ liệu với secretKey bằng HMAC-SHA256
func CreateHmacSha256(rawString, secretKey string) string {
	h := hmac.New(sha256.New, []byte(secretKey))
	h.Write([]byte(rawString))
	return hex.EncodeToString(h.Sum(nil))
}

// CreateMomoPaymentUrl — tạo link thanh toán MoMo cho một đơn hàng
func CreateMomoPaymentUrl(order *models.Order, customRedirectURL string) (*payments.MomoCreatePaymentResponse, error) {
	cfg := payments.GetMomoConfig()

	// Đảm bảo số tiền hợp lệ (MoMo yêu cầu VND là số nguyên >= 1000)
	amount := int64(order.Total)
	if amount < 1000 {
		return nil, errors.New("Số tiền thanh toán MoMo tối thiểu là 1,000 VND")
	}

	timestamp := time.Now().UnixMilli()
	orderID := fmt.Sprintf("BOKO_%d_%d", order.ID, timestamp)
	requestID := fmt.Sprintf("REQ_%d_%d", order.ID, timestamp)
	orderInfo := fmt.Sprintf("Thanh toan don hang Boko #%d", order.ID)
	extraData := ""
	requestType := "captureWallet"

	redirectURL := cfg.RedirectURL
	if customRedirectURL != "" {
		redirectURL = customRedirectURL
	}

	// Chuỗi ký bắt buộc đúng định dạng bảng chữ cái của MoMo
	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s&requestType=%s",
		cfg.AccessKey, amount, extraData, cfg.IpnURL, orderID, orderInfo, cfg.PartnerCode, redirectURL, requestID, requestType,
	)

	signature := CreateHmacSha256(rawSignature, cfg.SecretKey)

	reqPayload := payments.MomoCreatePaymentRequest{
		PartnerCode: cfg.PartnerCode,
		PartnerName: "Boko Book Store",
		StoreID:     "BokoStore",
		RequestID:   requestID,
		Amount:      amount,
		OrderID:     orderID,
		OrderInfo:   orderInfo,
		RedirectURL: redirectURL,
		IpnURL:      cfg.IpnURL,
		Lang:        "vi",
		ExtraData:   extraData,
		RequestType: requestType,
		Signature:   signature,
	}

	jsonBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("lỗi đóng gói JSON MoMo: %w", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(cfg.Endpoint, "application/json; charset=UTF-8", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối tới MoMo Sandbox Gateway: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc phản hồi từ MoMo: %w", err)
	}

	var momoResp payments.MomoCreatePaymentResponse
	if err := json.Unmarshal(bodyBytes, &momoResp); err != nil {
		return nil, fmt.Errorf("lỗi giải mã phản hồi JSON từ MoMo: %w", err)
	}

	if momoResp.ResultCode != 0 {
		return nil, fmt.Errorf("MoMo từ chối giao dịch: [%d] %s", momoResp.ResultCode, momoResp.Message)
	}

	return &momoResp, nil
}

// VerifyMomoIpnSignature — kiểm tra chữ ký số của Webhook IPN do MoMo gửi về
func VerifyMomoIpnSignature(req *payments.MomoIpnRequest) bool {
	cfg := payments.GetMomoConfig()

	// Định dạng chuỗi ký cho IPN Webhook theo chuẩn MoMo
	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%d&resultCode=%d&transId=%d",
		cfg.AccessKey, req.Amount, req.ExtraData, req.Message, req.OrderID, req.OrderInfo, req.OrderType,
		cfg.PartnerCode, req.PayType, req.RequestID, req.ResponseTime, req.ResultCode, req.TransID,
	)

	expectedSignature := CreateHmacSha256(rawSignature, cfg.SecretKey)
	return hmac.Equal([]byte(expectedSignature), []byte(req.Signature))
}

// QueryMomoTransaction — kiểm tra trạng thái giao dịch từ MoMo API Query
func QueryMomoTransaction(orderID, requestID string) (*payments.MomoQueryResponse, error) {
	cfg := payments.GetMomoConfig()

	rawSignature := fmt.Sprintf(
		"accessKey=%s&orderId=%s&partnerCode=%s&requestId=%s",
		cfg.AccessKey, orderID, cfg.PartnerCode, requestID,
	)
	signature := CreateHmacSha256(rawSignature, cfg.SecretKey)

	reqPayload := payments.MomoQueryRequest{
		PartnerCode: cfg.PartnerCode,
		RequestID:   requestID,
		OrderID:     orderID,
		Lang:        "vi",
		Signature:   signature,
	}

	jsonBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(cfg.QueryURL, "application/json; charset=UTF-8", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var queryResp payments.MomoQueryResponse
	if err := json.Unmarshal(bodyBytes, &queryResp); err != nil {
		return nil, err
	}

	return &queryResp, nil
}
