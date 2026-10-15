-- ============================================================================
-- 0003_orders_idempotency_unique.sql
--
-- Ràng buộc idempotency key duy nhất (partial unique) cho bảng orders.
-- Mục đích: chống tạo trùng đơn khi hai request song song cùng mang một
-- X-Idempotency-Key (ngoài lớp kiểm tra SELECT trong CreateCodOrder /
-- VerifyAtmOtpPayment đã được scope theo user_id).
--
-- Partial index: bỏ qua các đơn không có key (idempotency_key rỗng/NULL) để
-- các đơn legacy không có key không xung đột nhau.
--
-- Idempotent: chạy lại nhiều lần cũng an toàn. Chạy SAU 0001/0002.
--
-- Khoá duy nhất là CẶP (user_id, idempotency_key): một key chỉ dedupe trong
-- phạm vi 1 người dùng, đúng với lớp kiểm tra scope theo user_id ở handler.
-- Partial: bỏ qua đơn không có key.
-- ============================================================================

DROP INDEX IF EXISTS idx_orders_idempotency_key;
DROP INDEX IF EXISTS idx_orders_user_idem;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idem
    ON orders (user_id, idempotency_key)
    WHERE idempotency_key <> '';
