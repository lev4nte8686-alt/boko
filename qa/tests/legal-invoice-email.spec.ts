import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { loginOk, cancelOrder } from './helpers';

/**
 * legal-invoice-email.spec.ts — Chứng minh nhóm tính năng mới:
 *   1. Trang pháp lý công khai (Điều khoản/Bảo mật/Đổi trả/Liên hệ) + footer.
 *   2. Quên / đặt lại mật khẩu: không dò email, token sai bị chặn, email được ghi log.
 *   3. Hoá đơn: endpoint + trang in.
 *   4. Email thông báo đơn hàng (dev-log) được ghi khi tạo đơn COD.
 *
 * Lưu ý: luồng reset "trọn vòng" (đọc token từ email rồi đặt lại) được chứng minh
 * ở test Go (server/controllers/email_reset_invoice_test.go) vì token thô chỉ nằm
 * trong nội dung email, KHÔNG lộ qua API — đúng chủ đích bảo mật.
 */

const ADMIN = {
  email: process.env.QA_ADMIN_EMAIL || 'admin@boko.com',
  password: process.env.QA_ADMIN_PASSWORD || 'Admin@12345',
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function loginToken(req: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await req.post('/api/login', { data: { identifier: email, password } });
  expect(res.ok(), `login ${email} -> HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

/** Tạo user mới và trả về {email, password, token}. */
async function registerFreshUser(
  req: APIRequestContext,
  prefix: string
): Promise<{ email: string; password: string; token: string }> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@boko.test`;
  const password = 'FreshPass123';
  const res = await req.post('/api/register', {
    data: { name: 'QA ' + prefix, email, password, username: email.split('@')[0] },
  });
  expect(res.ok(), `register ${email} -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
  const token = await loginToken(req, email, password);
  return { email, password, token };
}

async function firstBookId(req: APIRequestContext): Promise<number> {
  const res = await req.get('/api/books?limit=5');
  const body = await res.json();
  const book = (body.data || [])[0];
  expect(book?.id).toBeTruthy();
  return book.id as number;
}

async function createCodOrder(req: APIRequestContext, token: string, bookId: number): Promise<number> {
  const res = await req.post('/api/orders/cod/create', {
    headers: { ...auth(token), 'X-Idempotency-Key': `QA-INV-${Date.now()}-${Math.floor(Math.random() * 1e6)}` },
    data: {
      shipping_address: '456 Test Invoice, HCM',
      phone: '0900000022',
      items: [{ book_id: bookId, quantity: 1, price: 1 }],
    },
  });
  expect(res.ok(), `tạo COD -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  expect(body.order_id).toBeTruthy();
  return body.order_id as number;
}

async function emailLogs(req: APIRequestContext, adminToken: string): Promise<any[]> {
  const res = await req.get('/api/admin/email-logs?limit=100', { headers: auth(adminToken) });
  expect(res.ok(), `email-logs -> HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.data || [];
}

// ============================================================================

test.describe('Trang pháp lý công khai', () => {
  const pages: Array<{ path: string; heading: RegExp }> = [
    { path: '/terms', heading: /Điều khoản sử dụng/i },
    { path: '/privacy', heading: /Chính sách bảo mật/i },
    { path: '/returns', heading: /Chính sách đổi trả/i },
    { path: '/contact', heading: /Liên hệ/i },
  ];

  for (const p of pages) {
    test(`${p.path} hiển thị được khi chưa đăng nhập`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
    });
  }

  test('footer có liên kết pháp lý và điều hướng được', async ({ page }) => {
    await page.goto('/terms');
    const privacyLink = page.getByRole('link', { name: /Chính sách bảo mật/i });
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: /Chính sách bảo mật/i })).toBeVisible();
  });
});

test.describe('Quên / đặt lại mật khẩu', () => {
  test('forgot-password trả thông báo trung tính cho cả email tồn tại và không tồn tại', async ({ request }) => {
    const user = await registerFreshUser(request, 'qa-forgot');

    const known = await request.post('/api/auth/forgot-password', { data: { email: user.email } });
    const unknown = await request.post('/api/auth/forgot-password', { data: { email: 'khong-ton-tai-xyz@boko.test' } });

    expect(known.status()).toBe(200);
    expect(unknown.status()).toBe(200);

    const knownBody = await known.json();
    const unknownBody = await unknown.json();
    expect(knownBody.message).toContain('Nếu email tồn tại');
    expect(unknownBody.message).toBe(knownBody.message);
  });

  test('thiếu email hợp lệ -> 400', async ({ request }) => {
    const res = await request.post('/api/auth/forgot-password', { data: { email: 'khong-phai-email' } });
    expect(res.status()).toBe(400);
  });

  test('token sai/hết hạn -> 400; mật khẩu ngắn -> 400', async ({ request }) => {
    const badToken = await request.post('/api/auth/reset-password', {
      data: { token: 'khong-ton-tai-token', password: 'NewPass123' },
    });
    expect(badToken.status()).toBe(400);

    const shortPw = await request.post('/api/auth/reset-password', {
      data: { token: 'bat-ky', password: '123' },
    });
    expect(shortPw.status()).toBe(400);
  });

  test('email-log ghi nhận yêu cầu reset (dev-log) và chỉ admin đọc được', async ({ request }) => {
    const user = await registerFreshUser(request, 'qa-emaillog');
    await request.post('/api/auth/forgot-password', { data: { email: user.email } });

    // User thường KHÔNG đọc được nhật ký email
    const forbidden = await request.get('/api/admin/email-logs', { headers: auth(user.token) });
    expect(forbidden.status()).toBe(403);

    // Admin đọc được và thấy bản ghi reset tới đúng email
    const adminToken = await loginToken(request, ADMIN.email, ADMIN.password);
    await expect
      .poll(
        async () => {
          const logs = await emailLogs(request, adminToken);
          return logs.some((l) => l.to === user.email && /Đặt lại mật khẩu/i.test(l.subject));
        },
        { timeout: 20_000, intervals: [500, 1500, 2500, 3000], message: 'không thấy email đặt lại mật khẩu trong email_logs' }
      )
      .toBeTruthy();

    const logs = await emailLogs(request, adminToken);
    const entry = logs.find((l) => l.to === user.email);
    expect(entry.provider).toBe('dev-log');
    expect(entry.status).toBe('sent');
  });
});

test.describe('Hoá đơn', () => {
  test('chủ đơn lấy được hoá đơn; khách vãng lai bị chặn', async ({ request }) => {
    const user = await registerFreshUser(request, 'qa-invoice');
    const bookId = await firstBookId(request);
    const orderId = await createCodOrder(request, user.token, bookId);

    // Chủ đơn (Bear token) -> 200
    const res = await request.get(`/api/orders/${orderId}/invoice`, { headers: auth(user.token) });
    expect(res.status()).toBe(200);
    const invoice = await res.json();
    expect(invoice.invoice_number).toMatch(/^BOKO-\d{4}-\d{6}$/);
    expect(Array.isArray(invoice.items)).toBeTruthy();
    expect(invoice.items.length).toBeGreaterThan(0);
    expect(invoice.totals.total).toBeGreaterThan(0);
    expect(invoice.shop.name).toBeTruthy();

    // Khách vãng lai không token, không key -> 401
    const guest = await request.get(`/api/orders/${orderId}/invoice`);
    expect(guest.status()).toBe(401);

    // Key sai -> 401
    const wrongKey = await request.get(`/api/orders/${orderId}/invoice?key=sai-key`);
    expect(wrongKey.status()).toBe(401);

    await request.put(`/api/orders/${orderId}/cancel`, { headers: auth(user.token) });
  });

  test('trang hoá đơn in được hiển thị cho chủ đơn', async ({ page }) => {
    // Đăng nhập qua UI để có token trong localStorage, rồi tạo đơn qua API.
    await loginOk(page);
    const token = await page.evaluate(() => localStorage.getItem('boko_auth_token'));
    expect(token).toBeTruthy();

    const bookRes = await page.request.get('/api/books?limit=5');
    const bookId = ((await bookRes.json()).data || [])[0].id;
    const orderId = await createCodOrder(page.request, token as string, bookId);

    await page.goto(`/invoice/${orderId}`);
    await expect(page.getByRole('heading', { name: /Hoá đơn/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /In hoá đơn/i })).toBeVisible();
    await expect(page.getByText(/BOKO-\d{4}-\d{6}/)).toBeVisible();

    await cancelOrder(page, orderId);
  });
});

test.describe('Email thông báo đơn hàng', () => {
  test('tạo đơn COD sinh email xác nhận cho chủ đơn', async ({ request }) => {
    const user = await registerFreshUser(request, 'qa-mail');
    const bookId = await firstBookId(request);
    const orderId = await createCodOrder(request, user.token, bookId);
    const adminToken = await loginToken(request, ADMIN.email, ADMIN.password);

    await expect
      .poll(
        async () => {
          const logs = await emailLogs(request, adminToken);
          return logs.some((l) => l.to === user.email && /Đặt hàng thành công/i.test(l.subject));
        },
        { timeout: 20_000, intervals: [500, 1500, 2500, 3000], message: 'không thấy email xác nhận đơn hàng trong email_logs' }
      )
      .toBeTruthy();

    await request.put(`/api/orders/${orderId}/cancel`, { headers: auth(user.token) });
  });
});
