import React from 'react';
import { Link } from 'react-router-dom';
import { useShopInfo } from '../hooks/useShopInfo';

/**
 * Footer công khai: thông tin shop + liên kết trang pháp lý.
 * Thông tin lấy từ GET /api/shop (SHOP_* env), fallback placeholder.
 */
export const Footer: React.FC = () => {
  const shop = useShopInfo();

  return (
    <footer className="w-full bg-white border-t border-slate-200 mt-auto">
      <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <p className="font-display font-bold text-slate-900 text-base mb-2">
            {shop.name} • Nhà Sách Trực Tuyến
          </p>
          <p className="text-slate-500 leading-relaxed">
            Tủ sách trực tuyến với các tác phẩm tuyển chọn từ những nhà xuất bản hàng đầu.
          </p>
        </div>

        <div>
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">
            Về chúng tôi
          </p>
          <ul className="space-y-2 text-slate-600">
            <li>
              <Link to="/terms" className="hover:text-blue-600 transition-colors">
                Điều khoản sử dụng
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-blue-600 transition-colors">
                Chính sách bảo mật
              </Link>
            </li>
            <li>
              <Link to="/returns" className="hover:text-blue-600 transition-colors">
                Đổi trả &amp; hoàn tiền
              </Link>
            </li>
            <li>
              <Link to="/contact" className="hover:text-blue-600 transition-colors">
                Liên hệ
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">
            Liên hệ
          </p>
          <ul className="space-y-2 text-slate-600">
            <li>
              <i className="fa-solid fa-location-dot text-slate-400 mr-2"></i>
              {shop.address}
            </li>
            <li>
              <i className="fa-solid fa-phone text-slate-400 mr-2"></i>
              {shop.phone}
            </li>
            <li className="break-all">
              <i className="fa-solid fa-envelope text-slate-400 mr-2"></i>
              {shop.email}
            </li>
          </ul>
        </div>

        <div>
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">
            Pháp lý
          </p>
          <ul className="space-y-2 text-slate-600">
            <li>
              Mã số thuế: <strong className="text-slate-800">{shop.taxCode}</strong>
            </li>
            <li className="break-all">{shop.website}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © 2026 {shop.name}. Tất cả quyền được bảo lưu.
      </div>
    </footer>
  );
};
