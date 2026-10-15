import { test, expect, APIRequestContext } from '@playwright/test';
import { loginOk, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, QA_EMAIL, QA_PASSWORD } from './helpers';

/**
 * dashboard.spec.ts — Bảng điều khiển Người bán / Quản trị (tận dụng backend sẵn có).
 *
 *  1. Hợp đồng API: các endpoint seller/admin yêu cầu đăng nhập + đúng vai trò
 *     (khách thường -> 403, chưa đăng nhập -> 401, admin -> 200).
 *  2. Phân quyền UI: khách thường vào /dashboard bị chặn; admin vào được.
 *  3. Admin: Tổng quan, Quản lý sách (thêm/xoá), Đơn hàng (lọc/chi tiết),
 *     Mã giảm giá (tạo/xoá), Danh mục + Nhật ký email (chỉ admin).
 *
 * Dùng tài khoản admin qua QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD (mặc định local
 * admin@boko.com / Admin@12345). Sách/mã tạo trong test đều bị xoá lại.
 */

async function apiLogin(request: APIRequestContext, identifier: string, password: string): Promise<string> {
  const res = await request.post('/api/login', { data: { identifier, password } });
  expect(res.ok(), `login ${identifier} -> HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Hợp đồng API seller/admin (phân quyền)', () => {
  test('endpoint seller 401 khi chưa đăng nhập, 403 với khách thường, 200 với admin', async ({ request }) => {
    const anon = await request.get('/api/seller/books');
    expect(anon.status()).toBe(401);

    const customerToken = await apiLogin(request, QA_EMAIL, QA_PASSWORD);
    const customer = await request.get('/api/seller/books', { headers: auth(customerToken) });
    expect(customer.status()).toBe(403);

    const adminToken = await apiLogin(request, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD);
    const admin = await request.get('/api/seller/books', { headers: auth(adminToken) });
    expect(admin.ok(), `admin /api/seller/books -> HTTP ${admin.status()}`).toBeTruthy();
    const adminBody = await admin.json();
    expect(Array.isArray(adminBody.data)).toBeTruthy();
  });

  test('nhật ký email chỉ admin đọc được', async ({ request }) => {
    const customerToken = await apiLogin(request, QA_EMAIL, QA_PASSWORD);
    const denied = await request.get('/api/admin/email-logs', { headers: auth(customerToken) });
    expect(denied.status()).toBe(403);

    const adminToken = await apiLogin(request, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD);
    const ok = await request.get('/api/admin/email-logs?limit=5', { headers: auth(adminToken) });
    expect(ok.ok()).toBeTruthy();
    const body = await ok.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });
});

test.describe('Phân quyền giao diện', () => {
  test('khách thường vào /dashboard bị chặn, không thấy lối vào ở menu', async ({ page }) => {
    await loginOk(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('role-denied')).toBeVisible();
    await expect(page.getByTestId('dashboard-page')).toHaveCount(0);

    // Menu người dùng không có lối vào bảng điều khiển.
    await page.locator('button[title="Tài khoản cá nhân"]').click();
    await expect(page.getByTestId('header-dashboard-link')).toHaveCount(0);
  });

  test('admin vào /dashboard được và thấy các tab quản trị', async ({ page }) => {
    await loginOk(page, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD);
    await page.goto('/dashboard');

    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('header-dashboard-link')).toHaveCount(0); // menu chưa mở
    await page.locator('button[title="Tài khoản cá nhân"]').click();
    await expect(page.getByTestId('header-dashboard-link')).toBeVisible();

    // Tab tổng quan + tab chỉ admin.
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    await expect(page.getByTestId('tab-categories')).toBeVisible();
    await expect(page.getByTestId('tab-emails')).toBeVisible();
  });
});

test.describe('Bảng điều khiển admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginOk(page, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('tổng quan hiển thị số liệu sách/đơn/doanh thu', async ({ page }) => {
    await expect(page.getByTestId('overview-tab')).toBeVisible();
    await expect(page.getByTestId('stat-books')).toHaveText(/\d/);
    await expect(page.getByTestId('stat-orders')).toHaveText(/\d/);
    await expect(page.getByTestId('stat-revenue')).toContainText('₫');
  });

  test('quản lý sách: thêm rồi xoá (round-trip) qua backend thật', async ({ page }) => {
    const title = `QA Dashboard ${Date.now()}`;
    await page.getByTestId('tab-books').click();
    await expect(page.getByTestId('book-row').first()).toBeVisible();

    await page.getByTestId('add-book-btn').click();
    await page.getByTestId('book-title-input').fill(title);
    await page.getByTestId('book-author-input').fill('QA Bot');
    await page.getByTestId('book-price-input').fill('50000');
    await page.getByTestId('book-stock-input').fill('3');
    await page.getByTestId('book-submit').click();

    const row = page.getByTestId('book-row').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByTestId('book-row-title')).toHaveText(title);

    await row.locator('[data-testid^="book-delete-"]').click();
    await row.getByTestId('book-delete-confirm').click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });

  test('đơn hàng: lọc trạng thái và mở chi tiết', async ({ page }) => {
    await page.getByTestId('tab-orders').click();
    await expect(page.getByTestId('order-row').first()).toBeVisible();

    // Lọc "Hoàn tất" — hoặc có đơn, hoặc hiện trạng thái rỗng (đều hợp lệ).
    await page.getByTestId('order-filter-completed').click();
    await expect(page.getByTestId('orders-tab')).toBeVisible();

    // Về "Tất cả" rồi mở chi tiết đơn đầu tiên.
    await page.getByTestId('order-filter-all').click();
    const firstRow = page.getByTestId('order-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.locator('[data-testid^="order-toggle-"]').click();
    await expect(firstRow.locator('[data-testid^="order-detail-"]')).toBeVisible();
  });

  test('mã giảm giá: tạo rồi xoá', async ({ page }) => {
    const code = `QA${Date.now()}`;
    await page.getByTestId('tab-coupons').click();

    await page.getByTestId('add-coupon-btn').click();
    await page.getByTestId('coupon-code-input').fill(code);
    await page.getByTestId('coupon-percent-input').fill('15');
    await page.getByTestId('coupon-expires-input').fill('2027-12-31T23:59');
    await page.getByTestId('coupon-submit').click();

    const row = page.getByTestId('coupon-row').filter({ hasText: code });
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid^="coupon-delete-"]').click();
    await row.getByTestId('coupon-delete-confirm').click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });

  test('danh mục + nhật ký email (chỉ admin)', async ({ page }) => {
    await page.getByTestId('tab-categories').click();
    await expect(page.getByTestId('category-row').first()).toBeVisible();

    await page.getByTestId('tab-emails').click();
    await expect(page.getByTestId('email-logs-tab')).toBeVisible();
    await expect(page.getByTestId('email-log-row').first()).toBeVisible({ timeout: 15_000 });
  });
});
