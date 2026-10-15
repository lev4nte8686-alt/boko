import { test, expect, APIRequestContext } from '@playwright/test';
import { QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, SEL, fillContactIfEmpty, selectShippingAddress } from './helpers';

/**
 * search-guest.spec.ts — hai tính năng mới:
 *   1. Tìm kiếm PHÍA SERVER (không còn lọc catalog mocks ở trình duyệt).
 *   2. KHÁCH VÃNG LAI đặt hàng COD không cần đăng nhập, nhận mã tra cứu để
 *      xem lại hoá đơn/đơn hàng.
 */

/** Huỷ đơn bất kỳ bằng quyền admin (dọn DB test, không để rác). */
async function cancelOrderAsAdmin(request: APIRequestContext, orderId: number | string) {
  const login = await request.post('/api/login', {
    data: { identifier: QA_ADMIN_EMAIL, password: QA_ADMIN_PASSWORD },
  });
  if (!login.ok()) return;
  const { token } = await login.json();
  await request.put(`/api/seller/orders/${orderId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'cancelled' },
  });
}

test.describe('Tìm kiếm phía server (SearchModal)', () => {
  test('gõ tên sách có thật -> trả kết quả từ backend', async ({ page }) => {
    await page.goto('/');
    await page.locator('button[title="Tìm kiếm sách"]').click();

    const input = page.getByTestId('search-input');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('Nhà Giả Kim');

    const result = page.getByTestId('search-result').first();
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result).toContainText('Nhà Giả Kim');
  });

  test('gõ chuỗi vô nghĩa -> báo không tìm thấy', async ({ page }) => {
    await page.goto('/');
    await page.locator('button[title="Tìm kiếm sách"]').click();

    const input = page.getByTestId('search-input');
    await input.fill('zzz-khong-co-sach-nao-xyz');

    await expect(page.getByTestId('search-empty')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('search-result')).toHaveCount(0);
  });

  test('kệ sách KHÔNG còn nút "xem thêm" sinh sách ảo', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', SEL.addToCart).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('button[title="Xem thêm"]')).toHaveCount(0);
  });
});

test.describe('Guest checkout (khách vãng lai)', () => {
  test('khách chưa đăng nhập vẫn đặt được COD + nhận mã tra cứu', async ({ page, request }) => {
    // 1. Xem tủ sách không cần đăng nhập
    await page.goto('/');
    const add = page.getByRole('button', SEL.addToCart).first();
    await expect(add).toBeVisible({ timeout: 20_000 });
    await add.click();

    const proceed = page.getByRole('button', SEL.proceed);
    if (!(await proceed.isVisible().catch(() => false))) {
      await page.locator(SEL.cartButton).click();
    }
    await proceed.click();
    await expect(page).toHaveURL(/\/checkout/);
    await selectShippingAddress(page);

    // 2. Điền thông tin liên hệ (không có tài khoản)
    await fillContactIfEmpty(page, { email: `guest.qa.${Date.now()}@boko.com` });

    // 3. Gửi đơn COD và chờ backend tạo đơn
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/orders/cod/create'), { timeout: 60_000 }),
      page.getByRole('button', SEL.continue).click(),
    ]);
    expect(resp.status(), `POST cod/create cho guest trả ${resp.status()}`).toBe(201);
    const body = await resp.json();
    expect(body.tracking_token, 'guest phải nhận được mã tra cứu').toBeTruthy();

    // 4. Modal thành công hiển thị mã tra cứu
    const tokenBox = page.getByTestId('order-tracking-token');
    await expect(tokenBox).toBeVisible({ timeout: 20_000 });
    await expect(tokenBox).toContainText(body.tracking_token);

    // 5. Tra cứu lại đơn bằng mã (không cần đăng nhập) + hoá đơn theo ?key=
    const lookup = await request.get(
      `/api/orders/my-orders?order_id=${body.order_id}&token=${encodeURIComponent(body.tracking_token)}`
    );
    expect(lookup.status()).toBe(200);

    const invoice = await request.get(
      `/api/orders/${body.order_id}/invoice?key=${encodeURIComponent(body.tracking_token)}`
    );
    expect(invoice.status(), 'khách vãng lai xem được hoá đơn bằng mã tra cứu').toBe(200);

    // Dọn rác test
    await cancelOrderAsAdmin(request, body.order_id);
  });
});
