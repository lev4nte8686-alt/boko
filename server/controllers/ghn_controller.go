package controllers

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
	"boko/services"
)

// ==================== TÍCH HỢP GHN VÀO SHIPPING ====================
//
// Nguyên tắc: đơn hàng chỉ chuyển sang GHN quản lý SAU KHI ĐÃ ĐÓNG GÓI
// (trạng thái "shipping"). GHN đảm nhận lấy hàng — vận chuyển — thu tiền COD.
// Người mua vẫn bấm "Tôi đã nhận được hàng" (confirm-receipt) để chốt đơn.

// ghnHandoverRequest — cho phép chỉnh đích đến (phục vụ môi trường test)
type ghnHandoverRequest struct {
	ToName        string  `json:"to_name"`
	ToPhone       string  `json:"to_phone"`
	ToAddress     string  `json:"to_address"`
	ToDistrictID  int     `json:"to_district_id"`
	ToWardCode    string  `json:"to_ward_code"`
	ToDistrictName string `json:"to_district_name"`
	ToWardName    string  `json:"to_ward_name"`
	ToProvinceName string `json:"to_province_name"`
	Note          string  `json:"note"`
}

// ghnAutoHandoverEnabled — có tự động đẩy đơn mới sang GHN (tạo vận đơn THẬT)
// hay không. Mặc định BẬT. Đặt GHN_AUTO_HANDOVER=false để tạm KHÔNG tạo vận đơn
// thật (vẫn dùng địa chỉ + phí GHN bình thường), chỉ chuyển khi người bán bấm tay.
func ghnAutoHandoverEnabled() bool {
	raw := strings.TrimSpace(os.Getenv("GHN_AUTO_HANDOVER"))
	if raw == "" {
		return true
	}
	switch strings.ToLower(raw) {
	case "false", "0", "no", "off":
		return false
	default:
		return true
	}
}

// autoHandoverToGHNAsync — chuyển đơn mới cho GHN ở chế độ nền.
// KHÔNG BAO GIỜ làm hỏng luồng tạo đơn: GHN lỗi chỉ log lại, người bán vẫn
// bấm "Chuyển cho GHN" thủ công sau. Có retry vì đơn vừa tạo có thể chưa
// commit xong khi goroutine chạy tới.
// Bỏ qua hoàn toàn khi GHN_AUTO_HANDOVER=false.
func autoHandoverToGHNAsync(orderID uint) {
	if !ghnAutoHandoverEnabled() {
		return
	}
	go func() {
		time.Sleep(3 * time.Second)
		for attempt := 1; attempt <= 3; attempt++ {
			if err := autoHandoverToGHN(orderID); err != nil {
				fmt.Printf("ghn: tự động chuyển đơn %d sang GHN thất bại (lần %d): %v\n", orderID, attempt, err)
				time.Sleep(time.Duration(attempt) * 3 * time.Second)
				continue
			}
			return
		}
	}()
}

// ghnPermissionOK — admin luôn được phép; còn lại phải là người bán TẤT CẢ
func ghnPermissionOK(c *gin.Context, order models.Order) bool {
	role, _ := c.Get("role")
	if role == "admin" {
		return true
	}
	userID, _ := c.Get("user_id")
	var uid uint
	if id, ok := userID.(uint); ok {
		uid = id
	}
	if uid == 0 {
		return false
	}

	var totalItems int64
	config.DB.Model(&models.OrderItem{}).Where("order_id = ?", order.ID).Count(&totalItems)

	var sellerItems int64
	config.DB.Table("order_items").
		Joins("JOIN books ON books.id = order_items.book_id").
		Where("order_items.order_id = ? AND books.user_id = ?", order.ID, uid).
		Count(&sellerItems)

	return totalItems > 0 && sellerItems == totalItems
}

// ghnCanViewOrder — người mua chủ đơn, admin hoặc người bán đều xem được vận đơn
func ghnCanViewOrder(c *gin.Context, order models.Order) bool {
	if ghnPermissionOK(c, order) {
		return true
	}
	userID, _ := c.Get("user_id")
	if uid, ok := userID.(uint); ok && uid > 0 && order.UserID == uid {
		return true
	}
	return false
}

// buildGHNPayload — dựng payload gửi GHN từ đơn hàng đã đóng gói.
// Trả về payload, số tiền COD GHN sẽ thu hộ và lỗi (nếu không đủ thông tin).
func buildGHNPayload(order models.Order, cfg services.GHNConfig, req ghnHandoverRequest) (services.GHNCreateOrderRequest, float64, error) {
	// Tuổi/tác giả người nhận
	toName := strings.TrimSpace(req.ToName)
	toPhone := strings.TrimSpace(req.ToPhone)
	if toPhone == "" {
		toPhone = order.Phone
	}
	if toName == "" {
		if order.User != nil {
			if name, err := config.DecryptString(order.User.Name); err == nil && strings.TrimSpace(name) != "" {
				toName = strings.TrimSpace(name)
			} else {
				toName = order.User.Name
			}
		}
	}
	if toName == "" {
		toName = "Người nhận Boko"
	}
	if strings.TrimSpace(toPhone) == "" {
		return services.GHNCreateOrderRequest{}, 0, fmt.Errorf("Đơn hàng chưa có số điện thoại người nhận")
	}

	toAddress := strings.TrimSpace(req.ToAddress)
	if toAddress == "" {
		toAddress = order.ShippingAddress
	}
	if toAddress == "" {
		return services.GHNCreateOrderRequest{}, 0, fmt.Errorf("Đơn hàng chưa có địa chỉ giao hàng")
	}

	// Quy đổi địa chỉ → DistrictID + WardCode
	var dest *services.GHNDestination
	if req.ToDistrictID > 0 && req.ToWardCode != "" {
		dest = &services.GHNDestination{
			DistrictID:   req.ToDistrictID,
			WardCode:     req.ToWardCode,
			DistrictName: pick(req.ToDistrictName, cfg.ToDistrictName),
			WardName:     pick(req.ToWardName, cfg.ToWardName),
			ProvinceName: pick(req.ToProvinceName, cfg.ToProvinceName),
		}
	} else if order.ToDistrictID > 0 && strings.TrimSpace(order.ToWardCode) != "" {
		// Ưu tiên mã địa chỉ đã lưu trên đơn (khách chọn từ dropdown GHN) —
		// chính xác hơn hẳn việc suy lại từ chuỗi địa chỉ tự do.
		dest = &services.GHNDestination{
			DistrictID: order.ToDistrictID,
			WardCode:   order.ToWardCode,
			// Tên chỉ để hiển thị trên nhãn: điền nếu suy ra được, không thì thôi
			// (GHN định tuyến theo mã).
			WardName: services.WardNameByCode(order.ToDistrictID, order.ToWardCode),
		}
		if d, err := cfg.ResolveDestination(toAddress); err == nil && d != nil && d.DistrictID == order.ToDistrictID {
			if dest.DistrictName == "" {
				dest.DistrictName = d.DistrictName
			}
			if dest.ProvinceName == "" {
				dest.ProvinceName = d.ProvinceName
			}
			if dest.WardName == "" {
				dest.WardName = d.WardName
			}
		}
	} else {
		d, err := cfg.ResolveDestination(toAddress)
		if err != nil {
			return services.GHNCreateOrderRequest{}, 0, err
		}
		dest = d
	}

	// Khối lượng: mỗi cuốn sách mặc định 350g + bưu kiện đóng gói
	totalWeight := cfg.PackageWeight
	items := make([]services.GHNItem, 0, len(order.Items))
	itemWeight := cfg.ItemWeight
	if itemWeight <= 0 {
		itemWeight = 350
	}
	for _, it := range order.Items {
		qty := it.Quantity
		if qty <= 0 {
			qty = 1
		}
		totalWeight += itemWeight * qty
		items = append(items, services.GHNItem{
			Name:     it.Title,
			Code:     fmt.Sprintf("BOKO-%d", it.BookID),
			Quantity: qty,
			Price:    int(it.Price),
			Weight:   itemWeight,
			Length:   cfg.Length,
			Width:    cfg.Width,
			Height:   cfg.Height,
		})
	}

	totalQty := 0
	for _, it := range order.Items {
		totalQty += it.Quantity
	}
	content := fmt.Sprintf("Sách Boko: %d cuốn (đơn #%d)", totalQty, order.ID)
	if totalQty <= 0 {
		// Đơn tạo từ cổng thanh toán (chưa có chi tiết mặt hàng)
		content = fmt.Sprintf("Đơn hàng Boko #%d", order.ID)
	}

	// COD: chỉ gửi GHN thu hộ khi đơn thanh toán khi nhận hàng và chưa trả tiền
	codAmount := 0.0
	if order.PaymentMethod == "cod" && order.PaymentStatus != "paid" {
		codAmount = order.Total
	}
	if codAmount < 0 {
		codAmount = 0
	}

	note := strings.TrimSpace(req.Note)
	if note == "" {
		note = fmt.Sprintf("Đơn sách Boko #%d. Gọi trước khi giao.", order.ID)
	}

	payload := services.GHNCreateOrderRequest{
		PaymentTypeID:    cfg.PaymentTypeID,
		RequiredNote:     cfg.RequiredNote,
		ClientOrderCode:  fmt.Sprintf("BOKO-%d", order.ID),
		FromName:         cfg.FromName,
		FromPhone:        cfg.FromPhone,
		FromAddress:      cfg.FromAddress,
		FromWardName:     cfg.FromWardName,
		FromDistrictName: cfg.FromDistrictName,
		FromProvinceName: cfg.FromProvinceName,
		ReturnName:         cfg.ReturnName,
		ReturnPhone:        cfg.ReturnPhone,
		ReturnAddress:      cfg.ReturnAddress,
		ReturnWardName:     cfg.ReturnWardName,
		ReturnDistrictName: cfg.ReturnDistrictName,
		ReturnProvinceName: cfg.ReturnProvinceName,
		ToName:           toName,
		ToPhone:          toPhone,
		ToAddress:        toAddress,
		ToWardName:       dest.WardName,
		ToDistrictName:   dest.DistrictName,
		ToProvinceName:   dest.ProvinceName,
		ToDistrictID:     dest.DistrictID,
		ToWardCode:       dest.WardCode,
		CODAmount:        int(codAmount),
		CodFailedAmount:  0,
		InsuranceValue:   int(order.Total),
		OrderValue:       int(order.Total),
		ServiceTypeID:    cfg.ServiceTypeID,
		Content:          content,
		Note:             note,
		Weight:           totalWeight,
		Length:           cfg.Length,
		Width:            cfg.Width,
		Height:           cfg.Height,
		Items:            items,
	}
	return payload, codAmount, nil
}

func pick(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// recordShipmentEvent — ghi 1 mốc hành trình vận đơn.
// Bỏ qua nếu trùng trạng thái với mốc ngay trước đó (webhook GHN gửi trùng).
func recordShipmentEvent(orderID, shipmentID uint, status, source string) {
	status = strings.TrimSpace(status)
	if status == "" {
		return
	}
	var last models.ShipmentEvent
	if err := config.DB.Where("shipment_id = ?", shipmentID).Order("id desc").First(&last).Error; err == nil {
		if last.Status == status {
			return
		}
	}
	config.DB.Create(&models.ShipmentEvent{
		OrderID:    orderID,
		ShipmentID: shipmentID,
		Status:     status,
		StatusText: services.GHNStatusText(status),
		Source:     source,
		CreatedAt:  time.Now(),
	})
}

// ghnTrackingPayload — gói shipment + lịch sử + hành trình 6 chặng cho UI
func ghnTrackingPayload(order models.Order, shipment models.Shipment) gin.H {
	var events []models.ShipmentEvent
	config.DB.Where("shipment_id = ?", shipment.ID).Order("id asc").Find(&events)

	history := make([]services.GHNEventInput, 0, len(events))
	for _, e := range events {
		history = append(history, services.GHNEventInput{Status: e.Status, At: e.CreatedAt})
	}

	cfg := services.GetGHNConfig()
	isTest := strings.Contains(strings.ToLower(cfg.BaseURL), "dev-") ||
		strings.Contains(strings.ToLower(cfg.BaseURL), "staging") ||
		strings.Contains(strings.ToLower(cfg.BaseURL), "test")

	return gin.H{
		"shipment":     shipment,
		"history":      events,
		"journey":      services.BuildGHNJourney(shipment.Status, history),
		"order_status": order.Status,
		// Đơn test (gateway staging) không tồn tại trên trang GHN production —
		// UI dùng cờ này để hướng dẫn tra cứu ngay trong Boko.
		"ghn_test_mode": isTest,
	}
}

// HandoverToGHN — POST /api/orders/:id/ghn/handover
func HandoverToGHN(c *gin.Context) {
	orderID := c.Param("id")
	cfg := services.GetGHNConfig()
	if !cfg.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": cfg.NotConfiguredError().Error(),
		})
		return
	}

	var req ghnHandoverRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req = ghnHandoverRequest{}
	}

	var order models.Order
	if err := config.DB.Preload("Items").Preload("User").First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}
	if !ghnPermissionOK(c, order) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Chỉ người bán (hoặc admin) của đơn hàng mới được chuyển đơn sang GHN",
		})
		return
	}

	// Idempotent: đã có vận đơn GHN thì không tạo nữa
	var existing models.Shipment
	if err := config.DB.Where("order_id = ? AND provider = ?", order.ID, "ghn").First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message":      "Đơn hàng đã được chuyển cho GHN trước đó.",
			"shipment":     existing,
			"order_status": order.Status,
			"duplicated":   true,
		})
		return
	}

	if order.Status == "completed" || order.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Không thể chuyển đơn đã \"%s\" cho GHN", order.Status),
		})
		return
	}

	payload, codAmount, err := buildGHNPayload(order, cfg, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, err := services.CreateGHNOrder(payload)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
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
	if raw, err := json.Marshal(created.Data); err == nil {
		shipment.Payload = string(raw)
	}

	if err := config.DB.Create(&shipment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":      "GHN đã tạo vận đơn nhưng không lưu được vào hệ thống: " + err.Error(),
			"order_code": shipment.OrderCode,
		})
		return
	}
	recordShipmentEvent(order.ID, shipment.ID, shipment.Status, "handover")

	// Sau khi đóng gói xong là chuyển sang GHN quản lý → đơn vào trạng thái giao
	if order.Status == "pending" || order.Status == "confirmed" {
		if err := config.DB.Model(&models.Order{}).
			Where("id = ? AND status IN ('pending','confirmed')", order.ID).
			Update("status", "shipping").Error; err != nil {
			fmt.Printf("ghn: cập nhật trạng thái đơn %d thất bại: %v\n", order.ID, err)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":      "Đã chuyển đơn cho GHN quản lý vận chuyển.",
		"shipment":     shipment,
		"order_status": "shipping",
	})
}

// GetOrderShipment — GET /api/orders/:id/ghn
func GetOrderShipment(c *gin.Context) {
	orderID := c.Param("id")

	var order models.Order
	if err := config.DB.First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}
	if !ghnCanViewOrder(c, order) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Bạn không có quyền xem thông tin vận chuyển của đơn hàng này",
		})
		return
	}

	var shipment models.Shipment
	err := config.DB.Where("order_id = ?", order.ID).Order("id desc").First(&shipment).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"shipment": nil,
			"message":  "Đơn hàng chưa được chuyển cho GHN quản lý vận chuyển.",
		})
		return
	}

	resp := ghnTrackingPayload(order, shipment)
	resp["message"] = "OK"
	c.JSON(http.StatusOK, resp)
}

// SyncOrderShipment — POST /api/orders/:id/ghn/sync
// Chủ động hỏi GHN trạng thái mới nhất của vận đơn (webhook chưa tới hoặc test).
func SyncOrderShipment(c *gin.Context) {
	orderID := c.Param("id")

	var order models.Order
	if err := config.DB.First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy đơn hàng"})
		return
	}
	if !ghnCanViewOrder(c, order) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Bạn không có quyền đồng bộ vận chuyển của đơn hàng này",
		})
		return
	}

	var shipment models.Shipment
	if err := config.DB.Where("order_id = ? AND provider = ?", order.ID, "ghn").First(&shipment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Đơn hàng chưa được chuyển cho GHN quản lý vận chuyển.",
		})
		return
	}

	detail, err := services.GetGHNOrderDetail(shipment.OrderCode)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	applyGHNStatus(&shipment, detail)
	recordShipmentEvent(order.ID, shipment.ID, shipment.Status, "sync")

	resp := ghnTrackingPayload(order, shipment)
	resp["message"] = "Đã đồng bộ trạng thái vận đơn từ GHN."
	c.JSON(http.StatusOK, resp)
}

// GHNWebhook — POST /api/ghn/webhook
// GHN gọi ngược khi trạng thái đơn thay đổi. Endpoint phải trả 2xx để GHN
// không gửi lại, và phải idempotent (GHN có thể gửi trùng cùng một sự kiện).
func GHNWebhook(c *gin.Context) {
	cfg := services.GetGHNConfig()

	// Bắt buộc xác thực webhook (fail-closed): nếu chưa cấu hình secret thì từ chối
	// để không ai giả mạo sự kiện đổi trạng thái đơn hàng.
	if cfg.WebhookSecret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "GHN webhook chưa được cấu hình secret"})
		return
	}
	incoming := c.GetHeader("X-GHN-Webhook-Secret")
	if incoming == "" {
		incoming = c.Query("secret")
	}
	if incoming == "" {
		// GHN không gửi được header/query tuỳ biến -> cho phép đặt secret trong
		// đường dẫn: POST /api/ghn/webhook/<secret>
		incoming = c.Param("secret")
	}
	if subtle.ConstantTimeCompare([]byte(incoming), []byte(cfg.WebhookSecret)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Webhook secret không đúng"})
		return
	}

	var event struct {
		ShopID        int    `json:"ShopID"`
		OrderCode     string `json:"OrderCode"`
		ClientOrderCode string `json:"ClientOrderCode"`
		Type          string `json:"Type"`
		Status        string `json:"Status"`
		Reason        string `json:"Reason"`
		CODAmount     int    `json:"CODAmount"`
		Time          string `json:"Time"`
		TotalFee      int    `json:"TotalFee"`
		Weight        int    `json:"Weight"`
		ShipperName   string `json:"ShipperName"`
		ShipperPhone  string `json:"ShipperPhone"`
		PodURL        string `json:"PodURL"`
	}
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload webhook không hợp lệ"})
		return
	}

	orderCode := strings.TrimSpace(event.OrderCode)
	if orderCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thiếu OrderCode"})
		return
	}

	var shipment models.Shipment
	if err := config.DB.Where("order_code = ?", orderCode).First(&shipment).Error; err != nil {
		// Không tìm thấy vận đơn: vẫn trả 200 để GHN ngừng retry
		c.JSON(http.StatusOK, gin.H{"message": "Không tìm thấy vận đơn phù hợp"})
		return
	}

	// Với sự kiện cập nhật trạng thái thì hỏi lại GHN cho chắc (webhook test
	// gửi không đầy đủ), các sự kiện khác chỉ lưu nhật ký.
	if event.Type == "" || event.Type == "switch_status" {
		if detail, err := services.GetGHNOrderDetail(orderCode); err == nil {
			applyGHNStatus(&shipment, detail)
		}
	}
	if event.Status != "" && (shipment.Status == "" || shipment.Status != event.Status) {
		shipment.Status = event.Status
		shipment.StatusText = services.GHNStatusText(event.Status)
	}

	now := time.Now()
	shipment.LastSyncedAt = &now
	shipment.UpdatedAt = now
	config.DB.Save(&shipment)
	recordShipmentEvent(shipment.OrderID, shipment.ID, shipment.Status, "webhook")

	// Lưu nhật ký webhook để đối soát
	dbg, _ := json.Marshal(event)
	shipment.Payload = truncateForDB(fmt.Sprintf("%s\n[webhook %s] %s", shipment.Payload, now.Format(time.RFC3339), string(dbg)), 8000)

	c.JSON(http.StatusOK, gin.H{"message": "Đã ghi nhận trạng thái từ GHN"})
}

// applyGHNStatus — cập nhật shipment từ dữ liệu GHN trả về
func applyGHNStatus(shipment *models.Shipment, detail *services.GHNOrderDetail) {
	now := time.Now()
	shipment.Status = detail.Status
	shipment.StatusText = services.GHNStatusText(detail.Status)
	if detail.ClientOrderCode != "" {
		shipment.ClientOrderCode = detail.ClientOrderCode
	}
	if detail.TotalFee > 0 {
		shipment.TotalFee = detail.TotalFee
	}
	if lead := services.ParseGHNTime(detail.Leadtime); lead != nil {
		shipment.Leadtime = lead
	}
	shipment.LastSyncedAt = &now
	shipment.UpdatedAt = now
	config.DB.Save(shipment)
}

func round2(f float64) float64 {
	if f < 0 {
		f = 0
	}
	return float64(int64(f*100)) / 100
}

func truncateForDB(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[len(s)-max:]
}
