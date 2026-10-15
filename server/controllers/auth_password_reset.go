package controllers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"boko/config"
	"boko/models"
	"boko/services"
)

// ============================================================================
// ĐẶT LẠI MẬT KHẨU (quên mật khẩu) — không dùng JWT, dùng token dùng-1-lần.
//
//  1. POST /api/auth/forgot-password { email }
//     → LUÔN trả 200 (chống dò email tồn tại). Nếu email tồn tại thì tạo token
//       và gửi link /reset-password?token=... (chỉ lưu SHA-256 trong DB).
//  2. POST /api/auth/reset-password { token, password }
//     → kiểm tra token còn hạn/chưa dùng, đổi mật khẩu (bcrypt), đánh dấu đã dùng.
// ============================================================================

const passwordResetTTL = 30 * time.Minute

// generateResetToken — 32 byte ngẫu nhiên (CSPRNG) dạng hex, không đoán được.
func generateResetToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// hashResetToken — SHA-256 dạng hex của token (chỉ hash này được lưu DB).
func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// ForgotPassword — yêu cầu gửi link đặt lại mật khẩu.
func ForgotPassword(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng nhập địa chỉ email hợp lệ"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(input.Email))
	genericMessage := "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả Spam)."

	var user models.User
	if err := config.DB.Where("email = ?", email).First(&user).Error; err != nil {
		// Không tiết lộ email có tồn tại hay không.
		c.JSON(http.StatusOK, gin.H{"success": true, "message": genericMessage})
		return
	}

	token, err := generateResetToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được yêu cầu đặt lại mật khẩu"})
		return
	}

	// Vô hiệu hoá các token cũ chưa dùng của user này (chỉ giữ 1 token sống).
	config.DB.Where("user_id = ? AND used_at IS NULL", user.ID).Delete(&models.PasswordResetToken{})

	reset := models.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: hashResetToken(token),
		ExpiresAt: time.Now().Add(passwordResetTTL),
		CreatedAt: time.Now(),
	}
	if err := config.DB.Create(&reset).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được yêu cầu đặt lại mật khẩu"})
		return
	}

	resetURL := services.AppBaseURL() + "/reset-password?token=" + token
	if err := services.SendPasswordResetEmail(user.Email, user.Name, resetURL); err != nil {
		// Gửi lỗi không nên chặn phản hồi; đã ghi email_logs để đối soát.
		log.Printf("forgot-password: gửi email cho %s thất bại: %v", user.Email, err)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": genericMessage})
}

// ResetPassword — đặt lại mật khẩu bằng token.
func ResetPassword(c *gin.Context) {
	var input struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ (mật khẩu tối thiểu 6 ký tự)"})
		return
	}

	var reset models.PasswordResetToken
	err := config.DB.
		Where("token_hash = ? AND used_at IS NULL AND expires_at > ?", hashResetToken(strings.TrimSpace(input.Token)), time.Now()).
		First(&reset).Error
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"})
		return
	}

	var user models.User
	if err := config.DB.First(&user, reset.UserID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Liên kết đặt lại mật khẩu không hợp lệ"})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi xử lý mật khẩu"})
		return
	}

	now := time.Now()
	if err := config.DB.Model(&user).Update("password", string(hashed)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không cập nhật được mật khẩu"})
		return
	}
	config.DB.Model(&reset).Update("used_at", now)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới."})
}
