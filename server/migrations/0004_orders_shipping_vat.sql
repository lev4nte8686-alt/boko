-- ============================================================================
-- 0004_orders_shipping_vat.sql
--
-- Thêm bóc tách tiền tệ cho đơn hàng + mã địa chỉ GHN của người nhận.
-- Trước đây orders chỉ có cột total; nay lưu chi tiết:
--   total = subtotal − discount_amount + shipping_fee + vat_amount
-- để hiển thị hoá đơn và đối soát thanh toán.
--
-- Cột địa chỉ (to_district_id/to_ward_code) giúp chuyển GHN chính xác, không
-- phải suy lại từ chuỗi địa chỉ.
--
-- Idempotent: chạy lại nhiều lần cũng an toàn. Chạy SAU 0001/0002/0003.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal        DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_percent     INTEGER          NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_fee_source VARCHAR(32)      NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS to_district_id  INTEGER          NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS to_ward_code    VARCHAR(32)      NOT NULL DEFAULT '';

-- Backfill đơn cũ: chưa có bóc tách => coi toàn bộ total là tạm tính (không
-- giảm giá, không phí ship, không VAT) để báo cáo không âm.
UPDATE orders SET subtotal = total
WHERE subtotal = 0 AND total > 0;
