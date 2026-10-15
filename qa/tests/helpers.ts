import { Page, expect, APIRequestContext } from '@playwright/test';

/**
 * Credentials seed.
 *  - LOCAL (docker) : test@gmail.com / Test@12345
 *  - PROD (Render)  : test@gmail.com / testpass
 * Override bang env: QA_EMAIL / QA_PASSWORD.
 */
export const QA_EMAIL = process.env.QA_EMAIL || 'test@gmail.com';
export const QA_PASSWORD = process.env.QA_PASSWORD || 'Test@12345';

/**
 * Tài khoản QUẢN TRỊ (để test bảng điều khiển seller/admin).
 *  - LOCAL (docker) : admin@boko.com / Admin@12345
 *  - PROD (Render)  : admin@gmail.com / admin123
 * Override bang env: QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD.
 */
export const QA_ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@boko.com';
export const QA_ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'Admin@12345';

export const SEL = {
  emailInput: 'input[type="email"], input[placeholder*="test_user"]',
  passwordInput: 'input[type="password"]',
  // exact: true de khong khop nham "Đăng nhập bằng Facebook/Apple"
  loginButton: { name: 'ĐĂNG NHẬP', exact: true },
  cartButton: 'button[title="Giỏ hàng"]',
  addToCart: { name: 'Thêm vào giỏ' },
  proceed: { name: /TIẾN HÀNH THANH TOÁN/ },
  continue: { name: 'CONTINUE' },
  // Nut submit doi nhan theo phuong thuc thanh toan (COD/MoMo/VNPay/PayPal/ATM)
  submitBtn: { name: /CONTINUE|ĐẶT HÀNG & THANH TOÁN|XÁC THỰC OTP/i },
};

/** Trang login tu dong hien khi chua dang nhap. */
export async function gotoLogin(page: Page) {
  await page.goto('/login');
  await expect(page.locator(SEL.passwordInput)).toBeVisible();
}

export async function login(page: Page, email = QA_EMAIL, password = QA_PASSWORD) {
  await gotoLogin(page);
  await page.locator(SEL.emailInput).first().fill(email);
  await page.locator(SEL.passwordInput).fill(password);
  await page.getByRole('button', SEL.loginButton).click();
}

/** Dang nhap va cho ve trang chu (header hien ten user). */
export async function loginOk(page: Page, email = QA_EMAIL, password = QA_PASSWORD) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/$|\/home$|\/$/);
  // token duoc luu -> cac API sau nay co Authorization
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('boko_auth_token')), { timeout: 20_000 })
    .toBeTruthy();
}

/** Them 1 cuon dau tien tren ke vao gio va mo checkout.
 *  Luu y: "Thêm vào giỏ" tu mo ngan keo gio hang -> khong can bam icon gio. */
export async function addFirstBookAndCheckout(page: Page) {
  await page.goto('/');
  const addBtn = page.getByRole('button', SEL.addToCart).first();
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await addBtn.click();

  const proceed = page.getByRole('button', SEL.proceed);
  if (!(await proceed.isVisible().catch(() => false))) {
    await page.locator(SEL.cartButton).click();
  }
  await expect(proceed).toBeVisible({ timeout: 10_000 });
  await proceed.click();
  await expect(page).toHaveURL(/\/checkout/);

  // Chọn địa chỉ giao hàng (dropdown GHN) để tính được phí vận chuyển.
  await selectShippingAddress(page);
}

/**
 * Tìm 1 chuỗi Tỉnh -> Quận -> Phường có dữ liệu thật từ master data GHN.
 * (Vài tỉnh trong dữ liệu test rỗng nên không thể hard-code phần tử đầu tiên.)
 */
export async function pickAddressChain(request: APIRequestContext) {
  const provinces = (await (await request.get('/api/shipping/provinces')).json()).data || [];
  for (const p of provinces.slice(0, 20)) {
    const districts =
      (await (await request.get(`/api/shipping/districts?province_id=${p.province_id}`)).json()).data || [];
    for (const d of districts.slice(0, 5)) {
      const wards =
        (await (await request.get(`/api/shipping/wards?district_id=${d.district_id}`)).json()).data || [];
      if (wards.length) return { province: p as any, district: d as any, ward: wards[0] as any };
    }
  }
  throw new Error('không tìm được tỉnh/quận/phường có dữ liệu GHN');
}

/**
 * Chọn Tỉnh/Quận/Phường qua dropdown GHN + chờ backend tính xong phí vận chuyển.
 * Nếu GHN không cấu hình (form vẫn là ô nhập tay) thì bỏ qua (không chặn test).
 */
export async function selectShippingAddress(page: Page) {
  const select = page.locator('select#province');
  const input = page.locator('input#province');

  // Chờ form địa chỉ xuất hiện (select nếu GHN đã cấu hình, input nếu nhập tay).
  await expect(select.or(input)).toBeVisible({ timeout: 20_000 });
  // Cho master data GHN tải xong (đổi ô nhập tay -> dropdown) tối đa 10s.
  await select.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (!(await select.isVisible().catch(() => false))) return; // GHN lỗi -> nhập tay, bỏ qua

  const chain = await pickAddressChain(page.request);
  await select.selectOption(String(chain.province.province_id));
  await page.locator('#district').selectOption(String(chain.district.district_id));
  await page.locator('#ward').selectOption(chain.ward.ward_code);

  // Nhãn "Chọn địa chỉ" biến mất khi phí đã được tính xong.
  await expect(page.getByText('Chọn địa chỉ', { exact: true })).toHaveCount(0, { timeout: 20_000 });
}

/** Huy don qua API de khong lam ban DB (dung token cua user dang nhap). */
export async function cancelOrder(page: Page, orderId: number | string) {
  const token = await page.evaluate(() => localStorage.getItem('boko_auth_token'));
  if (!token) return;
  await page.request.put(`/api/orders/${orderId}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
