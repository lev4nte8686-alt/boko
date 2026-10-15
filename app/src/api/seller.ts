import { safeFetchJson, ApiResult } from './client';
import { Shipment } from '../types';

// ============================================================================
// API cho bảng điều khiển Người bán (seller) / Quản trị (admin).
// Tận dụng endpoint backend sẵn có — KHÔNG thêm endpoint mới:
//   - Sách:      GET/POST /api/books, PUT/DELETE /api/books/:id, GET /api/seller/books
//   - Đơn hàng:  GET /api/seller/orders, PUT /api/seller/orders/:id/status
//   - Mã giảm:   GET/POST /api/coupons, DELETE /api/coupons/:id
//   - Danh mục:  GET /api/categories, POST/PUT/DELETE /api/categories/:id (admin)
//   - Email:     GET /api/admin/email-logs (admin)
// ============================================================================

export interface SellerBook {
  id: number;
  title: string;
  author: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  category_id: number | null;
  category?: { id: number; name: string } | null;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface BookInput {
  title: string;
  author: string;
  description?: string;
  price: number;
  stock: number;
  image_url?: string;
  category_id?: number | null;
}

export interface SellerOrderItem {
  id: number;
  order_id: number;
  book_id: number;
  title: string;
  price: number;
  quantity: number;
}

export interface SellerOrder {
  id: number;
  user_id: number;
  user?: { id: number; name: string; email: string } | null;
  total: number;
  status: string; // pending | confirmed | shipping | completed | cancelled
  shipping_address: string;
  phone: string;
  payment_method: string;
  payment_status: string;
  coupon_code?: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  vat_percent: number;
  vat_amount: number;
  ship_fee_source?: string;
  items?: SellerOrderItem[];
  shipment?: Shipment | null;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: number;
  code: string;
  discount_percent: number;
  max_uses: number;
  used_count: number;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CouponInput {
  code: string;
  discount_percent: number;
  max_uses?: number;
  expires_at: string; // RFC3339
}

export interface CategoryItem {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: number;
  to: string;
  subject: string;
  provider: string; // resend | dev-log
  status: string; // sent | failed
  error: string;
  created_at: string;
}

// ==================== SÁCH ====================

export function getSellerBooks(): Promise<ApiResult<{ data?: SellerBook[] }>> {
  return safeFetchJson<{ data?: SellerBook[] }>('/api/seller/books', { method: 'GET' });
}

export function createBook(input: BookInput): Promise<ApiResult<{ message?: string; data?: SellerBook }>> {
  return safeFetchJson<{ message?: string; data?: SellerBook }>('/api/books', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBook(
  id: number | string,
  input: Partial<BookInput>
): Promise<ApiResult<{ message?: string; data?: SellerBook }>> {
  return safeFetchJson<{ message?: string; data?: SellerBook }>(`/api/books/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteBook(id: number | string): Promise<ApiResult<{ message?: string }>> {
  return safeFetchJson<{ message?: string }>(`/api/books/${id}`, { method: 'DELETE' });
}

// ==================== ĐƠN HÀNG ====================

export function getSellerOrders(): Promise<ApiResult<{ data?: SellerOrder[] }>> {
  return safeFetchJson<{ data?: SellerOrder[] }>('/api/seller/orders', { method: 'GET' });
}

export function updateOrderStatus(
  id: number | string,
  status: string
): Promise<ApiResult<{ message?: string; status?: string }>> {
  return safeFetchJson<{ message?: string; status?: string }>(`/api/seller/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ==================== MÃ GIẢM GIÁ ====================

export function getCoupons(): Promise<ApiResult<{ data?: Coupon[] }>> {
  return safeFetchJson<{ data?: Coupon[] }>('/api/coupons', { method: 'GET' });
}

export function createCoupon(input: CouponInput): Promise<ApiResult<{ message?: string; data?: Coupon }>> {
  return safeFetchJson<{ message?: string; data?: Coupon }>('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteCoupon(id: number | string): Promise<ApiResult<{ message?: string }>> {
  return safeFetchJson<{ message?: string }>(`/api/coupons/${id}`, { method: 'DELETE' });
}

// ==================== DANH MỤC (admin) ====================

export function getCategories(): Promise<ApiResult<{ data?: CategoryItem[] }>> {
  return safeFetchJson<{ data?: CategoryItem[] }>('/api/categories', { method: 'GET' });
}

export function createCategory(input: {
  name: string;
  description?: string;
}): Promise<ApiResult<{ message?: string; data?: CategoryItem }>> {
  return safeFetchJson<{ message?: string; data?: CategoryItem }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  id: number | string,
  input: { name?: string; description?: string }
): Promise<ApiResult<{ message?: string; data?: CategoryItem }>> {
  return safeFetchJson<{ message?: string; data?: CategoryItem }>(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteCategory(id: number | string): Promise<ApiResult<{ message?: string }>> {
  return safeFetchJson<{ message?: string }>(`/api/categories/${id}`, { method: 'DELETE' });
}

// ==================== NHẬT KÝ EMAIL (admin) ====================

export function getEmailLogs(limit = 50): Promise<ApiResult<{ data?: EmailLog[] }>> {
  return safeFetchJson<{ data?: EmailLog[] }>(`/api/admin/email-logs?limit=${limit}`, { method: 'GET' });
}
