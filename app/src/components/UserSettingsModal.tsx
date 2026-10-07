import React, { useState, useEffect } from 'react';
import { User, ShippingAddress, SavedPaymentMethod } from '../types';
import logoImg from '../assets/images/app_main_logo_1786578722639.jpg';

export type SettingsTab = 'profile' | 'address' | 'payments';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUpdateUser: (updatedUser: User) => void;
  initialTab?: SettingsTab;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
];

const VIETNAM_BANKS = [
  { id: 'vcb', name: 'Vietcombank (VCB)', logo: 'account_balance' },
  { id: 'mbb', name: 'MB Bank (Quân Đội)', logo: 'account_balance' },
  { id: 'tcb', name: 'Techcombank', logo: 'account_balance' },
  { id: 'acb', name: 'ACB (Á Châu)', logo: 'account_balance' },
  { id: 'bidv', name: 'BIDV', logo: 'account_balance' },
  { id: 'vpb', name: 'VPBank', logo: 'account_balance' },
  { id: 'tpb', name: 'TPBank', logo: 'account_balance' },
];

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  initialTab = 'profile'
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Tab 1: Profile fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Tab 2: Address fields
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [province, setProvince] = useState('Hà Nội');
  const [ward, setWard] = useState('');
  const [streetAddress, setStreetAddress] = useState('');

  // Tab 3: Payment Methods
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [showAddPaymentForm, setShowAddPaymentForm] = useState(false);
  const [newPaymentType, setNewPaymentType] = useState<'card' | 'momo' | 'zalopay' | 'bank' | 'paypal'>('card');
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [walletPhone, setWalletPhone] = useState('');
  const [walletName, setWalletName] = useState('');
  const [selectedBank, setSelectedBank] = useState('Vietcombank (VCB)');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [isDefaultMethod, setIsDefaultMethod] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Sync state with user and initial tab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || user.shippingAddress?.phone || '');
      setBio(user.bio || 'Độc giả yêu sách tại Boko.');
      setAvatarUrl(user.avatarUrl || PRESET_AVATARS[0]);

      const addr = user.shippingAddress;
      setReceiverName(addr?.fullName || user.name || '');
      setReceiverPhone(addr?.phone || user.phone || '');
      setProvince(addr?.province || 'Hà Nội');
      setWard(addr?.ward || '');
      setStreetAddress(addr?.streetAddress || '');

      setPaymentMethods(user.paymentMethods || []);
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 3000);
  };

  // 1. Save Basic Profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Vui lòng nhập họ và tên.');
      return;
    }

    const updated: User = {
      ...user,
      name: name.trim(),
      email: email.trim() || user.email,
      phone: phone.trim(),
      bio: bio.trim(),
      avatarUrl: avatarUrl.trim() || user.avatarUrl
    };

    onUpdateUser(updated);
    showToast('Đã lưu thông tin cơ bản thành công!');
  };

  // 2. Save Shipping Address
  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverName.trim() || !receiverPhone.trim() || !streetAddress.trim()) {
      showToast('Vui lòng điền đầy đủ các thông tin địa chỉ bắt buộc (*).');
      return;
    }

    const newAddress: ShippingAddress = {
      fullName: receiverName.trim(),
      phone: receiverPhone.trim(),
      province: province.trim(),
      ward: ward.trim(),
      streetAddress: streetAddress.trim()
    };

    const updated: User = {
      ...user,
      shippingAddress: newAddress
    };

    onUpdateUser(updated);
    showToast('Đã lưu địa chỉ giao hàng mặc định!');
  };

  // 3. Add New Payment Method
  const handleAddPaymentMethod = (e: React.FormEvent) => {
    e.preventDefault();

    let newMethod: SavedPaymentMethod;

    if (newPaymentType === 'card') {
      const cleanNum = cardNumber.replace(/\s+/g, '');
      if (cleanNum.length < 12) {
        showToast('Số thẻ không hợp lệ (tối thiểu 12-16 số).');
        return;
      }
      if (!cardHolder.trim()) {
        showToast('Vui lòng nhập tên in trên thẻ.');
        return;
      }

      const last4 = cleanNum.slice(-4);
      newMethod = {
        id: `pm-card-${Date.now()}`,
        type: 'card',
        label: `Thẻ Quốc Tế •••• ${last4}`,
        accountNumber: `•••• •••• •••• ${last4}`,
        accountHolder: cardHolder.toUpperCase().trim(),
        providerName: cleanNum.startsWith('4') ? 'Visa' : 'Mastercard',
        cardExpiry: cardExpiry || '12/28',
        isDefault: isDefaultMethod || paymentMethods.length === 0
      };
    } else if (newPaymentType === 'momo') {
      if (!walletPhone.trim()) {
        showToast('Vui lòng nhập số điện thoại MoMo.');
        return;
      }
      newMethod = {
        id: `pm-momo-${Date.now()}`,
        type: 'momo',
        label: `Ví Điện Tử MoMo (${walletPhone.trim()})`,
        accountNumber: walletPhone.trim(),
        accountHolder: (walletName.trim() || user.name).toUpperCase(),
        providerName: 'MoMo',
        isDefault: isDefaultMethod || paymentMethods.length === 0
      };
    } else if (newPaymentType === 'zalopay') {
      if (!walletPhone.trim()) {
        showToast('Vui lòng nhập số điện thoại ZaloPay.');
        return;
      }
      newMethod = {
        id: `pm-zalopay-${Date.now()}`,
        type: 'zalopay',
        label: `Ví ZaloPay (${walletPhone.trim()})`,
        accountNumber: walletPhone.trim(),
        accountHolder: (walletName.trim() || user.name).toUpperCase(),
        providerName: 'ZaloPay',
        isDefault: isDefaultMethod || paymentMethods.length === 0
      };
    } else if (newPaymentType === 'paypal') {
      if (!walletPhone.trim() || !walletPhone.includes('@')) {
        showToast('Vui lòng nhập địa chỉ email PayPal hợp lệ.');
        return;
      }
      newMethod = {
        id: `pm-paypal-${Date.now()}`,
        type: 'paypal',
        label: `PayPal (${walletPhone.trim()})`,
        accountNumber: walletPhone.trim(),
        accountHolder: (walletName.trim() || user.name).toUpperCase(),
        providerName: 'PayPal',
        isDefault: isDefaultMethod || paymentMethods.length === 0
      };
    } else {
      // bank
      if (!bankAccountNumber.trim() || !bankAccountHolder.trim()) {
        showToast('Vui lòng nhập đầy đủ Số tài khoản & Tên chủ tài khoản.');
        return;
      }
      newMethod = {
        id: `pm-bank-${Date.now()}`,
        type: 'bank',
        label: `${selectedBank} - STK •••• ${bankAccountNumber.slice(-4)}`,
        accountNumber: bankAccountNumber.trim(),
        accountHolder: bankAccountHolder.toUpperCase().trim(),
        bankName: selectedBank,
        providerName: selectedBank,
        isDefault: isDefaultMethod || paymentMethods.length === 0
      };
    }

    let updatedMethods = isDefaultMethod
      ? paymentMethods.map((m) => ({ ...m, isDefault: false }))
      : [...paymentMethods];

    updatedMethods = [newMethod, ...updatedMethods];

    setPaymentMethods(updatedMethods);
    const updatedUser: User = {
      ...user,
      paymentMethods: updatedMethods
    };
    onUpdateUser(updatedUser);

    // Reset form
    setCardNumber('');
    setCardHolder('');
    setCardExpiry('');
    setCardCvv('');
    setWalletPhone('');
    setWalletName('');
    setBankAccountNumber('');
    setBankAccountHolder('');
    setShowAddPaymentForm(false);
    showToast('Tích hợp phương thức thanh toán thành công!');
  };

  const handleSetDefaultPayment = (methodId: string) => {
    const updated = paymentMethods.map((m) => ({
      ...m,
      isDefault: m.id === methodId
    }));
    setPaymentMethods(updated);
    onUpdateUser({
      ...user,
      paymentMethods: updated
    });
    showToast('Đã đặt làm phương thức thanh toán mặc định!');
  };

  const handleDeletePayment = (methodId: string) => {
    const updated = paymentMethods.filter((m) => m.id !== methodId);
    if (updated.length > 0 && !updated.some((m) => m.isDefault)) {
      updated[0].isDefault = true;
    }
    setPaymentMethods(updated);
    onUpdateUser({
      ...user,
      paymentMethods: updated
    });
    showToast('Đã xóa phương thức thanh toán!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 my-auto flex flex-col max-h-[90vh]">
        {/* Header with Boko Logo & Title */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-900 border border-amber-400/50 p-0.5 shadow-md flex items-center justify-center overflow-hidden">
              <img
                src={logoImg}
                alt="Boko"
                className="w-full h-full object-cover rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg sm:text-xl font-bold tracking-tight text-amber-100">
                  Cài Đặt Tài Khoản Boko
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-slate-950">
                  Thành viên
                </span>
              </div>
              <p className="text-xs text-amber-200/70">
                Quản lý thông tin cá nhân, sổ địa chỉ và liên kết thanh toán
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors border border-white/15 cursor-pointer"
            title="Đóng cài đặt"
          >
            <i className="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50/90 px-4 sm:px-6 gap-2 overflow-x-auto hide-scrollbar">
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setShowAddPaymentForm(false);
            }}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <i className="fa-solid fa-user text-xs"></i>
            <span>Thông Tin Cơ Bản</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('address');
              setShowAddPaymentForm(false);
            }}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'address'
                ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <i className="fa-solid fa-truck-fast text-xs"></i>
            <span>Địa Chỉ Giao Hàng</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'payments'
                ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <i className="fa-solid fa-wallet text-xs"></i>
            <span>Phương Thức Thanh Toán</span>
            {paymentMethods.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                {paymentMethods.length}
              </span>
            )}
          </button>
        </div>

        {/* Toast Feedback */}
        {toastMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-2xs">
            <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Modal Body Content Container */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {/* =========================================================
              TAB 1: THÔNG TIN CƠ BẢN
             ========================================================= */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Avatar Selector Section */}
              <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Ảnh Đại Diện (Avatar)
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="w-20 h-20 rounded-full border-2 border-amber-600/60 p-1 shadow-md overflow-hidden bg-white shrink-0">
                    <img
                      src={avatarUrl || user.avatarUrl}
                      alt={name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <p className="text-xs text-slate-500">
                      Chọn ảnh đại diện có sẵn hoặc dán liên kết URL ảnh của bạn:
                    </p>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {PRESET_AVATARS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAvatarUrl(preset)}
                          className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform hover:scale-105 shrink-0 cursor-pointer ${
                            avatarUrl === preset ? 'border-amber-600 ring-2 ring-amber-400' : 'border-slate-300'
                          }`}
                        >
                          <img src={preset} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="Dán đường dẫn ảnh URL (https://...)"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-700/30"
                    />
                  </div>
                </div>
              </div>

              {/* Form inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và Tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số Điện Thoại
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ví dụ: 0912 345 678"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thành viên từ ngày
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.memberSince || '2026'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm font-body text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giới Thiệu Ngắn (Bio)
                  </label>
                  <textarea
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Sở thích đọc sách, thể loại yêu thích..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 resize-none"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk text-sm"></i>
                  <span>Lưu Thông Tin Cá Nhân</span>
                </button>
              </div>
            </form>
          )}

          {/* =========================================================
              TAB 2: ĐỊA CHỈ GIAO HÀNG
             ========================================================= */}
          {activeTab === 'address' && (
            <form onSubmit={handleSaveAddress} className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <i className="fa-solid fa-location-dot text-amber-700 text-base"></i>
                    <span>Địa Chỉ Nhận Hàng Mặc Định</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hệ thống sẽ tự động điền địa chỉ này khi bạn đặt sách tại giỏ hàng.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và Tên Người Nhận <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số Điện Thoại Người Nhận <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(e.target.value)}
                    placeholder="Ví dụ: 0912 345 678"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tỉnh / Thành Phố <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    placeholder="Ví dụ: Hà Nội / TP. Hồ Chí Minh"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phường / Xã / Quận / Huyện <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                    placeholder="Ví dụ: Phường Bến Nghé, Quận 1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên Đường, Số Nhà, Tòa Nhà <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="Ví dụ: Số 123 Đường Đồng Khởi, Tòa nhà Vincom Center"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 resize-none"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-check text-sm"></i>
                  <span>Lưu Địa Chỉ Giao Hàng</span>
                </button>
              </div>
            </form>
          )}

          {/* =========================================================
              TAB 3: PHƯƠNG THỨC THANH TOÁN
             ========================================================= */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <i className="fa-solid fa-credit-card text-blue-600 text-base"></i>
                    <span>Phương Thức Thanh Toán Đã Liên Kết</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tích hợp ví điện tử, thẻ ngân hàng để thanh toán nhanh chóng và bảo mật khi mua sách.
                  </p>
                </div>

                {!showAddPaymentForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddPaymentForm(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <i className="fa-solid fa-plus text-xs"></i>
                    <span>Thêm Phương Thức Mới</span>
                  </button>
                )}
              </div>

              {/* Form Add New Payment Method */}
              {showAddPaymentForm ? (
                <form
                  onSubmit={handleAddPaymentMethod}
                  className="bg-slate-50 p-5 sm:p-6 rounded-2xl border-2 border-blue-500/40 space-y-5 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h5 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                      <i className="fa-solid fa-credit-card text-blue-600"></i>
                      <span>Tích Hợp Phương Thức Thanh Toán Mới</span>
                    </h5>
                    <button
                      type="button"
                      onClick={() => setShowAddPaymentForm(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                  </div>

                  {/* Payment Type Selection Buttons */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      Chọn Loại Phương Thức Thanh Toán:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewPaymentType('card')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold cursor-pointer ${
                          newPaymentType === 'card'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <i className="fa-solid fa-credit-card text-lg"></i>
                        <span>Thẻ Tín Dụng / Visa</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewPaymentType('momo')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold cursor-pointer ${
                          newPaymentType === 'momo'
                            ? 'bg-[#a50064] text-white border-[#a50064] shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <i className="fa-solid fa-wallet text-lg"></i>
                        <span>Ví MoMo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewPaymentType('zalopay')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold cursor-pointer ${
                          newPaymentType === 'zalopay'
                            ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <i className="fa-solid fa-money-bill-wave text-lg"></i>
                        <span>Ví ZaloPay</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewPaymentType('bank')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold cursor-pointer ${
                          newPaymentType === 'bank'
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <i className="fa-solid fa-building-columns text-lg"></i>
                        <span>Tài Khoản NH</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewPaymentType('paypal')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold cursor-pointer ${
                          newPaymentType === 'paypal'
                            ? 'bg-[#003087] text-white border-[#003087] shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <i className="fa-brands fa-paypal text-lg"></i>
                        <span>PayPal</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-form based on selected payment type */}
                  {newPaymentType === 'card' && (
                    <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Số Thẻ (Visa / Mastercard / JCB) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="4532 8892 1029 4242"
                          maxLength={19}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Tên In Trên Thẻ (Không dấu) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={cardHolder}
                            onChange={(e) => setCardHolder(e.target.value)}
                            placeholder="NGUYEN VAN A"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Hạn Dùng (MM/YY) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="12/28"
                            maxLength={5}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(newPaymentType === 'momo' || newPaymentType === 'zalopay') && (
                    <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Số Điện Thoại Đăng Ký {newPaymentType === 'momo' ? 'Ví MoMo' : 'Ví ZaloPay'}{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={walletPhone}
                          onChange={(e) => setWalletPhone(e.target.value)}
                          placeholder="Ví dụ: 0912 345 678"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Họ và Tên Chủ Ví
                        </label>
                        <input
                          type="text"
                          value={walletName}
                          onChange={(e) => setWalletName(e.target.value)}
                          placeholder={user.name}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                        />
                      </div>
                    </div>
                  )}

                  {newPaymentType === 'paypal' && (
                    <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Địa chỉ email PayPal <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={walletPhone}
                          onChange={(e) => setWalletPhone(e.target.value)}
                          placeholder="email@example.com"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Họ và Tên Chủ Tài Khoản
                        </label>
                        <input
                          type="text"
                          value={walletName}
                          onChange={(e) => setWalletName(e.target.value)}
                          placeholder={user.name}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                        />
                      </div>
                    </div>
                  )}

                  {newPaymentType === 'bank' && (
                    <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Chọn Ngân Hàng <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={selectedBank}
                          onChange={(e) => setSelectedBank(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 cursor-pointer"
                        >
                          {VIETNAM_BANKS.map((b) => (
                            <option key={b.id} value={b.name}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Số Tài Khoản (STK) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={bankAccountNumber}
                            onChange={(e) => setBankAccountNumber(e.target.value)}
                            placeholder="Ví dụ: 88992026888"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Tên Chủ Tài Khoản <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={bankAccountHolder}
                            onChange={(e) => setBankAccountHolder(e.target.value)}
                            placeholder="NGUYEN VAN A"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-body uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Set as Default Checkbox */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isDefaultMethodCheck"
                      checked={isDefaultMethod}
                      onChange={(e) => setIsDefaultMethod(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="isDefaultMethodCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Đặt làm phương thức thanh toán mặc định
                    </label>
                  </div>

                  {/* Form Actions */}
                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAddPaymentForm(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-link text-xs"></i>
                      <span>Xác Nhận & Liên Kết</span>
                    </button>
                  </div>
                </form>
              ) : null}

              {/* List of Saved Payment Methods */}
              <div className="space-y-3">
                {paymentMethods.length === 0 ? (
                  <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
                      <i className="fa-solid fa-wallet text-2xl"></i>
                    </div>
                    <div>
                      <h5 className="font-display font-bold text-sm text-slate-800">
                        Chưa có phương thức thanh toán nào
                      </h5>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                        Hãy liên kết thẻ ngân hàng, ví MoMo, ZaloPay hoặc tài khoản ngân hàng để sử dụng khi thanh toán đơn hàng sách.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddPaymentForm(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                    >
                      <i className="fa-solid fa-plus text-xs"></i>
                      <span>Tích Hợp Phương Thức Đầu Tiên</span>
                    </button>
                  </div>
                ) : (
                  paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                        method.isDefault
                          ? 'bg-blue-50/40 border-blue-400/80 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Left: Icon & Details */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs ${
                            method.type === 'momo'
                              ? 'bg-[#a50064]'
                              : method.type === 'zalopay'
                              ? 'bg-blue-500'
                              : method.type === 'bank'
                              ? 'bg-emerald-700'
                              : method.type === 'paypal'
                              ? 'bg-[#003087]'
                              : 'bg-slate-900'
                          }`}
                        >
                          <i className={`${
                            method.type === 'paypal'
                              ? 'fa-brands fa-paypal'
                              : 'fa-solid'
                          } ${
                            method.type === 'card'
                              ? 'fa-credit-card'
                              : method.type === 'bank'
                              ? 'fa-building-columns'
                              : method.type === 'paypal'
                              ? ''
                              : 'fa-wallet'
                          } text-xl`}></i>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="font-display font-bold text-sm text-slate-900 truncate">
                              {method.label}
                            </h5>
                            {method.isDefault && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
                                Mặc định
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            Chủ tài khoản: <strong className="text-slate-700 font-semibold">{method.accountHolder}</strong>
                            {method.cardExpiry && ` • Hạn: ${method.cardExpiry}`}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!method.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultPayment(method.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            Đặt làm mặc định
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(method.id)}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                          title="Xóa phương thức này"
                        >
                          <i className="fa-solid fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
