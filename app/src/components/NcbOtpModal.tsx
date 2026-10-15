import React, { useState, useEffect, useRef } from 'react';
import { verifyAtmOtpPaymentApi, VerifyAtmOtpResponse } from '../api/payment';
import { resolveBackendBookId } from '../api/catalog';

interface NcbOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountVND: number;
  cardNumber?: string;
  cardHolder?: string;
  bankName?: string;
  shippingAddress: string;
  phone: string;
  email: string;
  customerName: string;
  couponCode?: string;
  items: Array<{
    book_id: number | string;
    title: string;
    price: number;
    quantity: number;
  }>;
  onSuccess: (res: VerifyAtmOtpResponse) => void;
}

export const NcbOtpModal: React.FC<NcbOtpModalProps> = ({
  isOpen,
  onClose,
  amountVND,
  cardNumber = '9704 •••• •••• 1432',
  cardHolder = 'NGUYEN VAN A',
  bankName = 'NCB (Ngân hàng Quốc Dân)',
  shippingAddress,
  phone,
  email,
  customerName,
  couponCode,
  items,
  onSuccess,
}) => {
  const [otp, setOtp] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setOtp('');
      setTimeLeft(60);
      setErrorMessage(null);
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, timeLeft]);

  if (!isOpen) return null;

  const handleResendOtp = () => {
    setTimeLeft(60);
    setOtp('');
    setErrorMessage(null);
    inputRef.current?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setErrorMessage('Vui lòng nhập mã xác thực OTP.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Sách demo có id chuỗi: resolve về id số backend theo tên sách trước khi gửi.
      const resolvedItems = await Promise.all(
        items.map(async (it) => ({
          book_id: await resolveBackendBookId({ id: it.book_id, title: it.title }),
          title: it.title,
          price: it.price,
          quantity: it.quantity,
        }))
      );
      const res = await verifyAtmOtpPaymentApi({
        amount: Math.round(amountVND),
        cardNumber,
        cardHolder,
        bankName,
        otp: otp.trim(),
        shippingAddress,
        phone,
        email,
        customerName,
        couponCode,
        items: resolvedItems,
      });

      onSuccess(res);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Mã OTP không hợp lệ. Vui lòng kiểm tra lại.');
    }
  };

  // Trích xuất 4 số cuối của thẻ để hiển thị an toàn
  const last4 = cardNumber.replace(/\D/g, '').slice(-4) || '1432';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-scaleUp">
        {/* Bank Header (Branded NCB blue) */}
        <div className="bg-gradient-to-r from-[#003B7A] via-[#0052A3] to-[#0070D2] px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                <i className="fa-solid fa-building-columns text-lg"></i>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-black text-lg tracking-wider text-amber-300">NCB</span>
                  <span className="text-[11px] font-semibold tracking-wide text-white/90 uppercase">
                    Ngân Hàng Quốc Dân
                  </span>
                </div>
                <p className="text-[11px] text-white/80 font-medium">Cổng Xác Thực NCB Smart OTP (3D Secure)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Transaction Summary Card */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/90 space-y-2.5 text-xs">
            <div className="flex justify-between items-center py-0.5 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Đơn vị thụ hưởng:</span>
              <span className="font-bold text-slate-800">Cửa Hàng Sách Boko (Boko Books)</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Số tiền thanh toán:</span>
              <span className="font-bold text-[#0052A3] text-base font-mono">
                {amountVND.toLocaleString('vi-VN')} ₫
              </span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Thẻ thanh toán:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Thẻ ATM NCB •••• {last4}
              </span>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">Chủ tài khoản thẻ:</span>
              <span className="font-bold uppercase text-slate-800 font-mono">
                {cardHolder || 'NGUYEN VAN A'}
              </span>
            </div>
          </div>

          {/* Test Sandbox Badge Alert */}
          <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <i className="fa-solid fa-key text-amber-600 text-sm shrink-0 mt-0.5"></i>
            <div>
              <p className="font-bold text-amber-950">Môi Trường Kiểm Thử Ngân Hàng (Sandbox)</p>
              <p className="text-amber-800/90 text-[11px] mt-0.5">
                Mã xác thực OTP kiểm thử chuẩn là: <strong className="font-mono text-xs text-amber-950 underline">123456</strong>
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 animate-fadeIn">
              <i className="fa-solid fa-circle-exclamation text-red-500 text-sm shrink-0"></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* OTP Input Form */}
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="ncb-otp" className="text-xs font-bold text-slate-700">
                  Nhập Mã Xác Thực OTP (6 số) <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-slate-500">
                  Hiệu lực còn:{' '}
                  <strong className={timeLeft <= 10 ? 'text-red-600 font-mono' : 'text-slate-700 font-mono'}>
                    {timeLeft}s
                  </strong>
                </span>
              </div>

              <input
                ref={inputRef}
                id="ncb-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                disabled={isSubmitting}
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0052A3]/30 focus:border-[#0052A3] text-slate-900 placeholder:text-slate-300 bg-white"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Chưa nhận được OTP?</span>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={timeLeft > 0 || isSubmitting}
                className="text-[#0052A3] hover:underline font-bold disabled:text-slate-400 disabled:no-underline cursor-pointer"
              >
                Gửi lại mã OTP
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-1/3 py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                HỦY BỎ
              </button>

              <button
                type="submit"
                disabled={isSubmitting || otp.length < 4}
                className="w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-[#003B7A] to-[#0052A3] hover:from-[#002D5E] hover:to-[#004080] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>ĐANG XÁC THỰC...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-shield-check text-sm"></i>
                    <span>XÁC NHẬN THANH TOÁN</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
