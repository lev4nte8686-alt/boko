package controllers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"boko/models"
)

// ============================================================================
// Test cho tìm kiếm phía server + guest checkout (không cần đăng nhập).
// Dùng SQLite in-memory (setupControllerTestDB) nên chạy offline.
// ============================================================================

func TestGetBooks_SearchServerSide(t *testing.T) {
	db := setupControllerTestDB(t)

	cat := models.Category{Name: "History"}
	if err := db.Create(&cat).Error; err != nil {
		t.Fatalf("tạo danh mục: %v", err)
	}
	books := []models.Book{
		{Title: "Nhà Giả Kim", Author: "Paulo Coelho", Price: 79000, Stock: 10},
		{Title: "The Hound of the Baskervilles", Author: "Arthur Conan Doyle", Price: 250000, Stock: 5},
		{Title: "Lịch Sử Việt Nam", Author: "Lê Văn Hồng", Price: 89000, Stock: 7, CategoryID: &cat.ID},
	}
	for _, b := range books {
		if err := db.Create(&b).Error; err != nil {
			t.Fatalf("tạo sách: %v", err)
		}
	}

	r := newTestRouter(func(r *gin.Engine) { r.GET("/api/books", GetBooks) })

	assertSearch := func(q string, wantTitle string, wantTotal int) {
		t.Helper()
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/books?limit=50&search="+q, nil)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("search %q: mã %d", q, w.Code)
		}
		var body struct {
			Data  []models.Book `json:"data"`
			Total int64         `json:"total"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("search %q: parse JSON: %v", q, err)
		}
		if int(body.Total) != wantTotal {
			t.Fatalf("search %q: total=%d, mong đợi %d", q, body.Total, wantTotal)
		}
		if wantTotal == 1 && len(body.Data) == 1 && body.Data[0].Title != wantTitle {
			t.Fatalf("search %q: nhận %q, mong đợi %q", q, body.Data[0].Title, wantTitle)
		}
	}

	// Theo tên (không phân biệt hoa/thường), có dấu tiếng Việt.
	assertSearch("giả%20kim", "Nhà Giả Kim", 1)
	// Theo tác giả.
	assertSearch("coelho", "Nhà Giả Kim", 1)
	// Theo tên danh mục (History).
	assertSearch("history", "Lịch Sử Việt Nam", 1)
	// Không khớp gì.
	assertSearch("zzz-khong-ton-tai", "", 0)
}

func TestCreateCodOrder_GuestReturnsTrackingToken(t *testing.T) {
	db := setupControllerTestDB(t)

	book := models.Book{Title: "Sách khách vãng lai", Author: "A", Price: 100000, Stock: 9}
	if err := db.Create(&book).Error; err != nil {
		t.Fatalf("tạo sách: %v", err)
	}

	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/orders/cod/create", CreateCodOrder) })

	payload := map[string]interface{}{
		"amount":           100000,
		"shipping_address": "Số 1 Đường Sách, Quận 1, TP. Hồ Chí Minh",
		"phone":            "0912345678",
		"email":            "guest.unit.test@boko.com",
		"customer_name":    "Khách Vãng Lai",
		"items": []map[string]interface{}{
			{"book_id": book.ID, "title": book.Title, "price": 100000, "quantity": 1},
		},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/orders/cod/create", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	// KHÔNG gắn Authorization => đóng vai khách vãng lai.
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Mong đợi 201 cho guest COD, nhận %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		OrderID       uint   `json:"order_id"`
		TrackingToken string `json:"tracking_token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse JSON: %v", err)
	}
	if resp.OrderID == 0 {
		t.Fatalf("thiếu order_id trong phản hồi")
	}
	if resp.TrackingToken == "" {
		t.Fatalf("guest phải nhận được tracking_token để tra cứu đơn")
	}

	// Đơn phải thuộc về một tài khoản khách được tạo theo email.
	var order models.Order
	if err := db.Preload("Items").First(&order, resp.OrderID).Error; err != nil {
		t.Fatalf("không tìm thấy đơn vừa tạo: %v", err)
	}
	if order.UserID == 0 {
		t.Fatalf("đơn guest phải được gán user_id (tài khoản khách)")
	}
	if order.TrackingToken != resp.TrackingToken {
		t.Fatalf("tracking_token không khớp giữa phản hồi và DB")
	}

	// Tồn kho phải bị trừ nguyên tử.
	var after models.Book
	db.First(&after, book.ID)
	if after.Stock != 8 {
		t.Fatalf("tồn kho sau đặt = %d, mong đợi 8", after.Stock)
	}
}
