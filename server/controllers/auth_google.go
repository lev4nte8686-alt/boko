package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"boko/config"
	"boko/middleware"
	"boko/models"
)

// googleUserInfo — thông tin Google trả về từ endpoint userinfo.
type googleUserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// GoogleAuth — POST /api/auth/google
//
// Nhận `access_token` do Google Identity Services cấp ở frontend, **verify với
// Google** (gọi userinfo) rồi cấp JWT của Boko. KHÔNG tin email do client gửi —
// chỉ dùng email đã được Google xác thực, nhờ vậy tài khoản guest tạo trước đó
// (cùng email) sẽ được "nhận" và các đơn cũ hiện ra.
func GoogleAuth(c *gin.Context) {
	var input struct {
		AccessToken string `json:"access_token"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Dữ liệu không hợp lệ"})
		return
	}

	accessToken := strings.TrimSpace(input.AccessToken)
	if accessToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Thiếu access_token của Google"})
		return
	}

	info, err := verifyGoogleAccessToken(accessToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": err.Error()})
		return
	}

	email := strings.ToLower(strings.TrimSpace(info.Email))
	if email == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Không lấy được email từ Google"})
		return
	}

	// Tìm hoặc tạo người dùng theo email ĐÃ XÁC THỰC của Google.
	var user models.User
	if err := config.DB.Where("email = ?", email).First(&user).Error; err != nil {
		name := strings.TrimSpace(info.Name)
		if name == "" {
			name = strings.Split(email, "@")[0]
		}
		user = models.User{Email: email, Name: name, Role: "customer"}
		if err := config.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Không tạo được tài khoản"})
			return
		}
	} else if strings.TrimSpace(user.Name) == "" && strings.TrimSpace(info.Name) != "" {
		config.DB.Model(&user).Update("name", info.Name)
	}

	// Cấp JWT của Boko (7 ngày) — giống luồng đăng nhập thường.
	jwtToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"role":    user.Role,
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	signed, err := jwtToken.SignedString(middleware.JwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Không tạo được phiên đăng nhập"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Đăng nhập Google thành công!",
		"token":   signed,
		"user":    userPublicPayload(user),
	})
}

// verifyGoogleAccessToken — xác thực access_token bằng API userinfo của Google.
// Chỉ tin phản hồi từ Google, không tin dữ liệu client gửi kèm.
func verifyGoogleAccessToken(accessToken string) (*googleUserInfo, error) {
	req, err := http.NewRequest(http.MethodGet, "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return nil, fmt.Errorf("không tạo được yêu cầu Google")
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("không gọi được Google để xác thực: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Google từ chối access_token (HTTP %d)", resp.StatusCode)
	}

	var info googleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("phản hồi từ Google không hợp lệ")
	}
	return &info, nil
}
