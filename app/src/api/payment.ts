import { getBackendBaseUrl } from './serverAuth';

export interface PaymentStatusResponse {
  order_id: number;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_trans_id: string;
  payment_order_id: string;
  updated_at: string;
}

export interface CreateVnpayPaymentParams {
  orderId?: number;
  amount: number;
  shippingAddress?: string;
  phone?: string;
  email?: string;
  bankCode?: string;
  redirectUrl?: string;
}

export interface VnpayPaymentResponse {
  message: string;
  order_id: number;
  amount: number;
  payment_url: string;
  txn_ref: string;
}

function getAuthToken(): string {
  try {
    const token = localStorage.getItem('boko_auth_token') || '';
    // Nếu là mock-token từ chế độ giả lập offline thì không gửi lên backend thật
    if (!token || token.startsWith('mock-token-')) {
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

function getBaseUrl(): string {
  const configured = getBackendBaseUrl();
  return configured || 'http://localhost:8080';
}

/**
 * Khởi tạo yêu cầu thanh toán VNPAY Sandbox
 * Endpoint: POST /api/payment/vnpay/create
 */
export async function createVnpayPaymentApi(
  params: CreateVnpayPaymentParams
): Promise<VnpayPaymentResponse> {
  const baseUrl = getBaseUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/api/payment/vnpay/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      order_id: params.orderId || 0,
      amount: params.amount,
      shipping_address: params.shippingAddress || '',
      phone: params.phone || '',
      email: params.email || '',
      bank_code: params.bankCode || '',
      redirect_url: params.redirectUrl || '',
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi tạo thanh toán VNPAY: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Lấy trạng thái đơn hàng thanh toán VNPAY từ Backend
 * Endpoint: GET /api/payment/vnpay/status/:id
 */
export async function getVnpayStatusApi(
  orderId: number | string,
  queryString?: string
): Promise<PaymentStatusResponse> {
  const baseUrl = getBaseUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const query = queryString ? (queryString.startsWith('?') ? queryString : `?${queryString}`) : '';
  const response = await fetch(`${baseUrl}/api/payment/vnpay/status/${orderId}${query}`, {
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi lấy trạng thái VNPAY: HTTP ${response.status}`);
  }

  return data;
}
