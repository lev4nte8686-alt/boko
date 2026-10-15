import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { User } from '../types';
import logoImg from '../assets/images/app_main_logo_1786578722639.jpg';

interface HeaderProps {
  currentView?: 'library' | 'usedBooks' | 'checkout';
  onNavigate?: (view: 'library' | 'usedBooks' | 'checkout') => void;
  onOpenSearch: () => void;
  onOpenCart: () => void;
  cartCount: number;
  user: User | null;
  onOpenAuth?: () => void;
  onLogout: () => void;
  onOpenSettings?: (tab?: 'profile' | 'orders' | 'address' | 'payments') => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onOpenSearch,
  onOpenCart,
  cartCount,
  user,
  onOpenAuth,
  onLogout,
  onOpenSettings,
  onOpenProfile
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isUsedBooksActive = location.pathname === '/used-books' || currentView === 'usedBooks';
  const isLibraryActive = location.pathname === '/' || location.pathname === '/home' || currentView === 'library';

  const handleNav = (path: string, viewType: 'library' | 'usedBooks') => {
    if (onNavigate) {
      onNavigate(viewType);
    }
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenSettingTab = (tab: 'profile' | 'orders' | 'address' | 'payments') => {
    setIsUserMenuOpen(false);
    if (onOpenSettings) {
      onOpenSettings(tab);
    } else if (onOpenProfile) {
      onOpenProfile();
    }
  };

  const handleAuthClick = () => {
    if (onOpenAuth) {
      onOpenAuth();
    } else {
      navigate('/login');
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200 transition-all duration-300">
      <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-3.5 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link
          to="/"
          onClick={() => {
            if (onNavigate) onNavigate('library');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="group flex items-center gap-3 text-left focus:outline-none cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/40 p-0.5 shadow-md shadow-slate-300/50 group-hover:scale-105 transition-transform overflow-hidden flex items-center justify-center">
            <img
              src={logoImg}
              alt="Boko Logo"
              className="w-full h-full object-cover rounded-lg"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 block leading-none">
              Boko
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mt-1">
              Nhà Sách Trực Tuyến
            </span>
          </div>
        </Link>

        {/* Center Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-full border border-slate-200">
          <button
            onClick={() => handleNav('/', 'library')}
            className={`px-4 py-1.5 rounded-full text-xs uppercase font-bold tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              isLibraryActive && !isUsedBooksActive
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className="fa-solid fa-book-open text-xs"></i>
            <span>Thư Viện Sách</span>
          </button>
          <button
            onClick={() => handleNav('/used-books', 'usedBooks')}
            className={`px-4 py-1.5 rounded-full text-xs uppercase font-bold tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              isUsedBooksActive
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className="fa-solid fa-shop text-xs"></i>
            <span>Chợ Sách Cũ</span>
          </button>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Search Button */}
          <button
            onClick={onOpenSearch}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors relative cursor-pointer"
            title="Tìm kiếm sách"
          >
            <i className="fa-solid fa-magnifying-glass text-base"></i>
          </button>

          {/* Cart Bag Button */}
          <button
            onClick={onOpenCart}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors relative cursor-pointer"
            title="Giỏ hàng"
          >
            <i className="fa-solid fa-bag-shopping text-base"></i>
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-blue-600 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-sm shadow-blue-200 animate-pulse">
                {cartCount}
              </span>
            )}
          </button>

          {/* User Auth Button / Profile Menu */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 transition-colors cursor-pointer"
                title="Tài khoản cá nhân"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover border border-amber-400/60"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-900 text-amber-100 text-xs font-bold flex items-center justify-center">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-semibold text-amber-950 max-w-[100px] truncate hidden md:inline">
                  {user.name}
                </span>
                <i className="fa-solid fa-chevron-down text-[10px] text-amber-800"></i>
              </button>

              {/* User Dropdown */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-fadeIn overflow-hidden">
                  {/* Dropdown Header with Logo & Brand */}
                  <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white flex items-center gap-3 border-b border-amber-500/30">
                    <div className="w-9 h-9 rounded-lg bg-slate-900 border border-amber-400/40 p-0.5 overflow-hidden flex items-center justify-center shrink-0">
                      <img
                        src={logoImg}
                        alt="Boko Logo"
                        className="w-full h-full object-cover rounded-md"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-bold text-sm tracking-tight text-amber-100">Boko</span>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-400 text-slate-950">
                          Member
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-200/80 truncate">{user.name}</p>
                    </div>
                  </div>

                  {/* User Email & Provider */}
                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/60">
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>

                  {/* Menu Options */}
                  <div className="py-1.5 space-y-0.5">
                    {/* Bảng điều khiển (chỉ seller/admin) */}
                    {(user.role === 'seller' || user.role === 'admin') && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          navigate('/dashboard');
                        }}
                        data-testid="header-dashboard-link"
                        className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-950 flex items-center gap-2.5 transition-colors cursor-pointer group"
                      >
                        <i className="fa-solid fa-gauge-high text-sm text-violet-600 group-hover:text-violet-800 w-4 text-center"></i>
                        <div className="flex-1">
                          <span className="font-bold block text-slate-900">Bảng điều khiển</span>
                          <span className="text-[10px] text-slate-400 block font-normal">Quản lý sách, đơn hàng, mã giảm giá</span>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>
                      </button>
                    )}

                    {/* Cài đặt (Chung / Thông tin cơ bản) */}
                    <button
                      onClick={() => handleOpenSettingTab('profile')}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-950 flex items-center gap-2.5 transition-colors cursor-pointer group"
                    >
                      <i className="fa-solid fa-gear text-sm text-slate-500 group-hover:text-amber-800 w-4 text-center"></i>
                      <div className="flex-1">
                        <span className="font-bold block">Cài đặt</span>
                        <span className="text-[10px] text-slate-400 block font-normal">Thông tin cá nhân & tài khoản</span>
                      </div>
                      <i className="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>
                    </button>

                    {/* Đơn hàng của tôi */}
                    <button
                      onClick={() => handleOpenSettingTab('orders')}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-950 flex items-center gap-2.5 transition-colors cursor-pointer group"
                    >
                      <i className="fa-solid fa-box-archive text-sm text-blue-600 group-hover:text-blue-800 w-4 text-center"></i>
                      <div className="flex-1">
                        <span className="font-bold block text-slate-900">Đơn hàng của tôi</span>
                        <span className="text-[10px] text-slate-400 block font-normal">Tiến trình vận chuyển & nhận hàng</span>
                      </div>
                      <i className="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>
                    </button>

                    {/* Địa chỉ giao hàng */}
                    <button
                      onClick={() => handleOpenSettingTab('address')}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-950 flex items-center gap-2.5 transition-colors cursor-pointer group"
                    >
                      <i className="fa-solid fa-truck-fast text-sm text-slate-500 group-hover:text-amber-800 w-4 text-center"></i>
                      <span>Địa chỉ giao hàng</span>
                    </button>

                    {/* Phương thức thanh toán */}
                    <button
                      onClick={() => handleOpenSettingTab('payments')}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-950 flex items-center gap-2.5 transition-colors cursor-pointer group"
                    >
                      <i className="fa-solid fa-credit-card text-sm text-slate-500 group-hover:text-amber-800 w-4 text-center"></i>
                      <span>Phương thức thanh toán</span>
                    </button>
                  </div>

                  {/* Logout Button */}
                  <div className="pt-1 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <i className="fa-solid fa-arrow-right-from-bracket text-sm text-red-600 w-4 text-center"></i>
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleAuthClick}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-800 hover:text-amber-900 bg-slate-100 hover:bg-amber-100/70 border border-slate-200/80 hover:border-amber-300 rounded-full transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <i className="fa-solid fa-user text-xs"></i>
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};


