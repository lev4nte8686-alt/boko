import { test, expect } from '@playwright/test';
import { loginOk, SEL } from './helpers';

test.describe('Catalog / Kệ sách', () => {
  test.beforeEach(async ({ page }) => {
    await loginOk(page);
  });

  test('trang chủ hiển thị sách (nạp từ backend)', async ({ page }) => {
    const add = page.getByRole('button', SEL.addToCart);
    await expect(add.first()).toBeVisible({ timeout: 20_000 });
    expect(await add.count()).toBeGreaterThan(0);
  });

  test('thêm vào giỏ -> badge giỏ hàng tăng', async ({ page }) => {
    const add = page.getByRole('button', SEL.addToCart).first();
    await expect(add).toBeVisible({ timeout: 20_000 });

    const cartBtn = page.locator(SEL.cartButton);
    const before = (await cartBtn.textContent())?.trim() || '0';
    await add.click();
    // Cho badge cap nhat
    await expect.poll(async () => {
      const t = (await cartBtn.textContent())?.trim() || '0';
      return Number(t) || 0;
    }, { timeout: 10_000 }).toBeGreaterThan(Number(before) || 0);
  });

  test('thêm vào giỏ mở ngăn kéo có nút tiến hành thanh toán', async ({ page }) => {
    await page.getByRole('button', SEL.addToCart).first().click();
    await expect(page.getByRole('button', SEL.proceed)).toBeVisible({ timeout: 10_000 });
  });
});
