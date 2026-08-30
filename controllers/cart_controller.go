package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"boko/config"
	"boko/models"
)

// ==================== CART ====================

// GetCart — xem giỏ hàng của user hiện tại (kèm thông tin sách và subtotal)
func GetCart(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var cartItems []struct {
		CartID   uint    `json:"cart_id"`
		BookID   uint    `json:"book_id"`
		Title    string  `json:"title"`
		Author   string  `json:"author"`
		Price    float64 `json:"price"`
		ImageURL string  `json:"image_url"`
		Quantity int     `json:"quantity"`
		Subtotal float64 `json:"subtotal"`
		Stock    int     `json:"stock"`
	}

	config.DB.Table("carts").
		Select("carts.id as cart_id, carts.book_id, books.title, books.author, books.price, books.image_url, carts.quantity, books.price * carts.quantity as subtotal, books.stock").
		Joins("join books on books.id = carts.book_id").
		Where("carts.user_id = ?", userID).
		Scan(&cartItems)

	var total float64
	for _, item := range cartItems {
		total += item.Subtotal
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"items": cartItems,
			"total": total,
		},
	})
}

// AddToCart — thêm sách vào giỏ hàng
func AddToCart(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input struct {
		BookID   uint `json:"book_id" binding:"required"`
		Quantity int  `json:"quantity" binding:"required,min=1"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	// Kiểm tra sách tồn tại
	var book models.Book
	if result := config.DB.First(&book, input.BookID); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy sách"})
		return
	}

	// Kiểm tra tồn kho
	if book.Stock < input.Quantity {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số lượng tồn kho không đủ"})
		return
	}

	// Nếu đã có trong giỏ → tăng quantity
	var existing models.Cart
	if result := config.DB.Where("user_id = ? AND book_id = ?", userID, input.BookID).First(&existing); result.Error == nil {
		newQty := existing.Quantity + input.Quantity
		if newQty > book.Stock {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Vượt quá số lượng tồn kho"})
			return
		}
		config.DB.Model(&existing).Update("quantity", newQty)
		c.JSON(http.StatusOK, gin.H{
			"message":  "Cập nhật số lượng trong giỏ!",
			"quantity": newQty,
		})
		return
	}

	// Thêm mới
	cart := models.Cart{
		UserID:   userID.(uint),
		BookID:   input.BookID,
		Quantity: input.Quantity,
	}
	config.DB.Create(&cart)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Đã thêm vào giỏ hàng!",
		"data":    cart,
	})
}

// UpdateCartItem — cập nhật số lượng item trong giỏ
func UpdateCartItem(c *gin.Context) {
	userID, _ := c.Get("user_id")
	cartID := c.Param("id")

	var input struct {
		Quantity int `json:"quantity" binding:"required,min=1"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số lượng không hợp lệ"})
		return
	}

	var cart models.Cart
	if result := config.DB.Where("id = ? AND user_id = ?", cartID, userID).First(&cart); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy item trong giỏ"})
		return
	}

	// Kiểm tra tồn kho
	var book models.Book
	config.DB.First(&book, cart.BookID)
	if book.Stock < input.Quantity {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Số lượng tồn kho không đủ"})
		return
	}

	config.DB.Model(&cart).Update("quantity", input.Quantity)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Cập nhật số lượng thành công!",
		"quantity": input.Quantity,
	})
}

// RemoveFromCart — xoá item khỏi giỏ hàng
func RemoveFromCart(c *gin.Context) {
	userID, _ := c.Get("user_id")
	cartID := c.Param("id")

	result := config.DB.Where("id = ? AND user_id = ?", cartID, userID).Delete(&models.Cart{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy item trong giỏ"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã xoá khỏi giỏ hàng!"})
}