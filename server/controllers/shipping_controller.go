package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
	"boko/services"
)

// atoiDefault — parse số nguyên, lỗi thì trả về giá trị mặc định.
func atoiDefault(s string, fallback int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
		return n
	}
	return fallback
}

// ==================== GIAO HÀNG: ĐỊA CHỈ + PHÍ VẬN CHUYỂN ====================
//
// Các endpoint dưới đây CÔNG KHAI vì người mua chưa đăng nhập vẫn cần chọn
// địa chỉ và xem phí ship trước khi đặt hàng. Chúng chỉ đọc master data GHN
// (tỉnh/quận/phường) nên an toàn để public.

// resolveToDestination — quy đích đến về mã GHN. Ưu tiên mã client gửi kèm; nếu
// thiếu thì tra cứu từ địa chỉ tự do (best-effort). Không tra được → (0, "").
func resolveToDestination(districtID int, wardCode, address string) (int, string) {
	if districtID > 0 && strings.TrimSpace(wardCode) != "" {
		return districtID, strings.TrimSpace(wardCode)
	}
	cfg := services.GetGHNConfig()
	if !cfg.IsConfigured() {
		return 0, ""
	}
	if dest, err := cfg.ResolveDestination(address); err == nil && dest != nil {
		return dest.DistrictID, dest.WardCode
	}
	return 0, ""
}

// GetShippingProvinces — GET /api/shipping/provinces
func GetShippingProvinces(c *gin.Context) {
	provinces, err := services.ListProvinces()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error(), "data": []any{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": provinces})
}

// GetShippingDistricts — GET /api/shipping/districts?province_id=
func GetShippingDistricts(c *gin.Context) {
	provinceID := atoiDefault(c.Query("province_id"), 0)
	if provinceID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thiếu province_id hợp lệ"})
		return
	}
	districts, err := services.ListDistricts(provinceID)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error(), "data": []any{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": districts})
}

// GetShippingWards — GET /api/shipping/wards?district_id=
func GetShippingWards(c *gin.Context) {
	districtID := atoiDefault(c.Query("district_id"), 0)
	if districtID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thiếu district_id hợp lệ"})
		return
	}
	wards, err := services.ListWards(districtID)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error(), "data": []any{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": wards})
}

// GetPricingConfig — GET /api/pricing
// Cấu hình tính giá hiển thị trên UI (VAT %, ngưỡng miễn phí ship...).
func GetPricingConfig(c *gin.Context) {
	cfg := services.GetGHNConfig()
	c.JSON(http.StatusOK, gin.H{
		"currency":            "VND",
		"vat_percent":         services.VatPercent(),
		"free_ship_threshold": services.FreeShipThreshold(),
		"ship_fee_fallback":   services.FlatShipFee(),
		"ghn_configured":      cfg.IsConfigured(),
	})
}

// QuoteShippingFee — POST /api/shipping/quote
// Tính trước phí vận chuyển + VAT + tổng cho giỏ hàng ở một địa chỉ (không tạo đơn).
func QuoteShippingFee(c *gin.Context) {
	var input struct {
		CouponCode   string `json:"coupon_code"`
		ToDistrictID int    `json:"to_district_id"`
		ToWardCode   string `json:"to_ward_code"`
		Items        []struct {
			BookID   uint `json:"book_id" binding:"required,gt=0"`
			Quantity int  `json:"quantity" binding:"required,gt=0"`
		} `json:"items" binding:"required,min=1,dive"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu tính phí không hợp lệ: " + err.Error()})
		return
	}

	var subtotal float64
	totalQuantity := 0
	for _, it := range input.Items {
		var book models.Book
		if err := config.DB.First(&book, it.BookID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Không tìm thấy sách ID %d", it.BookID)})
			return
		}
		subtotal += book.Price * float64(it.Quantity)
		totalQuantity += it.Quantity
	}

	// Coupon ở bước xem phí chỉ mang tính gợi ý: mã sai thì bỏ qua (không chặn xem phí).
	discountPercent := 0
	if strings.TrimSpace(input.CouponCode) != "" {
		if p, err := resolveCouponReadOnly(input.CouponCode); err == nil {
			discountPercent = p
		}
	}

	discountAmount := subtotal * float64(discountPercent) / 100
	afterDiscount := subtotal - discountAmount

	weightGram := services.PackageWeightForItems(totalQuantity)
	quote, feeErr := services.ResolveShippingFeeDetail(
		afterDiscount, input.ToDistrictID, strings.TrimSpace(input.ToWardCode), weightGram, afterDiscount,
		services.IsFreeShipCoupon(input.CouponCode),
	)

	vatAmount := services.VatAmountFor(afterDiscount)

	resp := gin.H{
		"subtotal":                subtotal,
		"discount_percent":        discountPercent,
		"discount_amount":         discountAmount,
		"subtotal_after_discount": afterDiscount,
		"shipping_fee":            quote.Fee,
		"free_ship":               quote.Free,
		"ship_fee_source":         quote.Source,
		"vat_percent":             services.VatPercent(),
		"vat_amount":              vatAmount,
		"free_ship_threshold":     services.FreeShipThreshold(),
		"total":                   afterDiscount + quote.Fee + vatAmount,
		"currency":                "VND",
	}
	if feeErr != nil {
		// Vẫn trả 200 với phí tạm tính; kèm cảnh báo để UI có thể hiển thị.
		resp["fee_warning"] = feeErr.Error()
	}
	c.JSON(http.StatusOK, resp)
}
