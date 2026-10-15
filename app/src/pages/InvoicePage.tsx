import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchOrderInvoice, InvoiceData } from '../api/invoice';

/**
 * Trang hoá đơn in được: /invoice/:orderId (kèm ?key=<tracking token> cho khách).
 * Bấm "In hoá đơn" (hoặc Ctrl+P) để lưu PDF.
 */
export const InvoicePage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const trackingKey = useMemo(() => searchParams.get('key') || undefined, [searchParams]);

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!orderId) {
      setLoading(false);
      return;
    }
    fetchOrderInvoice(orderId, trackingKey).then((data) => {
      if (mounted) {
        setInvoice(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [orderId, trackingKey]);

  const formatVND = (v: number) => `${Math.round(v).toLocaleString('vi-VN')} ₫`;
  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('vi-VN');
    } catch {
      return iso;
    }
  };

  const paymentLabel = (method: string) => {
    switch (method) {
      case 'cod':
        return 'Thanh toán khi nhận hàng (COD)';
      case 'momo':
        return 'Ví MoMo';
      case 'vnpay':
        return 'VNPAY';
      case 'paypal':
        return 'PayPal';
      case 'atm':
        return 'Thẻ ATM nội địa';
      case 'bank':
        return 'Chuyển khoản ngân hàng';
      default:
        return method || 'COD';
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <i className="fa-solid fa-circle-notch fa-spin text-2xl mr-3"></i> Đang tải hoá đơn...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <i className="fa-solid fa-file-invoice text-4xl text-slate-300 mb-4"></i>
        <h1 className="font-display font-bold text-xl text-slate-800 mb-2">Không tìm thấy hoá đơn</h1>
        <p className="text-sm text-slate-500 mb-6">
          Đơn hàng không tồn tại hoặc bạn không có quyền xem hoá đơn này.
        </p>
        <Link to="/" className="text-blue-600 hover:text-blue-800 font-semibold text-sm">
          ← Về trang chủ
        </Link>
      </div>
    );
  }

  const { shop, order, items, totals } = invoice;

  return (
    <main className="flex-1 w-full bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4">
        {/* Actions (không in) */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to="/" className="text-slate-600 hover:text-slate-900 text-sm font-semibold">
            ← Về trang chủ
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold text-xs tracking-wider uppercase flex items-center gap-2 transition-all cursor-pointer"
          >
            <i className="fa-solid fa-print"></i>
            <span>In hoá đơn</span>
          </button>
        </div>

        {/* Hoá đơn */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 print:shadow-none print:border-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-200 pb-6 mb-6">
            <div>
              <h1 className="font-display font-bold text-2xl text-slate-900">{shop.name}</h1>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                MST: {shop.tax_code}
                <br />
                {shop.address}
                <br />
                Hotline: {shop.phone} • {shop.email}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <h2 className="font-display font-bold text-xl text-blue-600 uppercase">Hoá đơn</h2>
              <p className="text-xs text-slate-500 mt-1">
                Số: <strong className="text-slate-800 font-mono">{invoice.invoice_number}</strong>
                <br />
                Ngày: {formatDate(invoice.issued_at)}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-6 text-sm">
            <div>
              <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
                Đơn hàng
              </p>
              <p className="text-slate-800">
                Mã đơn: <strong className="font-mono">#{order.id}</strong>
                <br />
                Ngày đặt: {formatDate(order.created_at)}
                <br />
                Thanh toán: {paymentLabel(order.payment_method)}
              </p>
            </div>
            <div>
              <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
                Giao đến
              </p>
              <p className="text-slate-800">
                {order.shipping_address}
                <br />
                SĐT: {order.phone || '—'}
              </p>
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-left text-slate-500">
                <th className="py-2">Sách</th>
                <th className="py-2 text-center w-16">SL</th>
                <th className="py-2 text-right w-28">Đơn giá</th>
                <th className="py-2 text-right w-32">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-2.5 text-slate-800">{it.title}</td>
                  <td className="py-2.5 text-center text-slate-700">{it.quantity}</td>
                  <td className="py-2.5 text-right text-slate-700 whitespace-nowrap">{formatVND(it.price)}</td>
                  <td className="py-2.5 text-right text-slate-900 font-semibold whitespace-nowrap">
                    {formatVND(it.price * it.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 ml-auto w-full sm:w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Tạm tính</span>
              <span>{formatVND(totals.subtotal)}</span>
            </div>
            {totals.discount_amount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Giảm giá{totals.discount_percent > 0 ? ` (${totals.discount_percent}%)` : ''}</span>
                <span>-{formatVND(totals.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Phí vận chuyển</span>
              <span>{formatVND(totals.shipping)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Thuế GTGT{(totals.vat_percent ?? 0) > 0 ? ` (${totals.vat_percent}%)` : ' (sách miễn thuế)'}</span>
              <span>{formatVND(totals.vat)}</span>
            </div>
            <div className="flex justify-between text-base font-display font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Tổng cộng</span>
              <span className="text-blue-700">{formatVND(totals.total)}</span>
            </div>
          </div>

          <p className="mt-8 text-xs text-slate-400 text-center">
            Hoá đơn được tạo tự động bởi hệ thống {shop.name}. Cảm ơn bạn đã mua sắm!
          </p>
        </div>
      </div>
    </main>
  );
};
