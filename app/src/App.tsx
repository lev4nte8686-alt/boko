import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Book, CartItem, Currency, Order, User, UsedBookListing } from './types';
import { INITIAL_USED_BOOKS } from './data/usedBooks';
import { Header } from './components/Header';
import { ShelfSection } from './components/ShelfSection';
import { BookcaseCabinet } from './components/BookcaseCabinet';
import { MallBar } from './components/MallBar';
import { BookReaderModal } from './components/BookReaderModal';
import { CartDrawer } from './components/CartDrawer';
import { SearchModal } from './components/SearchModal';
import { CheckoutView } from './components/CheckoutView';
import { UsedBooksMarketView } from './components/UsedBooksMarketView';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { UserSettingsModal, SettingsTab } from './components/UserSettingsModal';
import { LoginPage } from './pages/LoginPage';
import { PaypalCallback } from './pages/PaypalCallback';
import { MomoCallback } from './pages/MomoCallback';
import { VnpayCallback } from './pages/VnpayCallback';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { InvoicePage } from './pages/InvoicePage';
import { TermsPage, PrivacyPage, ReturnsPage, ContactPage } from './pages/LegalPages';
import { DashboardPage } from './pages/DashboardPage';
import { Footer } from './components/Footer';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { getStoredAuthUser, getStoredAuthToken, logoutApi, serverUpdateProfile } from './api/auth';
import { isBackendConfigured } from './api/serverAuth';
import { fetchBooksFromBackend } from './api/catalog';
import { validateCouponCode } from './api/coupons';
import { sanitizeBokoOrdersCache } from './utils/storage';

const normalizeCategoryName = (name?: string): string => {
  const value = (name || '').trim().toLowerCase();

  if (!value) return 'Literature';
  if (value.includes('trinh') || value.includes('detective') || value.includes('mystery')) return 'Mystery';
  if (value.includes('van') || value.includes('literature') || value.includes('story') || value.includes('ngon')) return 'Literature';
  if (value.includes('lich') || value.includes('history')) return 'History';
  if (value.includes('khoa') || value.includes('science') || value.includes('tech') || value.includes('it')) return 'Science';
  if (value.includes('nghe') || value.includes('art')) return 'Art';

  return 'Literature';
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currency, setCurrency] = useState<Currency>('VND');
  // Catalog lấy 100% từ backend (không còn dữ liệu mocks ở frontend).
  const [booksList, setBooksList] = useState<Book[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isBooksLoaded, setIsBooksLoaded] = useState(false);

  useEffect(() => {
    // Làm sạch cache dữ liệu thẻ cũ khi khởi động (Fail-closed)
    sanitizeBokoOrdersCache();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadBooks() {
      if (!isBackendConfigured()) {
        setIsBooksLoaded(true);
        return;
      }

      try {
        // Backend free-tier có thể đang ngủ (cold start): thử lại vài lần
        // trước khi chịu để kệ trống.
        let backendBooks: Book[] = [];
        for (let attempt = 1; attempt <= 3; attempt++) {
          backendBooks = await fetchBooksFromBackend();
          if (backendBooks.length > 0) break;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 8000));
        }
        if (isMounted) {
          // Lọc bỏ sách fixture test để không hiển thị rác kiểm thử lên UI
          setBooksList(
            backendBooks.filter(
              (b) => !b.title.startsWith('MATRIX_') && !b.title.startsWith('STAGE2_') && !b.title.startsWith('S3_')
            )
          );
          setIsBooksLoaded(true);
        }
      } catch (error) {
        console.warn('Failed to load books from backend:', error);
        if (isMounted) setIsBooksLoaded(true);
      }
    }

    loadBooks();
    return () => {
      isMounted = false;
    };
  }, []);

  // Used Books Marketplace state with localStorage persistence
  const [usedBooksList, setUsedBooksList] = useState<UsedBookListing[]>(() => {
    try {
      const saved = localStorage.getItem('boko_used_books');
      return saved ? JSON.parse(saved) : INITIAL_USED_BOOKS;
    } catch {
      return INITIAL_USED_BOOKS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('boko_used_books', JSON.stringify(usedBooksList));
    } catch (e) {
      console.error(e);
    }
  }, [usedBooksList]);

  // User Auth State - auto-loads from storage, user doesn't need to log in again if already authenticated
  const [user, setUser] = useState<User | null>(() => getStoredAuthUser());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('profile');

  const handleOpenSettings = (tab: SettingsTab = 'profile') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  const [cart, setCart] = useState<CartItem[]>(() => {
    // Giỏ hàng được lưu vào localStorage để không mất khi reload/điều hướng.
    try {
      const raw = localStorage.getItem('boko_cart');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('boko_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn('Không lưu được giỏ hàng vào localStorage:', e);
    }
  }, [cart]);

  // Modals state
  const [selectedBookForReader, setSelectedBookForReader] = useState<Book | null>(null);
  const [isReaderOpen, setIsReaderOpen] = useState<boolean>(false);

  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string>('');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [isOrderSuccessOpen, setIsOrderSuccessOpen] = useState<boolean>(false);

  // Filter category & brand state
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  // Filtered books based on brand selection
  const displayedBooks = selectedBrandId
    ? booksList.filter((b) => b.brandId === selectedBrandId)
    : booksList;

  // Cart operations
  const handleAddToCart = (book: Book) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.book.id === book.id);
      if (existing) {
        return prevCart.map((item) =>
          item.book.id === book.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { book, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (bookId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.book.id === bookId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveItem = (bookId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.book.id !== bookId));
  };

  const handleApplyDiscountCode = async (code: string): Promise<boolean> => {
    const validation = await validateCouponCode(code);
    if (!validation.isValid) {
      return false;
    }

    setAppliedDiscountCode(validation.code);
    return true;
  };

  const handleSelectBook = (book: Book) => {
    setSelectedBookForReader(book);
    setIsReaderOpen(true);
  };

  // Used Books Marketplace operations
  const handleAddNewUsedBook = (newListing: UsedBookListing) => {
    setUsedBooksList((prev) => [newListing, ...prev]);
    setToastMessage('Đã đăng bán sách thành công trên Chợ Sách Cũ Boko!');
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleDeleteListing = (id: string) => {
    setUsedBooksList((prev) => prev.filter((b) => b.id !== id));
    setToastMessage('Đã xóa bài đăng sách cũ.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleListingStatus = (id: string) => {
    setUsedBooksList((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, status: b.status === 'available' ? 'sold' : 'available' }
          : b
      )
    );
  };

  const handleLoginSuccess = (newUser: User) => {
    setUser(newUser);
    try {
      localStorage.setItem('boko_user', JSON.stringify(newUser));
    } catch (e) {
      console.error(e);
    }
    setToastMessage(`Đăng nhập thành công! Chào mừng ${newUser.name}`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLogout = async () => {
    await logoutApi();
    setUser(null);
    setToastMessage('Đã đăng xuất khỏi tài khoản.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdateUser = async (updatedUser: User) => {
    setUser(updatedUser);
    try {
      localStorage.setItem('boko_user', JSON.stringify(updatedUser));
    } catch (e) {
      console.error(e);
    }

    const token = getStoredAuthToken();
    if (!token) return;

    try {
      const response = await serverUpdateProfile(updatedUser, token);
      if (!response.success) {
        console.warn('Profile update failed on backend:', response.error);
      }
    } catch (error) {
      console.warn('Could not sync profile update to backend:', error);
    }
  };

  const handleOrderPlaced = (order: Order) => {
    setCompletedOrder(order);
    setCart([]);
    setIsOrderSuccessOpen(true);
  };

  const categories = ['Mystery', 'Literature', 'History', 'Science', 'Art'];
  const totalCartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Check if current route is auth page
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/signup' || location.pathname === '/reset-password';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-body flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar (Shown on non-auth routes) */}
      {!isAuthRoute && (
        <Header
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenCart={() => setIsCartOpen(true)}
          cartCount={totalCartItemsCount}
          user={user}
          onOpenAuth={() => navigate('/login')}
          onLogout={handleLogout}
          onOpenSettings={handleOpenSettings}
          onOpenProfile={() => handleOpenSettings('profile')}
        />
      )}

      {/* Main Body with Routes */}
      <Routes>
        {/* Home / Library Route — xem tự do, không bắt buộc đăng nhập.
            Khách vãng lai xem kệ, thêm giỏ và đặt COD được; chỉ khi cần lưu
            thông tin/địa chỉ/tra đơn theo tài khoản mới cần đăng nhập. */}
        <Route
          path="/"
          element={
            <main className="flex-1 pt-6 pb-20 w-full animate-fadeIn">
              {/* Welcome / Brand Banner */}
              <div className="max-w-[1600px] mx-auto px-6 md:px-12 mb-6 text-center md:text-left flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-200/80 pb-6">
                <div>
                  <span className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold block mb-1">
                    BOKO MALL • TỦ SÁCH TRỰC TUYẾN
                  </span>
                  <h1 className="font-display font-bold text-3xl md:text-4xl text-slate-900 tracking-tight mb-2">
                    Tủ Sách Trực Tuyến Boko
                  </h1>
                  <p className="font-body text-sm md:text-base text-slate-500 max-w-2xl font-normal leading-relaxed">
                    Khám phá các tác phẩm tuyển chọn từ các Nhà xuất bản & Chuỗi nhà sách hàng đầu trên kiến trúc tủ sách 3D sống động.
                  </p>
                </div>
                {!user && (
                  <button
                    onClick={() => navigate('/login')}
                    className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-amber-600/20 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <i className="fa-solid fa-right-to-bracket text-sm"></i>
                    <span>Đăng nhập / Đăng ký</span>
                  </button>
                )}
              </div>

              {isBooksLoaded && displayedBooks.length === 0 ? (
                <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-20 text-center text-slate-500">
                  <i className="fa-solid fa-book-open text-4xl text-slate-300 mb-4 block"></i>
                  <p className="font-body text-sm">
                    {isBackendConfigured()
                      ? 'Chưa có sách nào trong hệ thống.'
                      : 'Chưa kết nối được kho sách nên tủ sách tạm thời trống.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mall Storefronts Bar */}
                  <MallBar
                    selectedBrandId={selectedBrandId}
                    onSelectBrand={(brandId) => setSelectedBrandId(brandId)}
                    filteredBooksCount={displayedBooks.length}
                  />

                  {/* Render Shelves inside 3D Bookcase Cabinet Frame */}
                  <BookcaseCabinet
                    activeCategoryFilter={activeCategoryFilter}
                    onSelectCategory={(category) => setActiveCategoryFilter(category)}
                    categories={categories}
                    totalBooksCount={displayedBooks.length}
                    selectedBrandId={selectedBrandId}
                    onSelectBrand={(brandId) => setSelectedBrandId(brandId)}
                  >
                    {categories
                      .filter((cat) => activeCategoryFilter === null || activeCategoryFilter === cat)
                      .map((cat) => {
                        const categoryBooks = displayedBooks.filter((b) => b.category === cat);
                        if (categoryBooks.length === 0) return null;

                        return (
                          <ShelfSection
                            key={cat}
                            title={cat}
                            books={categoryBooks}
                            onSelectBook={handleSelectBook}
                            onAddToCart={handleAddToCart}
                            currency={currency}
                          />
                        );
                      })}
                  </BookcaseCabinet>
                </>
              )}
            </main>
          }
        />

        {/* Alias routes for Home */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/library" element={<Navigate to="/" replace />} />

        {/* Used Books Marketplace Route - Protected with RequireAuth */}
        <Route
          path="/used-books"
          element={
            <RequireAuth user={user}>
              <main className="flex-1 pb-20 w-full animate-fadeIn">
                <UsedBooksMarketView
                  usedBooks={usedBooksList}
                  currency={currency}
                  user={user}
                  onAddToCart={handleAddToCart}
                  onAddNewListing={handleAddNewUsedBook}
                  onDeleteListing={handleDeleteListing}
                  onToggleListingStatus={handleToggleListingStatus}
                  onOpenAuth={() => navigate('/login')}
                />
              </main>
            </RequireAuth>
          }
        />

        {/* Checkout Route — KHÁCH VÃNG LAI cũng đặt được (COD / cổng thanh toán).
            Backend tự xử lý cả 2 trường hợp (AuthOptional), đơn của khách lấy
            theo email + mã tra cứu. */}
        <Route
          path="/checkout"
          element={
            <CheckoutView
              cart={cart}
              currency={currency}
              onReturnToCart={() => {
                navigate('/');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onRequireLogin={() => navigate('/login', { state: { from: '/checkout' } })}
              onOrderPlaced={handleOrderPlaced}
              appliedDiscountCode={appliedDiscountCode}
              onApplyDiscountCode={handleApplyDiscountCode}
              user={user}
              onOpenSettings={handleOpenSettings}
              onOpenProfile={() => handleOpenSettings('profile')}
              onSaveAddressToProfile={(address) => {
                if (user) {
                  handleUpdateUser({ ...user, shippingAddress: address });
                }
              }}
            />
          }
        />

        {/* Bảng điều khiển Người bán / Quản trị (chỉ seller/admin) */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth user={user}>
              <RequireRole user={user} allow={['seller', 'admin']}>
                <DashboardPage user={user} />
              </RequireRole>
            </RequireAuth>
          }
        />

        {/* Payment Callback Route for MoMo Sandbox */}
        <Route
          path="/payment/momo-callback"
          element={
            <MomoCallback
              onOrderSuccessFinished={() => {
                setCart([]);
              }}
            />
          }
        />

        {/* Payment Callback Route for VNPAY Sandbox */}
        <Route
          path="/payment/vnpay-callback"
          element={
            <VnpayCallback
              onOrderSuccessFinished={() => {
                setCart([]);
              }}
            />
          }
        />

        {/* Login Route (If user is already logged in, automatically routes to home) */}
        <Route
          path="/login"
          element={
            <LoginPage
              user={user}
              onLoginSuccess={handleLoginSuccess}
              initialMode="login"
            />
          }
        />

        {/* Register Route (If user is already logged in, automatically routes to home) */}
        <Route
          path="/register"
          element={
            <LoginPage
              user={user}
              onLoginSuccess={handleLoginSuccess}
              initialMode="signup"
            />
          }
        />

        <Route path="/signup" element={<Navigate to="/register" replace />} />

        {/* Payment Callback Route for PayPal (public, PayPal redirect về sau khi duyệt) */}
        <Route
          path="/payment/paypal-callback"
          element={
            <PaypalCallback
              onOrderSuccessFinished={() => {
                setCart([]);
              }}
            />
          }
        />

        {/* Trang pháp lý (công khai, không cần đăng nhập) */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Đặt lại mật khẩu (mở từ link trong email) */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Hoá đơn in được (chủ đơn đăng nhập, hoặc khách có ?key=tracking) */}
        <Route path="/invoice/:orderId" element={<InvoicePage />} />

        {/* Catch-all fallback Route -> quay về tủ sách */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast Notification for Shelf Expansion / Actions */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-amber-200 px-5 py-3 rounded-xl border border-amber-500/40 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-slideUp text-sm font-medium">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <i className="fa-solid fa-envelope-circle-check text-sm"></i>
          </div>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Book Reader Modal (Sample spread view) */}
      <BookReaderModal
        book={selectedBookForReader}
        isOpen={isReaderOpen}
        onClose={() => setIsReaderOpen(false)}
        onAddToCart={handleAddToCart}
        currency={currency}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          navigate('/checkout');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        currency={currency}
        appliedDiscountCode={appliedDiscountCode}
        onApplyDiscountCode={handleApplyDiscountCode}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectBook={handleSelectBook}
        currency={currency}
        isBackendReady={isBackendConfigured()}
      />

      {/* Order Success Modal */}
      <OrderSuccessModal
        order={completedOrder}
        isOpen={isOrderSuccessOpen}
        onClose={() => setIsOrderSuccessOpen(false)}
        onReturnToLibrary={() => {
          setIsOrderSuccessOpen(false);
          navigate('/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenOrders={
          user
            ? () => {
                setIsOrderSuccessOpen(false);
                handleOpenSettings('orders');
              }
            : undefined
        }
        onOpenInvoice={() => {
          const invoiceId = completedOrder?.dbId || completedOrder?.id;
          if (!invoiceId) return;
          setIsOrderSuccessOpen(false);
          // Khách vãng lai (và cả khách có tài khoản) đều tra cứu được hoá đơn
          // bằng mã tra cứu nhận sau khi đặt hàng.
          const key = completedOrder?.trackingToken;
          navigate(key ? `/invoice/${invoiceId}?key=${encodeURIComponent(key)}` : `/invoice/${invoiceId}`);
        }}
      />

      {/* User Settings Modal (Basic info, Shipping address, Payment methods integration) */}
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onUpdateUser={handleUpdateUser}
        initialTab={settingsInitialTab}
      />

      {/* Footer (Shown on non-auth routes) */}
      {!isAuthRoute && <Footer />}
    </div>
  );
}
