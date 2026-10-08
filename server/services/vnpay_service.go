package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"boko/models"
	"boko/payments"
)

// CreateHmacSha512 — thuật toán băm chuỗi dữ liệu với secretKey bằng HMAC-SHA512
func CreateHmacSha512(data, secretKey string) string {
	h := hmac.New(sha512.New, []byte(secretKey))
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

// CreateVnPayPaymentUrl — tạo link thanh toán VNPAY Sandbox cho đơn hàng
func CreateVnPayPaymentUrl(order *models.Order, clientIP string, bankCode string, customReturnURL string) (string, string, error) {
	cfg := payments.GetVnPayConfig()

	// VNPAY yêu cầu số tiền tối thiểu là 5,000 VND
	amount := int64(order.Total)
	if amount < 5000 {
		return "", "", errors.New("Số tiền thanh toán VNPAY tối thiểu là 5,000 VND")
	}

	// Múi giờ chuẩn Việt Nam (GMT+7)
	loc := time.FixedZone("ICT", 7*3600)
	now := time.Now().In(loc)
	createDate := now.Format("20060102150405")

	txnRef := fmt.Sprintf("BOKO_%d_%d", order.ID, now.Unix())
	orderInfo := fmt.Sprintf("Thanh toan don hang Boko %d", order.ID)

	returnURL := cfg.ReturnURL
	if customReturnURL != "" {
		returnURL = customReturnURL
	}

	if clientIP == "" || clientIP == "::1" || clientIP == "localhost" {
		clientIP = "127.0.0.1"
	}

	// Tạo tham số VNPAY (vnp_Amount phải nhân 100 theo chuẩn VNPAY)
	vnpParams := url.Values{}
	vnpParams.Set("vnp_Version", "2.1.0")
	vnpParams.Set("vnp_Command", "pay")
	vnpParams.Set("vnp_TmnCode", cfg.TmnCode)
	vnpParams.Set("vnp_Amount", fmt.Sprintf("%d", amount*100))
	vnpParams.Set("vnp_CreateDate", createDate)
	vnpParams.Set("vnp_CurrCode", "VND")
	vnpParams.Set("vnp_IpAddr", clientIP)
	vnpParams.Set("vnp_Locale", "vn")
	vnpParams.Set("vnp_OrderInfo", orderInfo)
	vnpParams.Set("vnp_OrderType", "other")
	vnpParams.Set("vnp_ReturnUrl", returnURL)
	vnpParams.Set("vnp_TxnRef", txnRef)

	if bankCode != "" {
		vnpParams.Set("vnp_BankCode", bankCode)
	}

	// url.Values.Encode() tự động sắp xếp tham số theo bảng chữ cái A-Z và mã hóa chuẩn URL
	signData := vnpParams.Encode()
	secureHash := CreateHmacSha512(signData, cfg.HashSecret)
	paymentURL := fmt.Sprintf("%s?%s&vnp_SecureHash=%s", cfg.BaseURL, signData, secureHash)

	return paymentURL, txnRef, nil
}

// VerifyVnPaySignature — kiểm tra chữ ký số HMAC-SHA512 của dữ liệu VNPAY gửi về
func VerifyVnPaySignature(queryParams url.Values) bool {
	cfg := payments.GetVnPayConfig()
	receivedHash := queryParams.Get("vnp_SecureHash")
	if receivedHash == "" {
		return false
	}

	filteredParams := url.Values{}
	for k, vs := range queryParams {
		if k == "vnp_SecureHash" || k == "vnp_SecureHashType" {
			continue
		}
		if len(vs) > 0 && vs[0] != "" {
			filteredParams.Set(k, vs[0])
		}
	}

	signData := filteredParams.Encode()
	expectedHash := CreateHmacSha512(signData, cfg.HashSecret)
	return strings.EqualFold(expectedHash, receivedHash)
}

// QueryVnPayTransaction — gọi API Merchant WebAPI để đối soát giao dịch
func QueryVnPayTransaction(txnRef, transDate, clientIP string) (*payments.VnPayQueryResponse, error) {
	cfg := payments.GetVnPayConfig()
	loc := time.FixedZone("ICT", 7*3600)
	now := time.Now().In(loc)
	createDate := now.Format("20060102150405")
	requestID := fmt.Sprintf("REQ_%d", now.UnixNano())
	orderInfo := fmt.Sprintf("Truy van giao dich don hang %s", txnRef)

	if clientIP == "" || clientIP == "::1" || clientIP == "localhost" {
		clientIP = "127.0.0.1"
	}

	rawHashData := fmt.Sprintf(
		"%s|%s|%s|%s|%s|%s|%s|%s|%s",
		requestID, "2.1.0", "querydr", cfg.TmnCode, txnRef, transDate, createDate, clientIP, orderInfo,
	)
	secureHash := CreateHmacSha512(rawHashData, cfg.HashSecret)

	payload := payments.VnPayQueryRequest{
		RequestID:       requestID,
		Version:         "2.1.0",
		Command:         "querydr",
		TmnCode:         cfg.TmnCode,
		TxnRef:          txnRef,
		OrderInfo:       orderInfo,
		TransactionDate: transDate,
		CreateDate:      createDate,
		IpAddr:          clientIP,
		SecureHash:      secureHash,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(cfg.APIURL, "application/json; charset=UTF-8", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var queryResp payments.VnPayQueryResponse
	if err := json.Unmarshal(bodyBytes, &queryResp); err != nil {
		return nil, err
	}

	return &queryResp, nil
}
