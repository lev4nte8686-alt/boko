package config

import (
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// ConnectDatabase — khởi tạo kết nối đến PostgreSQL
// Ưu tiên DATABASE_URL (Neon/Render), fallback DB_HOST/DB_PORT/... (Docker/localhost)
// Hỗ trợ cả trường hợp user paste nhầm full URL vào DB_HOST
func ConnectDatabase() {
	// 1. Ưu tiên DATABASE_URL nguyên chuỗi (Neon cung cấp sẵn)
	//    Ví dụ: postgresql://user:pass@ep-xxx-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))

	// 2. Phòng trường hợp paste nhầm full URL vào DB_HOST
	if dsn == "" {
		host := strings.TrimSpace(os.Getenv("DB_HOST"))
		if strings.HasPrefix(host, "postgres://") || strings.HasPrefix(host, "postgresql://") {
			dsn = host
			log.Println("Cảnh báo: DB_HOST đang chứa full connection URL — dùng luôn làm DSN")
		}
	}

	// 3. Fallback: ráp từ từng biến rời (Docker/local)
	if dsn == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "postgres")
		password := getEnv("DB_PASSWORD", "123456")
		dbname := getEnv("DB_NAME", "boko_db")
		sslmode := getEnv("DB_SSLMODE", "disable") // Neon/managed DB yêu cầu "require"

		dsn = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, dbname, sslmode,
		)
		// Neon pooler yêu cầu channel_binding=require khi dùng URL có channel_binding
		if cb := strings.TrimSpace(os.Getenv("DB_CHANNEL_BINDING")); cb != "" {
			dsn += " channel_binding=" + cb
		}
		log.Printf("Kết nối Postgres rời: host=%s db=%s sslmode=%s", host, dbname, sslmode)
	} else {
		log.Println("Kết nối Postgres qua DATABASE_URL (Neon)")
	}

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