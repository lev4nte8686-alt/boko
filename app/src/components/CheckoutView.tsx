import React, { useState, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { CartItem, CheckoutFormState, Currency, Order, User, ShippingAddress } from '../types';
import { getBackendBaseUrl } from '../api/serverAuth';

// PayPal không hỗ trợ VND → quy đổi sang USD theo tỷ giá này (giữ đồng bộ với backend vndPerUSD)
const VND_PER_USD = 25000;

interface CheckoutViewProps {
  cart: CartItem[];
  currency: Currency;
  onReturnToCart: () => void;
  onOrderPlaced: (order: Order) => void;
  appliedDiscountCode: string;
  onApplyDiscountCode: (code: string) => boolean;
  user?: User | null;
  onOpenSettings?: (tab?: 'profile' | 'address' | 'payments') => void;
  onOpenProfile?: () => void;
  onSaveAddressToProfile?: (address: ShippingAddress) => void;
  // true khi có modal phủ lên (cài đặt, giỏ hàng, tìm kiếm...) — ẩn iframe PayPal
  // vì iframe PayPal luôn vẽ đè lên modal (lỗi stacking của PayPal SDK)
  isOverlayOpen?: boolean;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  cart,
  currency,
  onReturnToCart,
  onOrderPlaced,
  appliedDiscountCode,
  onApplyDiscountCode,
  user,
  onOpenSettings,
  onOpenProfile,
  onSaveAddressToProfile,
  isOverlayOpen
}) => {
  const [formData, setFormData] = useState<CheckoutFormState>({
    email: user?.email || 'customer@boko.com',
    firstName: user?.shippingAddress?.fullName || user?.name || 'Albert Camus',
    lastName: '',
    company: '',
    address: user?.shippingAddress?.streetAddress || 'Rue Sébastien Bottin',
    apt: '',
    city: user?.shippingAddress?.province || 'Hà Nội',
    country: 'Vietnam',
    postalCode: '100000',
    telephone: user?.shippingAddress?.phone || '0912 345 678',
    province: user?.shippingAddress?.province || 'Hà Nội',
    ward: user?.shippingAddress?.ward || 'Phường Bến Nghé',
    streetAddress: user?.shippingAddress?.streetAddress || 'Số 123 Đường Đồng Khởi',
    paymentMethod: 'cod',
    cardNumber: '4532 •••• •••• 8892',
    cardExpiry: '12/28',
    cardCvv: '882',
    ewalletType: 'momo'
  });

  const [selectedSavedPaymentId, setSelectedSavedPaymentId] = useState<string | null>(null);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  const savedCards = (user?.paymentMethods || []).filter((m) => m.type === 'card');
  const savedMomo = (user?.paymentMethods || []).filter((m) => m.type === 'momo');
  const savedZalo = (user?.paymentMethods || []).filter((m) => m.type === 'zalopay');
  const savedBanks = (user?.paymentMethods || []).filter((m) => m.type === 'bank');
  const savedPaypal = (user?.paymentMethods || []).filter((m) => m.type === 'paypal');

  // Handle open settings tab
  const handleOpenSettingsTab = (tab: 'profile' | 'address' | 'payments') => {
    if (onOpenSettings) {
      onOpenSettings(tab);
    } else if (onOpenProfile) {
      onOpenProfile();
    }
  };

  // Auto pre-fill when user object is updated or present
  useEffect(() => {
    if (user) {
      const addr = user.shippingAddress;
      setFormData((prev) => ({
        ...prev,
        email: user.email || prev.email,
        firstName: addr?.fullName || user.name || prev.firstName,
        telephone: addr?.phone || prev.telephone,
        province: addr?.province || prev.province || 'Hà Nội',
        ward: addr?.ward || prev.ward || '',
        streetAddress: addr?.streetAddress || prev.streetAddress || prev.address,
        address: addr?.streetAddress || prev.address,
        city: addr?.province || prev.city
      }));
    }
  }, [user]);

  const [discountInput, setDiscountInput] = useState<string>('');
  const [discountMessage, setDiscountMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [copiedBank, setCopiedBank] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Default fallback book if cart is empty so user can test the exact checkout screen from Image 1!
  const displayItems: CartItem[] =
    cart.length > 0
      ? cart
      : [
          {
            book: {
              id: 'camus-1',
              title: "L'Étranger",
              author: 'Albert Camus',
              category: 'VĂN HỌC',
              priceEUR: 24.0,
              priceVND: 240000,
              coverUrl:
                'https://lh3.googleusercontent.com/aida-public/AB6AXuAMmrVi1HZtk0j2V8SVSuMmHBIUX0oNAHwkxVKk3q0h3zQQiRNTRbE-5N5Bwuhk8a1Cy0vpDMnZrIpZrx7LYQIj41lhJ6WW0hFpMWUMS-_dCJOMUqDWgl5JD31eyoLktacAZ81q668R300goQc7QRRI-YtcdZfCcQ5ePgjA9GHz0EqyWg0gZxzhJ3CeSbQQ3ZcCkAlYAfDC68av5rURiElgkcov58r30L9Bp6mQZ86SK8AGHMmccC-Z4w',
              description: 'L\'Étranger by Albert Camus',
              sampleChapters: { title: '', page1: [], page2: [], page3: [] }
            },
            quantity: 1
          }
        ];

  // Price calculations
  const subtotalEUR = displayItems.reduce((acc, i) => acc + i.book.priceEUR * i.quantity, 0);
  const subtotalVND = displayItems.reduce((acc, i) => acc + i.book.priceVND * i.quantity, 0);

  const isPercentDiscount = appliedDiscountCode.toUpperCase() === 'GIAM10';
  const isFreeShip = appliedDiscountCode.toUpperCase() === 'FREESHIP';

  const discountRate = isPercentDiscount ? 0.1 : 0;
  const discountEUR = subtotalEUR * discountRate;
  const discountVND = subtotalVND * discountRate;

  const vatEUR = (subtotalEUR - discountEUR) * 0.05;
  const vatVND = (subtotalVND - discountVND) * 0.05;

  const shippingEUR = isFreeShip ? 0 : 4.5;
  const shippingVND = isFreeShip ? 0 : 45000;

  const totalEUR = subtotalEUR - discountEUR + vatEUR + shippingEUR;
  const totalVND = subtotalVND - discountVND + vatVND + shippingVND;

  const isEUR = currency === 'EUR';

  // PayPal thật: Client ID public đọc từ env (Vercel: VITE_PAYPAL_CLIENT_ID).
  // Không có = chế độ mock cũ (liên kết email trong Cài đặt).
  const paypalClientId = (import.meta.env.VITE_PAYPAL_CLIENT_ID || '').trim();
  const totalUSD = Math.round((totalVND / VND_PER_USD) * 100) / 100;

  const buildShippingAddress = () =>
    `${formData.streetAddress || formData.address}, ${formData.ward || ''}, ${formData.province || formData.city || ''}`
      .replace(/(^,\s*|,\s*$)/g, '')
      .trim();

  const buildItemsPayload = () =>
    displayItems.map((it) => ({
      title: it.book.title,
      price: it.book.priceVND,
      quantity: it.quantity
    }));

  const makeLocalOrder = (id?: string): Order => ({
    id: id || `BST-${Math.floor(100000 + Math.random() * 900000)}`,
    date: new Date().toLocaleDateString('vi-VN'),
    items: displayItems,
    customer: formData,
    subtotalEUR,
    subtotalVND,
    discountEUR,
    discountVND,
    vatEUR,
    vatVND,
    shippingEUR,
    shippingVND,
    totalEUR,
    totalVND,
    currency,
    discountCode: appliedDiscountCode || undefined
  });

  // Kiểm tra form trước khi mở popup PayPal
  const validateForPayPal = (): boolean => {
    const errors: string[] = [];
    if (!formData.email.trim()) errors.push('Vui lòng nhập Email');
    if (!formData.firstName.trim()) errors.push('Vui lòng nhập Họ và Tên người nhận');
    if (!formData.telephone.trim()) errors.push('Vui lòng nhập Số điện thoại');
    if (!(formData.streetAddress || formData.address || '').trim()) errors.push('Vui lòng nhập Địa chỉ giao hàng');
    setFormErrors(errors);
    return errors.length === 0;
  };

  const formatPrice = (eur: number, vnd: number) => {
    return isEUR ? `€ ${eur.toFixed(2)}` : `${vnd.toLocaleString('vi-VN')} ₫`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleApplyDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountInput.trim()) return;

    const success = onApplyDiscountCode(discountInput.trim());
    if (success) {
      setDiscountMessage({ text: `Đã áp dụng mã "${discountInput.trim().toUpperCase()}"`, isError: false });
      setDiscountInput('');
    } else {
      setDiscountMessage({ text: 'Mã giảm giá không hợp lệ. Thử GIAM10 hoặc FREESHIP', isError: true });
    }
  };

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('88992026888');
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2000);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    const errors: string[] = [];
    if (!formData.email.trim()) errors.push('Vui lòng nhập Email');
    if (!formData.firstName.trim()) errors.push('Vui lòng nhập Họ và Tên người nhận');
    if (!formData.telephone.trim()) errors.push('Vui lòng nhập Số điện thoại');
    if (!(formData.streetAddress || formData.address || '').trim()) errors.push('Vui lòng nhập Địa chỉ giao hàng');

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    // Check non-COD payment integrations
    if (formData.paymentMethod === 'card' && savedCards.length === 0) {
      setFormErrors(['Bạn chưa tích hợp Thẻ tín dụng/ghi nợ trong Cài đặt. Vui lòng thêm thẻ thanh toán trước khi tiếp tục.']);
      handleOpenSettingsTab('payments');
      return;
    }

    if (formData.paymentMethod === 'ewallet') {
      if (formData.ewalletType === 'momo' && savedMomo.length === 0) {
        setFormErrors(['Bạn chưa liên kết Ví MoMo trong Cài đặt. Vui lòng liên kết ví trước khi tiếp tục.']);
        handleOpenSettingsTab('payments');
        return;
      }
      if (formData.ewalletType === 'zalopay' && savedZalo.length === 0) {
        setFormErrors(['Bạn chưa liên kết Ví ZaloPay trong Cài đặt. Vui lòng liên kết ví trước khi tiếp tục.']);
        handleOpenSettingsTab('payments');
        return;
      }
    }

    if (formData.paymentMethod === 'paypal') {
      if (paypalClientId) {
        // Thu thật qua nút PayPal ở trên — không đặt đơn bằng nút Continue
        setFormErrors(['Vui lòng bấm nút PayPal ở trên để thanh toán. Đơn chỉ được lưu sau khi PayPal xác nhận tiền về.']);
        return;
      }
      if (savedPaypal.length === 0) {
        setFormErrors(['Bạn chưa liên kết tài khoản PayPal trong Cài đặt. Vui lòng liên kết trước khi tiếp tục.']);
        handleOpenSettingsTab('payments');
        return;
      }
    }

    setFormErrors([]);

    // Gửi đơn đặt hàng lên backend (nếu có) — backend sẽ mã hóa ShippingAddress
    const baseUrl = getBackendBaseUrl();
    if (baseUrl) {
      try {
        const shippingAddress = buildShippingAddress();
        const res = await fetch(`${baseUrl}/api/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            // Gắn token nếu đã đăng nhập để backend lưu đơn vào đúng user
            // (không có token = guest checkout, backend lưu user_id NULL)
            ...(localStorage.getItem('boko_auth_token')
              ? { Authorization: `Bearer ${localStorage.getItem('boko_auth_token')}` }
              : {}),
          },
          body: JSON.stringify({
            shipping_address: shippingAddress,
            phone: formData.telephone,
            payment_method: formData.paymentMethod === 'ewallet' ? 'momo' : formData.paymentMethod === 'bank' ? 'cod' : formData.paymentMethod,
            items: buildItemsPayload()
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('Checkout API error:', data?.error || res.status);
        }
      } catch (err) {
        console.warn('Checkout API call failed:', err);
      }
    }

    onOrderPlaced(makeLocalOrder());
  };

  // Thu tiền thật qua PayPal: user approve → backend capture + verify → lưu đơn
  const handlePayPalApprove = async (paypalOrderId: string) => {
    const baseUrl = getBackendBaseUrl();
    if (!baseUrl) {
      setFormErrors(['Chưa cấu hình backend để xác thực PayPal.']);
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/api/paypal/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(localStorage.getItem('boko_auth_token')
            ? { Authorization: `Bearer ${localStorage.getItem('boko_auth_token')}` }
            : {}),
        },
        body: JSON.stringify({
          paypal_order_id: paypalOrderId,
          shipping_address: buildShippingAddress(),
          phone: formData.telephone,
          total_vnd: totalVND,
          items: buildItemsPayload()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormErrors([data?.error || 'Xác thực thanh toán PayPal thất bại.']);
        return;
      }
      setFormErrors([]);
      onOrderPlaced(makeLocalOrder(`PP-${data.order_id}`));
    } catch {
      setFormErrors(['Không kết nối được máy chủ xác thực PayPal.']);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900">
      {/* Progress Indicator Stepper Header */}
      <div className="w-full pt-8 pb-6 flex justify-center items-center space-x-2 sm:space-x-6 px-4 sm:px-16">
        <button
          onClick={onReturnToCart}
          className="flex items-center text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <span className="font-label-caps text-xs tracking-wider uppercase font-medium">Cart</span>
        </button>
        <div className="w-6 sm:w-16 h-px bg-slate-200"></div>
        <div className="flex items-center bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold">
          <span className="font-label-caps text-xs tracking-widest uppercase">Customer Info</span>
        </div>
        <div className="w-6 sm:w-16 h-px bg-slate-200"></div>
        <div className="flex items-center text-slate-400">
          <span className="font-label-caps text-xs tracking-wider uppercase">Shipping</span>
        </div>
        <div className="w-6 sm:w-16 h-px bg-slate-200"></div>
        <div className="flex items-center text-slate-400">
          <span className="font-label-caps text-xs tracking-wider uppercase">Payment</span>
        </div>
      </div>

      {/* Main Content Area - Form & Summary Desk Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        {/* Left Column: Input Forms */}
        <section className="lg:col-span-7 space-y-10">
          {formErrors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl space-y-1">
              <p className="font-bold">Vui lòng kiểm tra lại thông tin:</p>
              <ul className="list-disc list-inside">
                {formErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Customer Info Section */}
          <div className="space-y-4">
            <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900 border-b border-slate-200 pb-3">
              Thông Tin Khách Hàng
            </h2>
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="email">
                Địa chỉ Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="email@example.com"
                className="paper-input w-full font-body text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Shipping Address Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">
                Địa Chỉ Nhận Hàng
              </h2>
              {user && (
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className="text-xs font-semibold text-amber-900 hover:text-amber-700 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200/80 transition-colors cursor-pointer"
                >
                  <i className="fa-solid fa-location-dot text-xs"></i>
                  <span>Cấu hình Hồ sơ</span>
                </button>
              )}
            </div>

            {/* Profile Auto-fill Banner / Feedback */}
            {user?.shippingAddress ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200/90 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-medium animate-fadeIn">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
                  <span>
                    Đã tự động điền địa chỉ giao hàng từ Hồ sơ cá nhân của <strong>{user.name}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className="text-emerald-800 underline hover:text-emerald-950 font-bold ml-2 whitespace-nowrap cursor-pointer"
                >
                  Thay đổi
                </button>
              </div>
            ) : user ? (
              <div className="p-3 bg-amber-50/90 border border-amber-200/80 rounded-2xl flex items-center justify-between text-xs text-amber-900 font-medium">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-info text-amber-600 text-sm"></i>
                  <span>Lưu địa chỉ bên dưới vào Hồ sơ cá nhân để không cần điền lại ở những lần mua sau.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onSaveAddressToProfile) {
                      const newAddr: ShippingAddress = {
                        fullName: formData.firstName,
                        phone: formData.telephone,
                        province: formData.province || formData.city || 'Hà Nội',
                        ward: formData.ward || '',
                        streetAddress: formData.streetAddress || formData.address
                      };
                      onSaveAddressToProfile(newAddr);
                      setSavedSuccessMsg('Đã lưu địa chỉ vào Hồ sơ cá nhân!');
                      setTimeout(() => setSavedSuccessMsg(null), 3000);
                    }
                  }}
                  className="px-3 py-1 bg-amber-900 hover:bg-amber-800 text-amber-50 font-semibold rounded-lg text-xs transition-colors shadow-2xs whitespace-nowrap ml-2 cursor-pointer"
                >
                  Lưu vào Hồ sơ
                </button>
              </div>
            ) : null}

            {savedSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
                <span>{savedSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
              {/* Tên người nhận */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="firstName">
                  Tên người nhận <span className="text-red-500">*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  placeholder="Họ và Tên người nhận"
                  className="paper-input w-full font-body text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {/* Số điện thoại */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="telephone">
                  Số điện thoại <span className="text-red-500">*</span>
                </label>
                <input
                  id="telephone"
                  type="tel"
                  value={formData.telephone}
                  onChange={handleInputChange}
                  placeholder="Số điện thoại nhận hàng"
                  className="paper-input w-full font-body text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Tỉnh / Thành phố */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="province">
                  Tỉnh / Thành phố <span className="text-red-500">*</span>
                </label>
                <input
                  id="province"
                  type="text"
                  value={formData.province || formData.city}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({ ...prev, province: val, city: val }));
                  }}
                  placeholder="TP. Hồ Chí Minh, Hà Nội, ĐN..."
                  className="paper-input w-full font-body text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {/* Phường / Xã */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="ward">
                  Phường / Xã <span className="text-red-500">*</span>
                </label>
                <input
                  id="ward"
                  type="text"
                  value={formData.ward || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({ ...prev, ward: val }));
                  }}
                  placeholder="Phường Bến Nghé, Quận 1..."
                  className="paper-input w-full font-body text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Tên đường / Tòa nhà / Số nhà */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="streetAddress">
                Tên đường / Tòa nhà / Số nhà <span className="text-red-500">*</span>
              </label>
              <input
                id="streetAddress"
                type="text"
                value={formData.streetAddress || formData.address}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({ ...prev, streetAddress: val, address: val }));
                }}
                placeholder="Số 123 Đường Đồng Khởi, Tòa nhà Vincom"
                className="paper-input w-full font-body text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Payment Method Section */}
          <div className="space-y-6 pt-4">
            <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900 border-b border-slate-200 pb-3">
              Payment Method
            </h2>

            <div className="space-y-5">
              {/* Cash On Delivery (COD) Option */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="payment-cod"
                    name="paymentMethod"
                    checked={formData.paymentMethod === 'cod'}
                    onChange={() => setFormData((p) => ({ ...p, paymentMethod: 'cod' }))}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="payment-cod" className="font-body text-base font-semibold text-slate-900 cursor-pointer">
                    Thanh toán khi nhận hàng (COD)
                  </label>
                  <div className="flex gap-2 ml-auto">
                    <i className="fa-solid fa-truck-fast text-slate-400 text-base"></i>
                  </div>
                </div>

                {formData.paymentMethod === 'cod' && (
                  <div className="pt-2 border-t border-slate-100 animate-fadeIn space-y-2">
                    <p className="text-xs text-slate-600 font-body">
                      Bạn sẽ thanh toán trực tiếp bằng tiền mặt cho nhân viên giao hàng khi nhận được sách.
                    </p>
                    <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                      <i className="fa-solid fa-circle-info text-amber-600 text-sm"></i>
                      <span>Vui lòng kiểm tra kỹ thông tin đơn hàng và chuẩn bị số tiền tương ứng khi nhận hàng.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Credit / Debit Card Option */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="payment-card"
                    name="paymentMethod"
                    checked={formData.paymentMethod === 'card'}
                    onChange={() => {
                      setFormData((p) => ({ ...p, paymentMethod: 'card' }));
                      if (savedCards.length === 0) {
                        handleOpenSettingsTab('payments');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="payment-card" className="font-body text-base font-semibold text-slate-900 cursor-pointer">
                    Thẻ Quốc Tế / Thẻ Tín Dụng (Visa, Mastercard, JCB)
                  </label>
                  <div className="flex gap-2 ml-auto">
                    <i className="fa-solid fa-credit-card text-slate-400 text-base"></i>
                  </div>
                </div>

                {formData.paymentMethod === 'card' && (
                  <div className="pt-2 border-t border-slate-100 animate-fadeIn space-y-3">
                    {savedCards.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-700">
                          Thẻ đã tích hợp sẵn trong Cài đặt:
                        </p>
                        <div className="space-y-2">
                          {savedCards.map((card) => (
                            <div
                              key={card.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                card.isDefault || selectedSavedPaymentId === card.id
                                    ? 'bg-blue-50/60 border-blue-500'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <i className="fa-solid fa-credit-card text-blue-600 text-base"></i>
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{card.label}</p>
                                  <p className="text-[11px] text-slate-500">Chủ thẻ: {card.accountHolder}</p>
                                </div>
                              </div>
                              {card.isDefault && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                                  Mặc định
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettingsTab('payments')}
                          className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1.5 mt-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-gear text-xs"></i>
                          <span>Quản lý hoặc thêm thẻ khác trong Cài đặt</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <i className="fa-solid fa-triangle-exclamation text-amber-700 text-lg shrink-0 mt-0.5"></i>
                          <div>
                            <p className="text-xs font-bold text-amber-950">
                              Chưa có thẻ nào được tích hợp trong tài khoản
                            </p>
                            <p className="text-xs text-amber-800/90 mt-0.5">
                              Để thanh toán bằng thẻ, vui lòng tích hợp thẻ ngân hàng / thẻ tín dụng của bạn tại trang Cài đặt.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettingsTab('payments')}
                          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-amber-900 hover:bg-amber-800 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <i className="fa-solid fa-credit-card text-xs"></i>
                          <span>Mở Cài Đặt Để Tích Hợp Thẻ Ngay</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* E-wallets Option */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="payment-ewallet"
                    name="paymentMethod"
                    checked={formData.paymentMethod === 'ewallet'}
                    onChange={() => {
                      setFormData((p) => ({ ...p, paymentMethod: 'ewallet' }));
                      const hasLinkedWallet =
                        formData.ewalletType === 'momo' ? savedMomo.length > 0 : savedZalo.length > 0;
                      if (!hasLinkedWallet) {
                        handleOpenSettingsTab('payments');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="payment-ewallet" className="font-body text-base font-semibold text-slate-900 cursor-pointer">
                    Ví Điện Tử (MoMo, ZaloPay)
                  </label>
                  <div className="flex gap-2 ml-auto">
                    <i className="fa-solid fa-wallet text-slate-400 text-base"></i>
                  </div>
                </div>

                {formData.paymentMethod === 'ewallet' && (
                  <div className="pt-2 border-t border-slate-100 animate-fadeIn space-y-3">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, ewalletType: 'momo' }))}
                        className={`px-4 py-2 rounded-lg border text-xs font-bold uppercase transition-all cursor-pointer ${
                          formData.ewalletType === 'momo'
                            ? 'bg-[#a50064] text-white border-[#a50064]'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        Ví MoMo
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, ewalletType: 'zalopay' }))}
                        className={`px-4 py-2 rounded-lg border text-xs font-bold uppercase transition-all cursor-pointer ${
                          formData.ewalletType === 'zalopay'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        ZaloPay
                      </button>
                    </div>

                    {formData.ewalletType === 'momo' && (
                      savedMomo.length > 0 ? (
                        <div className="p-3 rounded-xl bg-pink-50/70 border border-pink-200 space-y-1">
                          <p className="text-xs font-bold text-pink-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-circle-check text-pink-700 text-sm"></i>
                            <span>Ví MoMo đã liên kết: {savedMomo[0].accountNumber}</span>
                          </p>
                          <p className="text-[11px] text-pink-800">Chủ tài khoản: {savedMomo[0].accountHolder}</p>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-pink-50/70 border border-pink-200 space-y-3 text-pink-950">
                          <div className="flex items-start gap-2">
                            <i className="fa-solid fa-circle-info text-pink-700 text-base shrink-0 mt-0.5"></i>
                            <div>
                              <p className="text-xs font-bold">Chưa liên kết Ví MoMo trong Cài đặt</p>
                              <p className="text-xs text-pink-900 mt-0.5">
                                Tích hợp ví MoMo trong Cài đặt để xác thực và thanh toán 1 chạm an toàn.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenSettingsTab('payments')}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#a50064] hover:bg-[#8e0056] text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <i className="fa-solid fa-link text-xs"></i>
                            <span>Mở Cài Đặt Để Liên Kết Ví MoMo</span>
                          </button>
                        </div>
                      )
                    )}

                    {formData.ewalletType === 'zalopay' && (
                      savedZalo.length > 0 ? (
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-1">
                          <p className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                            <i className="fa-solid fa-circle-check text-blue-700 text-sm"></i>
                            <span>Ví ZaloPay đã liên kết: {savedZalo[0].accountNumber}</span>
                          </p>
                          <p className="text-[11px] text-blue-800">Chủ tài khoản: {savedZalo[0].accountHolder}</p>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3 text-blue-950">
                          <div className="flex items-start gap-2">
                            <i className="fa-solid fa-circle-info text-blue-700 text-base shrink-0 mt-0.5"></i>
                            <div>
                              <p className="text-xs font-bold">Chưa liên kết Ví ZaloPay trong Cài đặt</p>
                              <p className="text-xs text-blue-900 mt-0.5">
                                Tích hợp ví ZaloPay trong Cài đặt để tự động thanh toán đơn hàng.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenSettingsTab('payments')}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <i className="fa-solid fa-link text-xs"></i>
                            <span>Mở Cài Đặt Để Liên Kết Ví ZaloPay</span>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* PayPal Option */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="payment-paypal"
                    name="paymentMethod"
                    checked={formData.paymentMethod === 'paypal'}
                    onChange={() => {
                      setFormData((p) => ({ ...p, paymentMethod: 'paypal' }));
                      // Chế độ thu thật: trả luôn bằng nút PayPal, không cần liên kết trước
                      if (!paypalClientId && savedPaypal.length === 0) {
                        handleOpenSettingsTab('payments');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="payment-paypal" className="font-body text-base font-semibold text-slate-900 cursor-pointer">
                    PayPal (thanh toán quốc tế)
                  </label>
                  <div className="flex gap-2 ml-auto">
                    <i className="fa-brands fa-paypal text-[#003087] text-xl"></i>
                  </div>
                </div>

                {formData.paymentMethod === 'paypal' && (
                  <div className="pt-2 border-t border-slate-100 animate-fadeIn space-y-3">
                    {paypalClientId ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-600 font-body">
                          Tổng thanh toán qua PayPal:{' '}
                          <strong className="text-slate-900">${totalUSD.toFixed(2)} USD</strong>{' '}
                          <span className="text-slate-400">(≈ {totalVND.toLocaleString('vi-VN')} ₫)</span>
                        </p>
                        {/* Ẩn iframe khi modal mở (giữ khung để không nhảy layout) */}
                        <div className={isOverlayOpen ? 'invisible' : ''}>
                        <PayPalScriptProvider
                          options={{ clientId: paypalClientId, currency: 'USD', disableFunding: 'card' }}
                        >
                          <PayPalButtons
                            style={{ layout: 'vertical', shape: 'rect', label: 'paypal' }}
                            createOrder={(_data, actions) =>
                              actions.order.create({
                                intent: 'CAPTURE',
                                purchase_units: [
                                  {
                                    description: 'Boko Bookstore order',
                                    amount: { currency_code: 'USD', value: totalUSD.toFixed(2) }
                                  }
                                ]
                              })
                            }
                            onClick={(_data, actions) =>
                              validateForPayPal() ? actions.resolve() : actions.reject()
                            }
                            onApprove={async (data) => {
                              await handlePayPalApprove(data.orderID);
                            }}
                            onError={() => setFormErrors(['Thanh toán PayPal thất bại. Vui lòng thử lại.'])}
                            onCancel={() => setFormErrors(['Bạn đã hủy thanh toán PayPal.'])}
                          />
                        </PayPalScriptProvider>
                        </div>
                      </div>
                    ) : null}
                    {savedPaypal.length > 0 && !paypalClientId ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-700">
                          Tài khoản PayPal đã liên kết:
                        </p>
                        <div className="space-y-2">
                          {savedPaypal.map((method) => (
                            <div
                              key={method.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                method.isDefault || selectedSavedPaymentId === method.id
                                  ? 'bg-blue-50/60 border-blue-500'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <i className="fa-brands fa-paypal text-[#003087] text-lg"></i>
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{method.label}</p>
                                  <p className="text-[11px] text-slate-500">Chủ tài khoản: {method.accountHolder}</p>
                                </div>
                              </div>
                              {method.isDefault && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                                  Mặc định
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettingsTab('payments')}
                          className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1.5 mt-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-gear text-xs"></i>
                          <span>Quản lý tài khoản PayPal trong Cài đặt</span>
                        </button>
                      </div>
                    ) : !paypalClientId ? (
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3 text-blue-950">
                        <div className="flex items-start gap-2">
                          <i className="fa-solid fa-circle-info text-[#003087] text-base shrink-0 mt-0.5"></i>
                          <div>
                            <p className="text-xs font-bold">Chưa liên kết tài khoản PayPal</p>
                            <p className="text-xs mt-0.5">
                              Liên kết email PayPal trong Cài đặt để thanh toán quốc tế nhanh chóng.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettingsTab('payments')}
                          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#003087] hover:bg-[#00246b] text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <i className="fa-brands fa-paypal text-xs"></i>
                          <span>Mở Cài Đặt Để Liên Kết PayPal</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Bank Transfer Option */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="payment-bank"
                    name="paymentMethod"
                    checked={formData.paymentMethod === 'bank'}
                    onChange={() => setFormData((p) => ({ ...p, paymentMethod: 'bank' }))}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="payment-bank" className="font-body text-base font-semibold text-slate-900 cursor-pointer">
                    Chuyển Khoản Ngân Hàng (QR Code / Internet Banking)
                  </label>
                  <div className="flex gap-2 ml-auto">
                    <i className="fa-solid fa-building-columns text-slate-400 text-base"></i>
                  </div>
                </div>

                {formData.paymentMethod === 'bank' && (
                  <div className="pt-2 border-t border-slate-100 animate-fadeIn space-y-4">
                    {savedBanks.length > 0 && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                        <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                          <i className="fa-solid fa-building-columns text-emerald-700 text-sm"></i>
                          <span>Tài khoản ngân hàng của bạn: {savedBanks[0].label}</span>
                        </p>
                        <p className="text-[11px] text-emerald-800">Chủ tài khoản: {savedBanks[0].accountHolder}</p>
                      </div>
                    )}

                    <div className="bg-slate-50 p-6 border border-slate-200 rounded-xl flex flex-col items-center gap-4 text-center">
                      <div className="w-32 h-32 bg-white border border-slate-200 flex flex-col items-center justify-center p-2 rounded-lg shadow-xs">
                        <i className="fa-solid fa-qrcode text-slate-400 text-5xl"></i>
                        <span className="text-[10px] text-slate-400 uppercase font-bold mt-1">
                          BIBLIOTHECA QR
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 space-y-1">
                        <p className="font-bold text-slate-900">Ngân hàng thụ hưởng: Vietcombank (VCB)</p>
                        <p>STK: <strong className="font-mono text-blue-600">88992026888</strong></p>
                        <p>Chủ TK: BIBLIOTHECA STILLE CO., LTD</p>
                        <button
                          type="button"
                          onClick={handleCopyAccount}
                          className="mt-2 text-[11px] font-bold text-blue-600 hover:text-blue-700 underline flex items-center justify-center gap-1 mx-auto cursor-pointer"
                        >
                          <i className="fa-solid fa-copy text-xs"></i>
                          <span>{copiedBank ? 'Đã sao chép STK!' : 'Sao chép STK ngân hàng'}</span>
                        </button>
                      </div>
                      <div className="pt-2 border-t border-slate-200 w-full">
                        <button
                          type="button"
                          onClick={() => handleOpenSettingsTab('payments')}
                          className="text-xs text-blue-600 hover:underline font-semibold flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                        >
                          <i className="fa-solid fa-gear text-xs"></i>
                          <span>Quản lý tài khoản ngân hàng trong Cài đặt</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Navigation */}
          <div className="flex flex-col-reverse sm:flex-row justify-between items-center pt-8 border-t border-slate-200 mt-10 gap-6">
            <button
              type="button"
              onClick={onReturnToCart}
              className="font-label-caps text-xs text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2 uppercase tracking-wider font-semibold cursor-pointer"
            >
              <i className="fa-solid fa-arrow-left text-sm"></i>
              <span>Return to Cart</span>
            </button>

            {formData.paymentMethod === 'paypal' && paypalClientId ? (
              <p className="text-xs text-slate-500 font-body text-center sm:text-right max-w-xs">
                Hoàn tất thanh toán bằng <strong className="text-slate-800">nút PayPal ở trên</strong> —
                đơn tự lưu sau khi PayPal xác nhận tiền về.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleSubmitOrder}
                className="bg-blue-600 hover:bg-blue-700 text-white font-label-caps text-xs py-4 px-12 rounded-lg w-full sm:w-auto uppercase tracking-widest font-bold shadow-md shadow-blue-200 transition-all cursor-pointer"
              >
                Continue
              </button>
            )}
          </div>
        </section>

        {/* Right Column: Order Summary (Sleek Panel) */}
        <aside className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <h2 className="font-display font-bold text-2xl text-slate-900 mb-6">
            Your Order
          </h2>

          {/* Book Items List */}
          <div className="space-y-5 pb-6 border-b border-slate-200">
            {displayItems.map((item) => (
              <div key={item.book.id} className="flex items-center gap-4">
                <div className="w-16 shrink-0 relative">
                  <div className="absolute -top-2 -right-2 bg-blue-600 text-white font-label-caps text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold z-20 shadow-xs">
                    {item.quantity}
                  </div>
                  <div className="w-full h-20 bg-slate-100 rounded-md overflow-hidden book-spine-shadow border border-slate-200">
                    {item.book.coverUrl ? (
                      <img
                        src={item.book.coverUrl}
                        alt={item.book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        style={{ backgroundColor: item.book.bgColor || '#334155' }}
                        className="w-full h-full flex items-center justify-center p-1 text-[8px] text-white font-bold text-center"
                      >
                        {item.book.title}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-grow flex justify-between items-center min-w-0">
                  <div className="pr-2 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 truncate max-w-[150px] flex items-center gap-1">
                        <i className="fa-solid fa-circle-check text-blue-500 text-[10px]"></i>
                        <span>{item.book.brandName || 'Chính Hãng'}</span>
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-sm text-slate-900 leading-tight truncate">
                      {item.book.title}
                    </h3>
                    <p className="font-body text-xs text-slate-500 mt-0.5 truncate">
                      {item.book.author} • {item.book.editionType || 'Bìa Mềm'}
                    </p>
                  </div>
                  <span className="font-body text-sm text-slate-900 font-bold shrink-0">
                    {formatPrice(item.book.priceEUR * item.quantity, item.book.priceVND * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Discount Code */}
          <form onSubmit={handleApplyDiscount} className="py-5 border-b border-slate-200 space-y-2">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Discount Code"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="paper-input flex-grow font-body text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border-slate-200"
              />
              <button
                type="submit"
                className="bg-slate-900 text-white hover:bg-slate-800 transition-colors font-label-caps text-[11px] py-2 px-5 rounded-lg uppercase tracking-widest font-bold cursor-pointer"
              >
                APPLY
              </button>
            </div>
            {discountMessage && (
              <p className={`text-xs font-semibold ${discountMessage.isError ? 'text-red-600' : 'text-green-600'}`}>
                {discountMessage.text}
              </p>
            )}
          </form>

          {/* Totals */}
          <div className="pt-5 space-y-3 font-body text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900">
                {formatPrice(subtotalEUR, subtotalVND)}
              </span>
            </div>

            {discountRate > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount ({discountRate * 100}%)</span>
                <span>-{formatPrice(discountEUR, discountVND)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>VAT (5%)</span>
              <span className="font-semibold text-slate-900">{formatPrice(vatEUR, vatVND)}</span>
            </div>

            <div className="flex justify-between">
              <span>Shipping</span>
              <span className="font-semibold text-slate-900">
                {isFreeShip ? 'FREE' : formatPrice(shippingEUR, shippingVND)}
              </span>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-slate-200 flex justify-between items-end">
            <span className="font-display font-bold text-xl text-slate-900">Total</span>
            <span className="font-display font-bold text-3xl text-slate-900">
              {formatPrice(totalEUR, totalVND)}
            </span>
          </div>
        </aside>
      </main>
    </div>
  );
};
