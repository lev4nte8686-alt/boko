package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/services"
)

// GetOrderInvoice — dữ liệu hoá đơn cho 1 đơn hàng (để frontend render trang in).
// Quyền truy cập giống trang trạng thái thanh toán: chủ đơn đã đăng nhập, hoặc
// khách vãng lai có ?key= (tracking token / mã thanh toán).
func GetOrderInvoice(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID đơn hàng không hợp lệ"})
		return
	}

	order, ok := authorizeOrderStatus(c, uint(id64))
	if !ok {
		return
	}

	// authorizeOrderStatus không preload Items → nạp lại để dựng bảng hoá đơn.
	config.DB.Preload("Items").First(&order, order.ID)

	// Hoá đơn vẫn xuất được cho đơn huỷ (ghi nhận lịch sử), chỉ chặn khi đơn trống.
	subtotal := order.Subtotal
	if subtotal <= 0 {
		for _, it := range order.Items {
			subtotal += it.Price * float64(it.Quantity)
		}
	}
	discountAmount := order.DiscountAmount
	if discountAmount <= 0 && order.DiscountPercent > 0 {
		discountAmount = subtotal * float64(order.DiscountPercent) / 100
	}

	issuedAt := order.CreatedAt
	if issuedAt.IsZero() {
		issuedAt = time.Now()
	}

	c.JSON(http.StatusOK, gin.H{
		"shop":           services.GetShopInfo(),
		"invoice_number": fmt.Sprintf("BOKO-%d-%06d", issuedAt.Year(), order.ID),
		"issued_at":      issuedAt,
		"order": gin.H{
			"id":               order.ID,
			"status":           order.Status,
			"payment_status":   order.PaymentStatus,
			"payment_method":   order.PaymentMethod,
			"payment_trans_id": order.PaymentTransID,
			"shipping_address": order.ShippingAddress,
			"phone":            order.Phone,
			"created_at":       order.CreatedAt,
		},
		"items": order.Items,
		"totals": gin.H{
			"subtotal":         subtotal,
			"discount_percent": order.DiscountPercent,
			"discount_amount":  discountAmount,
			"coupon_code":      order.CouponCode,
			"shipping":         order.ShippingFee,
			"ship_fee_source":  order.ShipFeeSource,
			"vat_percent":      order.VatPercent,
			"vat":              order.VatAmount,
			"total":            order.Total,
		},
	})
}

// GetShopInfo — thông tin shop (public) cho footer/trang pháp lý/hoá đơn.
func GetShopInfo(c *gin.Context) {
	c.JSON(http.StatusOK, services.GetShopInfo())
}
