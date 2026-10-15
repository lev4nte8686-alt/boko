function getAuthToken(): string {
  try {
    const token = localStorage.getItem('boko_auth_token') || '';
    // Bỏ qua token giả lập/offline (mock-token-*, google-demo-token-*).
    if (!token || token.startsWith('mock-token-') || token.startsWith('google-demo-token-')) {
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

export interface CreateCodOrderItem {
  book_id?: number;
  title: string;
  price: number;
  quantity: number;
}

export interface CreateCodOrderParams {
  amount: number;
  shippingAddress: string;
  phone: string;
  email: string;
  customerName?: string;
  couponCode?: string;
  idempotencyKey?: string;
  toDistrictId?: number;
  toWardCode?: string;
  items: CreateCodOrderItem[];
}

export interface CodOrderResponse {
  message: string;
  order_id: number;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  order?: any;
  // Mã tra cứu cho khách vãng lai (xem trạng thái + hoá đơn không cần đăng nhập)
  tracking_token?: string;
}

export interface OrderQuoteResponse {
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
  coupon_code?: string;
}

/**
 * Lấy báo giá chuẩn từ Backend trước khi submit đơn hàng
 * Endpoint: POST /api/orders/quote
 */
export async function getOrderQuoteApi(params: {
  couponCode?: string;
  items: { book_id: number; quantity: number }[];
}): Promise<OrderQuoteResponse> {
  const baseUrl = getBackendBaseUrl();
  const response = await fetch(`${baseUrl}/api/orders/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      coupon_code: params.couponCode || '',
      items: params.items,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Lỗi tính báo giá đơn hàng');
  }
  return data;
}

export interface ConfirmReceiptResponse {
  message: string;
  order: any;
  status: string;
  payment_status: string;
}

function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const fromMeta = (import.meta as { env?: Record<string, string> }).env?.VITE_BACKEND_URL;
    if (fromMeta && typeof fromMeta === 'string' && fromMeta.trim() !== '') {
      return fromMeta.replace(/\/+$/, '');
    }
  }
  //return 'http://localhost:8080';
  return '';
}

/**
 * Lỗi mạng (không tới được server) — KHÁC với lỗi HTTP từ server.
 * Backend Render free-tier có thể "ngủ" (cold start) nên lần gọi đầu dễ ném
 * `TypeError: Failed to fetch`. Ta tách riêng để retry và báo lỗi thân thiện.
 */
export function isNetworkFailure(err: unknown): boolean {
  const msg = (err as Error)?.message || String(err || '');
  return /failed to fetch|networkerror|load failed|network request failed|quá thời gian|timeout|aborted/i.test(
    msg
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gọi fetch, tự thử lại khi lỗi MẠNG (cold start). Chỉ dùng cho request
 * idempotent (ví dụ tạo đơn COD đã kèm X-Idempotency-Key) — KHÔNG dùng cho
 * tạo phiên cổng thanh toán (tránh tạo đơn trùng).
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (attempt < retries && isNetworkFailure(err)) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * "Đánh thức" backend trước khi gửi yêu cầu quan trọng (ví dụ lúc bấm đặt hàng).
 * Render free-tier ngủ sau ~15 phút; gọi sớm để lần submit không bị Failed to fetch.
 */
export async function warmUpBackend(): Promise<void> {
  const baseUrl = getBackendBaseUrl();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fetch(`${baseUrl}/api/pricing`, { method: 'GET', headers: { Accept: 'application/json' } });
      return;
    } catch {
      await sleep(2000 * (attempt + 1));
    }
  }
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Tạo đơn hàng COD trực tiếp từ checkout
 * Endpoint: POST /api/orders/cod/create
 */
export async function createCodOrderApi(params: CreateCodOrderParams): Promise<CodOrderResponse> {
  const baseUrl = getBackendBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...authHeaders(),
  };
  if (params.idempotencyKey) {
    headers['X-Idempotency-Key'] = params.idempotencyKey;
  }

  const response = await fetchWithRetry(`${baseUrl}/api/orders/cod/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: params.amount,
      shipping_address: params.shippingAddress,
      phone: params.phone,
      email: params.email,
      customer_name: params.customerName || '',
      coupon_code: params.couponCode || '',
      to_district_id: params.toDistrictId || 0,
      to_ward_code: params.toWardCode || '',
      items: params.items,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi tạo đơn hàng COD: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Người mua xác nhận đã nhận hàng COD
 * Endpoint: POST /api/orders/:id/confirm-receipt
 */
export async function confirmOrderReceivedApi(orderId: number | string): Promise<ConfirmReceiptResponse> {
  const baseUrl = getBackendBaseUrl();
  const response = await fetch(`${baseUrl}/api/orders/${orderId}/confirm-receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi xác nhận nhận hàng: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Lấy danh sách lịch sử đơn hàng của tôi (đã đăng nhập).
 * Khách vãng lai dùng getGuestOrderApi(orderId, token) với mã tra cứu
 * nhận được lúc tạo đơn — KHÔNG còn tra cứu công khai bằng email.
 * Endpoint: GET /api/orders/my-orders
 */
export async function getMyOrdersApi(email?: string): Promise<any[]> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/orders/my-orders`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi lấy danh sách đơn hàng: HTTP ${response.status}`);
  }

  return data.data || [];
}

/**
 * Tra cứu 1 đơn hàng của khách vãng lai bằng mã tracking token.
 * Endpoint: GET /api/orders/my-orders?order_id=&token=
 */
export async function getGuestOrderApi(orderId: number | string, token: string): Promise<any[]> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/orders/my-orders?order_id=${encodeURIComponent(String(orderId))}&token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi tra cứu đơn hàng: HTTP ${response.status}`);
  }

  return data.data || [];
}

/**
 * Lấy danh sách đơn hàng chứa sách của người bán (dùng cho seller/admin
 * quản lý và chuyển đơn cho GHN). Endpoint: GET /api/seller/orders
 */
export async function getSellerOrdersApi(): Promise<any[]> {
  const baseUrl = getBackendBaseUrl();
  const response = await fetch(`${baseUrl}/api/seller/orders`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi lấy đơn hàng của shop: HTTP ${response.status}`);
  }

  return data.data || [];
}

// ==================== GHN SHIPPING ====================

export interface ShipmentApiResponse {
  shipment: {
    id: number;
    order_id: number;
    provider: string;
    client_order_code: string;
    order_code: string;
    status: string;
    status_text: string;
    service_type_id: number;
    payment_type_id: number;
    total_fee: number;
    cod_amount: number;
    leadtime: string | null;
    last_synced_at: string | null;
    created_at: string;
  } | null;
  history?: {
    id: number;
    order_id: number;
    shipment_id: number;
    status: string;
    status_text: string;
    source: string;
    created_at: string;
  }[];
  journey?: {
    key: string;
    title: string;
    done: boolean;
    current: boolean;
    warning: boolean;
    at: string | null;
  }[];
  order_status?: string;
  message?: string;
  // true khi đơn chạy trên gateway test của GHN (mã vận đơn test không có
  // trên trang ghn.vn production — tra cứu ngay trong Boko)
  ghn_test_mode?: boolean;
}

/**
 * Lấy thông tin vận đơn GHN đang quản lý cho 1 đơn hàng.
 * Endpoint: GET /api/orders/:id/ghn
 */
export async function getOrderShipmentApi(orderId: number | string): Promise<ShipmentApiResponse> {
  const baseUrl = getBackendBaseUrl();
  const response = await fetch(`${baseUrl}/api/orders/${orderId}/ghn`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi lấy thông tin vận chuyển: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Chuyển đơn đã đóng gói sang GHN quản lý vận chuyển (dùng cho người bán/admin).
 * Endpoint: POST /api/orders/:id/ghn/handover
 */
export async function handoverToGHNApi(
  orderId: number | string,
  overrides?: { to_district_id?: number; to_ward_code?: string; to_address?: string }
): Promise<ShipmentApiResponse & { message?: string }> {
  const baseUrl = getBackendBaseUrl();
  const response = await fetch(`${baseUrl}/api/orders/${orderId}/ghn/handover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(overrides || {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi chuyển đơn cho GHN: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Đồng bộ trạng thái mới nhất từ GHN (webhook chưa tới hoặc cần refresh tay).
 * Endpoint: POST /api/orders/:id/ghn/sync
 */
export async function syncOrderShipmentApi(orderId: number | string): Promise<ShipmentApiResponse> {
  const baseUrl = getBackendBaseUrl();
  const response = await fetch(`${baseUrl}/api/orders/${orderId}/ghn/sync`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Lỗi đồng bộ vận đơn: HTTP ${response.status}`);
  }

  return data;
}
