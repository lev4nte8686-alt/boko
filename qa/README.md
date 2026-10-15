# Boko QA (Playwright E2E)

Bộ test đầu-cuối cho web Boko, chạy **trên localhost trước**, ổn rồi mới áp lên prod.

## Chạy local (mặc định)

Yêu cầu: stack local đang chạy (`docker compose up -d` → nginx ở `https://localhost`).

```powershell
cd qa
npm install            # lần đầu
npx playwright install chromium
npm test               # chạy hết, base https://localhost
npm run test:headed    # xem trình duyệt chạy
npm run test:ui        # Playwright UI mode
npm run report         # mở báo cáo HTML
```

## Chạy trên prod (Vercel + Render)

```powershell
$env:BASE_URL='https://boko-three.vercel.app'
$env:QA_PASSWORD='testpass'      # prod dùng mật khẩu khác local
npm test
```

Config tự bật `retries` + timeout dài khi `BASE_URL` là vercel/onrender (Render free cold-start ~30s).

## Tài khoản

| Môi trường | Email | Mật khẩu |
|---|---|---|
| Local (docker) | `test@gmail.com` | `Test@12345` |
| Prod (Render) | `test@gmail.com` | `testpass` |

Tài khoản **admin** (test bảng điều khiển):

| Môi trường | Email | Mật khẩu |
|---|---|---|
| Local (docker) | `admin@boko.com` | `Admin@12345` |
| Prod (Render) | `admin@gmail.com` | `admin123` |

Override: `$env:QA_EMAIL=...; $env:QA_PASSWORD=...` và `$env:QA_ADMIN_EMAIL=...; $env:QA_ADMIN_PASSWORD=...`

## Cấu trúc

```
qa/
  playwright.config.ts     # baseURL, timeout, retries theo môi trường
  tests/
    helpers.ts             # login, thêm giỏ, mở checkout, hủy đơn (cleanup)
    auth.spec.ts           # redirect /login, đăng nhập đúng/sai
    catalog.spec.ts        # kệ sách nạp từ backend, thêm giỏ
    checkout-cod.spec.ts   # đặt COD 201 (khoá regression "Failed to fetch")
    payment-gateways.spec.ts # MoMo/VNPay/PayPal tạo phiên + guard ZaloPay/ATM
    security-p0.spec.ts    # P0: chống IDOR tạo phiên + idempotency không rò rỉ
    p1-fixes.spec.ts       # P1: giỏ hàng persist, chặn card/bank giả, callback tin backend
    legal-invoice-email.spec.ts # Pháp lý, quên/đặt lại mật khẩu, hoá đơn, email giao dịch
    shipping-vat.spec.ts   # Phí ship thật (GHN) + VAT + chọn địa chỉ Tỉnh/Quận/Phường
    dashboard.spec.ts      # Bảng điều khiển seller/admin (phân quyền + CRUD sách/đơn/mã/danh mục/email)
  pen_test_p0.py           # Pen test P0 độc lập (python requests)
  playwright-report/       # báo cáo HTML (gitignore)
  test-results/            # ảnh/video khi fail (gitignore)
```

## Pen test P0 (an ninh + tiền)

Chạy độc lập với Playwright (chỉ cần Python + `requests`):

```powershell
python qa/pen_test_p0.py
python qa/pen_test_p0.py --base https://localhost `
  --admin admin@boko.com:Admin@12345 --user test@gmail.com:Test@12345
```

Kiểm tra: IDOR tạo phiên MoMo/VNPay/PayPal bằng `order_id` của người khác,
rò rỉ idempotency key giữa user, hoàn kho khi huỷ đơn, IPN chữ ký giả mạo,
không lộ chữ ký trong phản hồi. Kết quả lưu `pentest_p0_report_*.json`.

Các guard **fail-closed** không thể kích hoạt qua HTTP ở local (vì local bật
`ALLOW_MOCK_PAYMENT=true`) được khoá bằng Go unit test:
`server/controllers/security_p0_test.go` (`go test ./controllers/... -run TestP0 -v`).

## Đã khoá regression gì

- **CORS `X-Idempotency-Key`**: test COD assert `POST /api/orders/cod/create` trả **201** và trang **không** xuất hiện `Failed to fetch`.
- **Đăng nhập sai host (405)**: test login assert về trang chủ + có token.
- **Cold-start/đổi host**: chạy local và prod cùng bộ test, chỉ khác `BASE_URL`.
- **Cổng thanh toán**: MoMo → `pay_url`, VNPay → `payment_url`, PayPal → `approve_url`; ZaloPay/ATM chưa liên kết phải chặn (không gọi API tạo phiên).
- **P0 an ninh**: guest/user khác dùng `order_id` có sẵn → `403/404` (không tạo được phiên); idempotency key không trả đơn của user khác; huỷ đơn hoàn kho; IPN chữ ký giả mạo không lật đơn sang `paid`.
- **P0 fail-closed** (Go test): simulator-ipn/ATM-OTP 403/503 khi tắt mock; GHN webhook thiếu/sai secret 503/401; MoMo/VNPay thiếu credential 503.
- **P1**: giỏ hàng giữ sau reload; Ngân hàng/Thẻ/ZaloPay báo "chưa hỗ trợ" (không tạo đơn ảo); callback chỉ báo thành công khi backend xác nhận `paid`.
- **Pháp lý + email + hoá đơn**: trang `/terms` `/privacy` `/returns` `/contact` công khai (không cần đăng nhập) + footer liên kết; quên mật khẩu trả thông báo trung tính (không dò email), token sai/hết hạn 400, email reset ghi `email_logs` và chỉ admin đọc được (`/api/admin/email-logs`); hoá đơn `/api/orders/:id/invoice` chỉ chủ đơn/khách có `?key=`, sai → 401; tạo đơn COD sinh email xác nhận.
- **Phí ship + VAT**: `/api/pricing` trả VAT/ngưỡng miễn phí; master data GHN tỉnh/quận/phường có dữ liệu; báo giá miễn phí khi vượt ngưỡng và `total = tạm tính sau giảm + ship + VAT`; đơn COD bóc tách tiền tệ (giá lấy từ DB dù client gửi `price=1`) và **hoá đơn khớp tổng**; UI chọn Tỉnh/Quận/Phường thì phí được tính.
- **Bảng điều khiển seller/admin** (`/dashboard`): khách thường bị chặn (403 API + trang "Không đủ quyền"); admin/seller dùng được các tab Tổng quan (số liệu sách/đơn/doanh thu), Sách (thêm/xoá round-trip qua backend thật), Đơn hàng (lọc trạng thái + mở chi tiết), Mã giảm giá (tạo/xoá); tab Danh mục + Nhật ký email **chỉ admin** thấy. Lối vào nằm ở menu tài khoản (`header-dashboard-link`).

## Email + hoá đơn (mới)

- **Email giao dịch (Resend)**: set `RESEND_API_KEY` để gửi thật; để trống → chế độ **dev-log**
  (không gửi ra ngoài, chỉ ghi log + bảng `email_logs`, xem `GET /api/admin/email-logs`).
  Cấu hình: `MAIL_FROM`, `APP_BASE_URL` (link trong email), `SHOP_*` (footer/hoá đơn).
- **Quên mật khẩu**: `POST /api/auth/forgot-password` → `POST /api/auth/reset-password`.
  Token ngẫu nhiên 256-bit, chỉ lưu **SHA-256**, dùng 1 lần, hạn 30 phút.
  Luồng "đọc token từ email rồi đặt lại" được khoá ở Go: `server/controllers/email_reset_invoice_test.go`.
- **Hoá đơn**: `GET /api/orders/:id/invoice` (chủ đơn hoặc `?key=<tracking token>`), trang in ở `/invoice/:orderId`.

## Phí vận chuyển + VAT + địa chỉ (mới)

- **Địa chỉ giao hàng**: dropdown **Tỉnh → Quận/Huyện → Phường/Xã** lấy từ master data GHN
  (`GET /api/shipping/provinces|districts|wards`, có cache 6 giờ). Khi GHN lỗi/chưa cấu hình,
  form tự rơi về **nhập tay** (không chặn khách đặt hàng). Mã `district_id`/`ward_code` được
  lưu vào đơn để chuyển GHN chính xác.
- **Phí vận chuyển**: tính **ở backend** khi tạo đơn (không tin client) qua
  `POST /api/shipping/quote` / `POST /api/orders/quote`. Miễn phí khi tạm tính (sau giảm giá)
  ≥ `FREE_SHIP_THRESHOLD` (mặc định **300.000đ**) hoặc dùng mã `FREESHIP`; còn lại gọi GHN
  `v2/shipping-order/fee`. Không tính được GHN → phí tạm tính `SHIP_FEE_FALLBACK` (mặc định 30.000đ)
  để không chặn đặt hàng.
- **VAT**: mặc định **0%** (sách in miễn thuế GTGT ở VN), đổi qua `VAT_PERCENT`.
  `total = subtotal − giảm giá + phí ship + VAT`; đơn lưu bóc tách
  (`subtotal`/`discount_amount`/`shipping_fee`/`vat_percent`/`vat_amount`) và hiện trên hoá đơn.
- **Cấu hình**: `GET /api/pricing` trả `{ vat_percent, free_ship_threshold, ship_fee_fallback, ghn_configured }`.
- **Nguồn toạ độ shop**: `GHN_FROM_DISTRICT_ID`/`GHN_FROM_WARD_CODE` (nếu trống → tự tra theo tên shop, có cache).

## Bảng điều khiển seller/admin (mới)

- **Đường dẫn**: `/dashboard` — hiển thị khi đăng nhập bằng **seller/admin**, có lối vào ở menu tài khoản.
- **Tận dụng backend sẵn có** (không thêm endpoint mới):
  - Sách: `GET /api/seller/books`, `POST/PUT/DELETE /api/books/:id`
  - Đơn hàng: `GET /api/seller/orders`, `PUT /api/seller/orders/:id/status`, bàn giao/đồng bộ GHN
  - Mã giảm giá: `GET/POST /api/coupons`, `DELETE /api/coupons/:id`
  - Danh mục (admin): `GET /api/categories`, `POST/PUT/DELETE /api/categories/:id`
  - Nhật ký email (admin): `GET /api/admin/email-logs`
- **Phân quyền**: `RequireRole` chặn khách thường; API vẫn là hàng rào cuối (khách thường → 403).
- **Mã nguồn**: `app/src/pages/DashboardPage.tsx`, `app/src/components/dashboard/*`, `app/src/api/seller.ts`.

### Rate limit khi chạy test

Chạy full suite (46 test) sinh nhiều request cùng IP nên có thể chạm rate limit. Local đã nới:
`RATE_LIMIT_PER_MINUTE=600` (backend, trong `server/docker-compose.yml`) và tách zone riêng cho
file tĩnh ở `server/nginx/default.conf`. **Production không set → giữ mặc định 120/phút/IP.**

## Cổng thanh toán — an toàn

`payment-gateways.spec.ts` **không hoàn tất giao dịch thật**:

- `page.route(...)` **abort** mọi điều hướng sang `momo.vn` / `vnpayment.vn` / `paypal.com`.
- Đọc body ngay tại route handler (app lập tức `window.location.href = pay_url`).
- Hủy đơn pending vừa tạo qua `PUT /api/orders/:id/cancel`.

MoMo/VNPay dùng sandbox mặc định trong code (`server/payments/*.go`); PayPal dùng `PAYPAL_*` trong `server/.env`.

## Dọn dữ liệu

Test checkout tự `PUT /api/orders/:id/cancel` đơn vừa tạo. Nếu test fail giữa chừng, huỷ tay các đơn địa chỉ chứa `123 Đường Đồng Khởi`.
