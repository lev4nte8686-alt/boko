import React, { useCallback, useEffect, useState } from 'react';
import { Coupon, getCoupons, createCoupon, deleteCoupon } from '../../api/seller';
import { AsyncState, Card, formatDateTime } from './ui';

interface CouponsTabProps {
  onChanged?: () => void;
}

export const CouponsTab: React.FC<CouponsTabProps> = ({ onChanged }) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('10');
  const [maxUses, setMaxUses] = useState('100');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getCoupons();
    if (!res.ok) {
      setError(res.error || 'Không tải được mã giảm giá.');
      setLoading(false);
      return;
    }
    setCoupons(res.data?.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setCode('');
    setPercent('10');
    setMaxUses('100');
    setExpires('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const pct = Number(percent);
    const max = Number(maxUses);
    if (!code.trim()) {
      setFormError('Vui lòng nhập mã giảm giá.');
      return;
    }
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      setFormError('Phần trăm giảm phải từ 1 đến 100.');
      return;
    }
    if (!expires) {
      setFormError('Vui lòng chọn ngày hết hạn.');
      return;
    }

    const isoExpiry = new Date(expires).toISOString();
    setSaving(true);
    try {
      const res = await createCoupon({
        code: code.trim().toUpperCase(),
        discount_percent: pct,
        max_uses: Number.isFinite(max) && max > 0 ? max : 100,
        expires_at: isoExpiry,
      });
      if (!res.ok) {
        setFormError(res.error || 'Tạo mã giảm giá thất bại.');
        return;
      }
      setIsFormOpen(false);
      showToast('Đã tạo mã giảm giá.');
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteCoupon(id);
    if (!res.ok) {
      showToast(res.error || 'Xoá mã giảm giá thất bại.');
      return;
    }
    setPendingDeleteId(null);
    showToast('Đã xoá mã giảm giá.');
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-5" data-testid="coupons-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Mã giảm giá</h2>
          <p className="text-xs text-slate-500">{coupons.length} mã trong hệ thống</p>
        </div>
        <button
          onClick={openForm}
          data-testid="add-coupon-btn"
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <i className="fa-solid fa-plus mr-2"></i>
          Tạo mã
        </button>
      </div>

      {isFormOpen && (
        <Card className="p-5" data-testid="coupon-form">
          <form onSubmit={handleSubmit} className="grid md:grid-cols-4 gap-4 items-end">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Mã *</span>
              <input
                data-testid="coupon-code-input"
                className="paper-input w-full mt-1 uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="GIAM20"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Giảm (%) *</span>
              <input
                data-testid="coupon-percent-input"
                type="number"
                min="1"
                max="100"
                className="paper-input w-full mt-1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Số lượt tối đa</span>
              <input
                data-testid="coupon-maxuses-input"
                type="number"
                min="1"
                className="paper-input w-full mt-1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Hết hạn *</span>
              <input
                data-testid="coupon-expires-input"
                type="datetime-local"
                className="paper-input w-full mt-1"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>

            {formError && (
              <p className="text-rose-600 text-xs font-semibold md:col-span-4" data-testid="coupon-form-error">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-3 md:col-span-4">
              <button
                type="submit"
                disabled={saving}
                data-testid="coupon-submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {saving ? 'Đang lưu…' : 'Tạo mã'}
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Huỷ
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <AsyncState
          loading={loading}
          error={error}
          empty={!coupons.length}
          emptyText="Chưa có mã giảm giá nào."
          onRetry={load}
        />
        {!loading && !error && coupons.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Mã</th>
                  <th className="px-4 py-3 text-center">Giảm</th>
                  <th className="px-4 py-3 text-center">Đã dùng</th>
                  <th className="px-4 py-3">Hết hạn</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired = c.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;
                  return (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid="coupon-row">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900" data-testid="coupon-row-code">
                        {c.code}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-900">{c.discount_percent}%</td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {c.used_count}/{c.max_uses}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(c.expires_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {!c.is_active || expired ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                            {expired ? 'Hết hạn' : 'Tắt'}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            Hoạt động
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {pendingDeleteId === c.id ? (
                            <>
                              <button
                                data-testid="coupon-delete-confirm"
                                onClick={() => handleDelete(c.id)}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Xác nhận xoá
                              </button>
                              <button
                                onClick={() => setPendingDeleteId(null)}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                              >
                                Huỷ
                              </button>
                            </>
                          ) : (
                            <button
                              data-testid={`coupon-delete-${c.id}`}
                              onClick={() => setPendingDeleteId(c.id)}
                              title="Xoá"
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 cursor-pointer"
                            >
                              <i className="fa-solid fa-trash text-xs"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toast && (
        <div
          data-testid="coupons-toast"
          className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-amber-200 px-5 py-3 rounded-xl border border-amber-500/40 shadow-2xl text-sm font-medium"
        >
          {toast}
        </div>
      )}
    </div>
  );
};
