import React, { useState, useEffect, useCallback } from 'react';
import { confirmOrderReceivedApi, getOrderShipmentApi, syncOrderShipmentApi } from '../api/order';
import { Shipment, GHNJourneyStage } from '../types';

interface OrderProgressStepperProps {
  orderId: number | string;
  status?: 'pending' | 'confirmed' | 'shipping' | 'completed' | 'cancelled';
  paymentMethod?: string;
  paymentStatus?: 'unpaid' | 'paid' | 'failed';
  totalVND?: number;
  onConfirmSuccess?: (updatedOrder?: any) => void;
  compact?: boolean;
  refreshTick?: number; // tăng số này để buộc tải lại thông tin GHN (sau khi chuyển cho GHN)
}

export const OrderProgressStepper: React.FC<OrderProgressStepperProps> = ({
  orderId,
  status = 'shipping',
  paymentMethod = 'cod',
  paymentStatus = 'unpaid',
  totalVND,
  onConfirmSuccess,
  compact = false,
  refreshTick = 0,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmedLocally, setConfirmedLocally] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Vận đơn GHN đang quản lý đơn hàng (sau khi đã đóng gói)
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [journey, setJourney] = useState<GHNJourneyStage[]>([]);
  const [ghnTestMode, setGhnTestMode] = useState(false);
  const [isLoadingShipment, setIsLoadingShipment] = useState(false);
  const [isSyncingShipment, setIsSyncingShipment] = useState(false);

  const isCompleted = status === 'completed' || confirmedLocally;
  const isShipping = !isCompleted; // Ở chế độ demo, 3 bước đầu luôn hoàn tất và đang ở shipping

  const loadShipment = useCallback(async (sync = false) => {
    const numericId = Number(orderId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return;

    try {
      if (sync) {
        setIsSyncingShipment(true);
      } else {
        setIsLoadingShipment(true);
      }

      if (sync) {
        // Đồng bộ trạng thái mới nhất từ GHN rồi lấy lại
        const synced = await syncOrderShipmentApi(orderId).catch(() => null);
        if (synced?.shipment) {
          setShipment(synced.shipment);
          setJourney(synced.journey || []);
          setGhnTestMode(!!synced.ghn_test_mode);
          return;
        }
      }

      const res = await getOrderShipmentApi(orderId).catch(() => null);
      setShipment(res?.shipment || null);
      setJourney(res?.journey || []);
      setGhnTestMode(!!res?.ghn_test_mode);
    } catch (err) {
      console.warn('Không lấy được thông tin vận đơn GHN:', err);
    } finally {
      setIsLoadingShipment(false);
      setIsSyncingShipment(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadShipment();
  }, [loadShipment, refreshTick]);

  const handleConfirmReceipt = async () => {
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      // 1. Gọi API backend
      const res = await confirmOrderReceivedApi(orderId).catch((err) => {
        console.warn('Backend confirm API error, falling back to local update:', err);
        return { order: { id: orderId, status: 'completed', payment_status: 'paid' } };
      });

      // 2. Cập nhật state nội bộ
      setConfirmedLocally(true);
      setShowConfirmModal(false);

      // 3. Đồng bộ với localStorage (danh sách boko_orders)
      try {
        const saved = localStorage.getItem('boko_orders');
        if (saved) {
          const list = JSON.parse(saved);
          const updatedList = list.map((ord: any) => {
            if (ord.id === orderId || ord.dbId === orderId || String(ord.id) === String(orderId)) {
              return {
                ...ord,
                status: 'completed',
                paymentStatus: 'paid',
              };
            }
            return ord;
          });
          localStorage.setItem('boko_orders', JSON.stringify(updatedList));
        }
      } catch (e) {
        console.error(e);
      }

      if (onConfirmSuccess) {
        onConfirmSuccess(res?.order);
      }
    } catch (err: unknown) {
      setErrorMessage((err as Error)?.message || 'Xác nhận thất bại, vui lòng thử lại.');
    } finally {
      setIsConfirming(false);
    }
  };

  const ghnStatus = shipment?.status || '';
  const ghnDelivered = ghnStatus === 'delivered';
  const shippingStepDesc = isCompleted
    ? 'Shipper đã giao tới bạn'
    : shipment
      ? ghnDelivered
        ? 'GHN đã giao bưu kiện cho bạn'
        : shipment.status_text
      : 'Shipper đang trên đường giao';

  const steps = [
    {
      id: 1,
      title: 'Đã Đặt Hàng',
      desc: 'Hệ thống đã nhận đơn',
      icon: 'fa-file-invoice',
      isDone: true,
      isActive: false,
    },
    {
      id: 2,
      title: 'Đã Đóng Gói',
      desc: shipment ? 'Đã bàn giao cho GHN quản lý' : 'Kho đã chuẩn bị sách',
      icon: 'fa-box-archive',
      isDone: true,
      isActive: false,
    },
    {
      id: 3,
      title: isCompleted ? 'Đã Giao Xong' : 'Đang Giao Hàng',
      desc: shippingStepDesc,
      icon: 'fa-truck-fast',
      isDone: isCompleted,
      isActive: isShipping,
    },
    {
      id: 4,
      title: isCompleted ? 'Đã Nhận Hàng' : 'Chờ Nhận Hàng',
      desc: isCompleted ? 'Đã hoàn tất thanh toán COD' : 'Kiểm tra & nhận hàng',
      icon: isCompleted ? 'fa-circle-check' : 'fa-handshake',
      isDone: isCompleted,
      isActive: false,
    },
  ];

  return (
    <div className={`w-full bg-slate-50/80 rounded-2xl border border-slate-200/90 ${compact ? 'p-4' : 'p-5 sm:p-6'} space-y-5`}>
      {/* Header bar of Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Tiến Trình Đơn Hàng • Mã #{orderId}
          </span>
        </div>
        <div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <i className="fa-solid fa-circle-check text-emerald-600"></i>
              <span>Hoàn Thành & Đã Thanh Toán</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">
              <i className="fa-solid fa-truck-fast text-blue-600"></i>
              <span>Đang Giao Hàng (COD)</span>
            </span>
          )}
        </div>
      </div>

      {/* Visual Stepper Nodes */}
      <div className="relative">
        <div className="grid grid-cols-4 gap-2 relative z-10">
          {steps.map((step, idx) => {
            return (
              <div key={step.id} className="flex flex-col items-center text-center group">
                {/* Circle Icon Indicator */}
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg transition-all duration-300 shadow-xs ${
                    step.isDone
                      ? 'bg-emerald-600 text-white shadow-emerald-200'
                      : step.isActive
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-blue-200 animate-bounce'
                      : 'bg-white text-slate-400 border-2 border-slate-200'
                  }`}
                >
                  {step.isDone ? (
                    <i className="fa-solid fa-check text-sm sm:text-base"></i>
                  ) : (
                    <i className={`fa-solid ${step.icon}`}></i>
                  )}
                </div>

                {/* Step Labels */}
                <div className="mt-2.5">
                  <p
                    className={`font-display font-bold text-xs sm:text-sm tracking-tight leading-tight ${
                      step.isDone
                        ? 'text-emerald-950 font-semibold'
                        : step.isActive
                        ? 'text-blue-900 font-extrabold'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.title}
                  </p>
                  {!compact && (
                    <p className="text-[10px] text-slate-500 hidden sm:block mt-0.5 leading-snug">
                      {step.desc}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Connecting Progress Line Bar */}
        <div className="absolute top-5 sm:top-6 left-1/8 right-1/8 h-1 bg-slate-200 -z-0">
          <div
            className={`h-full bg-emerald-500 transition-all duration-500 ${
              isCompleted ? 'w-full' : 'w-2/3'
            }`}
          />
        </div>
      </div>

      {/* Thông tin vận đơn GHN — bên thứ 3 quản lý sau khi đã đóng gói */}
      {isLoadingShipment && !shipment && !isCompleted && (
        <p className="text-[11px] text-slate-500 text-center">Đang tải thông tin vận chuyển...</p>
      )}

      {shipment && (
        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-truck-fast text-blue-600"></i>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                GHN Quản Lý Vận Chuyển
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                ghnDelivered
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {shipment.status_text}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
            <p>
              Mã vận đơn GHN:{' '}
              <strong className="font-mono text-slate-900">{shipment.order_code || '—'}</strong>
            </p>
            <p>
              Mã đơn shop: <strong className="font-mono text-slate-900">{shipment.client_order_code}</strong>
            </p>
            {shipment.leadtime && (
              <p>
                Dự kiến giao:{' '}
                <strong className="text-slate-900">
                  {new Date(shipment.leadtime).toLocaleDateString('vi-VN')}
                </strong>
              </p>
            )}
            {shipment.cod_amount > 0 && (
              <p>
                Tiền COD cho shipper:{' '}
                <strong className="text-slate-900">{shipment.cod_amount.toLocaleString('vi-VN')} ₫</strong>
              </p>
            )}
            <p>
              Cước phí GHN:{' '}
              <strong className="text-slate-900">{shipment.total_fee.toLocaleString('vi-VN')} ₫</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <button
              type="button"
              onClick={() => loadShipment(true)}
              disabled={isSyncingShipment}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <i className={`fa-solid fa-rotate ${isSyncingShipment ? 'fa-spin' : ''}`}></i>
              {isSyncingShipment ? 'Đang đồng bộ...' : 'Làm mới trạng thái từ GHN'}
            </button>
            {shipment.order_code && !ghnTestMode && (
              <a
                href="https://ghn.vn/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1.5"
                title="Mở trang ghn.vn rồi nhập mã vận đơn vào ô tra cứu"
              >
                <i className="fa-solid fa-up-right-from-square"></i>
                Tra cứu trên trang GHN
              </a>
            )}
            {ghnTestMode && (
              <p className="text-[11px] text-slate-500 italic">
                Đơn chạy trên môi trường test của GHN nên tra cứu hành trình ngay tại đây — mã này chưa có trên trang ghn.vn công khai.
              </p>
            )}
          </div>

          {/* Timeline hành trình bưu kiện — người mua biết hàng đang ở đâu */}
          {journey.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Hành trình bưu kiện
              </p>
              <div>
                {journey.map((stage, idx) => (
                  <div key={stage.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                          stage.done
                            ? 'bg-emerald-600 text-white'
                            : stage.current
                              ? stage.warning
                                ? 'bg-amber-500 text-white animate-pulse'
                                : 'bg-blue-600 text-white animate-pulse'
                              : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {stage.done ? (
                          <i className="fa-solid fa-check"></i>
                        ) : stage.current ? (
                          <i className="fa-solid fa-truck-fast"></i>
                        ) : (
                          <i className="fa-solid fa-circle text-[6px]"></i>
                        )}
                      </div>
                      {idx < journey.length - 1 && (
                        <div
                          className={`w-0.5 flex-1 min-h-4 ${stage.done ? 'bg-emerald-500' : 'bg-slate-200'}`}
                        ></div>
                      )}
                    </div>
                    <div className="pb-3.5 -mt-0.5">
                      <p
                        className={`text-xs font-bold leading-tight ${
                          stage.done
                            ? 'text-emerald-900'
                            : stage.current
                              ? stage.warning
                                ? 'text-amber-800'
                                : 'text-blue-900'
                              : 'text-slate-400'
                        }`}
                      >
                        {stage.title}
                      </p>
                      {stage.at && (
                        <p className="text-[11px] text-slate-500">
                          {new Date(stage.at).toLocaleString('vi-VN')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Area: Notification & Confirm Button */}
      {isShipping && !isCompleted && (
        <div className="pt-2 animate-fadeIn">
          <div className="p-4 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-950 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <i className="fa-solid fa-bell text-sm"></i>
              </div>
              <div className="text-left">
                <p className="text-xs sm:text-sm font-bold text-blue-950">
                  {ghnDelivered
                    ? 'GHN đã giao bưu kiện sách cho bạn!'
                    : 'Shipper đang trên đường vận chuyển bưu kiện sách tới bạn!'}
                </p>
                <p className="text-xs text-blue-800/90 mt-0.5">
                  Hình thức: <strong>Thanh toán khi nhận hàng (COD)</strong>
                  {totalVND ? ` • Chuẩn bị tiền mặt: ${totalVND.toLocaleString('vi-VN')} ₫` : ''}.
                  {ghnDelivered
                    ? ' Vui lòng kiểm tra đủ số lượng sách rồi bấm "Tôi Đã Nhận Được Hàng" để hoàn tất đơn.'
                    : ' Vui lòng bấm xác nhận sau khi bạn đã nhận đủ sách từ shipper.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-200 hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-circle-check text-sm"></i>
              <span>Tôi Đã Nhận Được Hàng</span>
            </button>
          </div>
        </div>
      )}

      {/* Completed Success Banner */}
      {isCompleted && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center gap-3 animate-fadeIn">
          <i className="fa-solid fa-circle-check text-emerald-600 text-lg"></i>
          <div className="text-xs">
            <p className="font-bold">Đơn hàng đã được xác nhận nhận hàng thành công!</p>
            <p className="text-emerald-800">
              Khoản tiền COD đã được thanh toán. Cảm ơn bạn đã tin tưởng mua sách tại Boko!
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="text-xs text-red-600 font-semibold text-center">{errorMessage}</p>
      )}

      {/* Confirmation Dialog Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 text-slate-900 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-box-open"></i>
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-display font-bold text-lg text-slate-900">
                Xác Nhận Đã Nhận Đủ Hàng?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn xác nhận rằng shipper đã giao bưu kiện sách, bạn đã kiểm tra hàng đầy đủ và đã thanh toán tiền mặt cho đơn hàng #{orderId}?
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isConfirming}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                HỦY
              </button>
              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={isConfirming}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isConfirming ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>ĐANG XÁC NHẬN...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check"></i>
                    <span>XÁC NHẬN ĐÃ NHẬN</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
