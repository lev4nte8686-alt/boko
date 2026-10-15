import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * security-p0.spec.ts — Chứng minh các vá P0 (an ninh + tiền) ở tầng API.
 * Chạy nhanh, KHÔNG cần browser: dùng APIRequestContext.
 *
 * Bao gồm:
 *   - IDOR: khách vãng lai / user khác KHÔNG dùng được order_id có sẵn để tạo
 *     phiên thanh toán (momo/vnpay/paypal).
 *   - Idempotency: cùng X-Idempotency-Key giữa 2 user KHÔNG trả đơn của nhau.
 */

const USER = {
  email: process.env.QA_EMAIL || 'test@gmail.com',
  password: process.env.QA_PASSWORD || 'Test@12345',
};
const ADMIN = {
  email: process.env.QA_ADMIN_EMAIL || 'admin@boko.com',
  password: process.env.QA_ADMIN_PASSWORD || 'Admin@12345',
};

async function loginToken(req: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await req.post('/api/login', { data: { identifier: email, password } });
  expect(res.ok(), `login ${email} -> HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function firstBookId(req: APIRequestContext): Promise<number> {
  const res = await req.get('/api/books?limit=5');
  const body = await res.json();
  const book = (body.data || [])[0];
  expect(book?.id).toBeTruthy();
  return book.id as number;
}

async function createCodOrder(
  req: APIRequestContext,
  token: string,
  bookId: number,
  idempotencyKey?: string
): Promise<number> {
  const res = await req.post('/api/orders/cod/create', {
    headers: { ...auth(token), ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
    data: {
      shipping_address: '123 Test Security, HCM',
      phone: '0900000009',
      email: 'qa-security@boko.com',
      customer_name: 'QA Security',
      items: [{ book_id: bookId, quantity: 1, price: 1 }],
    },
  });
  expect(res.ok(), `tạo COD -> HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.order_id).toBeTruthy();
  return body.order_id as number;
}

async function cancel(req: APIRequestContext, token: string, orderId: number) {
  await req.put(`/api/orders/${orderId}/cancel`, { headers: auth(token) });
}

test.describe('P0 — chống IDOR tạo phiên thanh toán', () => {
  test('khách vãng lai không dùng được order_id có sẵn (MoMo/VNPay/PayPal)', async ({ request }) => {
    const userToken = await loginToken(request, USER.email, USER.password);
    const bookId = await firstBookId(request);
    const orderId = await createCodOrder(request, userToken, bookId);

    const endpoints = ['/api/payment/momo/create', '/api/payment/vnpay/create', '/api/payment/paypal/create'];
    for (const ep of endpoints) {
      const res = await request.post(ep, {
        data: { order_id: orderId, amount: 50000, redirect_url: '/payment/callback' },
      });
      const text = await res.text();
      expect(res.status(), `${ep} phải chặn guest dùng order_id -> ${text}`).toBe(403);
      expect(text).not.toContain('pay_url');
      expect(text).not.toContain('payment_url');
      expect(text).not.toContain('approve_url');
    }

    await cancel(request, userToken, orderId);
  });

  test('user A không tạo được phiên thanh toán cho đơn của user khác', async ({ request }) => {
    const userToken = await loginToken(request, USER.email, USER.password);
    const adminToken = await loginToken(request, ADMIN.email, ADMIN.password);
    const bookId = await firstBookId(request);
    const orderId = await createCodOrder(request, userToken, bookId);

    const res = await request.post('/api/payment/momo/create', {
      headers: auth(adminToken),
      data: { order_id: orderId, amount: 50000, redirect_url: '/payment/callback' },
    });
    expect(res.status()).toBe(404);

    await cancel(request, userToken, orderId);
  });
});

test.describe('P0 — idempotency key không rò rỉ giữa các user', () => {
  test('cùng key giữa 2 user tạo ra 2 đơn khác nhau, retry đúng chủ', async ({ request }) => {
    const userToken = await loginToken(request, USER.email, USER.password);
    const adminToken = await loginToken(request, ADMIN.email, ADMIN.password);
    const bookId = await firstBookId(request);
    const key = `QA-${Date.now()}`;

    const orderUser = await createCodOrder(request, userToken, bookId, key);
    const orderAdmin = await createCodOrder(request, adminToken, bookId, key);
    const orderUserRetry = await createCodOrder(request, userToken, bookId, key);

    // Không được trả đơn của nhau
    expect(orderAdmin).not.toBe(orderUser);
    // Retry của chính user phải trả đúng đơn của user
    expect(orderUserRetry).toBe(orderUser);

    await cancel(request, userToken, orderUser);
    await cancel(request, adminToken, orderAdmin);
  });
});
