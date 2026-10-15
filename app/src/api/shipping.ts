import { getBackendBaseUrl } from './serverAuth';

// ==================== ĐỊA CHỈ GIAO HÀNG + PHÍ VẬN CHUYỂN ====================
//
// Master data (tỉnh/quận/phường) lấy từ backend (GHN). Phí vận chuyển + VAT
// được tính ở backend để không thể sửa từ trình duyệt.

export interface ShippingProvince {
  province_id: number;
  province_name: string;
}

export interface ShippingDistrict {
  district_id: number;
  district_name: string;
  province_id: number;
}

export interface ShippingWard {
  ward_code: string;
  ward_name: string;
  district_id: number;
}

export interface PricingConfig {
  currency: string;
  vat_percent: number;
  free_ship_threshold: number;
  ship_fee_fallback: number;
  ghn_configured: boolean;
}

export interface ShippingQuote {
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  subtotal_after_discount: number;
  shipping_fee: number;
  free_ship: boolean;
  ship_fee_source: string;
  vat_percent: number;
  vat_amount: number;
  free_ship_threshold: number;
  total: number;
  currency: string;
  fee_warning?: string;
}

async function getJSON<T>(path: string): Promise<T> {
  const base = getBackendBaseUrl();
  const res = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchProvincesApi(): Promise<ShippingProvince[]> {
  const d = await getJSON<{ data: ShippingProvince[] }>('/api/shipping/provinces');
  return d.data || [];
}

export async function fetchDistrictsApi(provinceId: number): Promise<ShippingDistrict[]> {
  const d = await getJSON<{ data: ShippingDistrict[] }>(`/api/shipping/districts?province_id=${provinceId}`);
  return d.data || [];
}

export async function fetchWardsApi(districtId: number): Promise<ShippingWard[]> {
  const d = await getJSON<{ data: ShippingWard[] }>(`/api/shipping/wards?district_id=${districtId}`);
  return d.data || [];
}

/** Cấu hình tính giá (VAT %, ngưỡng miễn phí ship). Trả null nếu không gọi được. */
export async function fetchPricingApi(): Promise<PricingConfig | null> {
  try {
    return await getJSON<PricingConfig>('/api/pricing');
  } catch {
    return null;
  }
}

export async function quoteShippingApi(params: {
  items: { book_id: number; quantity: number }[];
  toDistrictId?: number;
  toWardCode?: string;
  couponCode?: string;
}): Promise<ShippingQuote> {
  const base = getBackendBaseUrl();
  const res = await fetch(`${base}/api/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      items: params.items,
      to_district_id: params.toDistrictId || 0,
      to_ward_code: params.toWardCode || '',
      coupon_code: params.couponCode || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Lỗi tính phí vận chuyển');
  }
  return data as ShippingQuote;
}
