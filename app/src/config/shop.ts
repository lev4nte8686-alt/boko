export interface ShopInfo {
  name: string;
  taxCode: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

/**
 * Thông tin shop dùng cho footer / trang pháp lý / hoá đơn.
 *
 * Nguồn ưu tiên là backend (`GET /api/shop`, đọc từ biến môi trường SHOP_*).
 * Giá trị dưới đây chỉ là placeholder dự phòng khi backend chưa cấu hình —
 * nhớ thay bằng thông tin thật trước khi go-live (xem server/.env.example).
 */
export const SHOP_INFO: ShopInfo = {
  name: import.meta.env.VITE_SHOP_NAME || 'BOKO',
  taxCode: import.meta.env.VITE_SHOP_TAX_CODE || 'TODO-ĐIỀN-MST',
  address:
    import.meta.env.VITE_SHOP_ADDRESS ||
    'TODO: Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành',
  phone: import.meta.env.VITE_SHOP_PHONE || 'TODO-ĐIỀN-HOTLINE',
  email: import.meta.env.VITE_SHOP_EMAIL || 'support@boko.example',
  website: import.meta.env.VITE_SHOP_WEBSITE || 'https://boko.example',
};
