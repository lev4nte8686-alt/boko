import { test, expect } from '@playwright/test';
import { loginOk, addFirstBookAndCheckout, cancelOrder, fillContactIfEmpty, SEL } from './helpers';

/**
 * Luong quan trong nhat: dat hang COD.
 * Day la cho tung vo o prod: (1) CORS chan header X-Idempotency-Key -> "Failed to fetch".
 * Test nay khoa lai: request phai 201 va KHONG duoc co "Failed to fetch".
 */
test.describe('Checkout COD', () => {
  test('đặt hàng COD thành công (201, không "Failed to fetch")', async ({ page }) => {
    await loginOk(page);
    await addFirstBookAndCheckout(page);

    // Form KHÔNG tự bịa dữ liệu: điền thông tin liên hệ còn trống.
    await fillContactIfEmpty(page);

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/orders/cod/create'),
        { timeout: 60_000 }
      ),
      page.getByRole('button', SEL.continue).click(),
    ]);

    expect(resp.status(), `POST cod/create tra ${resp.status()}`).toBe(201);

    // Khong duoc hien banner loi mang
    await expect(page.locator('body')).not.toContainText('Failed to fetch', { timeout: 5_000 });

    // Don sach don test vua tao
    const json = await resp.json().catch(() => ({}));
    const orderId = json?.order?.id;
    if (orderId) await cancelOrder(page, orderId);
  });

  test('thiếu thông tin bắt buộc -> báo lỗi, không gọi API tạo đơn', async ({ page }) => {
    await loginOk(page);
    await addFirstBookAndCheckout(page);

    // Xoa ten nguoi nhan
    await page.getByPlaceholder('Họ và Tên người nhận').fill('');

    let called = false;
    page.on('request', (r) => {
      if (r.url().includes('/api/orders/cod/create')) called = true;
    });

    await page.getByRole('button', SEL.continue).click();
    await expect(page.locator('text=/Vui lòng nhập/i').first()).toBeVisible({ timeout: 10_000 });
    expect(called, 'không được gọi API khi thiếu dữ liệu').toBe(false);
  });
});
