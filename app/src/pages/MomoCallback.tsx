import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPaymentStatusApi, PaymentStatusResponse } from '../api/payment';

interface MomoCallbackProps {
  onOrderSuccessFinished?: () => void;
}

export const MomoCallback: React.FC<MomoCallbackProps> = ({ onOrderSuccessFinished }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState<PaymentStatusResponse | null>(null);

  // Lấy các tham số từ URL do MoMo redirect về
  const resultCode = searchParams.get('resultCode') || '';
  const momoOrderId = searchParams.get('orderId') || '';
  const message = searchParams.get('message') || '';
  const transId = searchParams.get('transId') || '';
  const amountStr = searchParams.get('amount') || '0';
  const amount = parseInt(amountStr, 10) || 0;

  // CHỈ tin trạng thái đã được BACKEND xác thực (đồng bộ từ MoMo), KHÔNG tin
  // tham số resultCode trên URL (có thể bị giả mạo để hiện "thành công").
  const isSuccess = backendStatus?.payment_status === 'paid';

  // Trích xuất ID đơn hàng Boko từ chuỗi dạng BOKO_<id>_<timestamp> hoặc ID thuần
  const parseBokoOrderId = (momoId: string): string => {
    if (!momoId) return '';
    const parts = momoId.split('_');
    if (parts.length >= 2 && parts[0] === 'BOKO') {
      return parts[1];
    }
    // Nếu truyền thẳng ID thuần như orderId=1
    if (/^\d+$/.test(momoId)) {
      return momoId;
    }
    return '';
  };

  const bokoId = parseBokoOrderId(momoOrderId);

  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      if (bokoId) {
        try {
          // momoOrderId chính là PaymentOrderID -> backend dùng làm mã xác thực
          // cho khách vãng lai không đăng nhập.
          const res = await getPaymentStatusApi(bokoId, momoOrderId || undefined);
          if (isMounted) {
            setBackendStatus(res);
          }
        } catch (err) {
          console.error('Không thể kiểm tra trạng thái từ backend:', err);
        }
      }
      if (isMounted) {
        setLoading(false);
      }
    }

    checkStatus();

    // Dọn dẹp giỏ hàng nếu thanh toán thành công
    if (isSuccess && onOrderSuccessFinished) {
      onOrderSuccessFinished();
    }

    return () => {
      isMounted = false;
    };
  }, [bokoId, isSuccess]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 font-body">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-fadeIn">
        {/* Header Banner */}
        <div
          className={`p-6 text-center text-white ${
            isSuccess
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
              : 'bg-gradient-to-r from-rose-500 to-amber-600'
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-3 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            {isSuccess ? (
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isSuccess ? 'Thanh Toán Thành Công!' : 'Giao Dịch Chưa Hoàn Tất'}
          </h1>
          <p className="text-xs sm:text-sm text-white/90 mt-1">
            {isSuccess
              ? 'Đơn hàng của bạn đã được xác nhận qua MoMo Sandbox'
              : message || 'Giao dịch bị từ chối hoặc người dùng đã hủy thanh toán'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Transaction Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2.5 text-xs sm:text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Mã đơn hàng Boko:</span>
              <span className="font-bold text-slate-800">
                #{bokoId || (momoOrderId ? momoOrderId.slice(0, 16) : 'N/A')}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Số tiền thanh toán:</span>
              <span className="font-bold text-emerald-600 text-base">
                {amount > 0
                  ? `${amount.toLocaleString('vi-VN')} ₫`
                  : backendStatus?.total
                  ? `${backendStatus.total.toLocaleString('vi-VN')} ₫`
                  : '50.000 ₫'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Phương thức:</span>
              <span className="font-semibold text-pink-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#a50064] inline-block"></span>
                Ví MoMo (Sandbox)
              </span>
            </div>

            {transId && (
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Mã giao dịch MoMo:</span>
                <span className="font-mono text-xs text-slate-700">{transId}</span>
              </div>
            )}

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Trạng thái hệ thống:</span>
              {loading ? (
                <span className="text-slate-400 italic text-xs">Đang đồng bộ...</span>
              ) : (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    backendStatus?.payment_status === 'paid' || isSuccess
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {backendStatus?.payment_status === 'paid' || isSuccess ? 'Đã Thanh Toán' : 'Chưa Thanh Toán'}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.99] transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Về Trang Chủ Tiếp Tục Mua Sắm</span>
            </button>

            {!isSuccess && (
              <button
                onClick={() => navigate('/checkout')}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Quay lại màn hình thanh toán
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50/70 p-3 text-center border-t border-slate-100 text-[11px] text-slate-400">
          Hệ thống Boko Book Store • Kiểm thử thanh toán an toàn qua MoMo Gateway
        </div>
      </div>
    </div>
  );
};
