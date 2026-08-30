package main

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"boko/config"
	"boko/models"
	"boko/routes"
)

func main() {
	// Kết nối database
	config.ConnectDatabase()

	// Tự động tạo bảng
	config.DB.AutoMigrate(
		&models.User{},
		&models.Category{},
		&models.Book{},
		&models.Cart{},
		&models.Order{},
		&models.OrderItem{},
		&models.Review{},
		&models.Coupon{},
	)

	// Tạo router Gin
	r := gin.Default()

	// CORS — cho phép React frontend (localhost:3000)
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Đăng ký routes
	routes.SetupRoutes(r)

	// Seed dữ liệu mẫu
	seedData()

	// Chạy server
	r.Run(":8080")
}

// seedData — tạo dữ liệu mẫu nếu database trống
func seedData() {
	// Tạo admin nếu chưa có
	var count int64
	config.DB.Model(&models.User{}).Where("role = ?", "admin").Count(&count)
	if count == 0 {
		hashed, _ := bcrypt.GenerateFromPassword([]byte("admin123456"), bcrypt.DefaultCost)
		config.DB.Create(&models.User{
			Email:    "admin@boko.com",
			Password: string(hashed), // hash đúng của "admin123456"
			Name:     "Admin Boko",
			Role:     "admin",
		})
	}

	// Tạo danh mục mẫu
	config.DB.Model(&models.Category{}).Count(&count)
	if count == 0 {
		categories := []models.Category{
			{Name: "Công Nghệ Thông Tin", Description: "Sách về lập trình, AI, phần mềm"},
			{Name: "Kinh Tế", Description: "Sách về kinh doanh, marketing, tài chính"},
			{Name: "Văn Học", Description: "Tiểu thuyết, truyện ngắn, thơ"},
			{Name: "Khoa Học", Description: "Sách khoa học tự nhiên và xã hội"},
			{Name: "Ngoại Ngữ", Description: "Sách học tiếng Anh, Nhật, Hàn..."},
		}
		for _, c := range categories {
			config.DB.Create(&c)
		}
	}

	// Tạo sách mẫu
	config.DB.Model(&models.Book{}).Count(&count)
	if count == 0 {
		// Lấy admin làm seller cho sách mẫu
		var admin models.User
		config.DB.Where("role = ?", "admin").First(&admin)

		// Lấy danh mục
		var catIT, catKinhTe, catVanHoc, catKhoaHoc models.Category
		config.DB.Where("name = ?", "Công Nghệ Thông Tin").First(&catIT)
		config.DB.Where("name = ?", "Kinh Tế").First(&catKinhTe)
		config.DB.Where("name = ?", "Văn Học").First(&catVanHoc)
		config.DB.Where("name = ?", "Khoa Học").First(&catKhoaHoc)

		books := []models.Book{
			{Title: "Lập Trình Go Cơ Bản", Author: "Nguyễn Văn A", Description: "Hướng dẫn lập trình Go từ cơ bản đến nâng cao", Price: 150000, Stock: 100, CategoryID: &catIT.ID, UserID: admin.ID},
			{Title: "Machine Learning với Python", Author: "Trần Thị B", Description: "Khám phá thế giới học máy với Python", Price: 250000, Stock: 50, CategoryID: &catIT.ID, UserID: admin.ID},
			{Title: "Nhà Giả Kim", Author: "Paulo Coelho", Description: "Hành trình theo đuổi giấc mơ", Price: 79000, Stock: 200, CategoryID: &catVanHoc.ID, UserID: admin.ID},
			{Title: "Đắc Nhân Tâm", Author: "Dale Carnegie", Description: "Nghệ thuật giao tiếp và đối nhân xử thế", Price: 89000, Stock: 150, CategoryID: &catKinhTe.ID, UserID: admin.ID},
			{Title: "Lược Sử Vạn Vật", Author: "Bill Bryson", Description: "Hành trình khám phá khoa học", Price: 180000, Stock: 80, CategoryID: &catKhoaHoc.ID, UserID: admin.ID},
		}
		for _, b := range books {
			config.DB.Create(&b)
		}
	}
}