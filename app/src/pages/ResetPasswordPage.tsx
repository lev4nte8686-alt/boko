import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPasswordApi } from '../api/auth';

/**
 * Trang đặt lại mật khẩu — mở từ link trong email: /reset-password?token=...
 * Không yêu cầu đăng nhập.
 */
export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (searchParams.get('token') || '').trim(), [searchParams]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Đường dẫn không hợp lệ hoặc thiếu mã đặt lại mật khẩu.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không trùng khớp.');
      return;
    }

    setIsLoading(true);
    const res = await resetPasswordApi(token, password);
    setIsLoading(false);

    if (res.success) {
      setDone(true);
    } else {
      setError(res.error || 'Đặt lại mật khẩu không thành công.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-8">
        <h1 className="font-display font-bold text-2xl text-slate-900 mb-1">Đặt lại mật khẩu</h1>
        <p className="font-body text-sm text-slate-500 mb-6">
          Tạo mật khẩu mới cho tài khoản Boko của bạn.
        </p>

        {done ? (
          <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm flex items-start gap-3">
              <i className="fa-solid fa-circle-check mt-0.5"></i>
              <span>Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="w-full py-3 rounded-xl bg-[#8c6d62] hover:bg-[#785b51] text-white font-bold text-xs tracking-wider uppercase transition-all cursor-pointer"
            >
              Đăng nhập ngay
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!token && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                Đường dẫn không hợp lệ hoặc thiếu mã đặt lại mật khẩu. Vui lòng yêu cầu lại từ trang đăng nhập.
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mật khẩu mới</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-300 focus:border-amber-800 focus:ring-2 focus:ring-amber-800/20 outline-none text-sm"
                  placeholder="Tối thiểu 6 ký tự"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Hiện/ẩn mật khẩu"
                >
                  <i className={showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'}></i>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nhập lại mật khẩu</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-amber-800 focus:ring-2 focus:ring-amber-800/20 outline-none text-sm"
                placeholder="Nhập lại mật khẩu mới"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-[#8c6d62] hover:bg-[#785b51] disabled:opacity-60 text-white font-bold text-xs tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <span>XÁC NHẬN ĐẶT LẠI</span>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-xs">
          <Link to="/login" className="text-slate-500 hover:text-slate-700 font-semibold">
            ← Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};
