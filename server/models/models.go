package models

import "time"

// User — người dùng (customer hoặc seller)
type User struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Password  string    `json:"-" gorm:"not null"` // không trả password trong JSON
	Name      string    `json:"name" gorm:"not null"`
	Phone     string    `json:"phone,omitempty" gorm:"default:''"` // số điện thoại đã mã hóa AES khi lưu vào DB
	Role      string    `json:"role" gorm:"default:customer"`      // customer | seller | admin
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Category — danh mục sách
type Category struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name" gorm:"uniqueIndex;not null"`
	Description string    `json:"description"`
	Books       []Book    `json:"books,omitempty" gorm:"foreignKey:CategoryID"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Book — sản phẩm sách
type Book struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Title       string    `json:"title" gorm:"not null"`
	Author      string    `json:"author" gorm:"not null"`
	Description string    `json:"description"`
	Price       float64   `json:"price" gorm:"not null"`
	Stock       int       `json:"stock" gorm:"default:0"`
	ImageURL    string    `json:"image_url"`
	CategoryID  *uint     `json:"category_id"` // FK → Category (nullable)
	Category    *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	UserID      uint      `json:"user_id"` // FK → User (seller)
	User        *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Cart — giỏ hàng
type Cart struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"uniqueIndex:idx_user_book"` // FK → User
	BookID    uint      `json:"book_id" gorm:"uniqueIndex:idx_user_book"` // FK → Book
	Book      *Book     `json:"book,omitempty" gorm:"foreignKey:BookID"`
	Quantity  int       `json:"quantity" gorm:"default:1"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Order — đơn hàng
type Order struct {
	ID               uint        `json:"id" gorm:"primaryKey"`
	UserID           uint        `json:"user_id"`
	User             *User       `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Total            float64     `json:"total"`
	Status           string      `json:"status" gorm:"default:pending"` // pending, confirmed, shipping, completed, cancelled
	ShippingAddress  string      `json:"shipping_address"`
	Phone            string      `json:"phone"`
	PaymentMethod    string      `json:"payment_method" gorm:"default:cod"`    // cod | momo | zalopay | vnpay...
	PaymentStatus    string      `json:"payment_status" gorm:"default:unpaid"` // unpaid | paid | failed
	PaymentTransID   string      `json:"payment_trans_id"`
	PaymentOrderID   string      `json:"payment_order_id"`
	PaymentRequestID string      `json:"payment_request_id"`
	CouponCode       string      `json:"coupon_code"`
	DiscountPercent  int         `json:"discount_percent" gorm:"default:0"`
	StockDeducted    bool        `json:"stock_deducted" gorm:"default:false"`
	IdempotencyKey   string      `json:"idempotency_key" gorm:"index"`
	// TrackingToken — mã tra cứu đơn không đoán được cho khách vãng lai
	// (thay thế tra cứu công khai bằng email). Không expose trong JSON đơn hàng.
	TrackingToken    string      `json:"-" gorm:"index"`
	Items            []OrderItem `json:"items,omitempty" gorm:"foreignKey:OrderID"`
	Shipment         *Shipment   `json:"shipment,omitempty" gorm:"foreignKey:OrderID"` // vận đơn GHN quản lý sau khi đóng gói
	CreatedAt        time.Time   `json:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at"`
}

// Shipment — vận đơn giao cho hãng thứ 3 (GHN) quản lý.
// Được tạo khi đơn đã đóng gói (Trạng thái chuyển sang shipping). GHN lo phần
// lấy hàng/vận chuyển/thu tiền COD; người mua vẫn bấm "Tôi đã nhận được hàng"
// để chốt đơn (chuyển đơn sang completed).
type Shipment struct {
	ID               uint       `json:"id" gorm:"primaryKey"`
	OrderID          uint       `json:"order_id" gorm:"uniqueIndex"`     // 1 đơn chỉ có 1 vận đơn GHN
	Provider         string     `json:"provider" gorm:"default:ghn"`     // nhà vận chuyển: ghn
	ClientOrderCode  string     `json:"client_order_code"`               // mã đơn phía shop gửi cho GHN
	OrderCode        string     `json:"order_code"`                      // mã vận đơn GHN để tra cứu
	Status           string     `json:"status"`                          // trạng thái gốc của GHN
	StatusText       string     `json:"status_text"`                     // mô tả tiếng Việt cho UI
	ServiceTypeID    int        `json:"service_type_id"`
	PaymentTypeID    int        `json:"payment_type_id"`
	TotalFee         int64      `json:"total_fee"`                       // cước phí GHN trả về
	CODAmount        float64    `json:"cod_amount"`                      // số tiền COD GHN thu hộ
	Leadtime         *time.Time `json:"leadtime"`                        // dự kiến giao xong
	Payload          string     `json:"-" gorm:"type:text"`              // JSON thô từ GHN để đối soát
	LastSyncedAt     *time.Time `json:"last_synced_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// ShipmentEvent — nhật ký hành trình vận đơn GHN.
// Ghi 1 mốc mỗi khi: tạo vận đơn (handover), đồng bộ trạng thái (sync),
// hoặc GHN gọi ngược (webhook). Dùng để vẽ timeline "hàng đang ở đâu" cho
// người mua (GHN test không duy trì log hành trình phía họ).
type ShipmentEvent struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	OrderID    uint      `json:"order_id" gorm:"index"`
	ShipmentID uint      `json:"shipment_id" gorm:"index"`
	Status     string    `json:"status"`
	StatusText string    `json:"status_text"`
	Source     string    `json:"source"` // handover | auto | sync | webhook
	CreatedAt  time.Time `json:"created_at"`
}

// OrderItem — chi tiết đơn hàng (lưu snapshot giá tại thời điểm mua)
type OrderItem struct {
	ID       uint    `json:"id" gorm:"primaryKey"`
	OrderID  uint    `json:"order_id"`
	BookID   uint    `json:"book_id"`
	Title    string  `json:"title"`
	Price    float64 `json:"price"`
	Quantity int     `json:"quantity"`
}

// Review — đánh giá sách
type Review struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"uniqueIndex:idx_user_book_review"`
	BookID    uint      `json:"book_id" gorm:"uniqueIndex:idx_user_book_review"`
	User      *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Rating    int       `json:"rating" gorm:"not null"` // 1-5
	Comment   string    `json:"comment" gorm:"type:text"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Coupon — mã giảm giá
type Coupon struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	Code            string    `json:"code" gorm:"uniqueIndex;not null"`
	DiscountPercent int       `json:"discount_percent" gorm:"not null"` // 1-100
	MaxUses         int       `json:"max_uses" gorm:"default:100"`
	UsedCount       int       `json:"used_count" gorm:"default:0"`
	ExpiresAt       time.Time `json:"expires_at"`
	IsActive        bool      `json:"is_active" gorm:"default:true"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
