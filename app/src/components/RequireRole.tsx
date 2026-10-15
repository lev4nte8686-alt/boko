import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';

interface RequireRoleProps {
  user: User | null;
  allow: string[]; // ví dụ: ['seller', 'admin']
  children: React.ReactNode;
}

/**
 * RequireRole — chặn truy cập bảng điều khiển theo vai trò.
 * Dùng BÊN TRONG RequireAuth (đã đảm bảo user đã đăng nhập).
 * user.role rỗng (tài khoản demo/offline) bị coi là không đủ quyền.
 */
export const RequireRole: React.FC<RequireRoleProps> = ({ user, allow, children }) => {
  const navigate = useNavigate();
  const role = (user?.role || '').toLowerCase();

  if (user && role && allow.includes(role)) {
    return <>{children}</>;
  }

  return (
    <div
      className="min-h-[calc(100vh-80px)] flex-1 flex items-center justify-center p-6 bg-slate-100/60"
      data-testid="role-denied"
    >
      <div className="w-full max-w-md bg-white rounded-3xl p-8 md:p-10 shadow-2xl border border-slate-200 text-center space-y-5">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-600 flex items-center justify-center mx-auto">
          <i className="fa-solid fa-user-shield text-3xl"></i>
        </div>
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] uppercase tracking-widest border border-rose-200">
            Không đủ quyền
          </div>
          <h2 className="font-display font-bold text-2xl text-slate-900">Khu vực dành cho người bán</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Tài khoản của bạn không có quyền truy cập bảng điều khiển người bán/quản trị.
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="w-full py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
        >
          <i className="fa-solid fa-house mr-2"></i>
          Về trang chủ
        </button>
      </div>
    </div>
  );
};
