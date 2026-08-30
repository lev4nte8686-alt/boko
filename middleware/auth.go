package middleware

import (
	"net/http"
	"strings"
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JwtSecret — khoá bí mật dùng để ký và xác thực JWT
var JwtSecret = []byte("boko-secret-key-2024")

// AuthRequired — middleware kiểm tra JWT token từ header Authorization
func AuthRequired(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Thiếu token xác thực"})
		c.Abort()
		return
	}

	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Sai định dạng token (cần Bearer token)"})
		c.Abort()
		return
	}

	tokenString := strings.TrimPrefix(authHeader, "Bearer ")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("sai phương thức ký")
		}
		return JwtSecret, nil
	})

	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token không hợp lệ hoặc đã hết hạn"})
		c.Abort()
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Không thể đọc token"})
		c.Abort()
		return
	}

	// Gắn thông tin user vào context để handler dùng
	c.Set("user_id", uint(claims["user_id"].(float64)))
	c.Set("email", claims["email"].(string))
	c.Set("role", claims["role"].(string))

	c.Next()
}

// SellerRequired — middleware chỉ cho phép seller (dùng sau AuthRequired)
func SellerRequired(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "seller" && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ seller mới có quyền thực hiện"})
		c.Abort()
		return
	}
	c.Next()
}

// AdminRequired — middleware chỉ cho phép admin (dùng sau AuthRequired)
func AdminRequired(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chỉ admin mới có quyền thực hiện"})
		c.Abort()
		return
	}
	c.Next()
}