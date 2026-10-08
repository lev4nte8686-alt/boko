import React from 'react';
import { Order } from '../types';

interface OrderSuccessModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onReturnToLibrary: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  order,
  isOpen,
  onClose,
  onReturnToLibrary
}) => {
  if (!isOpen || !order) return null;

  const isEUR = order.currency === 'EUR';
  const formatPrice = (eur: number, vnd: number) =>
    isEUR ? `€ ${eur.toFixed(2)}` : `${vnd.toLocaleString('vi-VN')} ₫`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-6 sm:p-8 relative border border-slate-200 text-slate-900 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header Icon */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
            <i className="fa-solid fa-circle-check text-3xl"></i>
          </div>
          <span className="font-label-caps text-xs tracking-widest text-blue-600 uppercase font-bold block">
            BOKO • HÓA ĐƠN ĐẶT HÀNG
          </span>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-900">
            Cảm Ơn Bạn Đã Đặt Hàng!
          </h2>
          <p className="font-body text-xs sm:text-sm text-slate-500">
            Mã đơn hàng: <strong className="text-slate-900 font-mono">{order.id}</strong> • Ngày: {order.date}
          </p>
        </div>

        {/* Customer & Shipping Summary */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs sm:text-sm space-y-1 font-body text-slate-700">
          <p className="font-bold text-slate-900">
            {order.customer.firstName} {order.customer.lastName} ({order.customer.email})
          </p>
          <p>
            {order.customer.address} {order.customer.apt ? `, ${order.customer.apt}` : ''}, {order.customer.city},{' '}
            {order.customer.country}
          </p>
          <p>SĐT: {order.customer.telephone || 'Không có'}</p>
          <p className="pt-1 text-blue-600 font-semibold">
            Phương thức thanh toán:{' '}
            {order.customer.paymentMethod === 'cod'
              ? 'Thanh toán khi nhận hàng (COD)'
              : order.customer.paymentMethod === 'card'
              ? 'Thẻ Tín Dụng / Ghi Nợ'
              : order.customer.paymentMethod === 'atm'
              ? 'Thẻ ATM Nội Địa (Napas)'
              : order.customer.paymentMethod === 'ewallet'
              ? 'Ví Điện Tử (ZaloPay)'
              : order.customer.paymentMethod === 'paypal'
              ? 'PayPal (thanh toán quốc tế)'
              : 'Chuyển Khoản Ngân Hàng'}
          </p>
        </div>

        {/* Item List */}
        <div className="space-y-3 border-t border-b border-slate-200 py-4">
          <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">
            Sách Đã Mua
          </h3>
          {order.items.map((item) => (
            <div key={item.book.id} className="flex justify-between items-center text-xs sm:text-sm">
              <div className="flex items-center gap-3">
                <span className="font-bold text-blue-600">{item.quantity}x</span>
                <div>
                  <p className="font-display font-bold text-slate-900">{item.book.title}</p>
                  <p className="font-body text-[11px] text-slate-500">{item.book.author}</p>
                </div>
              </div>
              <span className="font-bold text-slate-900">
                {formatPrice(item.book.priceEUR * item.quantity, item.book.priceVND * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        {/* Total Cost Breakdown */}
        <div className="space-y-2 text-xs sm:text-sm font-body text-slate-600">
          <div className="flex justify-between">
            <span>Tạm tính</span>
            <span>{formatPrice(order.subtotalEUR, order.subtotalVND)}</span>
          </div>

          {(order.discountEUR > 0 || order.discountVND > 0) && (
            <div className="flex justify-between text-red-600">
              <span>Giảm giá</span>
              <span>-{formatPrice(order.discountEUR, order.discountVND)}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span>VAT (5%)</span>
            <span>{formatPrice(order.vatEUR, order.vatVND)}</span>
          </div>

          <div className="flex justify-between">
            <span>Phí vận chuyển</span>
            <span>{formatPrice(order.shippingEUR, order.shippingVND)}</span>
          </div>

          <div className="flex justify-between text-lg font-display font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Tổng thanh toán</span>
            <span className="text-xl text-slate-900 font-bold">
              {formatPrice(order.totalEUR, order.totalVND)}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              onClose();
              onReturnToLibrary();
            }}
            className="bg-blue-600 hover:bg-blue-700 w-full text-white py-3.5 px-6 rounded-lg font-label-caps text-xs tracking-wider uppercase font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-200 transition-all cursor-pointer"
          >
            <i className="fa-solid fa-arrow-left text-sm"></i>
            <span>QUAY LẠI TỦ SÁCH</span>
          </button>
        </div>
      </div>
    </div>
  );
};
