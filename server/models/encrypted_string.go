package models

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql/driver"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"strings"
)

const encPrefix = "v1:" // đánh dấu giá trị đã mã hóa

// getEncKey — khóa 32 bytes: ưu tiên APP_ENCRYPTION_KEY (base64/hex/chuỗi), fallback dev key
func getEncKey() []byte {
	k := os.Getenv("APP_ENCRYPTION_KEY")
	if k == "" {
		k = "boko-dev-fallback-key"
	}
	if b, err := base64.StdEncoding.DecodeString(k); err == nil && len(b) == 32 {
		return b
	}
	if b, err := hex.DecodeString(k); err == nil && len(b) == 32 {
		return b
	}
	h := sha256.Sum256([]byte(k))
	return h[:]
}

// encrypt — AES-256-GCM, trả về base64(nonce||ciphertext), kèm prefix v1:
func encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	block, err := aes.NewCipher(getEncKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(append(nonce, ct...)), nil
}

// decrypt — giải mã base64(nonce||ciphertext), nếu lỗi hoặc không có prefix thì trả về nguyên text (dữ liệu cũ)
func decrypt(value string) (string, error) {
	if value == "" || !strings.HasPrefix(value, encPrefix) {
		return value, nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix))
	if err != nil {
		return "", fmt.Errorf("lỗi giải mã: %w", err)
	}
	block, err := aes.NewCipher(getEncKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("dữ liệu không hợp lệ")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}

// EncryptedString — kiểu GORM tự động mã hóa khi lưu xuống DB, tự giải mã khi đọc lên
type EncryptedString string

func (es EncryptedString) Value() (driver.Value, error) {
	return encrypt(string(es))
}

func (es *EncryptedString) Scan(src interface{}) error {
	if src == nil {
		*es = ""
		return nil
	}
	var s string
	switch v := src.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("không hỗ trợ kiểu %T", src)
	}
	pt, err := decrypt(s)
	if err != nil {
		return err
	}
	*es = EncryptedString(pt)
	return nil
}

// GormDataType — map sang TEXT trong Postgres
func (EncryptedString) GormDataType() string { return "text" }
