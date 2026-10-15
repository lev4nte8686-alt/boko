import React, { useState } from 'react';
import { CartItem, Currency } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (bookId: string, delta: number) => void;
  onRemoveItem: (bookId: string) => void;
  onProceedToCheckout: () => void;
  currency: Currency;
  appliedDiscountCode: string;
  onApplyDiscountCode: (code: string) => boolean | Promise<boolean>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  currency,
  appliedDiscountCode,
  onApplyDiscountCode
}) => {
  const [couponInput, setCouponInput] = useState<string>('');
  const [couponMessage, setCouponMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  // Cost calculations
  const subtotalEUR = cart.reduce((acc, item) => acc + item.book.priceEUR * item.quantity, 0);
  const subtotalVND = cart.reduce((acc, item) => acc + item.book.priceVND * item.quantity, 0);

  const discountRate = appliedDiscountCode.toUpperCase() === 'GIAM10' ? 0.1 : 0;
  const isFreeShip = appliedDiscountCode.toUpperCase() === 'FREESHIP';

  const discountEUR = subtotalEUR * discountRate;
  const discountVND = subtotalVND * discountRate;

  const vatEUR = 0;
  const vatVND = 0;

  const totalEUR = Math.max(0, subtotalEUR - discountEUR);
  const totalVND = Math.max(0, subtotalVND - discountVND);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    const success = await onApplyDiscountCode(couponInput.trim());
    if (success) {
      setCouponMessage({ text: `Đã áp dụng mã "${couponInput.trim().toUpperCase()}"!`, isError: false });
      setCouponInput('');
    } else {
      setCouponMessage({ text: 'Mã giảm giá không hợp lệ. Thử: GIAM10 hoặc FREESHIP', isError: true });
    }
  };

  const formatPrice = (eur: number, vnd: number) => {
    return currency === 'EUR' ? `€ ${eur.toFixed(2)}` : `${vnd.toLocaleString('vi-VN')} ₫`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
      ></div>

      {/* Slide-over Panel */}
      <aside className="bg-white relative z-10 w-full max-w-md h-full flex flex-col shadow-2xl border-l border-slate-200 animate-slideLeft">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-bag-shopping text-blue-600 text-lg"></i>
            <h2 className="font-display font-bold text-xl text-slate-900">Giỏ Hàng Của Bạn</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/60 text-slate-600 transition-colors cursor-pointer w-8 h-8 flex items-center justify-center"
            title="Đóng"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-slate-500 space-y-4">
              <i className="fa-solid fa-book-open text-6xl text-slate-300"></i>
              <p className="font-body text-base">Giỏ hàng của bạn đang trống.</p>
              <button
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-label-caps text-xs tracking-wider uppercase font-semibold inline-block shadow-md shadow-blue-200 transition-all cursor-pointer"
              >
                Khám phá tủ sách
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.book.id}
                className="flex items-center gap-4 pb-4 border-b border-slate-100 group"
              >
                {/* Book Thumbnail */}
                <div className="w-16 h-20 shrink-0 relative bg-slate-100 rounded-md overflow-hidden book-spine-shadow border border-slate-200">
                  {item.book.coverUrl ? (
                    <img
                      src={item.book.coverUrl}
                      alt={item.book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      style={{ backgroundColor: item.book.bgColor || '#334155' }}
                      className="w-full h-full flex items-center justify-center p-1 text-[8px] text-white font-display text-center font-bold"
                    >
                      {item.book.title}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 truncate max-w-[150px] flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-blue-500 text-[10px]"></i>
                      <span>{item.book.brandName || 'Chính hãng'}</span>
                    </span>
                    {item.book.editionType && (
                      <span className="text-[10px] text-slate-400">({item.book.editionType})</span>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-sm text-slate-900 truncate">
                    {item.book.title}
                  </h3>
                  <p className="font-body text-xs text-slate-500">{item.book.author}</p>
                  <div className="font-body font-bold text-sm text-slate-900 mt-1">
                    {formatPrice(item.book.priceEUR * item.quantity, item.book.priceVND * item.quantity)}
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                      <button
                        onClick={() => onUpdateQuantity(item.book.id, -1)}
                        className="px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-l-lg transition-colors cursor-pointer"
                      >
                        -
                      </button>
                      <span className="px-2.5 py-0.5 text-xs font-bold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.book.id, 1)}
                        className="px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-r-lg transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => onRemoveItem(item.book.id)}
                      className="text-xs text-red-600 hover:underline flex items-center gap-1 ml-auto font-medium cursor-pointer"
                    >
                      <i className="fa-solid fa-trash-can text-xs"></i>
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer & Totals */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-4">
            {/* Coupon Code Input */}
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <input
                type="text"
                placeholder="Mã giảm giá (ví dụ: GIAM10, FREESHIP)"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                className="paper-input flex-1 font-body text-xs text-slate-900 placeholder:text-slate-400 bg-white border-slate-200"
              />
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white font-label-caps text-[11px] px-4 py-2 rounded-lg uppercase tracking-wider font-bold transition-colors cursor-pointer"
              >
                Áp Dụng
              </button>
            </form>

            {couponMessage && (
              <p className={`text-xs font-semibold ${couponMessage.isError ? 'text-red-600' : 'text-green-600'}`}>
                {couponMessage.text}
              </p>
            )}

            {/* Calculations Breakdown */}
            <div className="space-y-2 text-xs font-body text-slate-600">
              <div className="flex justify-between">
                <span>Tạm tính</span>
                <span className="font-semibold text-slate-900">
                  {formatPrice(subtotalEUR, subtotalVND)}
                </span>
              </div>

              {discountRate > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Giảm giá (10%)</span>
                  <span>-{formatPrice(discountEUR, discountVND)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Thuế GTGT (sách miễn thuế)</span>
                <span>{formatPrice(vatEUR, vatVND)}</span>
              </div>

              <div className="flex justify-between">
                <span>Phí vận chuyển</span>
                <span>{isFreeShip ? 'MIỄN PHÍ' : 'Tính ở bước thanh toán'}</span>
              </div>

              <div className="flex justify-between text-base font-display font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Tổng Tiền</span>
                <span className="text-xl text-slate-900">
                  {formatPrice(totalEUR, totalVND)}
                </span>
              </div>
            </div>

            {/* Proceed Button */}
            <button
              onClick={() => {
                onClose();
                onProceedToCheckout();
              }}
              className="bg-blue-600 hover:bg-blue-700 w-full text-white py-3.5 px-6 rounded-lg font-label-caps text-xs tracking-wider uppercase font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-200 transition-all cursor-pointer"
            >
              <span>TIẾN HÀNH THANH TOÁN</span>
              <i className="fa-solid fa-arrow-right text-sm"></i>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
