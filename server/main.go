package main

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"boko/config"
	"boko/middleware"
	"boko/models"
	pmiddleware "boko/payments/middleware"
	"boko/routes"
)

func main() {
	// Đọc biến môi trường từ server/.env khi chạy local dev
	if err := godotenv.Load(); err != nil {
		// Không fatal nếu file .env không tồn tại ở môi trường khác
		_ = err
	}

	// Kiểm tra tính hợp lệ của JWT_SECRET (bắt buộc tối thiểu 32 byte CSPRNG dạng hex)
	secretHex := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	rawBytes, err := hex.DecodeString(secretHex)
	if err != nil || len(rawBytes) < 32 {
		log.Fatalf("FATAL ERROR: JWT_SECRET chưa được cấu hình hoặc không hợp lệ! Bắt buộc phải là chuỗi Hex tối thiểu 32 byte (64 ký tự hex) sinh từ CSPRNG. Dừng backend.")
	}
	middleware.JwtSecret = rawBytes

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
		&models.Shipment{},
		&models.ShipmentEvent{},
	)

	// Tạo router Gin
	r := gin.Default()
	// Tự sửa path thừa dấu / (vd //api/... do base URL có trailing slash) thay vì 404.
	r.RedirectFixedPath = true
	r.Use(pmiddleware.NewRedactingLogger())
	r.Use(pmiddleware.RateLimitMiddleware(120, 1*time.Minute, func(c *gin.Context) string {
		return c.ClientIP()
	}))

	// Cache-Control — API trả dữ liệu nhạy cảm (đơn hàng, profile):
	// cấm browser/proxy cache để ZAP không gắn cờ "Re-examine Cache-control".
	r.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
			c.Header("Pragma", "no-cache")
		}
	})

	// Security headers — prod (Render) không có nginx đứng trước như local,
	// nên backend tự gắn để qua ZAP T01 (CSP API để 'none' vì API chỉ trả JSON).
	r.Use(func(c *gin.Context) {
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "SAMEORIGIN")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}
	})

	// CORS — cho phép React frontend (localhost:3000)
	// Khi deploy cloud (Vercel...), thêm origin qua biến môi trường CORS_ORIGINS,
	// nhiều origin phân tách bằng dấu phẩy. Ví dụ:
	//   CORS_ORIGINS=https://boko-web.vercel.app,https://boko.com
	allowOrigins := []string{
		"http://localhost:3000",   // local dev (Vite)
		"http://127.0.0.1:3000",  // local dev (Vite)
		"http://localhost",        // nginx HTTP (port 80)
		"https://localhost",       // nginx HTTPS (port 443)
		"http://localhost:80",     // nginx HTTP explicit
		"https://localhost:443",   // nginx HTTPS explicit
		"https://boko.com",
	}
	if extra := strings.TrimSpace(os.Getenv("CORS_ORIGINS")); extra != "" {
		for _, o := range strings.Split(extra, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowOrigins = append(allowOrigins, o)
			}
		}
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Đăng ký routes
	routes.SetupRoutes(r)

	// Seed dữ liệu mẫu
	seedData()

	// Backfill mã tra cứu cho đơn hàng cũ (trước bản vá T07)
	backfillTrackingTokens()

	// Chạy server — nền tảng cloud (Render...) cấp cổng qua biến môi trường
	// PORT, local mặc định 8080.
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}

// demoCatalogBooks — danh mục sách mẫu của frontend (app/src/data/books.ts).
// Seed xuống DB để mọi cuốn trên kệ đều mua được thật qua COD/cổng thanh toán.
var demoCatalogBooks = []struct {
	Title       string
	Author      string
	Category    string
	Price       float64
	Stock       int
	ImageURL    string
	Description string
}{
	{
		Title: "Bóng Tối Phố Baker", Author: "Arthur Conan Doyle", Category: "Mystery",
		Price: 240000, Stock: 60,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuDCfxWh0sp0lzL_jUmX_W2r3Nmbq37cAx5PzRnz64HkSP-U5MbCrwaq1CzftUcLDX8uT0T9-F84I8Pm79RJn8TtpXz73_w_pD8n2rHX9YrDMqo4pYPOez0E12EGfwy1bcbAVsdhfZeAd79MoLJt-tslWZ4JXnQbwdLSk8cUTZF0SuV8LBWbJBAoiB17fRKs7TN3GxrOriyCgtVIx4kWlgz7i7Hq49Y82n0orgkLFUWXlG3SuAXnqvRR5A",
		Description: "Bóng tối bao trùm con hẻm vắng lặng phố Baker, nơi những vụ án ly kỳ chờ đón bước chân nhà thám tử lừng danh.",
	},
	{
		Title: "Vết Cắt", Author: "Phạm Gia Bảo", Category: "Mystery",
		Price: 225000, Stock: 55,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuChDYT25hMiy4fGpGIsbsGfjKFL7ZVQwdl8wYTXz0x2XbekBq8w0tcUmJ-WSoASDTXmqXNZ2VtJvvu_T9bSkb_Wv3xcwg4qCJCJJf73cFbpDfYmit78I1Y6XPsd9num7wWNXrzP-Q-6M8_8TOBvfIHsG6xq_txUl4wD0jYGv0roVzBCNaNKMoxO6VCS-Xx5dJsOhClUGDFPlZRuOL1MIKIzi52NnDdIwSPJpZiVRb2H7Pbjqiud-6Q_OtA",
		Description: "Một tác phẩm tâm lý tội phạm u tối xoay quanh vết cắt bí ẩn làm rung chuyển cả dòng họ.",
	},
	{
		Title: "Vực Thẳm Lạnh Lẽo", Author: "Hoàng Minh Trạng", Category: "Mystery",
		Price: 250000, Stock: 45,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuDeoPVHaZVAKEkRGrc5_oWMAk_eYZz2ipZV1AAg52lUCFWVPeIOVHGUH3zE7ZewD8vDLSTgApI3ijH77VYF6mh-Bd0yLQF7ybV0mCUZU3fOcmSA_hvJ1jbLfLScLcqRAvuv5CDWTDGa5WgJl7RdoTjggWNnQOBDXjGuisdH9cWpyG78B4k6BfvarIkDYp6vXaT7JtiXLF1KKgynUnDGqWAltYefwolpF5yFbt5Kt3iYYCxmBR38WVDcnQ",
		Description: "Cuộc truy lùng gã sát nhân bí ẩn giữa vùng núi hẻo lánh bao phủ bởi mây mù và vách đá dốc đứng.",
	},
	{
		Title: "Bí Ấn Của Chiếc Đồng Hồ Cổ", Author: "Agatha Christie", Category: "Mystery",
		Price: 210000, Stock: 70,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuBPbcE1ztksqe9U7V6M_1YgHrMRmRZs-6BDvuP7nMto_0W-_5R8c1-8xHkOiRD2HB1pZJCzdhskHUyB2rBvsCQoVvsOggBK2APkp_rLBJkbBEAVY7neQO6EVIFIJwp1loKwfSwUXUdZmmTlY9-D2ND7s87rAC65fkq5xHC1pTtvVZ7hHed3Zu5W4aQrKqpaulq4KJFfRgCMoljDsxg2mXq9gqubsWxLErxKcGAWxFV1PO4N0H0VmYpE1A",
		Description: "Một vụ án hóc húa khi năm chiếc đồng hồ cổ trong căn phòng nạn nhân đều dừng đúng ở thời điểm 4 giờ 13 phút.",
	},
	{
		Title: "Gió Lạnh Đầu Mùa", Author: "Thạch Lam", Category: "Literature",
		Price: 180000, Stock: 80,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuBMO3iuYigtjk1EySNX3heNHOE43nAMlKZl1WQxOX7Ocd2KhjBz8qoTDeqwAKUje_nx6_ctGsM7G6aDj4WmULyD0uR_Wckuhv8_nl02YMAEWET-hOej0fcrdDYq9IT559QtmN9HBrvKbHHG08EivYCJ_v1G2Y-9iax9CFXUKW-qnA1VE_zVcrQTdZ2P1jkX9t2DPKb6Rl4WiJ9u_7ZHK_D_Z46WMw-An4GYz55WZ7qMcOvsYyE4dvLXZL8cfTp4ctLVj04",
		Description: "Tập truyện ngắn dịu dàng, ấm áp tình người trong những ngày đầu đông xứ Bắc.",
	},
	{
		Title: "Dưới Bóng Hoa Tàn", Author: "Lê Phương Thảo", Category: "Literature",
		Price: 200000, Stock: 65,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuC-84D2ndfimeOlPT2_LK8a2gWhnnYkWle5ooDMinZVSJCqLcyBg_vgAz4OAQQlX0CtRRvTseVm3oPcr9nHoQ2ObowH8IG403I-N5gAMY9gLwcsCB5orgFQcPnuCtgGJ-380EH0XypVPo9TlQyjD72Z1NWiCOsm5sW0ciu-mhIv3Mo0CLgMMP5Sg96kZ5LUZrgM7dKod2f8lpNUOzpBepmrGf7BFln31m4bANoY-MJEMxEa2NkBMcBj1w",
		Description: "Tiểu thuyết lãng mạn nhẹ nhàng xoay quanh những kỷ niệm tuổi trẻ và những đóa hoa mùa hạ.",
	},
	{
		Title: "The Shifting Tides", Author: "Eliza Vance", Category: "Literature",
		Price: 260000, Stock: 40,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuA0OSXgiMKLi6Gw7zLxaKFJt6QyUBql8n9AID4BmbmJXYLFxlRGD5dxeC4Fj1KHAODM4-Yt9yTPSC32te5Ujm60vI40eog1JzGqId7FcWSZb9hm05gCwzaYl-KYdSpEHMuvo4eZe0W372JOmJqzWEdU_74M-rsMtspve6YJWcLR1D5GBzGp3s4v3W_QcHYBcjWYg79mIuRV95Xn2D-hFBITYr9OoSEHheyc9GfHAFzWWG94p3VlmFw-_g",
		Description: "A poetic literary novel exploring human connection and the passing of generations along the coastline.",
	},
	{
		Title: "L'Étranger", Author: "Albert Camus", Category: "Literature",
		Price: 240000, Stock: 90,
		ImageURL:    "https://lh3.googleusercontent.com/aida-public/AB6AXuAMmrVi1HZtk0j2V8SVSuMmHBIUX0oNAHwkxVKk3q0h3zQQiRNTRbE-5N5Bwuhk8a1Cy0vpDMnZrIpZrx7LYQIj41lhJ6WW0hFpMWUMS-_dCJOMUqDWgl5JD31eyoLktacAZ81q668R300goQc7QRRI-YtcdZfCcQ5ePgjA9GHz0EqyWg0gZxzhJ3CeSbQQ3ZcCkAlYAfDC68av5rURiElgkcov58r30L9Bp6mQZ86SK8AGHMmccC-Z4w",
		Description: "Tác phẩm kinh điển triết học phi lý của Albert Camus xoay quanh Meursault và cái nắng thiêu đốt của Alger.",
	},
	{
		Title: "Đại Việt Sử Ký Toàn Thư", Author: "Ngô Sĩ Liên", Category: "History",
		Price: 320000, Stock: 55, ImageURL: "",
		Description: "Bộ chính sử vô giá ghi chép từ thời Hồng Bàng đến triều đại Nhà Lê.",
	},
	{
		Title: "Sử Ký Tư Mã Thiên", Author: "Tư Mã Thiên", Category: "History",
		Price: 290000, Stock: 50, ImageURL: "",
		Description: "Tuyệt tác lịch sử văn học Trung Hoa ghi chép hơn ba nghìn năm biến động.",
	},
	{
		Title: "Vũ Trụ Của Carl Sagan", Author: "Carl Sagan", Category: "Science",
		Price: 280000, Stock: 60, ImageURL: "",
		Description: "Hành trình kỳ diệu khám phá vũ trụ bao la, hành tinh Trái Đất và nguồn gốc sự sống.",
	},
	{
		Title: "Câu Chuyện Nghệ Thuật", Author: "E.H. Gombrich", Category: "Art",
		Price: 350000, Stock: 80, ImageURL: "",
		Description: "Cuốn sách nhập môn nghệ thuật nổi tiếng nhất thế giới từ thời tiền sử đến hiện đại.",
	},
}

// seedData — tạo dữ liệu mẫu nếu database trống.
// Mật khẩu của tài khoản seed KHÔNG hardcode trong code — đọc từ biến môi trường
// (xem server/.env.example): SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD,
// SEED_CUSTOMER_EMAIL / SEED_CUSTOMER_PASSWORD.
func seedData() {
	// Tạo admin nếu chưa có
	seedUser(getSeedEnv("SEED_ADMIN_EMAIL", "admin@boko.com"), "SEED_ADMIN_PASSWORD", "Admin Boko", "admin")

	// Tạo tài khoản khách hàng thử nghiệm nếu chưa có
	seedUser(getSeedEnv("SEED_CUSTOMER_EMAIL", "test@gmail.com"), "SEED_CUSTOMER_PASSWORD", "test_user", "customer")

	// Tạo danh mục mẫu cùng tên với UI frontend để đồng bộ giữa backend và frontend
	categories := []models.Category{
		{Name: "Mystery", Description: "Sách trinh thám, bí ẩn, khám phá"},
		{Name: "Literature", Description: "Tiểu thuyết, truyện ngắn, thơ"},
		{Name: "History", Description: "Sách lịch sử, chính trị, văn hóa"},
		{Name: "Science", Description: "Sách khoa học, công nghệ, xã hội"},
		{Name: "Art", Description: "Sách nghệ thuật, hội họa, thiết kế"},
	}
	for _, c := range categories {
		var existing models.Category
		if err := config.DB.Where("name = ?", c.Name).First(&existing).Error; err != nil {
			config.DB.Create(&c)
		}
	}

	// Tạo sách mẫu tương ứng từng danh mục UI
	var admin models.User
	if err := config.DB.Where("role = ?", "admin").First(&admin).Error; err == nil && admin.ID > 0 {
		var catTrinhTham, catVanHoc, catLichSu, catKhoaHoc, catNgheThuat models.Category
		config.DB.Where("name = ?", "Mystery").First(&catTrinhTham)
		config.DB.Where("name = ?", "Literature").First(&catVanHoc)
		config.DB.Where("name = ?", "History").First(&catLichSu)
		config.DB.Where("name = ?", "Science").First(&catKhoaHoc)
		config.DB.Where("name = ?", "Art").First(&catNgheThuat)

		sampleBooks := []models.Book{
			{Title: "The Hound of the Baskervilles", Author: "Arthur Conan Doyle", Description: "Tiểu thuyết trinh thám kinh điển", Price: 250000, Stock: 50, CategoryID: &catTrinhTham.ID, UserID: admin.ID},
			{Title: "Nhà Giả Kim", Author: "Paulo Coelho", Description: "Hành trình theo đuổi giấc mơ", Price: 79000, Stock: 200, CategoryID: &catVanHoc.ID, UserID: admin.ID},
			{Title: "Lịch Sử Việt Nam", Author: "TS. Lê Văn Hồng", Description: "Khái quát lịch sử Việt Nam qua các triều đại", Price: 89000, Stock: 150, CategoryID: &catLichSu.ID, UserID: admin.ID},
			{Title: "Lập Trình Go Cơ Bản", Author: "Nguyễn Văn A", Description: "Hướng dẫn lập trình Go từ cơ bản đến nâng cao", Price: 150000, Stock: 100, CategoryID: &catKhoaHoc.ID, UserID: admin.ID},
			{Title: "Câu Chuyện Nghệ Thuật", Author: "E.H. Gombrich", Description: "Hành trình khám phá mỹ thuật và hình thành văn hóa", Price: 180000, Stock: 80, CategoryID: &catNgheThuat.ID, UserID: admin.ID},
		}
		for _, b := range sampleBooks {
			var existing models.Book
			if err := config.DB.Where("title = ?", b.Title).First(&existing).Error; err != nil {
				config.DB.Create(&b)
			}
		}

		// Đồng bộ danh mục sách demo của frontend (app/src/data/books.ts) xuống DB.
		// Nhờ đó mọi cuốn hiển thị trên kệ đều có bản ghi thật (kèm tồn kho) nên
		// người dùng mua được bằng COD thay vì bị lỗi "Mã sách ... không hợp lệ".
		for _, d := range demoCatalogBooks {
			var existing models.Book
			if err := config.DB.Where("title = ?", d.Title).First(&existing).Error; err == nil {
				continue
			}

			var cat models.Category
			config.DB.Where("name = ?", d.Category).First(&cat)

			book := models.Book{
				Title:       d.Title,
				Author:      d.Author,
				Description: d.Description,
				Price:       d.Price,
				Stock:       d.Stock,
				ImageURL:    d.ImageURL,
				UserID:      admin.ID,
			}
			if cat.ID > 0 {
				book.CategoryID = &cat.ID
			}
			config.DB.Create(&book)
			log.Printf("seed: đã tạo sách danh mục %q (%s)", d.Title, d.Category)
		}
	}
}

// seedUser — tạo tài khoản seed nếu chưa tồn tại (so theo email).
// Mật khẩu đọc từ biến môi trường passwordEnv (không hardcode trong code).
// Nếu tài khoản đã tồn tại thì không đụng tới — trừ khi operator đặt
// SEED_UPDATE_PASSWORD=true, lúc đó mật khẩu được đồng bộ lại từ env
// (dùng sau khi chạy server/migrations/0002_seed_data.sql để cài mật khẩu
// thật cho các tài khoản placeholder).
func seedUser(email, passwordEnv, name, role string) {
	var count int64
	config.DB.Model(&models.User{}).Where("email = ?", email).Count(&count)

	password := strings.TrimSpace(os.Getenv(passwordEnv))
	if count == 0 {
		if password == "" {
			log.Printf("seed: bỏ qua tài khoản %s — chưa set biến môi trường %s", email, passwordEnv)
			return
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("seed: không tạo được tài khoản %s: %v", email, err)
			return
		}
		config.DB.Create(&models.User{
			Email:    email,
			Password: string(hashed),
			Name:     name,
			Role:     role,
		})
		log.Printf("seed: đã tạo tài khoản %s (%s)", email, role)
		return
	}

	if password != "" && os.Getenv("SEED_UPDATE_PASSWORD") == "true" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("seed: không cập nhật được mật khẩu %s: %v", email, err)
			return
		}
		config.DB.Model(&models.User{}).Where("email = ?", email).Update("password", string(hashed))
		log.Printf("seed: đã đồng bộ lại mật khẩu cho %s từ %s", email, passwordEnv)
	}
}

// backfillTrackingTokens — cấp mã tra cứu cho đơn tạo trước bản vá T07.
// Chạy mỗi lần khởi động, chỉ chạm các dòng còn trống nên an toàn idempotent.
func backfillTrackingTokens() {
	var ids []uint
	if err := config.DB.Model(&models.Order{}).
		Where("tracking_token = '' OR tracking_token IS NULL").
		Pluck("id", &ids).Error; err != nil || len(ids) == 0 {
		return
	}
	for _, id := range ids {
		var b [32]byte
		if _, err := rand.Read(b[:]); err != nil {
			continue
		}
		config.DB.Model(&models.Order{}).Where("id = ?", id).
			Update("tracking_token", hex.EncodeToString(b[:]))
	}
	log.Printf("backfill: đã cấp tracking_token cho %d đơn hàng cũ", len(ids))
}

// getSeedEnv — đọc biến môi trường, dùng fallback khi trống
func getSeedEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
