package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestIsFreeShipCoupon(t *testing.T) {
	cases := map[string]bool{
		"FREESHIP":   true,
		" freeship ": true,
		"FreeShip":   true,
		"GIAM10":     false,
		"":           false,
	}
	for code, want := range cases {
		if got := IsFreeShipCoupon(code); got != want {
			t.Errorf("IsFreeShipCoupon(%q) = %v, want %v", code, got, want)
		}
	}
}

func TestResolveShippingFeeRules(t *testing.T) {
	t.Setenv("FREE_SHIP_THRESHOLD", "300000")
	t.Setenv("SHIP_FEE_FALLBACK", "30000")
	t.Setenv("GHN_TOKEN", "")
	t.Setenv("GHN_SHOP_ID", "")

	// Mã FREESHIP → miễn phí
	if q := ResolveShippingFee(100000, 0, "", 500, 0, true); !q.Free || q.Fee != 0 || q.Source != "free_coupon" {
		t.Errorf("freeship coupon: %+v", q)
	}

	// Đạt ngưỡng → miễn phí
	if q := ResolveShippingFee(300000, 0, "", 500, 0, false); !q.Free || q.Fee != 0 || q.Source != "free_threshold" {
		t.Errorf("threshold: %+v", q)
	}

	// Dưới ngưỡng, GHN chưa cấu hình → phí tạm tính
	if q := ResolveShippingFee(299999, 0, "", 500, 0, false); q.Free || q.Fee != 30000 || q.Source != "fallback" {
		t.Errorf("fallback: %+v", q)
	}

	// Chi tiết: dưới ngưỡng thiếu địa chỉ → trả kèm lỗi
	if _, err := ResolveShippingFeeDetail(100000, 0, "", 500, 0, false); err == nil {
		t.Error("mong đợi lỗi thiếu địa chỉ, nhận nil")
	}
}

func TestVatAmountFor(t *testing.T) {
	t.Setenv("VAT_PERCENT", "5")
	if got := VatAmountFor(200000); got != 10000 {
		t.Errorf("VAT 5%% của 200000 = %v, want 10000", got)
	}
	t.Setenv("VAT_PERCENT", "0")
	if got := VatAmountFor(200000); got != 0 {
		t.Errorf("VAT 0%% của 200000 = %v, want 0", got)
	}
}

func TestPackageWeightForItems(t *testing.T) {
	t.Setenv("GHN_ITEM_WEIGHT", "350")
	t.Setenv("GHN_PACKAGE_WEIGHT", "150")
	if got := PackageWeightForItems(3); got != 150+350*3 {
		t.Errorf("3 cuốn = %d, want %d", got, 150+350*3)
	}
	// Số lượng ≤ 0 coi như 1 cuốn
	if got := PackageWeightForItems(0); got != 150+350 {
		t.Errorf("0 cuốn = %d, want %d", got, 150+350)
	}
}

// resetMasterDataCache — xoá cache master data giữa các test (cùng package nên
// truy cập được biến nội bộ).
func resetMasterDataCache() {
	masterDataMu.Lock()
	provincesCache = masterDataEntry[[]GHNProvince]{}
	districtsCache = map[int]masterDataEntry[[]GHNDistrict]{}
	wardsCache = map[int]masterDataEntry[[]GHNWard]{}
	masterDataMu.Unlock()

	originCache.Lock()
	originCache.districtID = 0
	originCache.wardCode = ""
	originCache.resolved = false
	originCache.Unlock()
}

func TestCalcGHNFeeParsesResponse(t *testing.T) {
	resetMasterDataCache()

	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/shiip/public-api/v2/shipping-order/fee" {
			t.Errorf("đường dẫn không mong đợi: %s", r.URL.Path)
		}
		if r.Header.Get("Token") != "test-token" || r.Header.Get("ShopId") != "123456" {
			t.Errorf("thiếu header xác thực GHN")
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":200,"message":"Success","data":{"total":25000,"service_fee":25000,"insurance_fee":0}}`))
	}))
	defer srv.Close()

	t.Setenv("GHN_BASE_URL", srv.URL)
	t.Setenv("GHN_TOKEN", "test-token")
	t.Setenv("GHN_SHOP_ID", "123456")
	t.Setenv("GHN_FROM_DISTRICT_ID", "1442")
	t.Setenv("GHN_FROM_WARD_CODE", "20106")

	fee, err := CalcGHNFee(1442, "20106", 500, 200000)
	if err != nil {
		t.Fatalf("CalcGHNFee lỗi: %v", err)
	}
	if fee != 25000 {
		t.Errorf("fee = %d, want 25000", fee)
	}
	if gotBody["from_district_id"] != float64(1442) {
		t.Errorf("from_district_id = %v, want 1442", gotBody["from_district_id"])
	}
	if gotBody["to_ward_code"] != "20106" {
		t.Errorf("to_ward_code = %v, want 20106", gotBody["to_ward_code"])
	}
}

func TestCalcGHNFeeRejectsErrorCode(t *testing.T) {
	resetMasterDataCache()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":400,"message":"Bad Request","code_message":"Weight is required"}`))
	}))
	defer srv.Close()

	t.Setenv("GHN_BASE_URL", srv.URL)
	t.Setenv("GHN_TOKEN", "test-token")
	t.Setenv("GHN_SHOP_ID", "123456")
	t.Setenv("GHN_FROM_DISTRICT_ID", "1442")
	t.Setenv("GHN_FROM_WARD_CODE", "20106")

	if _, err := CalcGHNFee(1, "2", 100, 0); err == nil {
		t.Fatal("mong đợi lỗi khi GHN trả code != 200, nhận nil")
	}
}

func TestListProvincesParsesAndCaches(t *testing.T) {
	resetMasterDataCache()

	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":200,"message":"Success","data":[{"ProvinceID":202,"ProvinceName":"TP. Hồ Chí Minh"},{"ProvinceID":201,"ProvinceName":"Hà Nội"}]}`))
	}))
	defer srv.Close()

	t.Setenv("GHN_BASE_URL", srv.URL)
	t.Setenv("GHN_TOKEN", "test-token")
	t.Setenv("GHN_SHOP_ID", "123456")

	p1, err := ListProvinces()
	if err != nil {
		t.Fatalf("ListProvinces lỗi: %v", err)
	}
	if len(p1) != 2 || p1[0].ProvinceName != "TP. Hồ Chí Minh" {
		t.Fatalf("dữ liệu tỉnh không đúng: %+v", p1)
	}

	if _, err := ListProvinces(); err != nil {
		t.Fatalf("ListProvinces lần 2 lỗi: %v", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("cache không hoạt động: gọi GHN %d lần, want 1", got)
	}
}
