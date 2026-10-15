import React from 'react';

// ============================================================================
// Tiện ích dùng chung cho bảng điều khiển seller/admin.
// ============================================================================

export const formatVND = (v: number): string =>
  `${Math.round(Number.isFinite(v) ? v : 0).toLocaleString('vi-VN')} ₫`;

export const formatDateTime = (raw?: string): string => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  shipping: 'bg-violet-100 text-violet-800 border-violet-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
};

const PAYMENT_STYLES: Record<string, string> = {
  unpaid: 'bg-amber-100 text-amber-800 border-amber-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-rose-100 text-rose-700 border-rose-200',
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
};

export const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const key = (status || '').toLowerCase();
  return (
    <span
      data-testid="status-badge"
      data-status={key}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
        STATUS_STYLES[key] || 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      {ORDER_STATUS_LABELS[key] || status || '—'}
    </span>
  );
};

export const PaymentBadge: React.FC<{ status?: string }> = ({ status }) => {
  const key = (status || '').toLowerCase();
  return (
    <span
      data-testid="payment-badge"
      data-status={key}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
        PAYMENT_STYLES[key] || 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      {PAYMENT_LABELS[key] || status || '—'}
    </span>
  );
};

export const AsyncState: React.FC<{
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
}> = ({ loading, error, empty, emptyText = 'Chưa có dữ liệu.', onRetry }) => {
  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm" data-testid="loading-state">
        <i className="fa-solid fa-spinner fa-spin text-lg mr-2"></i>
        Đang tải…
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-10 text-center" data-testid="error-state">
        <p className="text-rose-600 text-sm font-semibold mb-3">
          <i className="fa-solid fa-triangle-exclamation mr-2"></i>
          {error}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
          >
            Thử lại
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm" data-testid="empty-state">
        <i className="fa-regular fa-folder-open text-2xl block mb-2 opacity-60"></i>
        {emptyText}
      </div>
    );
  }
  return null;
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

export const StatCard: React.FC<{
  label: string;
  value: string;
  icon: string;
  tone?: 'blue' | 'amber' | 'emerald' | 'violet';
  testId?: string;
}> = ({ label, value, icon, tone = 'blue', testId }) => {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tones[tone]}`}>
          <i className={`${icon} text-lg`}></i>
        </div>
        <div>
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">{label}</p>
          <p className="text-xl font-display font-bold text-slate-900" data-testid={testId}>
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
};
