import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Book, CartItem, Currency, Order, User, UsedBookListing } from './types';
import { BOOKS_DATA, generateExtraBooks } from './data/books';
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
import { VnpayCallback } from './pages/VnpayCallback';
import { RequireAuth } from './components/RequireAuth';
import { getStoredAuthUser, logoutApi } from './api/auth';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currency, setCurrency] = useState<Currency>('VND');
  const [booksList, setBooksList] = useState<Book[]>(BOOKS_DATA);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const [cart, setCart] = useState<CartItem[]>([
    // Initialize with Albert Camus L'Étranger by default so user can test cart & checkout immediately
    {
      book: BOOKS_DATA.find((b) => b.id === 'camus-1') || BOOKS_DATA[0],
      quantity: 1,
    },
  ]);

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

  // Load 10 additional books horizontally into a specific category without filtering out other shelves
  const handleLoadMoreBooks = (category: string) => {
    const currentCategoryCount = booksList.filter((b) => b.category === category).length;
    const newBooks = generateExtraBooks(category, currentCategoryCount, 10);

    setBooksList((prev) => [...prev, ...newBooks]);

    setToastMessage(`Đã thêm 10 cuốn sách mới vào kệ ${category}!`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

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

  const handleApplyDiscountCode = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === 'GIAM10' || cleanCode === 'FREESHIP') {
      setAppliedDiscountCode(cleanCode);
      return true;
    }
    return false;
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

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    try {
      localStorage.setItem('boko_user', JSON.stringify(updatedUser));
    } catch (e) {
      console.error(e);
    }
  };

  const handleOrderPlaced = (order: Order) => {
    setCompletedOrder(order);
    setCart([]);
    setIsOrderSuccessOpen(true);
  };

  const categories = ['TRINH THÁM', 'VĂN HỌC', 'LỊCH SỬ', 'KHOA HỌC', 'NGHỆ THUẬT'];
  const totalCartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Check if current route is auth page
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/signup';

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
        {/* Home / Library Route - Redirects to /login if not authenticated, otherwise renders home */}
        <Route
          path="/"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : (
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
                </div>

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
                          onLoadMoreBooks={handleLoadMoreBooks}
                          currency={currency}
                        />
                      );
                    })}
                </BookcaseCabinet>
              </main>
            )
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

        {/* Checkout Route - Protected with RequireAuth */}
        <Route
          path="/checkout"
          element={
            <RequireAuth user={user}>
              <CheckoutView
                cart={cart}
                currency={currency}
                onReturnToCart={() => {
                  navigate('/');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onOrderPlaced={handleOrderPlaced}
                appliedDiscountCode={appliedDiscountCode}
                onApplyDiscountCode={handleApplyDiscountCode}
                user={user}
                // Ẩn iframe PayPal khi có popup phủ lên (iframe PayPal vẽ đè lên modal)
                isOverlayOpen={isSettingsOpen || isOrderSuccessOpen || isCartOpen || isSearchOpen || isReaderOpen}
                onOpenSettings={handleOpenSettings}
                onOpenProfile={() => handleOpenSettings('profile')}
                onSaveAddressToProfile={(address) => {
                  if (user) {
                    handleUpdateUser({ ...user, shippingAddress: address });
                  }
                }}
              />
            </RequireAuth>
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

        {/* Catch-all fallback Route -> If user not logged in, show RequireAuth; else redirect to / */}
        <Route
          path="*"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <RequireAuth user={user}>
                <div />
              </RequireAuth>
            )
          }
        />
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
        books={booksList}
        onSelectBook={handleSelectBook}
        currency={currency}
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
      {!isAuthRoute && (
        <footer className="w-full bg-white border-t border-slate-200 py-8 px-6 text-center text-xs text-slate-500 space-y-1 mt-auto">
          <p className="font-display font-semibold text-slate-800">Boko • Nhà Sách Trực Tuyến</p>
          <p>© 2026 Boko. Tất cả quyền được bảo lưu.</p>
        </footer>
      )}
    </div>
  );
}
