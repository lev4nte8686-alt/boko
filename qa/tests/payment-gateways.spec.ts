import { test, expect, Page } from '@playwright/test';
import { loginOk, addFirstBookAndCheckout, SEL } from './helpers';

/**
 * Kiem tra cac cong thanh toan KHAC (MoMo / VNPay / PayPal / ATM).
 *
 * Nguyen tac: CHI kiem tra buoc "tao phien thanh toan" (backend tra ve URL cong).
 * KHONG hoan tat giao dich that:
 *   - Chan (abort) moi dieu huong sang domain cong thanh toan.
 *   - Huy don vua tao qua API sau khi assert.
 *
 * Luu y ky thuat: app lap tuc `window.location.href = pay_url` ngay sau khi nhan
 * response, khien `resp.json()` bao "navigated away". Vi vay ta doc body NGAY tai
 * route handler (truoc khi app kip dieu huong).
 */
const GATEWAY_HOSTS = /(momo\.vn|vnpayment\.vn|paypal\.com)/i;

interface Created {
  status: number;
  json: any;
}

/** Chan route API tao phien, doc body truoc khi app dieu huong. */
async function captureCreate(page: Page, endpoint: string): Promise<Promise<Created>> {
  let resolveFn!: (v: Created) => void;
  const promise = new Promise<Created>((res) => (resolveFn = res));

  await page.route(`**${endpoint}`, async (route) => {
    try {
      const response = await route.fetch();
      const status = response.status();
      let json: any = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      resolveFn({ status, json });
      await route.fulfill({ response });
    } catch (e) {
      resolveFn({ status: 0, json: { error: String(e) } });
    }
  });

  return promise;
}

async function cancelWithToken(page: Page, orderId: number | string, token: string | null) {
  if (!orderId || !token) return;
  await page.request
    .put(`/api/orders/${orderId}/cancel`, { headers: { Authorization: `Bearer ${token}` } })
    .catch(() => {});
}

async function payAndCapture(
  page: Page,
  endpoint: string,
  urlKey: 'pay_url' | 'payment_url' | 'approve_url',
  expectHost: RegExp
) {
  const token = await page.evaluate(() => localStorage.getItem('boko_auth_token'));
  const created = captureCreate(page, endpoint);

  await page.getByRole('button', SEL.submitBtn).click();

  const { status, json } = await created;
  expect(status, `${endpoint} tra ve ${status}`).toBe(200);
  expect(String(json?.[urlKey]), `thieu ${urlKey}`).toMatch(expectHost);

  if (json?.order_id) await cancelWithToken(page, json.order_id, token);
  return json;
}

test.describe('Cổng thanh toán (sandbox)', () => {
  test.beforeEach(async ({ page }) => {
    // Khong that su nhay sang cong thanh toan -> giu test offline & khong tra tien
    await page.route(GATEWAY_HOSTS, (r) => r.abort());
    await loginOk(page);
    await addFirstBookAndCheckout(page);
  });

  test('MoMo: tạo phiên trả về pay_url', async ({ page }) => {
    await page.locator('#payment-ewallet').check();
    await page.getByRole('button', { name: /Ví MoMo/ }).click();
    await payAndCapture(page, '/api/payment/momo/create', 'pay_url', /momo\.vn/);
  });

  test('VNPay: tạo phiên trả về payment_url', async ({ page }) => {
    await page.locator('#payment-ewallet').check();
    await page.getByRole('button', { name: /VNPAY/ }).click();
    await payAndCapture(page, '/api/payment/vnpay/create', 'payment_url', /vnpayment\.vn/);
  });

  test('PayPal: tạo đơn trả về approve_url', async ({ page }) => {
    await page.locator('#payment-paypal').check();
    await payAndCapture(page, '/api/payment/paypal/create', 'approve_url', /paypal\.com/);
  });

  test('ZaloPay chưa liên kết -> báo lỗi, KHÔNG gọi API tạo phiên', async ({ page }) => {
    await page.locator('#payment-ewallet').check();
    await page.getByRole('button', { name: /ZaloPay/ }).click();

    let called = false;
    page.on('request', (r) => {
      if (/\/api\/payment\/.*\/create/.test(r.url())) called = true;
    });

    await page.getByRole('button', SEL.submitBtn).click();

    await expect(page.getByText(/chưa liên kết Ví ZaloPay/i).first()).toBeVisible({ timeout: 10_000 });
    expect(called, 'không được gọi API khi ví chưa liên kết').toBe(false);
  });

  test('Thẻ ATM khi chưa liên kết -> hiện cảnh báo liên kết thẻ', async ({ page }) => {
    await page.locator('#payment-atm').check();
    await expect(page.getByText(/Chưa có thẻ ATM nào được liên kết/i).first()).toBeAttached({ timeout: 10_000 });
  });
});
