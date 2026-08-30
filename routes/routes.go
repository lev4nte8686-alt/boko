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

	// Auth
	r.POST("/api/register", controllers.Register)
	r.POST("/api/login", controllers.Login)

	// Books (public)
	r.GET("/api/books", controllers.GetBooks)
	r.GET("/api/books/:id", controllers.GetBook)

	// Categories (public)
	r.GET("/api/categories", controllers.GetCategories)
	r.GET("/api/categories/:id", controllers.GetCategory)

	// Reviews (public)
	r.GET("/api/books/:id/reviews", controllers.GetBookReviews)

	// ==================== PROTECTED ROUTES ====================

	auth := r.Group("/api")
	auth.Use(middleware.AuthRequired)
	{
		// Profile
		auth.GET("/profile", controllers.GetProfile)
		auth.PUT("/profile", controllers.UpdateProfile)

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
	}
}