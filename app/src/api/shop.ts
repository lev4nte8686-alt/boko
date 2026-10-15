import { getBackendBaseUrl } from './serverAuth';
import { SHOP_INFO, ShopInfo } from '../config/shop';

/**
 * Lấy thông tin shop từ backend (`GET /api/shop`). Nếu backend chưa cấu hình
 * SHOP_* hoặc không gọi được, fallback về placeholder trong config/shop.ts.
 */
export async function fetchShopInfo(): Promise<ShopInfo> {
  try {
    const base = getBackendBaseUrl();
    const url = `${base}/api/shop`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return SHOP_INFO;

    const d = await res.json();
    return {
      name: d?.name || SHOP_INFO.name,
      taxCode: d?.tax_code || SHOP_INFO.taxCode,
      address: d?.address || SHOP_INFO.address,
      phone: d?.phone || SHOP_INFO.phone,
      email: d?.email || SHOP_INFO.email,
      website: d?.website || SHOP_INFO.website,
    };
  } catch {
    return SHOP_INFO;
  }
}
