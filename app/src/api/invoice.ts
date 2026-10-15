import { getBackendBaseUrl } from './serverAuth';
import { getStoredAuthToken } from './auth';

export interface InvoiceTotals {
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  coupon_code: string;
  shipping: number;
  ship_fee_source?: string;
  vat: number;
  vat_percent?: number;
  total: number;
}

export interface InvoiceItem {
  ID?: number;
  title: string;
  price: number;
  quantity: number;
}

export interface InvoiceShop {
  name: string;
  tax_code: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export interface InvoiceData {
  shop: InvoiceShop;
  invoice_number: string;
  issued_at: string;
  order: {
    id: number;
    status: string;
    payment_status: string;
    payment_method: string;
    payment_trans_id: string;
    shipping_address: string;
    phone: string;
    created_at: string;
  };
  items: InvoiceItem[];
  totals: InvoiceTotals;
}

/**
 * Tải dữ liệu hoá đơn cho 1 đơn hàng.
 * - Đã đăng nhập: gửi Bearer token.
 * - Khách vãng lai: truyền `trackingKey` (?key=<tracking token>) để chứng minh quyền.
 * Trả về null nếu không có quyền hoặc đơn không tồn tại.
 */
export async function fetchOrderInvoice(
  orderId: string | number,
  trackingKey?: string
): Promise<InvoiceData | null> {
  try {
    const base = getBackendBaseUrl();
    const params = new URLSearchParams();
    if (trackingKey) params.set('key', trackingKey);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getStoredAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${base}/api/orders/${orderId}/invoice${qs}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as InvoiceData;
  } catch {
    return null;
  }
}
