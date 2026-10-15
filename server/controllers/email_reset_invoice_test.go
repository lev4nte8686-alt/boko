package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// ============================================================================
// Test cho luồng đặt lại mật khẩu + hoá đơn + phân quyền tra cứu đơn.
// Dùng SQLite in-memory để chạy được offline, không cần Postgres.
// ============================================================================

func setupControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:ctrltest_%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("mở sqlite test: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("lấy sql.DB: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if err := db.AutoMigrate(
		&models.User{},
		&models.PasswordResetToken{},
		&models.EmailLog{},
		&models.Book{},
		&models.Order{},
		&models.OrderItem{},
		&models.Coupon{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	prev := config.DB
	config.DB = db
	t.Cleanup(func() {
		config.DB = prev
		_ = sqlDB.Close()
	})
	return db
}

func setupAuthRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/auth/forgot-password", ForgotPassword)
	r.POST("/api/auth/reset-password", ResetPassword)
	return r
}

func postJSON(t *testing.T, r *gin.Engine, path string, payload interface{}) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", path, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// TestHashResetTokenStableAndDistinct — hash phải tất định và phân biệt token.
func TestHashResetTokenStableAndDistinct(t *testing.T) {
	a := hashResetToken("token-a")
	if a != hashResetToken("token-a") {
		t.Fatal("hashResetToken phải tất định với cùng input")
	}
	if a == hashResetToken("token-b") {
		t.Fatal("hashResetToken phải khác nhau với token khác")
	}
	if len(a) != 64 {
		t.Fatalf("SHA-256 hex phải dài 64 ký tự, nhận %d", len(a))
	}
}

// TestForgotPasswordUnknownEmailGeneric — email không tồn tại vẫn trả 200 và
// KHÔNG tạo token/email (chống dò tài khoản).
func TestForgotPasswordUnknownEmailGeneric(t *testing.T) {
	db := setupControllerTestDB(t)
	r := setupAuthRouter()

	w := postJSON(t, r, "/api/auth/forgot-password", map[string]string{"email": "khong-ton-tai@example.com"})
	if w.Code != http.StatusOK {
		t.Fatalf("mong đợi 200, nhận %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Nếu email tồn tại") {
		t.Fatalf("thông báo phải trung tính, nhận: %s", w.Body.String())
	}

	var tokenCount, emailCount int64
	db.Model(&models.PasswordResetToken{}).Count(&tokenCount)
	db.Model(&models.EmailLog{}).Count(&emailCount)
	if tokenCount != 0 || emailCount != 0 {
		t.Fatalf("không được tạo token/email cho email lạ (token=%d, email=%d)", tokenCount, emailCount)
	}
}

// TestForgotPasswordStoresHashedTokenAndEmitsLink — với email tồn tại: tạo
// token (chỉ lưu hash), ghi email_logs, và luồng reset bằng token đó thành công;
// dùng lại token lần 2 phải bị từ chối.
func TestForgotPasswordStoresHashedTokenAndEmitsLink(t *testing.T) {
	db := setupControllerTestDB(t)

	hashed, _ := bcrypt.GenerateFromPassword([]byte("OldPass123"), bcrypt.DefaultCost)
	user := models.User{Email: "reset.me@example.com", Name: "Reset Me", Password: string(hashed), Role: "customer"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("tạo user: %v", err)
	}

	r := setupAuthRouter()
	w := postJSON(t, r, "/api/auth/forgot-password", map[string]string{"email": "reset.me@example.com"})
	if w.Code != http.StatusOK {
		t.Fatalf("mong đợi 200, nhận %d", w.Code)
	}

	// 1. Token lưu DB phải ở dạng hash (không lưu token thô).
	var stored models.PasswordResetToken
	if err := db.Where("user_id = ?", user.ID).First(&stored).Error; err != nil {
		t.Fatalf("không tìm thấy token đã lưu: %v", err)
	}
	if stored.TokenHash == "" || stored.UsedAt != nil {
		t.Fatalf("token lưu phải có hash và chưa dùng, nhận: %+v", stored)
	}

	// 2. Email log phải tồn tại, provider dev-log, chứa link reset kèm token.
	var log models.EmailLog
	if err := db.Order("id DESC").First(&log).Error; err != nil {
		t.Fatalf("không có email_log: %v", err)
	}
	if log.To != "reset.me@example.com" || log.Provider != "dev-log" || log.Status != "sent" {
		t.Fatalf("email_log không đúng: %+v", log)
	}
	marker := "/reset-password?token="
	idx := strings.Index(log.Body, marker)
	if idx < 0 {
		t.Fatalf("email không chứa link reset: %s", log.Body)
	}
	rawToken := strings.TrimSpace(log.Body[idx+len(marker):])
	// cắt tới ký tự không phải hex đầu tiên (phòng HTML bao quanh)
	rawToken = strings.TrimRightFunc(rawToken, func(r rune) bool {
		return !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f'))
	})
	rawToken = rawToken[:min(len(rawToken), 64)]

	if hashResetToken(rawToken) != stored.TokenHash {
		t.Fatal("hash của token trong email không khớp token đã lưu")
	}

	// 3. Reset bằng token hợp lệ -> 200 và mật khẩu đổi.
	w = postJSON(t, r, "/api/auth/reset-password", map[string]string{"token": rawToken, "password": "NewPass456"})
	if w.Code != http.StatusOK {
		t.Fatalf("reset mật khẩu mong đợi 200, nhận %d: %s", w.Code, w.Body.String())
	}

	var refreshed models.User
	db.First(&refreshed, user.ID)
	if bcrypt.CompareHashAndPassword([]byte(refreshed.Password), []byte("NewPass456")) != nil {
		t.Fatal("mật khẩu mới chưa được cập nhật đúng")
	}
	if bcrypt.CompareHashAndPassword([]byte(refreshed.Password), []byte("OldPass123")) == nil {
		t.Fatal("mật khẩu cũ vẫn còn hiệu lực")
	}

	// 4. Token đã dùng -> lần 2 bị từ chối.
	w = postJSON(t, r, "/api/auth/reset-password", map[string]string{"token": rawToken, "password": "Another789"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("dùng lại token phải bị từ chối (400), nhận %d", w.Code)
	}
}

// TestResetPasswordRejectsExpiredToken — token hết hạn -> 400.
func TestResetPasswordRejectsExpiredToken(t *testing.T) {
	db := setupControllerTestDB(t)

	user := models.User{Email: "expired@example.com", Name: "Expired", Password: "x", Role: "customer"}
	db.Create(&user)

	expired := models.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: hashResetToken("expired-token"),
		ExpiresAt: time.Now().Add(-1 * time.Minute),
		CreatedAt: time.Now(),
	}
	db.Create(&expired)

	r := setupAuthRouter()
	w := postJSON(t, r, "/api/auth/reset-password", map[string]string{"token": "expired-token", "password": "Whatever123"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("token hết hạn phải bị từ chối (400), nhận %d", w.Code)
	}
}

// TestResetPasswordRejectsShortPassword — mật khẩu < 6 ký tự không hợp lệ.
func TestResetPasswordRejectsShortPassword(t *testing.T) {
	setupControllerTestDB(t)
	r := setupAuthRouter()
	w := postJSON(t, r, "/api/auth/reset-password", map[string]string{"token": "abc", "password": "123"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("mật khẩu ngắn phải bị từ chối (400), nhận %d", w.Code)
	}
}

// TestAuthorizeOrderStatusAcceptsTrackingToken — khách vãng lai dùng tracking
// token phải đọc được; thiếu/sai key phải bị chặn.
func TestAuthorizeOrderStatusAcceptsTrackingToken(t *testing.T) {
	db := setupControllerTestDB(t)

	user := models.User{Email: "guest@example.com", Name: "Guest", Password: "x", Role: "customer"}
	db.Create(&user)
	order := models.Order{UserID: user.ID, Total: 100000, Status: "pending", TrackingToken: "track-token-xyz", PaymentOrderID: ""}
	db.Create(&order)

	callWithKey := func(key string) (models.Order, bool) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		url := "/api/orders/" + strconv.FormatUint(uint64(order.ID), 10) + "/invoice"
		if key != "" {
			url += "?key=" + key
		}
		c.Request = httptest.NewRequest("GET", url, nil)
		return authorizeOrderStatus(c, order.ID)
	}

	if _, ok := callWithKey("track-token-xyz"); !ok {
		t.Fatal("tracking token hợp lệ phải được chấp nhận")
	}
	if _, ok := callWithKey("sai-token"); ok {
		t.Fatal("key sai không được chấp nhận")
	}
	if _, ok := callWithKey(""); ok {
		t.Fatal("thiếu key không được chấp nhận")
	}
}

// TestGetOrderInvoiceReturnsInvoice — hoá đơn trả đủ số hoá đơn, items, tổng.
func TestGetOrderInvoiceReturnsInvoice(t *testing.T) {
	db := setupControllerTestDB(t)

	user := models.User{Email: "buyer@example.com", Name: "Buyer", Password: "x", Role: "customer"}
	db.Create(&user)

	order := models.Order{
		UserID: user.ID, Total: 180000, Status: "completed", PaymentStatus: "paid",
		PaymentMethod: "cod", ShippingAddress: "1 Đường ABC", Phone: "0900000000",
	}
	db.Create(&order)
	db.Create(&models.OrderItem{OrderID: order.ID, Title: "Sách A", Price: 90000, Quantity: 2})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = gin.Params{{Key: "id", Value: strconv.FormatUint(uint64(order.ID), 10)}}
	c.Set("user_id", user.ID)
	c.Request = httptest.NewRequest("GET", "/api/orders/"+strconv.FormatUint(uint64(order.ID), 10)+"/invoice", nil)

	GetOrderInvoice(c)

	if w.Code != http.StatusOK {
		t.Fatalf("mong đợi 200, nhận %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		InvoiceNumber string  `json:"invoice_number"`
		Items         []struct {
			Title string `json:"title"`
		} `json:"items"`
		Totals struct {
			Subtotal float64 `json:"subtotal"`
			Total    float64 `json:"total"`
		} `json:"totals"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse JSON hoá đơn: %v", err)
	}

	wantNumber := fmt.Sprintf("BOKO-%d-%06d", order.CreatedAt.Year(), order.ID)
	if resp.InvoiceNumber != wantNumber {
		t.Fatalf("số hoá đơn mong đợi %q, nhận %q", wantNumber, resp.InvoiceNumber)
	}
	if len(resp.Items) != 1 || resp.Items[0].Title != "Sách A" {
		t.Fatalf("items không đúng: %+v", resp.Items)
	}
	if resp.Totals.Subtotal != 180000 || resp.Totals.Total != 180000 {
		t.Fatalf("tổng không đúng: %+v", resp.Totals)
	}
}
