import { test, expect } from '@playwright/test';
import { addFirstBookAndCheckout, loginOk, SEL } from './helpers';

/**
 * p1-fixes.spec.ts — Chứng minh các vá P1 (dùng được đúng ở frontend):
 *   - Giỏ hàng persist qua reload (localStorage).
 *   - Phương thức chưa tích hợp (Ngân hàng/Thẻ/ZaloPay) KHÔNG tạo đơn ảo báo thành công.
 *   - Trang callback KHÔNG tin tham số trên URL, chỉ tin trạng thái backend.
 */

test.describe('P1 — giỏ hàng persist', () => {
  test('giỏ hàng được giữ sau khi reload trang', async ({ page }) => {
    await loginOk(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('boko_cart'));
    await page.reload();

    const add = page.getByRole('button', SEL.addToCart).first();
    await expect(add).toBeVisible({ timeout: 20_000 });
    await add.click();

    await expect
      .poll(async () => Number((await page.locator(SEL.cartButton).textContent())?.trim() || 0), { timeout: 10_000 })
      .toBeGreaterThan(0);

    await page.reload();
    await expect
      .poll(async () => Number((await page.locator(SEL.cartButton).textContent())?.trim() || 0), { timeout: 10_000 })
      .toBeGreaterThan(0);
  });
});

test.describe('P1 — chặn phương thức thanh toán chưa hỗ trợ', () => {
  test('Ngân hàng chưa tích hợp -> báo lỗi, không tạo đơn ảo', async ({ page }) => {
    await loginOk(page);
    await addFirstBookAndCheckout(page);

    await page.locator('#payment-bank').check();
    await page.getByRole('button', SEL.submitBtn).click();

    await expect(page.getByText(/chưa được hỗ trợ chính thức/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/checkout/);
  });
});

test.describe('P1 — callback không tin tham số URL', () => {
  test('MoMo callback với resultCode=0 giả mạo vẫn báo chưa hoàn tất', async ({ page }) => {
    await page.goto('/payment/momo-callback?orderId=BOKO_999999_1&resultCode=0&message=ok&amount=50000');
    await expect(page.getByRole('heading', { name: /Giao Dịch Chưa Hoàn Tất/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Thanh Toán Thành Công/i })).toHaveCount(0);
  });

  test('VNPAY callback với vnp_ResponseCode=00 giả mạo vẫn báo chưa hoàn tất', async ({ page }) => {
    await page.goto('/payment/vnpay-callback?vnp_TxnRef=BOKO_999999_1&vnp_ResponseCode=00&vnp_Amount=5000000');
    await expect(page.getByRole('heading', { name: /Giao Dịch Chưa Hoàn Tất/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Thành Công/i })).toHaveCount(0);
  });
});
