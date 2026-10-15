package controllers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
)

// ============================================================================
// Test cho phí vận chuyển + VAT khi tạo đơn (giá luôn tính lại từ DB).
// ============================================================================

func setupCodPricingRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/orders/cod/create", CreateCodOrder)
	r.POST("/api/orders/quote", GetOrderQuote)
	r.POST("/api/shipping/quote", QuoteShippingFee)
	r.GET("/api/pricing", GetPricingConfig)
	return r
}

// disableGHN — tắt GHN để phí rơi về mức tạm tính (deterministic).
func disableGHN(t *testing.T) {
	t.Helper()
	t.Setenv("GHN_TOKEN", "")
	t.Setenv("GHN_SHOP_ID", "")
}

func mustCreateBook(t *testing.T, price float64, stock int) models.Book {
	t.Helper()
	b := models.Book{Title: "Sách test " + time.Now().Format("150405.000000"), Price: price, Stock: stock}
	if err := config.DB.Create(&b).Error; err != nil {
		t.Fatalf("tạo sách: %v", err)
	}
	return b
}

type codOrderResp struct {
	Order struct {
		ID             uint    `json:"id"`
		Total          float64 `json:"total"`
		Subtotal       float64 `json:"subtotal"`
		DiscountAmount float64 `json:"discount_amount"`
		ShippingFee    float64 `json:"shipping_fee"`
		VatPercent     int     `json:"vat_percent"`
		VatAmount      float64 `json:"vat_amount"`
		ShipFeeSource  string  `json:"ship_fee_source"`
	} `json:"order"`
}

func postCodOrder(t *testing.T, r *gin.Engine, payload map[string]any) (*httptest.ResponseRecorder, codOrderResp) {
	t.Helper()
	w := postJSON(t, r, "/api/orders/cod/create", payload)
	var resp codOrderResp
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return w, resp
}

func TestCodOrderUsesDBPriceAndFallbackShipping(t *testing.T) {
	setupControllerTestDB(t)
	disableGHN(t)
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")
	t.Setenv("SHIP_FEE_FALLBACK", "30000")
	t.Setenv("VAT_PERCENT", "0")

	book := mustCreateBook(t, 200000, 10)
	r := setupCodPricingRouter()

	w, resp := postCodOrder(t, r, map[string]any{
		"shipping_address": "123 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
		"phone":            "0912345678",
		"email":            "cod-fallback@boko.test",
		// price gửi lên sai lệch (1) → phải bị bỏ qua, dùng giá DB 200000
		"items": []map[string]any{{"book_id": book.ID, "title": book.Title, "price": 1, "quantity": 1}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	if resp.Order.Subtotal != 200000 {
		t.Errorf("subtotal=%v, want 200000 (giá DB)", resp.Order.Subtotal)
	}
	if resp.Order.ShippingFee != 30000 {
		t.Errorf("shipping_fee=%v, want 30000", resp.Order.ShippingFee)
	}
	if resp.Order.ShipFeeSource != "fallback" {
		t.Errorf("ship_fee_source=%q, want fallback", resp.Order.ShipFeeSource)
	}
	if resp.Order.VatAmount != 0 {
		t.Errorf("vat_amount=%v, want 0", resp.Order.VatAmount)
	}
	if resp.Order.Total != 230000 {
		t.Errorf("total=%v, want 230000", resp.Order.Total)
	}
}

func TestCodOrderFreeShipOverThreshold(t *testing.T) {
	setupControllerTestDB(t)
	disableGHN(t)
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")
	t.Setenv("SHIP_FEE_FALLBACK", "30000")

	book := mustCreateBook(t, 400000, 5)
	r := setupCodPricingRouter()

	w, resp := postCodOrder(t, r, map[string]any{
		"shipping_address": "1 Đường Sách, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
		"phone":            "0900000001",
		"email":            "cod-freeship@boko.test",
		"items":            []map[string]any{{"book_id": book.ID, "title": book.Title, "quantity": 1}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	if resp.Order.ShippingFee != 0 || resp.Order.ShipFeeSource != "free_threshold" {
		t.Errorf("mong đợi miễn phí ship theo ngưỡng, nhận %+v", resp.Order)
	}
	if resp.Order.Total != 400000 {
		t.Errorf("total=%v, want 400000", resp.Order.Total)
	}
}

func TestCodOrderAppliesVat(t *testing.T) {
	setupControllerTestDB(t)
	disableGHN(t)
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")
	t.Setenv("SHIP_FEE_FALLBACK", "30000")
	t.Setenv("VAT_PERCENT", "5")

	book := mustCreateBook(t, 100000, 5)
	r := setupCodPricingRouter()

	w, resp := postCodOrder(t, r, map[string]any{
		"shipping_address": "1 Đường Sách, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
		"phone":            "0900000002",
		"email":            "cod-vat@boko.test",
		"items":            []map[string]any{{"book_id": book.ID, "title": book.Title, "quantity": 1}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	if resp.Order.VatPercent != 5 || resp.Order.VatAmount != 5000 {
		t.Errorf("VAT: percent=%d amount=%v, want 5/5000", resp.Order.VatPercent, resp.Order.VatAmount)
	}
	if resp.Order.Total != 135000 { // 100000 + 30000 ship + 5000 vat
		t.Errorf("total=%v, want 135000", resp.Order.Total)
	}
}

func TestCodOrderFreeShipCoupon(t *testing.T) {
	setupControllerTestDB(t)
	disableGHN(t)
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")
	t.Setenv("SHIP_FEE_FALLBACK", "30000")

	coupon := models.Coupon{Code: "FREESHIP", DiscountPercent: 0, MaxUses: 10, ExpiresAt: time.Now().Add(24 * time.Hour), IsActive: true}
	if err := config.DB.Create(&coupon).Error; err != nil {
		t.Fatalf("tạo coupon: %v", err)
	}

	book := mustCreateBook(t, 100000, 5)
	r := setupCodPricingRouter()

	w, resp := postCodOrder(t, r, map[string]any{
		"shipping_address": "1 Đường Sách, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
		"phone":            "0900000003",
		"email":            "cod-coupon@boko.test",
		"coupon_code":      "FREESHIP",
		"items":            []map[string]any{{"book_id": book.ID, "title": book.Title, "quantity": 1}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	if resp.Order.ShippingFee != 0 || resp.Order.ShipFeeSource != "free_coupon" {
		t.Errorf("mong đợi FREESHIP miễn phí, nhận %+v", resp.Order)
	}
	if resp.Order.Total != 100000 {
		t.Errorf("total=%v, want 100000", resp.Order.Total)
	}
}

func TestPricingConfigEndpoint(t *testing.T) {
	setupControllerTestDB(t)
	t.Setenv("VAT_PERCENT", "0")
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")

	r := setupCodPricingRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/pricing", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("code=%d", w.Code)
	}
	var cfgResp struct {
		FreeShipThreshold float64 `json:"free_ship_threshold"`
		VatPercent        int     `json:"vat_percent"`
		Currency          string  `json:"currency"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &cfgResp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if cfgResp.FreeShipThreshold != 300000 || cfgResp.VatPercent != 0 || cfgResp.Currency != "VND" {
		t.Errorf("pricing config sai: %+v", cfgResp)
	}
}

func TestShippingQuoteEndpointFallback(t *testing.T) {
	setupControllerTestDB(t)
	disableGHN(t)
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")
	t.Setenv("SHIP_FEE_FALLBACK", "30000")
	t.Setenv("VAT_PERCENT", "0")

	book := mustCreateBook(t, 120000, 10)
	r := setupCodPricingRouter()

	w := postJSON(t, r, "/api/shipping/quote", map[string]any{
		"items": []map[string]any{{"book_id": book.ID, "quantity": 1}},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	var q struct {
		Subtotal    float64 `json:"subtotal"`
		ShippingFee float64 `json:"shipping_fee"`
		Total       float64 `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &q); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if q.Subtotal != 120000 || q.ShippingFee != 30000 || q.Total != 150000 {
		t.Errorf("quote sai: %+v", q)
	}
}
