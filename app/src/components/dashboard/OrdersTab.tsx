import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerOrder, getSellerOrders, updateOrderStatus } from '../../api/seller';
import { handoverToGHNApi, syncOrderShipmentApi } from '../../api/order';
import { User } from '../../types';
import { AsyncState, Card, formatVND, formatDateTime, StatusBadge, PaymentBadge, ORDER_STATUS_LABELS } from './ui';

interface OrdersTabProps {
  user: User | null;
  onChanged?: () => void;
}

const FILTERS = ['all', 'pending', 'confirmed', 'shipping', 'completed', 'cancelled'];

function allowedNextStatuses(current: string, isAdmin: boolean): string[] {
  if (current === 'completed' || current === 'cancelled') return [];
  if (isAdmin) {
    return ['confirmed', 'shipping', 'completed', 'cancelled'].filter((s) => s !== current);
  }
  switch (current) {
    case 'pending':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['shipping', 'cancelled'];
    case 'shipping':
      return ['completed', 'cancelled'];
    default:
      return [];
  }
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ user, onChanged }) => {
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getSellerOrders();
    if (!res.ok) {
      setError(res.error || 'Không tải được danh sách đơn hàng.');
      setLoading(false);
      return;
    }
    setOrders(res.data?.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const o of orders) map[o.status] = (map[o.status] || 0) + 1;
    return map;
  }, [orders]);

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  const handleApplyStatus = async (order: SellerOrder) => {
    const next = draftStatus[order.id];
    if (!next || next === order.status) return;
    setBusyId(order.id);
    try {
      const res = await updateOrderStatus(order.id, next);
      if (!res.ok) {
        showToast(res.error || 'Cập nhật trạng thái thất bại.');
        return;
      }
      showToast(`Đơn #${order.id} → ${ORDER_STATUS_LABELS[next] || next}`);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const handleHandover = async (order: SellerOrder) => {
    setBusyId(order.id);
    try {
      const res = await handoverToGHNApi(order.id);
      if (res?.shipment) {
        showToast(`Đã chuyển đơn #${order.id} cho GHN. Mã: ${res.shipment.order_code}`);
      } else {
        showToast(res?.message || 'Đơn đã được chuyển cho GHN trước đó.');
      }
      await load();
    } catch (err: any) {
      showToast(err?.message || 'Chuyển đơn cho GHN thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSync = async (order: SellerOrder) => {
    setBusyId(order.id);
    try {
      const res = await syncOrderShipmentApi(order.id);
      showToast(
        res?.shipment?.status_text
          ? `Đơn #${order.id}: ${res.shipment.status_text}`
          : 'Đã đồng bộ trạng thái vận đơn.'
      );
      await load();
    } catch (err: any) {
      showToast(err?.message || 'Đồng bộ vận đơn thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="orders-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Quản lý đơn hàng</h2>
          <p className="text-xs text-slate-500">Đơn chứa sách của cửa hàng — cập nhật trạng thái & bàn giao GHN</p>
        </div>
        <button
          onClick={load}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
        >
          <i className="fa-solid fa-rotate mr-2"></i>
          Tải lại
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            data-testid={`order-filter-${f}`}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border cursor-pointer ${
              filter === f
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {f === 'all' ? 'Tất cả' : ORDER_STATUS_LABELS[f] || f}
            <span className="ml-1.5 opacity-70">{counts[f] || 0}</span>
          </button>
        ))}
      </div>

      <Card>
        <AsyncState
          loading={loading}
          error={error}
          empty={!visible.length}
          emptyText="Không có đơn hàng nào ở mục này."
          onRetry={load}
        />
        {!loading && !error && visible.length > 0 && (
          <div className="divide-y divide-slate-100">
            {visible.map((o) => {
              const nextOptions = allowedNextStatuses(o.status, isAdmin);
              const showHandover = o.status === 'shipping' && !o.shipment;
              return (
                <div key={o.id} className="p-4 md:p-5" data-testid="order-row">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-display font-bold text-slate-900" data-testid="order-row-id">
                          #{o.id}
                        </span>
                        <StatusBadge status={o.status} />
                        <PaymentBadge status={o.payment_status} />
                        <span className="text-[11px] uppercase font-bold text-slate-400">
                          {o.payment_method}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">
                        <i className="fa-solid fa-user mr-1.5"></i>
                        {o.user?.name || 'Khách'} • {o.user?.email || o.phone || '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <i className="fa-regular fa-clock mr-1.5"></i>
                        {formatDateTime(o.created_at)} • {o.items?.length || 0} sản phẩm
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-display font-bold text-lg text-slate-900">{formatVND(o.total)}</p>
                      <button
                        onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        data-testid={`order-toggle-${o.id}`}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        {expandedId === o.id ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                      </button>
                    </div>
                  </div>

                  {(nextOptions.length > 0 || o.shipment || showHandover) && (
                    <div className="flex items-center gap-2.5 mt-3 flex-wrap">
                      {nextOptions.length > 0 && (
                        <>
                          <select
                            data-testid={`order-status-select-${o.id}`}
                            className="paper-input text-xs py-1.5"
                            value={draftStatus[o.id] || ''}
                            onChange={(e) => setDraftStatus({ ...draftStatus, [o.id]: e.target.value })}
                          >
                            <option value="">— Chuyển trạng thái —</option>
                            {nextOptions.map((s) => (
                              <option key={s} value={s}>
                                {ORDER_STATUS_LABELS[s] || s}
                              </option>
                            ))}
                          </select>
                          <button
                            data-testid={`order-status-apply-${o.id}`}
                            disabled={busyId === o.id || !draftStatus[o.id]}
                            onClick={() => handleApplyStatus(o)}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Cập nhật
                          </button>
                        </>
                      )}

                      {showHandover && (
                        <button
                          data-testid={`order-handover-${o.id}`}
                          disabled={busyId === o.id}
                          onClick={() => handleHandover(o)}
                          className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                        >
                          <i className="fa-solid fa-truck-fast mr-1.5"></i>
                          Chuyển cho GHN
                        </button>
                      )}

                      {o.shipment && (
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                            GHN: {o.shipment.order_code} • {o.shipment.status_text}
                          </span>
                          <button
                            data-testid={`order-sync-${o.id}`}
                            disabled={busyId === o.id}
                            onClick={() => handleSync(o)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold cursor-pointer"
                          >
                            <i className="fa-solid fa-rotate mr-1"></i>
                            Đồng bộ
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {expandedId === o.id && (
                    <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4" data-testid={`order-detail-${o.id}`}>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[11px] uppercase font-bold text-slate-400 mb-2">Sản phẩm</p>
                          <ul className="space-y-1.5">
                            {(o.items || []).map((it) => (
                              <li key={it.id} className="flex justify-between text-xs">
                                <span className="text-slate-700">
                                  {it.title} <span className="text-slate-400">×{it.quantity}</span>
                                </span>
                                <span className="font-semibold text-slate-900">
                                  {formatVND(it.price * it.quantity)}
                                </span>
                              </li>
                            ))}
                            {!o.items?.length && <li className="text-xs text-slate-400">Không có sản phẩm.</li>}
                          </ul>
                        </div>
                        <div className="text-xs space-y-1.5">
                          <p className="text-[11px] uppercase font-bold text-slate-400 mb-2">Giao hàng</p>
                          <p className="text-slate-700">
                            <i className="fa-solid fa-location-dot mr-1.5 text-slate-400"></i>
                            {o.shipping_address || '—'}
                          </p>
                          <p className="text-slate-700">
                            <i className="fa-solid fa-phone mr-1.5 text-slate-400"></i>
                            {o.phone || '—'}
                          </p>
                          <div className="pt-2 mt-2 border-t border-slate-200 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Tạm tính</span>
                              <span>{formatVND(o.subtotal)}</span>
                            </div>
                            {o.discount_amount > 0 && (
                              <div className="flex justify-between text-emerald-700">
                                <span>Giảm giá {o.coupon_code ? `(${o.coupon_code})` : ''}</span>
                                <span>-{formatVND(o.discount_amount)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-slate-500">Phí vận chuyển</span>
                              <span>{formatVND(o.shipping_fee)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">VAT ({o.vat_percent}%)</span>
                              <span>{formatVND(o.vat_amount)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                              <span>Tổng</span>
                              <span>{formatVND(o.total)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {toast && (
        <div
          data-testid="orders-toast"
          className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-amber-200 px-5 py-3 rounded-xl border border-amber-500/40 shadow-2xl text-sm font-medium max-w-sm"
        >
          {toast}
        </div>
      )}
    </div>
  );
};
