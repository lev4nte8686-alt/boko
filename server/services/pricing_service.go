package services

import (
	"fmt"
	"strings"
)

// ==================== TÍNH GIÁ ĐƠN HÀNG: PHÍ VẬN CHUYỂN + VAT ====================
//
// Mọi con số tiền tệ được tính lại ở backend từ giá trong DB (không tin client):
//   total = tạm tính − giảm giá + phí vận chuyển + VAT
//
// Quy tắc nghiệp vụ:
//   - Sách in được MIỄN thuế GTGT ở Việt Nam → VAT mặc định 0% (đổi qua VAT_PERCENT).
//   - Đơn có tạm tính (sau giảm giá) ≥ FREE_SHIP_THRESHOLD → miễn phí vận chuyển.
//   - Mã FREESHIP → miễn phí vận chuyển.
//   - Còn lại: tính phí thật theo GHN; nếu GHN chưa cấu hình/lỗi → phí tạm tính
//     SHIP_FEE_FALLBACK để không chặn khách đặt hàng.

const (
	defaultFreeShipThreshold = 300000 // VND — đơn từ mức này được miễn phí ship
	defaultFlatShipFee       = 30000  // VND — phí tạm tính khi chưa tính được phí GHN
)

// FreeShipThreshold — ngưỡng miễn phí vận chuyển (VND), cấu hình qua FREE_SHIP_THRESHOLD.
func FreeShipThreshold() float64 {
	return float64(getEnvInt("FREE_SHIP_THRESHOLD", defaultFreeShipThreshold))
}

// VatPercent — thuế GTGT (%). Sách in miễn thuế ở VN nên mặc định 0.
func VatPercent() int {
	return getEnvInt("VAT_PERCENT", 0)
}

// FlatShipFee — phí vận chuyển tạm tính khi không tính được phí thật từ GHN.
func FlatShipFee() float64 {
	return float64(getEnvInt("SHIP_FEE_FALLBACK", defaultFlatShipFee))
}

// IsFreeShipCoupon — mã FREESHIP được miễn phí vận chuyển.
func IsFreeShipCoupon(code string) bool {
	return strings.EqualFold(strings.TrimSpace(code), "FREESHIP")
}

// PackageWeightForItems — tổng khối lượng bưu kiện (gram) = trọng lượng đóng gói
// + số cuốn × trọng lượng 1 cuốn (cấu hình GHN_ITEM_WEIGHT / GHN_PACKAGE_WEIGHT).
func PackageWeightForItems(totalQuantity int) int {
	cfg := GetGHNConfig()
	if totalQuantity <= 0 {
		totalQuantity = 1
	}
	return cfg.PackageWeight + cfg.ItemWeight*totalQuantity
}

// ShippingQuote — kết quả tính phí vận chuyển cho đơn.
type ShippingQuote struct {
	Fee    float64
	Free   bool
	Source string // free_coupon | free_threshold | ghn | fallback
}

// ResolveShippingFeeDetail — tính phí vận chuyển. Trả kèm lỗi GHN (nếu có) để
// nơi gọi ghi log; khi lỗi vẫn trả phí tạm tính (Source = "fallback") để không
// chặn đặt hàng.
//
//	subtotalAfterDiscount: tạm tính sau giảm giá (để xét ngưỡng miễn phí)
//	districtID/wardCode:   đích đến đã quy về mã GHN (0/"" nếu chưa có)
//	weightGram:            tổng khối lượng bưu kiện
//	insuranceVND:          giá trị khai báo bảo hiểm (0 = không)
func ResolveShippingFeeDetail(
	subtotalAfterDiscount float64,
	districtID int,
	wardCode string,
	weightGram int,
	insuranceVND float64,
	freeShipCoupon bool,
) (ShippingQuote, error) {
	if freeShipCoupon {
		return ShippingQuote{Fee: 0, Free: true, Source: "free_coupon"}, nil
	}
	if threshold := FreeShipThreshold(); threshold > 0 && subtotalAfterDiscount >= threshold {
		return ShippingQuote{Fee: 0, Free: true, Source: "free_threshold"}, nil
	}
	if districtID > 0 && strings.TrimSpace(wardCode) != "" {
		fee, err := CalcGHNFee(districtID, wardCode, weightGram, int(insuranceVND))
		if err == nil {
			return ShippingQuote{Fee: float64(fee), Free: fee == 0, Source: "ghn"}, nil
		}
		return ShippingQuote{Fee: FlatShipFee(), Free: false, Source: "fallback"}, err
	}
	return ShippingQuote{Fee: FlatShipFee(), Free: false, Source: "fallback"},
		fmt.Errorf("chưa xác định được địa chỉ nhận hàng (mã quận/huyện, phường/xã)")
}

// ResolveShippingFee — bản rút gọn, bỏ qua lỗi (dùng khi chỉ cần con số).
func ResolveShippingFee(
	subtotalAfterDiscount float64,
	districtID int,
	wardCode string,
	weightGram int,
	insuranceVND float64,
	freeShipCoupon bool,
) ShippingQuote {
	q, _ := ResolveShippingFeeDetail(subtotalAfterDiscount, districtID, wardCode, weightGram, insuranceVND, freeShipCoupon)
	return q
}

// VatAmountFor — tiền thuế GTGT tính trên tạm tính sau giảm giá.
func VatAmountFor(subtotalAfterDiscount float64) float64 {
	return subtotalAfterDiscount * float64(VatPercent()) / 100
}
