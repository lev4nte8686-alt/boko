import { test, expect, APIRequestContext } from '@playwright/test';
import { loginOk, addFirstBookAndCheckout, pickAddressChain } from './helpers';

/**
 * shipping-vat.spec.ts — Chứng minh nhóm "phí ship thật (GHN) + VAT + địa chỉ":
 *   1. Cấu hình giá (VAT %, ngưỡng miễn phí ship) qua /api/pricing.
 *   2. Master data địa chỉ GHN: tỉnh/quận/phường.
 *   3. Báo giá phí vận chuyển: miễn phí khi vượt ngưỡng; tổng = tạm tính sau
 *      giảm giá + phí ship + VAT.
 *   4. Đơn COD lưu bóc tách (subtotal/giảm giá/phí ship/VAT) và hoá đơn khớp.
 *   5. UI: chọn Tỉnh/Quận/Phường bằng dropdown thì phí vận chuyển được tính.
 */

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function registerFreshUser(
  req: APIRequestContext,
  prefix: string
): Promise<{ email: string; token: string }> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@boko.test`;
  const password = 'FreshPass123';
  const res = await req.post('/api/register', {
    data: { name: 'QA ' + prefix, email, password, username: email.split('@')[0] },
  });
  expect(res.ok(), `register ${email} -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
  const login = await req.post('/api/login', { data: { identifier: email, password } });
  const body = await login.json();
  expect(body.token).toBeTruthy();
  return { email, token: body.token as string };
}

async function firstBook(req: APIRequestContext): Promise<{ id: number; price: number }> {
  const res = await req.get('/api/books?limit=5');
  const body = await res.json();
  const book = (body.data || [])[0];
  expect(book?.id).toBeTruthy();
  return { id: book.id as number, price: book.price as number };
}

test.describe('Cấu hình giá + địa chỉ GHN (API)', () => {
  test('GET /api/pricing trả VAT và ngưỡng miễn phí ship', async ({ request }) => {
    const res = await request.get('/api/pricing');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.currency).toBe('VND');
    expect(typeof body.vat_percent).toBe('number');
    expect(body.free_ship_threshold).toBeGreaterThan(0);
  });

  test('địa chỉ GHN: tỉnh -> quận -> phường đều có dữ liệu', async ({ request }) => {
    const chain = await pickAddressChain(request);
    expect(chain.province.province_id).toBeTruthy();
    expect(chain.district.district_id).toBeTruthy();
    expect(chain.ward.ward_code).toBeTruthy();
  });

  test('báo giá: miễn phí khi vượt ngưỡng; tổng luôn = tạm tính sau giảm + ship + VAT', async ({ request }) => {
    const book = await firstBook(request);

    // Số lượng lớn -> tạm tính vượt ngưỡng -> miễn phí vận chuyển
    const bigRes = await request.post('/api/shipping/quote', {
      data: { items: [{ book_id: book.id, quantity: 50 }] },
    });
    expect(bigRes.ok(), `quote(50) HTTP ${bigRes.status()}: ${await bigRes.text()}`).toBeTruthy();
    const big = await bigRes.json();
    expect(big.free_ship).toBe(true);
    expect(big.shipping_fee).toBe(0);
    expect(big.total).toBeCloseTo(big.subtotal_after_discount + 0 + big.vat_amount, 2);

    // Số lượng nhỏ -> công thức tổng vẫn đúng
    const smallRes = await request.post('/api/shipping/quote', {
      data: { items: [{ book_id: book.id, quantity: 1 }] },
    });
    expect(smallRes.ok(), `quote(1) HTTP ${smallRes.status()}: ${await smallRes.text()}`).toBeTruthy();
    const small = await smallRes.json();
    expect(small.total).toBeCloseTo(small.subtotal_after_discount + small.shipping_fee + small.vat_amount, 2);
  });
});

test.describe('Đơn hàng lưu phí ship + VAT', () => {
  test('đơn COD bóc tách tiền tệ và hoá đơn khớp tổng', async ({ request }) => {
    const user = await registerFreshUser(request, 'qa-ship');
    const book = await firstBook(request);

    const res = await request.post('/api/orders/cod/create', {
      headers: { ...auth(user.token), 'X-Idempotency-Key': `QA-SHIP-${Date.now()}-${Math.floor(Math.random() * 1e6)}` },
      data: {
        shipping_address: '789 Test Shipping, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        phone: '0900000099',
        items: [{ book_id: book.id, quantity: 1, price: 1 }], // price sai -> server dùng giá DB
      },
    });
    expect(res.ok(), `tạo COD -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    const order = body.order;

    expect(order.subtotal).toBeGreaterThan(0);
    // total = subtotal − giảm giá + phí ship + VAT
    expect(order.total).toBeCloseTo(order.subtotal - order.discount_amount + order.shipping_fee + order.vat_amount, 2);
    expect(order.subtotal).toBe(book.price); // giá lấy từ DB, không phải price=1 gửi lên

    const invoiceRes = await request.get(`/api/orders/${body.order_id}/invoice`, { headers: auth(user.token) });
    expect(invoiceRes.ok()).toBeTruthy();
    const invoice = await invoiceRes.json();
    expect(invoice.totals.total).toBeCloseTo(order.total, 2);
    expect(invoice.totals.shipping).toBeCloseTo(order.shipping_fee, 2);
    expect(invoice.totals.vat).toBeCloseTo(order.vat_amount, 2);

    await request.put(`/api/orders/${body.order_id}/cancel`, { headers: auth(user.token) });
  });
});

test.describe('UI chọn địa chỉ tính phí', () => {
  test('dropdown Tỉnh/Quận/Phường: sau khi chọn thì phí được tính', async ({ page }) => {
    await loginOk(page);
    await addFirstBookAndCheckout(page); // helper đã chọn sẵn Tỉnh/Quận/Phường

    const provinceSel = page.locator('#province');
    await expect(provinceSel).toBeVisible();
    await expect(provinceSel).not.toHaveValue('');
    await expect(page.locator('#district')).not.toHaveValue('');
    await expect(page.locator('#ward')).not.toHaveValue('');

    // Sau khi chọn + tính xong, không còn nhãn "Chọn địa chỉ".
    await expect(page.getByText('Chọn địa chỉ', { exact: true })).toHaveCount(0);
    // Nhãn VAT thể hiện đúng quy tắc sách miễn thuế.
    await expect(page.getByText(/Thuế GTGT/)).toBeVisible();
  });
});
