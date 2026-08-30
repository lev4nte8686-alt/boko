package controllers

import (
	"net/http"
	"time"
	"errors"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"boko/config"
	"boko/models"
	"boko/middleware"
)

// ==================== REGISTER ====================

// Register — tạo tài khoản mới (mặc định role = customer)
func Register(c *gin.Context) {
	var input struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
		Name     string `json:"name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: " + err.Error()})
		return
	}

	// Kiểm tra email trùng
	var existing models.User
	if result := config.DB.Where("email = ?", input.Email).First(&existing); result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email đã được sử dụng"})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi xử lý mật khẩu"})
		return
	}

	user := models.User{
		Email:    input.Email,
		Password: string(hashedPassword),
		Name:     input.Name,
		Role:     "customer",
	}
	config.DB.Create(&user)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Đăng ký thành công!",
		"data": gin.H{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

// ==================== LOGIN ====================

// Login — đăng nhập, trả về JWT token
func Login(c *gin.Context) {
	var input struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	var user models.User
	if result := config.DB.Where("email = ?", input.Email).First(&user); errors.Is(result.Error, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email hoặc mật khẩu không đúng"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email hoặc mật khẩu không đúng"})
		return
	}

	// Tạo JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"role":    user.Role,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, _ := token.SignedString(middleware.JwtSecret)

	c.JSON(http.StatusOK, gin.H{
		"message": "Đăng nhập thành công!",
		"token":   tokenString,
		"data": gin.H{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

// ==================== PROFILE ====================

// GetProfile — lấy thông tin user đang đăng nhập
func GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	if result := config.DB.First(&user, userID); result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

// UpdateProfile — cập nhật tên và mật khẩu
func UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input struct {
		Name        string `json:"name"`
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password" binding:"omitempty,min=6"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	var user models.User
	config.DB.First(&user, userID)

	updates := map[string]interface{}{}

	if input.Name != "" {
		updates["name"] = input.Name
	}

	// Đổi mật khẩu nếu có
	if input.NewPassword != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.OldPassword)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mật khẩu cũ không đúng"})
			return
		}
		hashed, _ := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
		updates["password"] = string(hashed)
	}

	config.DB.Model(&user).Updates(updates)

	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật thông tin thành công!"})
}