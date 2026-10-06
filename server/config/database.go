package config

import (
	"fmt"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// ConnectDatabase — khởi tạo kết nối đến PostgreSQL
// Đọc biến môi trường (dùng trong Docker); nếu không có → fallback localhost
func ConnectDatabase() {
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "123456")
	dbname := getEnv("DB_NAME", "boko_db")
	sslmode := getEnv("DB_SSLMODE", "disable") // Neon/managed DB yêu cầu "require"

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode,
	)

	cfg := postgres.New(postgres.Config{
		DSN: dsn,
		// Neon pooler (pgbouncer) không hỗ trợ prepared statement → dùng simple protocol
		PreferSimpleProtocol: getEnv("DB_SIMPLE", "false") == "true",
	})

	var err error
	DB, err = gorm.Open(cfg, &gorm.Config{})
	if err != nil {
		panic("Không thể kết nối database: " + err.Error())
	}

	// Giới hạn pool kết nối (Neon free tier giới hạn kết nối đồng thời)
	sqlDB, err := DB.DB()
	if err == nil {
		sqlDB.SetMaxOpenConns(10)
		sqlDB.SetMaxIdleConns(5)
	}
}

// getEnv — trả về biến môi trường, nếu không có thì dùng fallback
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}