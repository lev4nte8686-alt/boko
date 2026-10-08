import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getVnpayStatusApi, PaymentStatusResponse } from '../api/payment';

interface VnpayCallbackProps {
  onOrderSuccessFinished?: () => void;
}

export const VnpayCallback: React.FC<VnpayCallbackProps> = ({ onOrderSuccessFinished }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState<PaymentStatusResponse | null>(null);

  // Lấy các tham số từ URL do VNPAY redirect về
  const responseCode = searchParams.get('vnp_ResponseCode') || '';
  const txnRef = searchParams.get('vnp_TxnRef') || '';
  const bankCode = searchParams.get('vnp_BankCode') || '';
  const transNo = searchParams.get('vnp_TransactionNo') || '';
  const amountStr = searchParams.get('vnp_Amount') || '0';
  // VNPAY amount nhân 100, nên chia 100 để ra số tiền VND thực tế
  const amount = (parseInt(amountStr, 10) || 0) / 100;

  const isSuccess = responseCode === '00' || backendStatus?.payment_status === 'paid';

  // Bảng diễn giải mã lỗi VNPAY thân thiện với người dùng
  const getVnpayErrorMessage = (code: string): string => {
    switch (code) {
      case '00':
        return 'Giao dịch thành công';
      case '07':
        return 'Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường).';
      case '09':
        return 'Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking tại ngân hàng.';
      case '10':
        return 'Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần.';
      case '11':
        return 'Đã hết hạn chờ thanh toán. Xin vui lòng thực hiện lại giao dịch.';
      case '12':
        return 'Thẻ/Tài khoản của khách hàng bị khóa.';
      case '13':
        return 'Quý khách nhập sai mật khẩu xác thực giao dịch (OTP).';
      case '24':
        return 'Khách hàng đã hủy giao dịch thanh toán.';
      case '51':
        return 'Tài khoản của quý khách không đủ số dư để thực hiện giao dịch.';
      case '65':
        return 'Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày.';
      case '75':
        return 'Ngân hàng thanh toán đang bảo trì.';
      case '97':
        return 'Chữ ký không hợp lệ (Dữ liệu bị can thiệp hoặc sai HashSecret).';
      default:
        return code ? `Giao dịch không thành công (Mã lỗi: ${code})` : 'Giao dịch bị từ chối hoặc đã bị hủy';
    }
  };

  // Trích xuất ID đơn hàng Boko từ chuỗi BOKO_<id>_<timestamp>
  const parseBokoOrderId = (ref: string): string => {
    if (!ref) return '';
    const parts = ref.split('_');
    if (parts.length >= 2 && parts[0] === 'BOKO') {
      return parts[1];
    }
    if (/^\d+$/.test(ref)) {
      return ref;
    }
    return '';
  };

  const bokoId = parseBokoOrderId(txnRef);

  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      if (bokoId) {
        try {
          const res = await getVnpayStatusApi(bokoId, window.location.search);
          if (isMounted) {
            setBackendStatus(res);
          }
        } catch (err) {
          console.error('Không thể kiểm tra trạng thái VNPAY từ backend:', err);
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
              ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600'
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
            {isSuccess ? 'Thanh Toán VNPAY Thành Công!' : 'Giao Dịch Chưa Hoàn Tất'}
          </h1>
          <p className="text-xs sm:text-sm text-white/90 mt-1">
            {isSuccess
              ? 'Đơn hàng đã được xác nhận qua Cổng VNPAY Sandbox (HMAC-SHA512)'
              : getVnpayErrorMessage(responseCode)}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Transaction Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2.5 text-xs sm:text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Mã đơn hàng Boko:</span>
              <span className="font-bold text-slate-800">
                #{bokoId || (txnRef ? txnRef.slice(0, 16) : 'N/A')}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Số tiền thanh toán:</span>
              <span className="font-bold text-blue-700 text-base">
                {amount > 0
                  ? `${amount.toLocaleString('vi-VN')} ₫`
                  : backendStatus?.total
                  ? `${backendStatus.total.toLocaleString('vi-VN')} ₫`
                  : 'N/A'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Cổng thanh toán:</span>
              <span className="font-semibold text-blue-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                VNPAY (Sandbox)
              </span>
            </div>

            {bankCode && (
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Ngân hàng thanh toán:</span>
                <span className="font-bold text-slate-800">{bankCode}</span>
              </div>
            )}

            {transNo && (
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Mã giao dịch VNPAY:</span>
                <span className="font-mono text-xs text-slate-700">{transNo}</span>
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
          Hệ thống Boko Book Store • Xác thực an toàn HMAC-SHA512 qua VNPAY Gateway
        </div>
      </div>
    </div>
  );
};
