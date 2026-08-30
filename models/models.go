package models

import "time"

// User — người dùng (customer hoặc seller)
type User struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Password  string    `json:"-" gorm:"not null"` // không trả password trong JSON
	Name      string    `json:"name" gorm:"not null"`
	Role      string    `json:"role" gorm:"default:customer"` // customer | seller | admin
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
	CategoryID  *uint     `json:"category_id"`                         // FK → Category (nullable)
	Category    *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	UserID      uint      `json:"user_id"`                             // FK → User (seller)
	User        *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Cart — giỏ hàng
type Cart struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"uniqueIndex:idx_user_book"`   // FK → User
	BookID    uint      `json:"book_id" gorm:"uniqueIndex:idx_user_book"`   // FK → Book
	Book      *Book     `json:"book,omitempty" gorm:"foreignKey:BookID"`
	Quantity  int       `json:"quantity" gorm:"default:1"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Order — đơn hàng
type Order struct {
	ID              uint        `json:"id" gorm:"primaryKey"`
	UserID          uint        `json:"user_id"`
	User            *User       `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Total           float64     `json:"total"`
	Status          string      `json:"status" gorm:"default:pending"` // pending, confirmed, shipping, completed, cancelled
	ShippingAddress string      `json:"shipping_address"`
	Phone           string      `json:"phone"`
	PaymentMethod   string      `json:"payment_method" gorm:"default:cod"` // cod | momo
	CouponCode      string      `json:"coupon_code"`
	DiscountPercent int         `json:"discount_percent" gorm:"default:0"`
	Items           []OrderItem `json:"items,omitempty" gorm:"foreignKey:OrderID"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
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