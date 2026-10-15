package services

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

func setupServicesTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:svctest_%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("mở sqlite test: %v", err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&models.EmailLog{}); err != nil {
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

func TestFormatVND(t *testing.T) {
	cases := map[float64]string{
		0:       "0 ₫",
		1000:    "1.000 ₫",
		1234567: "1.234.567 ₫",
	}
	for in, want := range cases {
		if got := formatVND(in); got != want {
			t.Fatalf("formatVND(%v) = %q, mong đợi %q", in, got, want)
		}
	}
}

func TestSendEmailEmptyRecipient(t *testing.T) {
	setupServicesTestDB(t)
	if err := SendEmail("   ", "Chủ đề", "<p>x</p>"); err == nil {
		t.Fatal("phải báo lỗi khi thiếu người nhận")
	}
}

// TestSendEmailDevLog — khi chưa cấu hình RESEND_API_KEY, email được ghi vào
// email_logs với provider dev-log và trạng thái sent (không gửi ra ngoài).
func TestSendEmailDevLog(t *testing.T) {
	db := setupServicesTestDB(t)
	t.Setenv("RESEND_API_KEY", "")

	if err := SendEmail("dev@example.com", "Xin chào", "<p>Nội dung</p>"); err != nil {
		t.Fatalf("dev-log không được trả lỗi: %v", err)
	}

	var log models.EmailLog
	if err := db.Order("id DESC").First(&log).Error; err != nil {
		t.Fatalf("không có email_log: %v", err)
	}
	if log.Provider != "dev-log" || log.Status != "sent" || log.To != "dev@example.com" {
		t.Fatalf("email_log không đúng: %+v", log)
	}
	if log.Body != "<p>Nội dung</p>" {
		t.Fatalf("body không được lưu đúng: %q", log.Body)
	}
}

// TestSendPasswordResetEmailContainsLink — template reset phải chứa link có token.
func TestSendPasswordResetEmailContainsLink(t *testing.T) {
	setupServicesTestDB(t)
	t.Setenv("RESEND_API_KEY", "")

	resetURL := "https://boko.example/reset-password?token=deadbeef"
	if err := SendPasswordResetEmail("user@example.com", "Người Dùng", resetURL); err != nil {
		t.Fatalf("gửi email reset lỗi: %v", err)
	}

	var log models.EmailLog
	config.DB.Order("id DESC").First(&log)
	if !strings.Contains(log.Body, resetURL) {
		t.Fatalf("email reset không chứa link: %s", log.Body)
	}
	if !strings.Contains(log.Body, "BOKO") && !strings.Contains(log.Body, "Boko") {
		t.Fatalf("email reset thiếu thương hiệu shop: %s", log.Body)
	}
}

// TestAppBaseURLTrim — APP_BASE_URL bỏ dấu / cuối, fallback khi trống.
func TestAppBaseURLTrim(t *testing.T) {
	t.Setenv("APP_BASE_URL", "https://boko.example/")
	if got := AppBaseURL(); got != "https://boko.example" {
		t.Fatalf("AppBaseURL phải bỏ / cuối, nhận %q", got)
	}
	t.Setenv("APP_BASE_URL", "")
	if got := AppBaseURL(); got != defaultAppBaseURL {
		t.Fatalf("AppBaseURL fallback mong đợi %q, nhận %q", defaultAppBaseURL, got)
	}
}

// TestGetShopInfoFallback — thông tin shop lấy từ env, có fallback placeholder.
func TestGetShopInfoFallback(t *testing.T) {
	t.Setenv("SHOP_NAME", "")
	t.Setenv("SHOP_TAX_CODE", "")
	info := GetShopInfo()
	if info.Name != "BOKO" {
		t.Fatalf("tên shop fallback mong đợi BOKO, nhận %q", info.Name)
	}
	if info.TaxCode == "" {
		t.Fatal("tax code phải có fallback placeholder")
	}

	t.Setenv("SHOP_NAME", "Nhà Sách ABC")
	if got := GetShopInfo().Name; got != "Nhà Sách ABC" {
		t.Fatalf("SHOP_NAME env phải được ưu tiên, nhận %q", got)
	}
}
