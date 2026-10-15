import { test, expect } from '@playwright/test';
import { gotoLogin, loginOk, login, QA_EMAIL } from './helpers';

test.describe('Xác thực (đăng nhập)', () => {
  test('chưa đăng nhập vào "/" thì bị đẩy về /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('đăng nhập đúng -> vào trang chủ, có token', async ({ page }) => {
    await loginOk(page);
    // Header hien ten nguoi dung
    await expect(page.locator('header')).toContainText('test_user', { timeout: 15_000 });
  });

  test('sai mật khẩu -> báo lỗi, không lưu token', async ({ page }) => {
    await gotoLogin(page);
    await login(page, QA_EMAIL, 'sai-mat-khau-123');
    // Van o trang login
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    const token = await page.evaluate(() => localStorage.getItem('boko_auth_token'));
    expect(token).toBeFalsy();
    // Co thong bao loi hien ra
    await expect(page.locator('text=/không đúng|không thành công|Sai|mật khẩu/i').first()).toBeVisible({ timeout: 15_000 });
  });
});
