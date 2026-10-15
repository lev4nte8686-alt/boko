package controllers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"boko/config"
	"boko/models"
	"boko/services"
)

// ==================== SELLER DASHBOARD ====================

// SellerGetBooks — danh sách sách của seller đang đăng nhập
func SellerGetBooks(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới xem được"})
		return
	}

	userID, _ := c.Get("user_id")

	var books []models.Book
	query := config.DB.Preload("Category").Where("user_id = ?", userID)

	// Nếu admin → xem tất cả
	if role == "admin" {
		query = config.DB.Preload("Category")
	}

	query.Order("created_at DESC").Find(&books)

	c.JSON(http.StatusOK, gin.H{"data": books})
}

// SellerGetOrders — đơn hàng có chứa sách của seller
func SellerGetOrders(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới xem được"})
		return
	}

	userID, _ := c.Get("user_id")

	// Lấy danh sách order_id từ order_items có book_id thuộc về seller
	var orderIDs []uint
	if role == "admin" {
		config.DB.Model(&models.OrderItem{}).Distinct().Pluck("order_id", &orderIDs)
	} else {
		config.DB.Table("order_items").
			Joins("join books on books.id = order_items.book_id").
			Where("books.user_id = ?", userID).
			Distinct("order_items.order_id").
			Pluck("order_items.order_id", &orderIDs)
	}

	var orders []models.Order
	if len(orderIDs) > 0 {
		config.DB.Preload("Items").Preload("User").Preload("Shipment").
			Where("id IN ?", orderIDs).
			Order("created_at DESC").
			Find(&orders)
	}

	c.JSON(http.StatusOK, gin.H{"data": orders})
}

// SellerUpdateOrderStatus — cập nhật trạng thái đơn hàng (seller)
func SellerUpdateOrderStatus(c *gin.Context) {
	role, _ := c.Get("role")
	userID, _ := c.Get("user_id")
	orderID := c.Param("id")

	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	// 1. Chỉ cho phép các trạng thái hợp lệ
	validStatuses := map[string]bool{
		"confirmed": true,
		"shipping":  true,
		"completed": true,
		"cancelled": true,
	}
	if !validStatuses[input.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Trạng thái không hợp lệ"})
		return
	}

	// 2. Tìm đơn hàng trước (Preload Items để có dữ liệu đối soát)
	var order models.Order
	if result := config.DB.Preload("Items").First(&order, orderID); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}

	// 3. VÁ IDOR (D09b): Phân quyền Mixed-Seller chống bẫy 0 == 0
	if role != "admin" {
		var totalItemsCount int64
		if err := config.DB.Model(&models.OrderItem{}).Where("order_id = ?", order.ID).Count(&totalItemsCount).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi truy vấn dữ liệu đơn hàng"})
			return
		}

		var sellerItemsCount int64
		if err := config.DB.Table("order_items").
			Joins("JOIN books ON books.id = order_items.book_id").
			Where("order_items.order_id = ? AND books.user_id = ?", order.ID, userID).
			Count(&sellerItemsCount).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi kiểm tra quyền sở hữu sách"})
			return
		}

		// Chặn đứng hoàn toàn bẫy 0 == 0 và đơn mixed-seller
		if totalItemsCount <= 0 || sellerItemsCount <= 0 || sellerItemsCount != totalItemsCount {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Bạn không có quyền quản lý đơn hàng rỗng hoặc chứa sản phẩm của người bán khác. Vui lòng liên hệ Admin.",
			})
			return
		}
	}

	// 4. KIỂM TRA QUY TẮC CHUYỂN TRẠNG THÁI (State Transition Guard)
	if order.Status == "completed" || order.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Không thể chuyển đổi trạng thái của đơn hàng đã \"%s\"", order.Status),
		})
		return
	}

	if role != "admin" {
		allowed := false
		switch order.Status {
		case "pending":
			allowed = input.Status == "confirmed" || input.Status == "cancelled"
		case "confirmed":
			allowed = input.Status == "shipping" || input.Status == "cancelled"
		case "shipping":
			allowed = input.Status == "completed" || input.Status == "cancelled" // Cho phép hủy đơn shipping cho demo
		}
		if !allowed {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Không thể chuyển từ \"%s\" sang \"%s\"", order.Status, input.Status),
			})
			return
		}
	}

	// 5. VÁ HOÀN TỒN KHO KHI HỦY ĐƠN (D04) VỚI CỜ StockDeducted VÀ TRANSACTION KHÓA FOR UPDATE
	if input.Status == "cancelled" {
		err := config.DB.Transaction(func(tx *gorm.DB) error {
			var lockedOrder models.Order
			if err := tx.Set("gorm:query_option", "FOR UPDATE").
				Preload("Items").First(&lockedOrder, order.ID).Error; err != nil {
				return err
			}

			if lockedOrder.Status == "completed" || lockedOrder.Status == "cancelled" {
				return fmt.Errorf("INVALID_STATUS: Đơn hàng đã ở trạng thái %s", lockedOrder.Status)
			}

			res := tx.Model(&lockedOrder).
				Where("id = ? AND status IN ('pending', 'confirmed', 'shipping')", lockedOrder.ID).
				Update("status", "cancelled")
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return errors.New("Đơn hàng đã được xử lý hoặc không hợp lệ để hủy")
			}

			// Chỉ hoàn kho khi đơn hàng đã thực sự trừ kho (StockDeducted == true)
			if lockedOrder.StockDeducted {
				resFlag := tx.Model(&lockedOrder).
					Where("id = ? AND stock_deducted = true", lockedOrder.ID).
					Update("stock_deducted", false)
				if resFlag.Error != nil {
					return resFlag.Error
				}

				if resFlag.RowsAffected > 0 {
					for _, it := range lockedOrder.Items {
						resBook := tx.Model(&models.Book{}).Where("id = ?", it.BookID).
							Update("stock", gorm.Expr("stock + ?", it.Quantity))
						if resBook.Error != nil {
							return resBook.Error
						}
						if resBook.RowsAffected == 0 {
							return fmt.Errorf("Sách ID %d không còn tồn tại để hoàn kho", it.BookID)
						}
					}
				}
			}
			return nil
		})

		if err != nil {
			if strings.HasPrefix(err.Error(), "INVALID_STATUS") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Không thể hủy đơn hàng đã hoàn tất hoặc đã bị hủy"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi khi hủy đơn hàng: " + err.Error()})
			return
		}

		notifyOrderEmail(order.ID, "[Boko] Đơn hàng đã huỷ",
			"Đơn hàng đã huỷ",
			"Đơn hàng của bạn đã bị huỷ. Nếu đã thanh toán, bộ phận hỗ trợ sẽ liên hệ để hoàn tiền.")

		c.JSON(http.StatusOK, gin.H{"message": "Đã hủy đơn hàng và hoàn lại tồn kho thành công!", "status": "cancelled"})
		return
	}

	// 6. Cập nhật trạng thái thông thường
	config.DB.Model(&order).Update("status", input.Status)

	// 7. ĐÃ ĐÓNG GÓI (shipping) => chuyển luôn cho GHN quản lý vận chuyển.
	//    Chạy nền để không làm chậm phản hồi; GHN lỗi chỉ log lại, người bán
	//    vẫn bấm "Chuyển cho GHN" thủ công ở bước sau (idempotent, không trùng).
	if input.Status == "shipping" {
		go autoHandoverToGHNAsync(order.ID)
	}

	notifyOrderEmail(order.ID, "[Boko] Cập nhật đơn hàng",
		"Đơn hàng được cập nhật",
		"Trạng thái đơn hàng của bạn vừa được cập nhật: "+input.Status+".")

	c.JSON(http.StatusOK, gin.H{
		"message": "Cập nhật trạng thái đơn hàng thành công!",
		"status":  input.Status,
	})
}

// autoHandoverToGHN — tạo vận đơn GHN cho đơn đã đóng gói (best effort).
// Trả về lỗi để caller chỉ log, không chặn cập nhật trạng thái.
func autoHandoverToGHN(orderID uint) error {
	cfg := services.GetGHNConfig()
	if !cfg.IsConfigured() {
		return errors.New("chưa cấu hình GHN_TOKEN/GHN_SHOP_ID")
	}

	var existing models.Shipment
	if err := config.DB.Where("order_id = ? AND provider = ?", orderID, "ghn").First(&existing).Error; err == nil {
		return nil // đã có vận đơn thì thôi
	}

	var order models.Order
	if err := config.DB.Preload("Items").Preload("User").First(&order, orderID).Error; err != nil {
		return err
	}
	if order.Status == "completed" || order.Status == "cancelled" {
		return errors.New("đơn đã " + order.Status)
	}

	payload, codAmount, err := buildGHNPayload(order, cfg, ghnHandoverRequest{})
	if err != nil {
		return err
	}

	created, err := services.CreateGHNOrder(payload)
	if err != nil {
		return err
	}

	now := time.Now()
	shipment := models.Shipment{
		OrderID:         order.ID,
		Provider:        "ghn",
		ClientOrderCode: payload.ClientOrderCode,
		OrderCode:       created.Data.OrderCode,
		Status:          "ready_to_pick",
		StatusText:      services.GHNStatusText("ready_to_pick"),
		ServiceTypeID:   payload.ServiceTypeID,
		PaymentTypeID:   payload.PaymentTypeID,
		TotalFee:        created.Data.TotalFee,
		CODAmount:       round2(codAmount),
		Leadtime:        services.ParseGHNTime(created.Data.ExpectedDeliveryTime),
		LastSyncedAt:    &now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if raw, marshalErr := json.Marshal(created.Data); marshalErr == nil {
		shipment.Payload = string(raw)
	}
	if err := config.DB.Create(&shipment).Error; err != nil {
		return err
	}
	recordShipmentEvent(order.ID, shipment.ID, shipment.Status, "auto")
	return nil
}
