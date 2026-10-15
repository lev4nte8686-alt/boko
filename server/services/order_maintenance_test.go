package services

import (
	"testing"
	"time"

	"gorm.io/gorm"

	"boko/config"
	"boko/models"
)

// setupOrderMaintenanceDB — DB sqlite in-memory với các bảng cần cho reaper.
func setupOrderMaintenanceDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := setupServicesTestDB(t)
	if err := db.AutoMigrate(&models.Book{}, &models.Order{}, &models.OrderItem{}); err != nil {
		t.Fatalf("auto migrate order maintenance: %v", err)
	}
	return db
}

func TestPendingOrderTTLFromEnv(t *testing.T) {
	t.Setenv("PENDING_ORDER_TTL_MINUTES", "45")
	if got := PendingOrderTTL(); got != 45*time.Minute {
		t.Fatalf("PendingOrderTTL() = %s, mong đợi 45m", got)
	}

	t.Setenv("PENDING_ORDER_TTL_MINUTES", "")
	if got := PendingOrderTTL(); got != 30*time.Minute {
		t.Fatalf("PendingOrderTTL() mặc định = %s, mong đợi 30m", got)
	}
}

func TestCancelStalePendingOrders_CancelsAndRestocks(t *testing.T) {
	db := setupOrderMaintenanceDB(t)

	book := models.Book{Title: "Sách treo", Author: "A", Price: 100000, Stock: 3}
	if err := db.Create(&book).Error; err != nil {
		t.Fatalf("tạo sách: %v", err)
	}

	// Đơn treo: pending + unpaid, tạo 2 giờ trước, đã trừ kho (đặt 2 cuốn).
	stale := models.Order{
		UserID: 1, Total: 200000, Subtotal: 200000,
		Status: "pending", PaymentStatus: "unpaid", PaymentMethod: "momo",
		StockDeducted: true, CreatedAt: time.Now().Add(-2 * time.Hour),
	}
	if err := db.Create(&stale).Error; err != nil {
		t.Fatalf("tạo đơn treo: %v", err)
	}
	if err := db.Create(&models.OrderItem{OrderID: stale.ID, BookID: book.ID, Title: book.Title, Price: 100000, Quantity: 2}).Error; err != nil {
		t.Fatalf("tạo item: %v", err)
	}

	// Đơn mới: pending + unpaid tạo vừa xong -> KHÔNG được huỷ.
	fresh := models.Order{
		UserID: 1, Total: 100000, Status: "pending", PaymentStatus: "unpaid",
		PaymentMethod: "vnpay", CreatedAt: time.Now(),
	}
	db.Create(&fresh)

	// Đơn đã thanh toán -> KHÔNG được huỷ.
	paid := models.Order{
		UserID: 1, Total: 100000, Status: "pending", PaymentStatus: "paid",
		PaymentMethod: "paypal", CreatedAt: time.Now().Add(-3 * time.Hour),
	}
	db.Create(&paid)

	// Đơn COD đang giao (shipping) -> KHÔNG được huỷ dù cũ.
	shipping := models.Order{
		UserID: 1, Total: 100000, Status: "shipping", PaymentStatus: "unpaid",
		PaymentMethod: "cod", CreatedAt: time.Now().Add(-3 * time.Hour),
	}
	db.Create(&shipping)

	n, err := CancelStalePendingOrders(30 * time.Minute)
	if err != nil {
		t.Fatalf("CancelStalePendingOrders lỗi: %v", err)
	}
	if n != 1 {
		t.Fatalf("số đơn huỷ = %d, mong đợi 1", n)
	}

	var gotStale, gotFresh, gotPaid, gotShipping models.Order
	db.First(&gotStale, stale.ID)
	db.First(&gotFresh, fresh.ID)
	db.First(&gotPaid, paid.ID)
	db.First(&gotShipping, shipping.ID)

	if gotStale.Status != "cancelled" {
		t.Fatalf("đơn treo status = %q, mong đợi cancelled", gotStale.Status)
	}
	if gotStale.StockDeducted {
		t.Fatalf("đơn treo vẫn còn cờ StockDeducted=true sau khi huỷ")
	}
	if gotFresh.Status != "pending" {
		t.Fatalf("đơn mới bị đổi status = %q, mong đợi pending", gotFresh.Status)
	}
	if gotPaid.Status != "pending" {
		t.Fatalf("đơn đã thanh toán bị đổi status = %q", gotPaid.Status)
	}
	if gotShipping.Status != "shipping" {
		t.Fatalf("đơn COD shipping bị đổi status = %q", gotShipping.Status)
	}

	var restored models.Book
	db.First(&restored, book.ID)
	if restored.Stock != 5 {
		t.Fatalf("tồn kho sau hoàn = %d, mong đợi 5 (3 + 2)", restored.Stock)
	}
}

func TestCancelStalePendingOrders_IdempotentWithoutStock(t *testing.T) {
	db := setupOrderMaintenanceDB(t)

	// Đơn treo tạo bởi cổng online: KHÔNG trừ kho (StockDeducted=false).
	o := models.Order{
		UserID: 2, Total: 150000, Status: "pending", PaymentStatus: "unpaid",
		PaymentMethod: "momo", StockDeducted: false, CreatedAt: time.Now().Add(-time.Hour),
	}
	db.Create(&o)

	n, err := CancelStalePendingOrders(30 * time.Minute)
	if err != nil || n != 1 {
		t.Fatalf("lần 1: n=%d err=%v, mong đợi 1/không lỗi", n, err)
	}

	// Chạy lần 2: đơn đã cancelled nên không còn bị chạm.
	n2, err := CancelStalePendingOrders(30 * time.Minute)
	if err != nil || n2 != 0 {
		t.Fatalf("lần 2: n=%d err=%v, mong đợi 0/không lỗi", n2, err)
	}

	var got models.Order
	db.First(&got, o.ID)
	if got.Status != "cancelled" {
		t.Fatalf("status = %q, mong đợi cancelled", got.Status)
	}
}

func TestCancelStalePendingOrders_EmptyDB(t *testing.T) {
	_ = config.DB
	setupOrderMaintenanceDB(t)
	n, err := CancelStalePendingOrders(30 * time.Minute)
	if err != nil || n != 0 {
		t.Fatalf("DB trống: n=%d err=%v, mong đợi 0/không lỗi", n, err)
	}
}
