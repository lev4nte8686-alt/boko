package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// getEnvTrim — đọc biến môi trường đã trim, dùng fallback nếu trống
func getEnvTrim(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// getEnvInt — đọc biến môi trường kiểu số, dùng fallback nếu lỗi
func getEnvInt(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// ==================== TÍCH HỢP GHN (GIAO HÀNG NHANH) — TEST/DEV ====================
//
// Luồng: đơn hàng đã đóng gói (status "shipping") được chuyển sang GHN quản lý
// vận chuyển. Boko gọi API tạo vận đơn, lưu lại mã vận đơn (order_code) để tra
// cứu trạng thái. GHN cập nhật trạng thái qua webhook hoặc ta chủ động đồng bộ.
// Người mua vẫn bấm "Tôi đã nhận được hàng" để chốt đơn hoàn tất.

// GHNConfig — cấu hình kết nối GHN, đọc từ biến môi trường (xem .env.example).
// Môi trường test/dev: https://dev-online-gateway.ghn.vn (− gateway staging của GHN).
type GHNConfig struct {
	Token    string // Token API do GHN cấp (bắt buộc)
	ShopID   string // Shop ID của shop trên GHN (bắt buộc)
	BaseURL  string // Cổng API: test = dev-online-gateway.ghn.dev, prod = online-gateway.ghn.vn
	FromName string
	FromPhone  string
	FromAddress string
	FromWardName    string
	FromDistrictName string
	FromProvinceName string
	// FromDistrictID / FromWardCode — mã điểm lấy hàng của shop, dùng để tính phí
	// vận chuyển. Để trống thì tự tra cứu từ FromProvince/District/Ward (có cache).
	FromDistrictID int
	FromWardCode   string
	ReturnName     string
	ReturnPhone    string
	ReturnAddress  string
	ReturnWardName    string
	ReturnDistrictName string
	ReturnProvinceName string
	ServiceTypeID int  // 2: dưới 20kg, 5: trên 20kg / nhiều kiện
	PaymentTypeID int  // 1: shop trả cước, 2: người nhận trả
	RequiredNote  string // CHOTHUHANG | CHOXEMHANG | KHONGCHOXEMHANG | KHONGCHOTHUDHANG
	ItemWeight    int    // gram / 1 cuốn sách
	PackageWeight int    // gram / bưu kiện (hộp, chống sốc)
	Length        int    // cm
	Width         int
	Height        int
	ToDistrictID   int    // quận/huyện mặc định cho môi trường test
	ToWardCode     string // phường/xã mặc định cho môi trường test
	ToDistrictName string
	ToWardName     string
	ToProvinceName string
	WebhookSecret  string // bảo vệ webhook (tuỳ chọn nhưng khuyến nghị)
}

// GetGHNConfig — đọc cấu hình GHN từ biến môi trường
func GetGHNConfig() GHNConfig {
	return GHNConfig{
		Token:    strings.TrimSpace(os.Getenv("GHN_TOKEN")),
		ShopID:   strings.TrimSpace(os.Getenv("GHN_SHOP_ID")),
		BaseURL:  strings.TrimRight(getEnvTrim("GHN_BASE_URL", "https://dev-online-gateway.ghn.vn"), "/"),
		FromName: getEnvTrim("GHN_FROM_NAME", "Boko Bookstore"),
		FromPhone: strings.TrimSpace(os.Getenv("GHN_FROM_PHONE")),
		FromAddress: getEnvTrim("GHN_FROM_ADDRESS", "Số 1 Đường Sách, Phường Bến Nghé"),
		FromWardName:    getEnvTrim("GHN_FROM_WARD_NAME", "Phường Bến Nghé"),
		FromDistrictName: getEnvTrim("GHN_FROM_DISTRICT_NAME", "Quận 1"),
		FromProvinceName: getEnvTrim("GHN_FROM_PROVINCE_NAME", "TP. Hồ Chí Minh"),
		FromDistrictID:  getEnvInt("GHN_FROM_DISTRICT_ID", 0),
		FromWardCode:    strings.TrimSpace(os.Getenv("GHN_FROM_WARD_CODE")),
		ReturnName:     getEnvTrim("GHN_FROM_NAME", "Boko Bookstore"),
		ReturnPhone:    strings.TrimSpace(os.Getenv("GHN_FROM_PHONE")),
		ReturnAddress:  getEnvTrim("GHN_FROM_ADDRESS", "Số 1 Đường Sách, Phường Bến Nghé"),
		ReturnWardName:    getEnvTrim("GHN_FROM_WARD_NAME", "Phường Bến Nghé"),
		ReturnDistrictName: getEnvTrim("GHN_FROM_DISTRICT_NAME", "Quận 1"),
		ReturnProvinceName: getEnvTrim("GHN_FROM_PROVINCE_NAME", "TP. Hồ Chí Minh"),
		ServiceTypeID: getEnvInt("GHN_SERVICE_TYPE_ID", 2),
		PaymentTypeID: getEnvInt("GHN_PAYMENT_TYPE_ID", 1),
		RequiredNote:  getEnvTrim("GHN_REQUIRED_NOTE", "KHONGCHOXEMHANG"),
		ItemWeight:    getEnvInt("GHN_ITEM_WEIGHT", 350),
		PackageWeight: getEnvInt("GHN_PACKAGE_WEIGHT", 150),
		Length:        getEnvInt("GHN_PARCEL_LENGTH", 20),
		Width:         getEnvInt("GHN_PARCEL_WIDTH", 15),
		Height:        getEnvInt("GHN_PARCEL_HEIGHT", 6),
		ToDistrictID:   getEnvInt("GHN_TO_DISTRICT_ID", 0),
		ToWardCode:     strings.TrimSpace(os.Getenv("GHN_TO_WARD_CODE")),
		ToDistrictName: getEnvTrim("GHN_TO_DISTRICT_NAME", "Quận 1"),
		ToWardName:     getEnvTrim("GHN_TO_WARD_NAME", "Phường Bến Nghé"),
		ToProvinceName: getEnvTrim("GHN_TO_PROVINCE_NAME", "TP. Hồ Chí Minh"),
		WebhookSecret:  strings.TrimSpace(os.Getenv("GHN_WEBHOOK_SECRET")),
	}
}

// IsConfigured — GHN được coi là sẵn sàng khi có Token + ShopID
func (c GHNConfig) IsConfigured() bool {
	return c.Token != "" && c.ShopID != ""
}

// NotConfiguredError — thông báo thân thiện khi chưa set credential test
func (c GHNConfig) NotConfiguredError() error {
	return fmt.Errorf("Chưa cấu hình GHN. Vui lòng set GHN_TOKEN và GHN_SHOP_ID (môi trường test) trong server/.env")
}

// ==================== PAYLOAD GỬI LÊN GHN ====================

// GHNItem — mặt hàng trong bưu kiện
type GHNItem struct {
	Name     string `json:"name"`
	Code     string `json:"code"`
	Quantity int    `json:"quantity"`
	Price    int    `json:"price"`
	Weight   int    `json:"weight"`
	Length   int    `json:"length"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

// GHNCreateOrderRequest — thân request tạo vận đơn (API v2)
type GHNCreateOrderRequest struct {
	PaymentTypeID   int       `json:"payment_type_id"`
	RequiredNote    string    `json:"required_note"`
	ClientOrderCode string    `json:"client_order_code"`

	FromName         string `json:"from_name"`
	FromPhone        string `json:"from_phone"`
	FromAddress      string `json:"from_address"`
	FromWardName     string `json:"from_ward_name"`
	FromDistrictName string `json:"from_district_name"`
	FromProvinceName string `json:"from_province_name"`

	ReturnName         string `json:"return_name"`
	ReturnPhone        string `json:"return_phone"`
	ReturnAddress      string `json:"return_address"`
	ReturnWardName     string `json:"return_ward_name"`
	ReturnDistrictName string `json:"return_district_name"`
	ReturnProvinceName string `json:"return_province_name"`

	ToName         string `json:"to_name"`
	ToPhone        string `json:"to_phone"`
	ToAddress      string `json:"to_address"`
	ToWardName     string `json:"to_ward_name"`
	ToDistrictName string `json:"to_district_name"`
	ToProvinceName string `json:"to_province_name"`
	ToDistrictID   int    `json:"to_district_id,omitempty"`
	ToWardCode     string `json:"to_ward_code,omitempty"`

	CODAmount      int `json:"cod_amount"`      // tiền COD GHN thu hộ (0 nếu đã thanh toán)
	CodFailedAmount int  `json:"cod_failed_amount"`
	InsuranceValue int   `json:"insurance_value"`
	OrderValue     int   `json:"order_value"`
	ServiceTypeID  int   `json:"service_type_id"`
	Content        string `json:"content"`
	Note           string `json:"note"`
	Weight         int    `json:"weight"`
	Length         int    `json:"length"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	PickShift      []int  `json:"pick_shift,omitempty"`
	Items          []GHNItem `json:"items"`
}

// GHNCreateOrderResponse — kết quả tạo vận đơn
type GHNCreateOrderResponse struct {
	Code        int    `json:"code"`
	Message     string `json:"message"`
	CodeMessage string `json:"code_message"` // một số phiên bản GHN trả code_message
	Data        struct {
		OrderCode             string `json:"order_code"`
		SortCode              string `json:"sort_code"`
		TotalFee              int64  `json:"total_fee"`
		ExpectedDeliveryTime  string `json:"expected_delivery_time"`
		OperationPartner      string `json:"operation_partner"`
	} `json:"data"`
}

// ErrText — thông báo lỗi GHN quy về 1 chuỗi
func (r *GHNCreateOrderResponse) ErrText() string {
	if r.CodeMessage != "" {
		return r.CodeMessage
	}
	return r.Message
}

// GHNOrderDetail — thông tin vận đơn trả về khi tra cứu
type GHNOrderDetail struct {
	OrderCode        string `json:"order_code"`
	ClientOrderCode  string `json:"client_order_code"`
	Status           string `json:"status"`
	ShopID           int    `json:"shop_id"`
	FromName         string `json:"from_name"`
	FromPhone        string `json:"from_phone"`
	FromAddress      string `json:"from_address"`
	ToName           string `json:"to_name"`
	ToPhone          string `json:"to_phone"`
	ToAddress        string `json:"to_address"`
	CODAmount        int64  `json:"cod_amount"`
	IsCODCollected   bool   `json:"is_cod_collected"`
	TotalFee         int64  `json:"total_fee"`
	InsuranceValue   int64  `json:"insurance_value"`
	ServiceTypeID    int    `json:"service_type_id"`
	PaymentTypeID    int    `json:"payment_type_id"`
	RequiredNote     string `json:"required_note"`
	Content          string `json:"content"`
	Note             string `json:"note"`
	Leadtime         string `json:"leadtime"`
	CreatedDate      string `json:"created_date"`
	UpdatedDate      string `json:"updated_date"`
}

// GHNDetailResponse — vỏ response của API tra cứu vận đơn
type GHNDetailResponse struct {
	Code        int            `json:"code"`
	Message     string         `json:"message"`
	CodeMessage string         `json:"code_message"`
	Data        GHNOrderDetail `json:"data"`
}

func (r *GHNDetailResponse) ErrText() string {
	if r.CodeMessage != "" {
		return r.CodeMessage
	}
	return r.Message
}

// ==================== GỌI API GHN ====================

func ghnClient() *http.Client {
	return &http.Client{Timeout: 20 * time.Second}
}

func (c GHNConfig) doRequest(method, path string, body interface{}, out interface{}) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("không đóng gói được request GHN: %w", err)
		}
		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Token", c.Token)
	req.Header.Set("ShopId", c.ShopID)
	req.Header.Set("Content-Type", "application/json")

	resp, err := ghnClient().Do(req)
	if err != nil {
		return fmt.Errorf("không kết nối được GHN: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("không đọc được phản hồi GHN: %w", err)
	}

	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("GHN trả về dữ liệu không đúng định dạng: %s", truncateString(string(raw), 200))
	}
	return nil
}

// CreateGHNOrder — tạo vận đơn GHN (bưu kiện do Boko giao cho GHN quản lý)
func CreateGHNOrder(req GHNCreateOrderRequest) (*GHNCreateOrderResponse, error) {
	cfg := GetGHNConfig()
	if !cfg.IsConfigured() {
		return nil, cfg.NotConfiguredError()
	}

	var out GHNCreateOrderResponse
	if err := cfg.doRequest(http.MethodPost, "/shiip/public-api/v2/shipping-order/create", req, &out); err != nil {
		return nil, err
	}
	if out.Code != 200 || out.Data.OrderCode == "" {
		msg := out.ErrText()
		if msg == "" {
			msg = "không rõ nguyên nhân"
		}
		return nil, fmt.Errorf("GHN từ chối tạo vận đơn: %s", msg)
	}
	return &out, nil
}

// GetGHNOrderDetail — tra cứu trạng thái vận đơn theo mã GHN
func GetGHNOrderDetail(orderCode string) (*GHNOrderDetail, error) {
	cfg := GetGHNConfig()
	if !cfg.IsConfigured() {
		return nil, cfg.NotConfiguredError()
	}

	var out GHNDetailResponse
	if err := cfg.doRequest(http.MethodPost, "/shiip/public-api/v2/shipping-order/detail",
		map[string]string{"order_code": orderCode}, &out); err != nil {
		return nil, err
	}
	if out.Code != 200 || out.Data.OrderCode == "" {
		msg := out.ErrText()
		if msg == "" {
			msg = "không rõ nguyên nhân"
		}
		return nil, fmt.Errorf("GHN không trả về vận đơn %s: %s", orderCode, msg)
	}
	return &out.Data, nil
}

// ==================== TRẠNG THÁI GHN ====================

// GHNStatusText — chuyển mã trạng thái GHN sang tiếng Việt cho giao diện
func GHNStatusText(status string) string {
	switch status {
	case "ready_to_pick":
		return "Chờ GHN lấy hàng"
	case "picking":
		return "GHN đang đến lấy hàng"
	case "money_collect_picking":
		return "GHN lấy hàng và thu tiền COD"
	case "picked":
		return "GHN đã lấy hàng"
	case "storing":
		return "Đang ở kho GHN"
	case "sorting":
		return "Đang phân loại bưu kiện"
	case "transporting":
		return "Đang vận chuyển đến kho bạn"
	case "delivering":
		return "GHN đang giao hàng cho bạn"
	case "money_collect_delivering":
		return "GHN đang giao hàng (thu tiền COD)"
	case "delivered":
		return "GHN đã giao hàng"
	case "delivery_fail":
		return "Giao hàng thất bại, GHN sẽ thử lại"
	case "waiting_to_return":
		return "Chờ trả hàng về shop"
	case "return":
		return "Yêu cầu trả hàng về shop"
	case "return_transporting":
		return "Đang vận chuyển hàng trả về shop"
	case "return_sorting":
		return "Đang phân loại hàng trả"
	case "returning":
		return "Đang trả hàng về shop"
	case "return_fail":
		return "Trả hàng thất bại"
	case "returned":
		return "Đã trả hàng về shop"
	case "cancel":
		return "Vận đơn đã hủy"
	case "exception":
		return "Vận đơn cần xử lý thủ công"
	case "lost":
		return "Bưu kiện thất lạc"
	case "damage":
		return "Bưu kiện hư hỏng"
	case "scrap":
		return "Bưu kiện đã bị loại bỏ"
	}
	if status == "" {
		return "Chưa rõ trạng thái"
	}
	return status
}

// GHNIsDelivered — GHN đã bàn giao cho người nhận chưa
func GHNIsDelivered(status string) bool {
	return status == "delivered"
}

// ==================== HÀNH TRÌNH VẬN ĐƠN (CHO NGƯỜI MUA THEO DÕI) ====================

// GHNJourneyStage — 1 chặng trong hành trình vận đơn
type GHNJourneyStage struct {
	Key     string  `json:"key"`
	Title   string  `json:"title"`
	Done    bool    `json:"done"`
	Current bool    `json:"current"`
	Warning bool    `json:"warning"`
	At      *string `json:"at"` // ISO 8601 thời điểm chạm chặng (nếu có)
}

// GHNEventInput — 1 mốc hành trình đã ghi nhận
type GHNEventInput struct {
	Status string
	At     time.Time
}

// GHNStageIndex — ánh xạ trạng thái GHN về chặng 1..5 (0 = vừa tạo vận đơn)
func GHNStageIndex(status string) int {
	switch status {
	case "ready_to_pick", "picking", "money_collect_picking":
		return 1
	case "picked", "storing", "sorting":
		return 2
	case "transporting":
		return 3
	case "delivering", "money_collect_delivering":
		return 4
	case "delivered":
		return 5
	}
	return -1
}

// BuildGHNJourney — dựng 6 chặng hành trình từ trạng thái hiện tại + lịch sử đã ghi.
func BuildGHNJourney(currentStatus string, history []GHNEventInput) []GHNJourneyStage {
	stages := []GHNJourneyStage{
		{Key: "created", Title: "Đã tạo vận đơn"},
		{Key: "ready_to_pick", Title: "Chờ GHN đến lấy hàng"},
		{Key: "picked", Title: "GHN đã lấy hàng"},
		{Key: "transporting", Title: "Đang vận chuyển liên kho"},
		{Key: "delivering", Title: "GHN đang giao hàng cho bạn"},
		{Key: "delivered", Title: "Đã giao hàng"},
	}

	cur := GHNStageIndex(currentStatus)
	// Trạng thái sự cố (giao/trả thất bại...): giữ tiến độ chặng tốt gần nhất
	if cur < 0 {
		for i := len(history) - 1; i >= 0; i-- {
			if idx := GHNStageIndex(history[i].Status); idx >= 0 {
				cur = idx
				break
			}
		}
	}

	for i := range stages {
		switch {
		case cur < 0:
			// Không suy ra được tiến độ: chỉ chặng tạo vận đơn xong
			stages[i].Done = i == 0
			stages[i].Current = i == 0
		case i < cur:
			stages[i].Done = true
		case i == cur:
			if cur == len(stages)-1 {
				stages[i].Done = true
			} else {
				stages[i].Current = true
				stages[i].Warning = GHNIsProblem(currentStatus)
			}
		}
	}

	// Thời điểm chạm từng chặng = mốc sớm nhất có trạng thái thuộc chặng đó
	for i := range stages {
		if i == 0 {
			continue
		}
		for _, h := range history {
			if GHNStageIndex(h.Status) == i {
				at := h.At.Format(time.RFC3339)
				stages[i].At = &at
				break
			}
		}
	}
	if len(history) > 0 {
		at := history[0].At.Format(time.RFC3339)
		stages[0].At = &at
	}
	return stages
}

// GHNIsProblem — vận đơn có vấn đề (giao/trả thất bại, thất lạc, huỷ...)
func GHNIsProblem(status string) bool {
	switch status {
	case "delivery_fail", "return_fail", "exception", "lost", "damage", "cancel", "scrap":
		return true
	}
	return false
}

// ParseGHNTime — GHN trả thời gian ISO 8601 (có thể có nanosecond), trả nil nếu lỗi
func ParseGHNTime(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05.000Z07:00", "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

// ==================== MASTER DATA: SUY RA QUẬN/HUYỆN + PHƯỜNG/XÃ ====================

// GHNDestination — địa chỉ người nhận đã được quy về mã GHN
type GHNDestination struct {
	DistrictID   int
	WardCode     string
	DistrictName string
	WardName     string
	ProvinceName string
}

// ResolveDestination — từ chuỗi địa chỉ tự do (VD "123 ABC, Phường 5, Quận 4, TP.HCM")
// suy ra DistrictID + WardCode bằng master data của GHN. Không tra được thì
// dùng giá trị dự phòng trong .env (GHN_TO_DISTRICT_ID / GHN_TO_WARD_CODE) cho
// môi trường test.
func (c GHNConfig) ResolveDestination(address string) (*GHNDestination, error) {
	parts := splitAddress(address)

	// 1) Quận/Huyện + Phường/Xã (3 phần cuối của địa chỉ, nếu có)
	provinceName, districtName, wardName := lastAddressParts(parts)

	if districtName != "" && wardName != "" {
		if dest, err := c.lookupDestination(provinceName, districtName, wardName); err == nil && dest != nil {
			return dest, nil
		}
	}

	// 2) Dự phòng: giá trị cấu hình cho môi trường test
	if c.ToDistrictID > 0 && c.ToWardCode != "" {
		return &GHNDestination{
			DistrictID:   c.ToDistrictID,
			WardCode:     c.ToWardCode,
			DistrictName: pickFirst(c.ToDistrictName, districtName),
			WardName:     pickFirst(c.ToWardName, wardName),
			ProvinceName: pickFirst(c.ToProvinceName, provinceName),
		}, nil
	}

	return nil, fmt.Errorf("Không suy ra được Quận/Huyện & Phường/Xã từ địa chỉ %q. Hãy set GHN_TO_DISTRICT_ID và GHN_TO_WARD_CODE cho môi trường test", address)
}

// GHNProvince / GHNDistrict / GHNWard — master data công khai cho dropdown chọn
// địa chỉ giao hàng ở frontend (đã chuẩn hoá snake_case).
type GHNProvince struct {
	ProvinceID   int    `json:"province_id"`
	ProvinceName string `json:"province_name"`
}

type GHNDistrict struct {
	DistrictID   int    `json:"district_id"`
	DistrictName string `json:"district_name"`
	ProvinceID   int    `json:"province_id"`
}

type GHNWard struct {
	WardCode   string `json:"ward_code"`
	WardName   string `json:"ward_name"`
	DistrictID int    `json:"district_id"`
}

// Kiểu nhận thô từ GHN (PascalCase)
type ghnProvince struct {
	ProvinceID   int    `json:"ProvinceID"`
	ProvinceName string `json:"ProvinceName"`
}

type ghnDistrict struct {
	DistrictID   int    `json:"DistrictID"`
	DistrictName string `json:"DistrictName"`
	ProvinceID   int    `json:"ProvinceID"`
}

type ghnWard struct {
	WardCode    string `json:"WardCode"`
	WardName    string `json:"WardName"`
	DistrictID  int    `json:"DistrictID"`
	SupportType int    `json:"SupportType"`
}

// ghnMasterData — vỏ phản hồi chung của API master-data GHN v2:
// {"code":200,"message":"Success","data":[...]}
type ghnMasterData[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    []T    `json:"data"`
}

// ==================== CACHE MASTER DATA (GIẢM GỌI GHN) ====================

const masterDataTTL = 6 * time.Hour

type masterDataEntry[T any] struct {
	value     T
	expiresAt time.Time
}

var (
	masterDataMu   sync.Mutex
	provincesCache masterDataEntry[[]GHNProvince]
	districtsCache = map[int]masterDataEntry[[]GHNDistrict]{}
	wardsCache     = map[int]masterDataEntry[[]GHNWard]{}
)

// ListProvinces — danh sách Tỉnh/Thành phố từ GHN (có cache 6 giờ)
func ListProvinces() ([]GHNProvince, error) {
	cfg := GetGHNConfig()
	if !cfg.IsConfigured() {
		return nil, cfg.NotConfiguredError()
	}

	masterDataMu.Lock()
	if provincesCache.value != nil && time.Now().Before(provincesCache.expiresAt) {
		v := provincesCache.value
		masterDataMu.Unlock()
		return v, nil
	}
	masterDataMu.Unlock()

	var resp ghnMasterData[ghnProvince]
	if err := cfg.doRequest(http.MethodGet, "/shiip/public-api/master-data/province", nil, &resp); err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("GHN master-data (province) lỗi: %s", resp.Message)
	}
	out := make([]GHNProvince, 0, len(resp.Data))
	for _, p := range resp.Data {
		out = append(out, GHNProvince{ProvinceID: p.ProvinceID, ProvinceName: p.ProvinceName})
	}

	masterDataMu.Lock()
	provincesCache = masterDataEntry[[]GHNProvince]{value: out, expiresAt: time.Now().Add(masterDataTTL)}
	masterDataMu.Unlock()
	return out, nil
}

// ListDistricts — danh sách Quận/Huyện theo Tỉnh/Thành (có cache 6 giờ)
func ListDistricts(provinceID int) ([]GHNDistrict, error) {
	cfg := GetGHNConfig()
	if !cfg.IsConfigured() {
		return nil, cfg.NotConfiguredError()
	}
	if provinceID <= 0 {
		return nil, fmt.Errorf("thiếu province_id")
	}

	masterDataMu.Lock()
	if e, ok := districtsCache[provinceID]; ok && e.value != nil && time.Now().Before(e.expiresAt) {
		v := e.value
		masterDataMu.Unlock()
		return v, nil
	}
	masterDataMu.Unlock()

	var resp ghnMasterData[ghnDistrict]
	if err := cfg.doRequest(http.MethodGet,
		fmt.Sprintf("/shiip/public-api/master-data/district?province_id=%d", provinceID), nil, &resp); err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("GHN master-data (district) lỗi: %s", resp.Message)
	}
	out := make([]GHNDistrict, 0, len(resp.Data))
	for _, d := range resp.Data {
		out = append(out, GHNDistrict{DistrictID: d.DistrictID, DistrictName: d.DistrictName, ProvinceID: d.ProvinceID})
	}

	masterDataMu.Lock()
	districtsCache[provinceID] = masterDataEntry[[]GHNDistrict]{value: out, expiresAt: time.Now().Add(masterDataTTL)}
	masterDataMu.Unlock()
	return out, nil
}

// ListWards — danh sách Phường/Xã theo Quận/Huyện (có cache 6 giờ)
func ListWards(districtID int) ([]GHNWard, error) {
	cfg := GetGHNConfig()
	if !cfg.IsConfigured() {
		return nil, cfg.NotConfiguredError()
	}
	if districtID <= 0 {
		return nil, fmt.Errorf("thiếu district_id")
	}

	masterDataMu.Lock()
	if e, ok := wardsCache[districtID]; ok && e.value != nil && time.Now().Before(e.expiresAt) {
		v := e.value
		masterDataMu.Unlock()
		return v, nil
	}
	masterDataMu.Unlock()

	var resp ghnMasterData[ghnWard]
	if err := cfg.doRequest(http.MethodGet,
		fmt.Sprintf("/shiip/public-api/master-data/ward?district_id=%d", districtID), nil, &resp); err != nil {
		return nil, err
	}
	if resp.Code != 200 {
		return nil, fmt.Errorf("GHN master-data (ward) lỗi: %s", resp.Message)
	}
	out := make([]GHNWard, 0, len(resp.Data))
	for _, w := range resp.Data {
		out = append(out, GHNWard{WardCode: w.WardCode, WardName: w.WardName, DistrictID: w.DistrictID})
	}

	masterDataMu.Lock()
	wardsCache[districtID] = masterDataEntry[[]GHNWard]{value: out, expiresAt: time.Now().Add(masterDataTTL)}
	masterDataMu.Unlock()
	return out, nil
}

// WardNameByCode — tra tên Phường/Xã theo mã trong 1 Quận/Huyện (dùng cache của
// ListWards). Trả "" nếu không tìm thấy. Dùng để điền tên trên nhãn GHN khi ta
// chỉ có mã đã lưu ở đơn.
func WardNameByCode(districtID int, wardCode string) string {
	if districtID <= 0 || strings.TrimSpace(wardCode) == "" {
		return ""
	}
	wards, err := ListWards(districtID)
	if err != nil {
		return ""
	}
	for _, w := range wards {
		if w.WardCode == wardCode {
			return w.WardName
		}
	}
	return ""
}

// ==================== ĐIỂM LẤY HÀNG + PHÍ VẬN CHUYỂN ====================

var originCache struct {
	sync.Mutex
	districtID int
	wardCode   string
	resolved   bool
}

// Origin — mã Quận/Huyện + Phường/Xã điểm lấy hàng của shop. Ưu tiên biến môi
// trường GHN_FROM_DISTRICT_ID / GHN_FROM_WARD_CODE; nếu thiếu thì tự tra cứu
// theo tên địa chỉ shop (kết quả được cache).
func (c GHNConfig) Origin() (int, string, error) {
	if c.FromDistrictID > 0 && c.FromWardCode != "" {
		return c.FromDistrictID, c.FromWardCode, nil
	}
	if !c.IsConfigured() {
		return 0, "", c.NotConfiguredError()
	}

	originCache.Lock()
	defer originCache.Unlock()
	if originCache.resolved {
		return originCache.districtID, originCache.wardCode, nil
	}

	dest, err := c.lookupDestination(c.FromProvinceName, c.FromDistrictName, c.FromWardName)
	if err != nil {
		return 0, "", err
	}
	originCache.districtID = dest.DistrictID
	originCache.wardCode = dest.WardCode
	originCache.resolved = true
	return dest.DistrictID, dest.WardCode, nil
}

// GHNFeeResponse — phản hồi API tính phí vận chuyển (v2/shipping-order/fee)
type GHNFeeResponse struct {
	Code        int    `json:"code"`
	Message     string `json:"message"`
	CodeMessage string `json:"code_message"`
	Data        struct {
		Total        int64 `json:"total"`
		ServiceFee   int64 `json:"service_fee"`
		InsuranceFee int64 `json:"insurance_fee"`
	} `json:"data"`
}

// CalcGHNFee — tính phí vận chuyển (VND) từ shop đến Quận/Huyện + Phường/Xã người nhận.
// weightGram: tổng khối lượng bưu kiện; insuranceValue: giá trị khai báo (0 = không).
func CalcGHNFee(toDistrictID int, toWardCode string, weightGram int, insuranceValue int) (int64, error) {
	cfg := GetGHNConfig()
	if !cfg.IsConfigured() {
		return 0, cfg.NotConfiguredError()
	}
	if toDistrictID <= 0 || strings.TrimSpace(toWardCode) == "" {
		return 0, fmt.Errorf("thiếu quận/huyện hoặc phường/xã người nhận")
	}

	fromDistrict, fromWard, err := cfg.Origin()
	if err != nil {
		return 0, err
	}
	if weightGram <= 0 {
		weightGram = cfg.PackageWeight + cfg.ItemWeight
	}
	if insuranceValue < 0 {
		insuranceValue = 0
	}

	req := map[string]interface{}{
		"from_district_id": fromDistrict,
		"from_ward_code":   fromWard,
		"service_type_id":  cfg.ServiceTypeID,
		"to_district_id":   toDistrictID,
		"to_ward_code":     toWardCode,
		"weight":           weightGram,
		"length":           cfg.Length,
		"width":            cfg.Width,
		"height":           cfg.Height,
		"insurance_value":  insuranceValue,
	}

	var out GHNFeeResponse
	if err := cfg.doRequest(http.MethodPost, "/shiip/public-api/v2/shipping-order/fee", req, &out); err != nil {
		return 0, err
	}
	if out.Code != 200 {
		msg := strings.TrimSpace(out.CodeMessage)
		if msg == "" {
			msg = strings.TrimSpace(out.Message)
		}
		if msg == "" {
			msg = "không rõ nguyên nhân"
		}
		return 0, fmt.Errorf("GHN không tính được phí vận chuyển: %s", msg)
	}
	return out.Data.Total, nil
}

// lookupDestination — tra cứu theo tên qua master data GHN (đã cache)
func (c GHNConfig) lookupDestination(provinceName, districtName, wardName string) (*GHNDestination, error) {
	if !c.IsConfigured() {
		return nil, c.NotConfiguredError()
	}

	// 1) Tỉnh/Thành phố
	provinces, err := ListProvinces()
	if err != nil || len(provinces) == 0 {
		return nil, fmt.Errorf("không lấy được danh sách tỉnh/thành từ GHN")
	}
	prov := findByName(provinces, normalizeProvince(provinceName), func(p GHNProvince) string { return p.ProvinceName })
	if prov.ProvinceID == 0 {
		return nil, fmt.Errorf("không tìm thấy tỉnh/thành %q trên GHN", provinceName)
	}

	// 2) Quận/Huyện
	districts, err := ListDistricts(prov.ProvinceID)
	if err != nil {
		return nil, err
	}
	dist := findByName(districts, districtName, func(d GHNDistrict) string { return d.DistrictName })
	if dist.DistrictID == 0 {
		return nil, fmt.Errorf("không tìm thấy quận/huyện %q trên GHN", districtName)
	}

	// 3) Phường/Xã
	wards, err := ListWards(dist.DistrictID)
	if err != nil {
		return nil, err
	}
	ward := findByName(wards, wardName, func(w GHNWard) string { return w.WardName })
	if ward.WardCode == "" {
		return nil, fmt.Errorf("không tìm thấy phường/xã %q trên GHN", wardName)
	}

	return &GHNDestination{
		DistrictID:   dist.DistrictID,
		WardCode:     ward.WardCode,
		DistrictName: dist.DistrictName,
		WardName:     ward.WardName,
		ProvinceName: prov.ProvinceName,
	}, nil
}

// findByName — tìm phần tử có tên khớp (bỏ dấu, không phân biệt hoa thường).
// Trả về zero value nếu không thấy.
func findByName[T any](list []T, name string, pick func(T) string) T {
	var zero T
	target := normalizeVN(name)
	if target == "" {
		return zero
	}
	// ưu tiên khớp tuyệt đối
	for _, it := range list {
		if normalizeVN(pick(it)) == target {
			return it
		}
	}
	// sau đó khớp "chứa"
	for _, it := range list {
		label := normalizeVN(pick(it))
		if strings.Contains(label, target) || strings.Contains(target, label) {
			return it
		}
	}
	return zero
}

func splitAddress(address string) []string {
	raw := strings.Split(address, ",")
	parts := make([]string, 0, len(raw))
	for _, p := range raw {
		if t := strings.TrimSpace(p); t != "" {
			parts = append(parts, t)
		}
	}
	return parts
}

func lastAddressParts(parts []string) (province, district, ward string) {
	switch len(parts) {
	case 0:
		return "", "", ""
	case 1:
		return "", "", parts[0]
	case 2:
		return "", parts[0], parts[1]
	default:
		n := len(parts)
		return parts[n-1], parts[n-2], parts[n-3]
	}
}

func pickFirst(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// provinceAliases — tên viết tắt thường gặp trong địa chỉ tự do
var provinceAliases = map[string]string{
	"hcm": "ho chi minh", "sg": "ho chi minh", "saigon": "ho chi minh", "sai gon": "ho chi minh",
	"hn": "ha noi", "hanoi": "ha noi",
	"dn": "da nang", "hp": "hai phong", "ct": "can tho", "hue": "thua thien hue",
}

// normalizeProvince — chuẩn hoá tên tỉnh/thành, áp dụng alias trước khi tra cứu
func normalizeProvince(name string) string {
	target := normalizeVN(name)
	if expanded, ok := provinceAliases[target]; ok {
		return expanded
	}
	return target
}
func normalizeVN(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	replacer := strings.NewReplacer(
		"tp.", "", "thành phố", "", "tỉnh", "", "quận", "", "huyện", "", "phường", "", "xã", "", "thị trấn", "",
	)
	s = replacer.Replace(s)
	s = removeDiacritics(s)
	fields := strings.Fields(s)
	return strings.Join(fields, " ")
}

func removeDiacritics(s string) string {
	var b strings.Builder
	for _, r := range s {
		if lower, ok := diacriticMap[r]; ok {
			b.WriteRune(lower)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

var diacriticMap = map[rune]rune{
	'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a', 'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
	'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
	'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
	'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o', 'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
	'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u', 'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
	'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
	'đ': 'd',
	'À': 'a', 'Á': 'a', 'Ạ': 'a', 'Ả': 'a', 'Ã': 'a', 'Â': 'a', 'Ầ': 'a', 'Ấ': 'a', 'Ậ': 'a', 'Ẩ': 'a', 'Ẫ': 'a', 'Ă': 'a', 'Ằ': 'a', 'Ắ': 'a', 'Ặ': 'a', 'Ẳ': 'a', 'Ẵ': 'a',
	'È': 'e', 'É': 'e', 'Ẹ': 'e', 'Ẻ': 'e', 'Ẽ': 'e', 'Ê': 'e', 'Ề': 'e', 'Ế': 'e', 'Ệ': 'e', 'Ể': 'e', 'Ễ': 'e',
	'Ì': 'i', 'Í': 'i', 'Ị': 'i', 'Ỉ': 'i', 'Ĩ': 'i',
	'Ò': 'o', 'Ó': 'o', 'Ọ': 'o', 'Ỏ': 'o', 'Õ': 'o', 'Ô': 'o', 'Ồ': 'o', 'Ố': 'o', 'Ộ': 'o', 'Ổ': 'o', 'Ỗ': 'o', 'Ơ': 'o', 'Ờ': 'o', 'Ớ': 'o', 'Ợ': 'o', 'Ở': 'o', 'Ỡ': 'o',
	'Ù': 'u', 'Ú': 'u', 'Ụ': 'u', 'Ủ': 'u', 'Ũ': 'u', 'Ư': 'u', 'Ừ': 'u', 'Ứ': 'u', 'Ự': 'u', 'Ử': 'u', 'Ữ': 'u',
	'Ỳ': 'y', 'Ý': 'y', 'Ỵ': 'y', 'Ỷ': 'y', 'Ỹ': 'y',
	'Đ': 'd',
}

func truncateString(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
