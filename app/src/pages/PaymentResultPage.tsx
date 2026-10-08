import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBackendBaseUrl } from '../api/serverAuth';

interface OrderStatus {
  order_id: number;
  total: number;
  status: string;
  payment_method: string;
}

export const PaymentResultPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [serverStatus, setServerStatus] = useState<OrderStatus | null>(null);
  const [checking, setChecking] = useState<boolean>(true);

  const resultCode = params.get('resultCode');
  const momoOrderId = params.get('orderId') || '';
  const message = params.get('message') || '';
  const amount = params.get('amount') || '';
  const success = resultCode === '0';

  useEffect(() => {
    const baseUrl = getBackendBaseUrl();
    if (!baseUrl || !momoOrderId || !success) {
      setChecking(false);
      return;
    }
    // IPN có thể tới chậm vài giây — poll tối đa ~15s
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(`${baseUrl}/api/momo/result?orderId=${encodeURIComponent(momoOrderId)}`);
        if (res.ok) {
          const data = (await res.json()) as OrderStatus;
          setServerStatus(data);
          if (data.status === 'confirmed' || tries >= 5) clearInterval(timer);
        }
      } catch {
        /* thử lại */
      }
      if (tries >= 5) {
        clearInterval(timer);
        setChecking(false);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [momoOrderId, success]);

  useEffect(() => {
    if (serverStatus?.status === 'confirmed') setChecking(false);
  }, [serverStatus]);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 text-center space-y-4">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
            success ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
          }`}
        >
          <i className={`fa-solid ${success ? 'fa-circle-check' : 'fa-circle-xmark'} text-3xl`}></i>
        </div>
        <h2 className="font-display font-bold text-2xl text-slate-900">
          {success ? 'Thanh toán MoMo thành công!' : 'Thanh toán chưa thành công'}
        </h2>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-700 space-y-1">
          {momoOrderId && (
            <p>
              Mã giao dịch: <strong className="font-mono">{momoOrderId}</strong>
            </p>
          )}
          {amount && (
            <p>
              Số tiền: <strong>{Number(amount).toLocaleString('vi-VN')} ₫</strong>
            </p>
          )}
          {message && <p className="text-slate-500">{decodeURIComponent(message.replace(/\+/g, ' '))}</p>}
          {success && (
            <p className="pt-1 font-semibold text-blue-700">
              {serverStatus?.status === 'confirmed'
                ? `Đơn #${serverStatus.order_id} đã được xác nhận và lưu vào hệ thống.`
                : checking
                ? 'Đang chờ MoMo xác nhận, vui lòng đợi...'
                : 'MoMo báo thành công. Nếu đơn chưa cập nhật, liên hệ shop để đối soát.'}
            </p>
          )}
        </div>
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg text-xs tracking-wider uppercase font-bold transition-all cursor-pointer"
          >
            Quay lại tủ sách
          </button>
          {!success && (
            <button
              onClick={() => navigate('/checkout')}
              className="flex-1 border border-slate-300 hover:bg-slate-100 text-slate-700 py-3 px-6 rounded-lg text-xs tracking-wider uppercase font-bold transition-all cursor-pointer"
            >
              Thử lại
            </button>
          )}
        </div>
      </div>
    </main>
  );
};
