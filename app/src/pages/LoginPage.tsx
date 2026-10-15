import React, { useState } from 'react';
import { Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { User } from '../types';
import forestBgImg from '../assets/images/auth_forest_bg_1786582595599.jpg';
import logoImg from '../assets/images/app_main_logo_1786578722639.jpg';
import { loginApi, signupApi, socialLoginApi, MOCK_USER_CREDENTIALS, forgotPasswordApi } from '../api/auth';

interface LoginPageProps {
  user: User | null;
  onLoginSuccess: (user: User) => void;
  initialMode?: 'login' | 'signup';
}

export const LoginPage: React.FC<LoginPageProps> = ({
  user,
  onLoginSuccess,
  initialMode = 'login',
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(initialMode);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  const handleFillMockAccount = () => {
    setEmail(MOCK_USER_CREDENTIALS.username);
    setPassword(MOCK_USER_CREDENTIALS.password);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);

    if (mode === 'forgot') {
      if (!email || !email.includes('@')) {
        setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.');
        return;
      }
      // Gửi yêu cầu thật tới backend (POST /api/auth/forgot-password). Backend
      // luôn trả 200 để không tiết lộ email có tồn tại hay không.
      setIsLoading(true);
      const res = await forgotPasswordApi(email);
      setIsLoading(false);

      if (res.success) {
        setSuccessInfo(
          res.message ||
            'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả Spam).'
        );
      } else {
        setErrorMessage(res.error || 'Không gửi được yêu cầu. Vui lòng thử lại.');
      }
      return;
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setErrorMessage('Vui lòng nhập Họ và Tên.');
        return;
      }
      if (!email || !email.includes('@')) {
        setErrorMessage('Vui lòng nhập Email hợp lệ.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Mật khẩu nhập lại không trùng khớp.');
        return;
      }

      setIsLoading(true);
      try {
        const res = await signupApi({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
        });

        setIsLoading(false);
        if (res.success && res.user) {
          onLoginSuccess(res.user);
          navigate('/', { replace: true });
        } else {
          setErrorMessage(res.error || 'Đăng ký không thành công. Vui lòng thử lại.');
        }
      } catch (err: any) {
        setIsLoading(false);
        setErrorMessage(err?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
      }
      return;
    }

    // Login mode
    if (!email.trim()) {
      setErrorMessage('Vui lòng nhập Username hoặc Email.');
      return;
    }
    if (!password) {
      setErrorMessage('Vui lòng nhập mật khẩu.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginApi({
        identifier: email.trim(),
        password,
      });

      setIsLoading(false);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
        navigate('/', { replace: true });
      } else {
        setErrorMessage(res.error || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Có lỗi xảy ra khi gọi API đăng nhập.');
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await socialLoginApi(provider);
      setIsLoading(false);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
        navigate('/', { replace: true });
      } else {
        setErrorMessage(res.error || 'Đăng nhập xã hội không thành công.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Có lỗi xảy ra khi xác thực tài khoản.');
    }
  };

  // If user is already logged in, automatically redirect to home (or previous intended path).
  // Đặt SAU tất cả hook (Rules of Hooks): trước đây đặt trên useState nên khi
  // user đổi từ null -> có giá trị sẽ gây crash "Rendered fewer hooks than expected".
  if (user) {
    const from = (location.state as any)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 bg-slate-900 overflow-hidden select-none">
      {/* Background with Ambient Image & Blur */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700 scale-105"
        style={{
          backgroundImage: `url(${forestBgImg})`,
        }}
      />
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" />

      {/* Top Left Brand Badge */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20 px-3.5 py-1.5 rounded-full bg-white/10 text-white/90 backdrop-blur-md border border-white/20 shadow-lg text-xs font-semibold flex items-center gap-2">
        <i className="fa-solid fa-book-bookmark text-amber-300 text-xs"></i>
        <span>Boko Bookstore</span>
      </div>

      {/* Centered Glass Card */}
      <div className="relative z-10 w-full max-w-[420px] bg-white/95 backdrop-blur-2xl border border-white/80 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-7 text-slate-800 transition-all flex flex-col justify-center my-auto">
        {/* Brand Header */}
        <div className="text-center mb-3 sm:mb-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-amber-400/40 p-1 shadow-md mx-auto mb-2 flex items-center justify-center">
            <img
              src={logoImg}
              alt="Boko Logo"
              className="w-full h-full object-cover rounded-xl"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100/80 border border-amber-300 text-[10px] uppercase font-bold tracking-widest text-amber-900 mb-1">
            Boko Bookstore Gateway
          </div>
          <h2 className="font-display font-serif text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-0.5">
            {mode === 'login' && 'Chào Mừng Trở Lại'}
            {mode === 'signup' && 'Tạo Tài Khoản Mới'}
            {mode === 'forgot' && 'Đặt Lại Mật Khẩu'}
          </h2>
          <p className="text-[11px] sm:text-xs font-body text-slate-600 max-w-xs mx-auto leading-tight">
            {mode === 'login' && 'Đăng nhập để vào trang chủ & khám phá tủ sách.'}
            {mode === 'signup' && 'Tạo tài khoản để lưu trữ tủ sách cá nhân.'}
            {mode === 'forgot' && 'Nhập email để nhận đường dẫn đặt lại mật khẩu.'}
          </p>
        </div>

        {/* Mock Account Fast-Fill Helper Banner (Only in Login Mode) */}
        {mode === 'login' && (
          <div className="mb-3 p-2 rounded-xl bg-amber-500/10 border border-amber-600/20 text-slate-800 flex items-center justify-between gap-2 shadow-2xs">
            <div className="text-[10px] sm:text-[11px] leading-tight">
              <div className="font-bold text-amber-950 flex items-center gap-1">
                <i className="fa-solid fa-key text-amber-800 text-[11px]"></i>
                <span>Tài khoản dùng thử:</span>
              </div>
              <div className="text-slate-600 mt-0.5">
                <span className="font-mono font-semibold text-slate-900">test_user</span> hoặc <span className="font-mono font-semibold text-slate-900">test@gmail.com</span> / <span className="font-mono font-semibold text-slate-900">testpass</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFillMockAccount}
              className="px-2.5 py-1 rounded-lg bg-[#8c6d62] hover:bg-[#785b51] text-white text-[10px] font-bold tracking-wide uppercase shadow-xs shrink-0 cursor-pointer transition-all active:scale-95"
            >
              Điền nhanh
            </button>
          </div>
        )}

        {/* Error / Success Feedback */}
        {errorMessage && (
          <div className="mb-2.5 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-[11px] font-medium flex items-center gap-2 animate-fadeIn">
            <i className="fa-solid fa-circle-exclamation text-xs shrink-0"></i>
            <span className="leading-tight">{errorMessage}</span>
          </div>
        )}

        {successInfo && (
          <div className="mb-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-[11px] font-medium flex items-center gap-2 animate-fadeIn">
            <i className="fa-solid fa-circle-check text-xs shrink-0"></i>
            <span className="leading-tight">{successInfo}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-2.5">
          {/* Full Name (Sign Up only) */}
          {mode === 'signup' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-0.5">
                HỌ VÀ TÊN
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập họ và tên..."
                className="w-full px-3 py-2 rounded-xl bg-white/90 border border-slate-200/90 text-slate-900 text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700/40 focus:border-amber-700 shadow-2xs transition-all"
              />
            </div>
          )}

          {/* Email / Username */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-0.5">
              USERNAME / EMAIL
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === 'signup' ? 'email@example.com' : 'test_user hoặc test@gmail.com'}
              className="w-full px-3 py-2 rounded-xl bg-white/90 border border-slate-200/90 text-slate-900 text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700/40 focus:border-amber-700 shadow-2xs transition-all"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-0.5">
                SỐ ĐIỆN THOẠI
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0987654321"
                className="w-full px-3 py-2 rounded-xl bg-white/90 border border-slate-200/90 text-slate-900 text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700/40 focus:border-amber-700 shadow-2xs transition-all"
              />
            </div>
          )}

          {/* Password (Login & Sign Up) */}
          {mode !== 'forgot' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-0.5">
                MẬT KHẨU
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-white/90 border border-slate-200/90 text-slate-900 text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700/40 focus:border-amber-700 shadow-2xs transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                >
                  {showPassword ? (
                    <i className="fa-solid fa-eye-slash text-xs"></i>
                  ) : (
                    <i className="fa-solid fa-eye text-xs"></i>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Confirm Password (Sign Up only) */}
          {mode === 'signup' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-0.5">
                XÁC NHẬN MẬT KHẨU
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl bg-white/90 border border-slate-200/90 text-slate-900 text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700/40 focus:border-amber-700 shadow-2xs transition-all"
              />
            </div>
          )}

          {/* Forgot Password Link */}
          {mode === 'login' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setErrorMessage(null);
                  setSuccessInfo(null);
                }}
                className="text-[11px] font-semibold text-amber-900 hover:text-amber-700 hover:underline transition-colors cursor-pointer"
              >
                Quên mật khẩu?
              </button>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-5 rounded-xl bg-[#8c6d62] hover:bg-[#785b51] active:bg-[#674b41] text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer"
          >
            {isLoading ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin text-sm"></i>
                <span>Đang xử lý...</span>
              </>
            ) : (
              <span>
                {mode === 'login' && 'ĐĂNG NHẬP'}
                {mode === 'signup' && 'TẠO TÀI KHOẢN'}
                {mode === 'forgot' && 'GỬI YÊU CẦU'}
              </span>
            )}
          </button>
        </form>

        {/* Social Logins Divider & Buttons */}
        {mode !== 'forgot' && (
          <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-center">
            {/* Direct Google OAuth Login Button */}
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 shadow-2xs flex items-center justify-center gap-2.5 transition-all hover:border-slate-400 active:scale-[0.98] cursor-pointer mb-2.5 group text-slate-700 font-semibold text-xs"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Tiếp tục bằng Google (OAuth)</span>
            </button>

            <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block mb-2">
              Hoặc các phương thức khác
            </span>

            <div className="flex items-center justify-center gap-3">
              {/* Facebook Button */}
              <button
                type="button"
                onClick={() => handleSocialLogin('facebook')}
                disabled={isLoading}
                title="Đăng nhập bằng Facebook"
                className="w-9 h-9 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white shadow-xs flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <i className="fa-brands fa-facebook-f text-sm"></i>
              </button>

              {/* Apple Button */}
              <button
                type="button"
                onClick={() => handleSocialLogin('apple')}
                disabled={isLoading}
                title="Đăng nhập bằng Apple ID"
                className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-black text-white shadow-xs flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <i className="fa-brands fa-apple text-sm"></i>
              </button>
            </div>
          </div>
        )}

        {/* Footer Toggle (Sign Up <-> Login) */}
        <div className="mt-3 text-center text-xs font-body text-slate-600">
          {mode === 'login' && (
            <p>
              Chưa có tài khoản?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setSuccessInfo(null);
                }}
                className="font-bold text-amber-900 hover:text-amber-700 hover:underline ml-1 cursor-pointer"
              >
                Đăng ký ngay
              </button>
            </p>
          )}

          {mode === 'signup' && (
            <p>
              Đã có tài khoản?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessInfo(null);
                }}
                className="font-bold text-amber-900 hover:text-amber-700 hover:underline ml-1 cursor-pointer"
              >
                Đăng nhập
              </button>
            </p>
          )}

          {mode === 'forgot' && (
            <p>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessInfo(null);
                }}
                className="font-bold text-amber-900 hover:text-amber-700 hover:underline ml-1 cursor-pointer"
              >
                Quay lại Đăng nhập
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
