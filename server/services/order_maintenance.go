package services

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"boko/config"
	"boko/models"
)

// PendingOrderTTL — thời gian sống tối đa (mặc định 30 phút) của một đơn
// thanh toán trực tuyến còn "pending" + "unpaid" trước khi bị huỷ tự động.
// Cấu hình qua env PENDING_ORDER_TTL_MINUTES.
func PendingOrderTTL() time.Duration {
	return durationFromEnvMinutes("PENDING_ORDER_TTL_MINUTES", 30)
}

// pendingOrderSweepInterval — nhịp quét nền, mặc định 5 phút.
// Cấu hình qua env PENDING_ORDER_SWEEP_MINUTES.
func pendingOrderSweepInterval() time.Duration {
	return durationFromEnvMinutes("PENDING_ORDER_SWEEP_MINUTES", 5)
}

func durationFromEnvMinutes(key string, fallback int) time.Duration {
	minutes := fallback
	if raw := strings.TrimSpace(os.Getenv(key)); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			minutes = n
		}
	}
	return time.Duration(minutes) * time.Minute
}

// StartPendingOrderReaper — khởi động tiến trình nền định kỳ huỷ các đơn online
// treo (chưa thanh toán) quá hạn, đồng thời hoàn tồn kho nếu đơn đã trừ kho.
// Chạy 1 lần ngay khi khởi động rồi lặp theo PENDING_ORDER_SWEEP_MINUTES.
func StartPendingOrderReaper() {
	ttl := PendingOrderTTL()
	interval := pendingOrderSweepInterval()

	go func() {
		runPendingOrderSweep(ttl)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			runPendingOrderSweep(ttl)
		}
	}()

	log.Printf("reaper: đã bật tiến trình huỷ đơn treo (TTL=%s, quét mỗi %s)", ttl, interval)
}

func runPendingOrderSweep(ttl time.Duration) {
	count, err := CancelStalePendingOrders(ttl)
	if err != nil {
		log.Printf("reaper: lỗi khi quét đơn treo: %v", err)
		return
	}
	if count > 0 {
		log.Printf("reaper: đã huỷ %d đơn online chưa thanh toán quá %s", count, ttl)
	}
}

// CancelStalePendingOrders — huỷ mọi đơn "pending" + "unpaid" tạo trước
// (now - ttl) và hoàn tồn kho nếu đơn đã trừ kho. Trả về số đơn đã huỷ.
// Tách riêng để unit test gọi trực tiếp mà không cần chờ ticker.
func CancelStalePendingOrders(ttl time.Duration) (int, error) {
	cutoff := time.Now().Add(-ttl)

	var stale []models.Order
	if err := config.DB.
		Where("status = ? AND payment_status = ? AND created_at < ?", "pending", "unpaid", cutoff).
		Find(&stale).Error; err != nil {
		return 0, err
	}

	cancelled := 0
	for _, o := range stale {
		ok, err := cancelStalePendingOrder(o.ID)
		if err != nil {
			log.Printf("reaper: không huỷ được đơn #%d: %v", o.ID, err)
			continue
		}
		if ok {
			cancelled++
		}
	}
	return cancelled, nil
}

// cancelStalePendingOrder — huỷ 1 đơn trong transaction, hoàn kho nếu đã trừ.
// Trả về true nếu đơn thực sự được chuyển sang "cancelled".
func cancelStalePendingOrder(orderID uint) (bool, error) {
	changed := false
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		q := tx.Preload("Items").Where("id = ?", orderID)
		// SQLite (dùng cho test) không hỗ trợ FOR UPDATE; Postgres thì có.
		if tx.Dialector.Name() != "sqlite" {
			q = q.Clauses(clause.Locking{Strength: "UPDATE"})
		}

		var order models.Order
		if err := q.First(&order).Error; err != nil {
			return err
		}

		// Guard chống huỷ lặp (race giữa nhiều instance / ticker trùng nhịp).
		if order.Status != "pending" || order.PaymentStatus != "unpaid" {
			return nil
		}

		if err := tx.Model(&order).Update("status", "cancelled").Error; err != nil {
			return err
		}

		if order.StockDeducted {
			if err := tx.Model(&order).Update("stock_deducted", false).Error; err != nil {
				return err
			}
			for _, it := range order.Items {
				res := tx.Model(&models.Book{}).Where("id = ?", it.BookID).
					Update("stock", gorm.Expr("stock + ?", it.Quantity))
				if res.Error != nil {
					return res.Error
				}
			}
		}

		changed = true
		return nil
	})
	return changed, err
}
