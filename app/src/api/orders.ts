import { Order } from '../types';
import { safeFetchJson } from './client';
import { normalizeCartItem } from './normalizers';

export async function createOrderSafe(orderPayload: {
  shippingAddress: string;
  phone: string;
  paymentMethod?: string;
  couponCode?: string;
  items?: { bookId: string | number; quantity: number }[];
}): Promise<{ ok: boolean; order?: Order; error?: string }> {
  try {
    const response = await safeFetchJson<{ message?: string; order_id?: number; total?: number; status?: string; payment_method?: string; payment_status?: string }>(`/api/orders`, {
      method: 'POST',
      body: JSON.stringify({
        shipping_address: orderPayload.shippingAddress,
        phone: orderPayload.phone,
        payment_method: orderPayload.paymentMethod || 'cod',
        coupon_code: orderPayload.couponCode || '',
      }),
    });

    if (!response.ok || !response.data) {
      return { ok: false, error: response.error || 'Không thể tạo đơn hàng.' };
    }

    const createdOrder: Order = {
      id: String(response.data.order_id ?? Date.now()),
      date: new Date().toLocaleDateString('vi-VN'),
      items: (orderPayload.items || []).map((item) => ({
        book: {
          id: String(item.bookId),
          title: 'Book order',
          author: 'Boko',
          category: 'LITERATURE',
          priceEUR: 0,
          priceVND: 0,
          coverUrl: '',
          description: 'Order item snapshot',
          sampleChapters: { title: '', page1: [], page2: [], page3: [] },
        },
        quantity: item.quantity,
      })),
      customer: {
        email: '',
        firstName: '',
        lastName: '',
        address: orderPayload.shippingAddress,
        apt: '',
        city: '',
        country: 'Vietnam',
        telephone: orderPayload.phone,
        paymentMethod: (orderPayload.paymentMethod as any) || 'cod',
      },
      subtotalEUR: 0,
      subtotalVND: Number(response.data.total ?? 0),
      discountEUR: 0,
      discountVND: 0,
      vatEUR: 0,
      vatVND: 0,
      shippingEUR: 0,
      shippingVND: 0,
      totalEUR: 0,
      totalVND: Number(response.data.total ?? 0),
      currency: 'VND',
      discountCode: orderPayload.couponCode,
    };

    return { ok: true, order: createdOrder };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Không thể tạo đơn hàng.' };
  }
}
