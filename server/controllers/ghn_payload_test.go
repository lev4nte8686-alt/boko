package controllers

import (
	"testing"

	"boko/models"
	"boko/services"
)

// TestBuildGHNPayloadPrefersOrderCodes — khi chuyển đơn sang GHN, phải ưu tiên
// mã Quận/Phường đã lưu trên đơn (khách chọn từ dropdown) thay vì suy lại từ
// chuỗi địa chỉ tự do; và mã truyền trong request handover vẫn thắng.
func TestBuildGHNPayloadPrefersOrderCodes(t *testing.T) {
	order := models.Order{
		ID:              1,
		ShippingAddress: "địa chỉ tự do không tra được",
		Phone:           "0912345678",
		Total:           120000,
		PaymentMethod:   "cod",
		PaymentStatus:   "unpaid",
		ToDistrictID:    1533,
		ToWardCode:      "22004",
		Items: []models.OrderItem{
			{BookID: 1, Title: "Sách A", Price: 120000, Quantity: 1},
		},
	}
	cfg := services.GHNConfig{
		ServiceTypeID: 2, PaymentTypeID: 1, RequiredNote: "KHONGCHOXEMHANG",
		ItemWeight: 350, PackageWeight: 150, Length: 20, Width: 15, Height: 6,
	}

	p, _, err := buildGHNPayload(order, cfg, ghnHandoverRequest{})
	if err != nil {
		t.Fatalf("buildGHNPayload lỗi: %v", err)
	}
	if p.ToDistrictID != 1533 || p.ToWardCode != "22004" {
		t.Fatalf("phải dùng mã lưu trên đơn, nhận %d/%s", p.ToDistrictID, p.ToWardCode)
	}
	if p.ClientOrderCode != "BOKO-1" {
		t.Fatalf("client_order_code = %q", p.ClientOrderCode)
	}

	// Override trong request phải thắng mã trên đơn.
	p2, _, err := buildGHNPayload(order, cfg, ghnHandoverRequest{
		ToDistrictID: 999, ToWardCode: "W999",
		ToDistrictName: "Q9", ToWardName: "P9", ToProvinceName: "T9",
	})
	if err != nil {
		t.Fatalf("buildGHNPayload (override) lỗi: %v", err)
	}
	if p2.ToDistrictID != 999 || p2.ToWardCode != "W999" {
		t.Fatalf("override phải thắng, nhận %d/%s", p2.ToDistrictID, p2.ToWardCode)
	}
}
