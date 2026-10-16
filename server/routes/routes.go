package routes

import (
	"github.com/gin-gonic/gin"

	"boko/controllers"
	"boko/middleware"
)

func SetupRoutes(r *gin.Engine) {
	// ==================== PUBLIC ROUTES ====================

	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "Boko API is running! 🚀"})
	})

	// Auth — frontend tương thích
	r.POST("/api/register", controllers.Register)
	r.POST("/api/login", controllers.Login)

	// Frontend gọi /api/auth/* (alias cho tương thích)
	r.POST("/api/auth/login", controllers.Login)
	r.POST("/api/auth/register", controllers.Register)
	r.POST("/api/auth/logout", controllers.Logout)

	// Đăng nhập Google (verify access_token với Google rồi cấp JWT của Boko)
	r.POST("/api/auth/google", controllers.GoogleAuth)

	// Đặt lại mật khẩu (quên mật khẩu) — token dùng 1 lần gửi qua email
	r.POST("/api/auth/forgot-password", controllers.ForgotPassword)
	r.POST("/api/auth/reset-password", controllers.ResetPassword)

	// Thông tin shop (pháp lý/footer/hoá đơn)
	r.GET("/api/shop", controllers.GetShopInfo)

	// Giao hàng: địa chỉ (master data GHN) + phí vận chuyển + cấu hình giá
	r.GET("/api/shipping/provinces", controllers.GetShippingProvinces)
	r.GET("/api/shipping/districts", controllers.GetShippingDistricts)
	r.GET("/api/shipping/wards", controllers.GetShippingWards)
	r.POST("/api/shipping/quote", controllers.QuoteShippingFee)
	r.GET("/api/pricing", controllers.GetPricingConfig)

	// Books (public)
	r.GET("/api/books", controllers.GetBooks)
	r.GET("/api/books/:id", controllers.GetBook)

	// Categories (public)
	r.GET("/api/categories", controllers.GetCategories)
	r.GET("/api/categories/:id", controllers.GetCategory)

	// Reviews (public)
	r.GET("/api/books/:id/reviews", controllers.GetBookReviews)

	// Payments Webhook & Status (public cho MoMo Gateway và trang Callback)
	r.POST("/api/payment/momo/ipn", controllers.MomoIPN)
	r.POST("/api/payment/momo/mock-ipn/:id", controllers.MockMomoIPN)
	r.POST("/api/payment/momo/simulator-ipn", controllers.MomoSimulatorIPN)
	r.GET("/api/payment/momo/status/:id", middleware.AuthOptional, controllers.GetPaymentStatus)

	// Payments Create (hỗ trợ cả người dùng đăng nhập và khách)
	r.POST("/api/payment/momo/create", middleware.AuthOptional, controllers.CreateMomoPayment)

	// VNPAY Payment Routes
	r.GET("/api/payment/vnpay/ipn", controllers.VnPayIPN)
	r.GET("/api/payment/vnpay/status/:id", middleware.AuthOptional, controllers.GetVnPayPaymentStatus)
	r.POST("/api/payment/vnpay/create", middleware.AuthOptional, controllers.CreateVnPayPayment)

	// PayPal Payment Routes — cùng cấu trúc với MoMo/VNPay
	r.POST("/api/payment/paypal/mock-capture/:id", controllers.MockPaypalCapture)
	r.GET("/api/payment/paypal/status/:id", middleware.AuthOptional, controllers.GetPaypalPaymentStatus)
	r.POST("/api/payment/paypal/create", middleware.AuthOptional, controllers.CreatePaypalPayment)
	r.POST("/api/payment/paypal/capture", middleware.AuthOptional, controllers.CapturePaypalPayment)

	// COD & Order Tracking Routes (hỗ trợ cả khách đăng nhập và khách vãng lai)
	r.POST("/api/orders/quote", controllers.GetOrderQuote)
	r.POST("/api/orders/cod/create", middleware.AuthOptional, controllers.CreateCodOrder)
	r.POST("/api/orders/:id/confirm-receipt", middleware.AuthOptional, controllers.ConfirmReceiptOrder)
	r.GET("/api/orders/my-orders", middleware.AuthOptional, controllers.GetMyOrders)

	// Hoá đơn đơn hàng (chủ đơn đăng nhập, hoặc khách có ?key=)
	r.GET("/api/orders/:id/invoice", middleware.AuthOptional, controllers.GetOrderInvoice)

	// Thẻ ATM Nội Địa NCB — Xác thực OTP 1-chạm
	r.POST("/api/payment/atm/verify-otp", middleware.AuthOptional, controllers.VerifyAtmOtpPayment)

	// ==================== GHN SHIPPING ====================
	// Chuyển đơn ĐÃ ĐÓNG GÓI cho hãng thứ 3 (GHN) quản lý vận chuyển.
	r.POST("/api/orders/:id/ghn/handover", middleware.AuthRequired, middleware.SellerRequired, controllers.HandoverToGHN)
	r.GET("/api/orders/:id/ghn", middleware.AuthOptional, controllers.GetOrderShipment)
	r.POST("/api/orders/:id/ghn/sync", middleware.AuthOptional, controllers.SyncOrderShipment)
	// GHN gọi ngược khi trạng thái đơn thay đổi (phải public, không cần đăng nhập)
	r.POST("/api/ghn/webhook", controllers.GHNWebhook)
	// Biến thể đặt secret ngay trong đường dẫn (GHN không gửi được header/query):
	// POST /api/ghn/webhook/<secret>
	r.POST("/api/ghn/webhook/:secret", controllers.GHNWebhook)

	// ==================== PROTECTED ROUTES ====================

	auth := r.Group("/api")
	auth.Use(middleware.AuthRequired)
	{
		// Profile — frontend tương thích
		auth.GET("/profile", controllers.GetProfile)
		auth.PUT("/profile", controllers.UpdateProfile)
		auth.GET("/auth/me", controllers.GetProfile)         // alias frontend
		auth.PUT("/auth/profile", controllers.UpdateProfile) // alias frontend

		// Books (seller)
		auth.POST("/books", middleware.SellerRequired, controllers.CreateBook)
		auth.PUT("/books/:id", middleware.SellerRequired, controllers.UpdateBook)
		auth.DELETE("/books/:id", middleware.SellerRequired, controllers.DeleteBook)

		// Categories (admin)
		auth.POST("/categories", middleware.AdminRequired, controllers.CreateCategory)
		auth.PUT("/categories/:id", middleware.AdminRequired, controllers.UpdateCategory)
		auth.DELETE("/categories/:id", middleware.AdminRequired, controllers.DeleteCategory)

		// Cart
		auth.GET("/cart", controllers.GetCart)
		auth.POST("/cart", controllers.AddToCart)
		auth.PUT("/cart/:id", controllers.UpdateCartItem)
		auth.DELETE("/cart/:id", controllers.RemoveFromCart)

		// Orders
		auth.POST("/orders", controllers.CreateOrder)
		auth.GET("/orders", controllers.GetMyOrders)
		auth.GET("/orders/:id", controllers.GetOrderDetail)
		auth.PUT("/orders/:id/cancel", controllers.CancelOrder)

		// Reviews
		auth.POST("/books/:id/reviews", controllers.CreateReview)
		auth.DELETE("/reviews/:id", controllers.DeleteReview)

		// Coupons
		auth.POST("/coupons", middleware.SellerRequired, controllers.CreateCoupon)
		auth.POST("/apply-coupon", controllers.ApplyCoupon)
		auth.GET("/coupons", controllers.GetCoupons)
		auth.DELETE("/coupons/:id", middleware.SellerRequired, controllers.DeleteCoupon)

		// Seller Dashboard
		auth.GET("/seller/books", middleware.SellerRequired, controllers.SellerGetBooks)
		auth.GET("/seller/orders", middleware.SellerRequired, controllers.SellerGetOrders)
		auth.PUT("/seller/orders/:id/status", middleware.SellerRequired, controllers.SellerUpdateOrderStatus)

		// Admin — nhật ký email giao dịch (đối soát/kiểm thử)
		auth.GET("/admin/email-logs", middleware.AdminRequired, controllers.GetEmailLogs)
	}
}
