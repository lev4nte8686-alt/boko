package services

import (
	"os"
	"strings"
)

// ShopInfo — thông tin pháp lý/hiển thị của shop, dùng cho trang điều khoản,
// chính sách, hoá đơn và footer. Đọc từ biến môi trường để KHÔNG hardcode.
// Giá trị mặc định là placeholder cần thay trước khi go-live (xem server/.env.example).
type ShopInfo struct {
	Name    string `json:"name"`
	TaxCode string `json:"tax_code"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Website string `json:"website"`
}

// GetShopInfo — trả thông tin shop hiện hành.
func GetShopInfo() ShopInfo {
	return ShopInfo{
		Name:    envOr("SHOP_NAME", "BOKO"),
		TaxCode: envOr("SHOP_TAX_CODE", "TODO-ĐIỀN-MST"),
		Address: envOr("SHOP_ADDRESS", "TODO: Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"),
		Phone:   envOr("SHOP_PHONE", "TODO-ĐIỀN-HOTLINE"),
		Email:   envOr("SHOP_EMAIL", "support@boko.example"),
		Website: envOr("SHOP_WEBSITE", "https://boko.example"),
	}
}

// envOr — đọc biến môi trường, fallback khi trống.
func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
