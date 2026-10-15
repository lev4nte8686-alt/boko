-- ============================================================================
-- 0002_seed_data.sql
--
-- Dữ liệu mẫu: tài khoản seed, danh mục, sách.
-- Chạy SAU 0001_payment_tables.sql. Idempotent (chạy lại nhiều lần cũng an toàn).
--
-- ⚠ KHÔNG chứa mật khẩu thật. Hai tài khoản seed được tạo với bcrypt hash
--   NGẪU NHIÊN (không ai biết mật khẩu → không đăng nhập được).
--   Mật khẩu thật được backend nạp từ biến môi trường khi khởi động:
--     SEED_ADMIN_PASSWORD / SEED_CUSTOMER_PASSWORD
--   (xem seedUser() trong server/main.go).
--
-- Cách dùng đúng:
--   1. Set SEED_ADMIN_PASSWORD (+ SEED_CUSTOMER_PASSWORD) ở biến môi trường.
--   2. Chạy backend lần đầu (AutoMigrate tạo bảng users/categories/books
--      rồi seedUser() tạo tài khoản với đúng mật khẩu bạn set).
--   3. Chạy file SQL này trên Neon SQL Editor để nạp danh mục + sách mẫu.
--
-- LƯU Ý: nếu chạy SQL TRƯỚC khi backend nạp mật khẩu, tài khoản seed vẫn
-- tồn tại nhưng không đăng nhập được — backend sẽ tự cài mật khẩu từ env
-- nếu đặt thêm SEED_UPDATE_PASSWORD=true (xem chú thích trong main.go).
-- ============================================================================

BEGIN;

-- pgcrypto: cần cho crypt()/gen_salt('bf') (bcrypt).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Danh mục mẫu (trùng thì bỏ qua)
-- ----------------------------------------------------------------------------
INSERT INTO categories (name, description, created_at, updated_at) VALUES
    ('Mystery',    'Sách trinh thám, bí ẩn, khám phá',     NOW(), NOW()),
    ('Literature', 'Tiểu thuyết, truyện ngắn, thơ',       NOW(), NOW()),
    ('History',    'Sách lịch sử, chính trị, văn hóa',    NOW(), NOW()),
    ('Science',    'Sách khoa học, công nghệ, xã hội',     NOW(), NOW()),
    ('Art',        'Sách nghệ thuật, hội họa, thiết kế',   NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Tài khoản seed — hash ngẫu nhiên, KHÔNG chứa mật khẩu thật.
--    Trừ khi operator chủ động đổi, không tài khoản nào đăng nhập được
--    bằng mật khẩu đoán trước (kể cả mật khẩu cũ từng hardcode trong code).
-- ----------------------------------------------------------------------------
INSERT INTO users (email, password, name, role, created_at, updated_at) VALUES
    ('admin@boko.com',
     crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
     'Admin Boko', 'admin', NOW(), NOW()),
    ('test@gmail.com',
     crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
     'test_user', 'customer', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Sách mẫu — gắn seller là tài khoản admin seed.
--    Chỉ chèn khi bảng books đang trống hoàn toàn (giống seedData() trong Go).
-- ----------------------------------------------------------------------------
INSERT INTO books (title, author, description, price, stock, category_id, user_id, created_at, updated_at)
SELECT b.title, b.author, b.description, b.price, b.stock, c.id, u.id, NOW(), NOW()
FROM (VALUES
    ('Lập Trình Go Cơ Bản', 'Nguyễn Văn A', 'Hướng dẫn lập trình Go từ cơ bản đến nâng cao', 150000, 100, 'Science'),
    ('The Hound of the Baskervilles', 'Arthur Conan Doyle', 'Tiểu thuyết trinh thám kinh điển', 250000, 50, 'Mystery'),
    ('Nhà Giả Kim', 'Paulo Coelho', 'Hành trình theo đuổi giấc mơ', 79000, 200, 'Literature'),
    ('Lịch Sử Việt Nam', 'TS. Lê Văn Hồng', 'Khái quát lịch sử Việt Nam qua các triều đại', 89000, 150, 'History'),
    ('Câu Chuyện Nghệ Thuật', 'E.H. Gombrich', 'Hành trình khám phá mỹ thuật và hình thành văn hóa', 180000, 80, 'Art')
) AS b(title, author, description, price, stock, cat_name)
JOIN categories c ON c.name = b.cat_name
CROSS JOIN (SELECT id FROM users WHERE role = 'admin' LIMIT 1) AS u
WHERE NOT EXISTS (SELECT 1 FROM books);

COMMIT;

-- ============================================================================
-- Bảo mật mật khẩu trong hệ thống:
--   * Mật khẩu KHÔNG BAO GIỜ lưu dạng plaintext — chỉ lưu bcrypt (Go:
--     bcrypt.GenerateFromPassword; SQL: crypt(x, gen_salt('bf'))).
--   * Hai dòng crypt(...) ở trên dùng UUID ngẫu nhiên làm đầu vào → hash
--     thay đổi mỗi lần chạy và không tương ứng với bất kỳ mật khẩu nào
--     con người biết được. Đây là placeholder an toàn, không phải backdoor.
-- ============================================================================
