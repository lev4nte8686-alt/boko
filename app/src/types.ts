export type Currency = 'EUR' | 'VND';

export interface PublisherBrand {
  id: string;
  name: string;
  shortName: string;
  type: 'publisher' | 'bookstore';
  typeLabel: string;
  badge: string;
  woodMaterialName: string;
  woodColorDot: string;
  tagline: string;
  description: string;
  rating: number;
  totalTitles: number;
  establishedYear: number;
  verified: boolean;
  address?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  priceEUR: number;
  priceVND: number;
  originalPriceVND?: number;
  discountPercent?: number;
  coverUrl: string;
  bgColor?: string; // Fallback background if image is colored/monochrome box
  description: string;
  publisher?: string;
  brandId?: string; // e.g. 'nha-nam' | 'fahasa' | 'nxb-tre' | 'kim-dong' | 'phuong-nam' | 'dong-a' | 'alpha-books'
  brandName?: string;
  editionType?: string;
  isbn?: string;
  pageCount?: number;
  publishYear?: number;
  stock?: number;
  sampleChapters: {
    title: string;
    page1: string[];
    page2: string[];
    page3: string[];
  };
}

export interface CartItem {
  book: Book;
  quantity: number;
}

export interface CheckoutFormState {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  apt: string;
  city: string;
  country: string;
  postalCode: string;
  telephone: string;
  province?: string;
  district?: string;
  ward?: string;
  provinceId?: number;
  districtId?: number;
  wardCode?: string;
  streetAddress?: string;
  paymentMethod: 'card' | 'ewallet' | 'bank' | 'cod' | 'paypal' | 'atm';
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  ewalletType: 'momo' | 'zalopay' | 'vnpay';
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  province: string;
  district?: string;
  ward: string;
  provinceId?: number;
  districtId?: number;
  wardCode?: string;
  streetAddress: string;
}

export interface SavedPaymentMethod {
  id: string;
  type: 'card' | 'momo' | 'zalopay' | 'vnpay' | 'bank' | 'paypal' | 'atm';
  label: string; // e.g. "Thẻ Visa •••• 8892" or "Ví MoMo - 0912 345 678"
  accountNumber: string;
  accountHolder: string;
  providerName?: string; // e.g. "Visa", "Mastercard", "MoMo", "ZaloPay", "Vietcombank", "MB Bank"
  bankName?: string;
  cardExpiry?: string;
  isDefault: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string; // customer | seller | admin (có khi đăng nhập qua backend)
  bio?: string;
  avatarUrl?: string;
  provider?: 'email' | 'google' | 'facebook' | 'apple';
  memberSince?: string;
  shippingAddress?: ShippingAddress;
  savedAddresses?: ShippingAddress[];
  paymentMethods?: SavedPaymentMethod[];
}

export interface CustomerOrderSummary {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  address?: string;
  streetAddress?: string;
  ward?: string;
  district?: string;
  province?: string;
  city?: string;
  country?: string;
  apt?: string;
  shippingAddress?: string;
  paymentMethod?: string;
}

export interface Order {
  id: string;
  dbId?: number;
  date: string;
  items: CartItem[];
  customer: CustomerOrderSummary;
  subtotalEUR: number;
  subtotalVND: number;
  discountEUR: number;
  discountVND: number;
  vatEUR: number;
  vatVND: number;
  shippingEUR: number;
  shippingVND: number;
  totalEUR: number;
  totalVND: number;
  currency: Currency;
  discountCode?: string;
  status?: 'pending' | 'confirmed' | 'shipping' | 'completed' | 'cancelled';
  paymentStatus?: 'unpaid' | 'paid' | 'failed';
  paymentMethod?: string;
  shippingAddress?: string;
  phone?: string;
  shipment?: Shipment | null;
  // Mã tra cứu đơn cho khách vãng lai (không đăng nhập): mở hoá đơn / tra cứu
  // trạng thái bằng /invoice/:id?key=<trackingToken>. Không đoán được.
  trackingToken?: string;
}

// Vận đơn giao cho hãng thứ 3 (GHN) quản lý sau khi đơn đã đóng gói
export interface Shipment {
  id: number;
  order_id: number;
  provider: string; // 'ghn'
  client_order_code: string; // mã đơn phía shop (BOKO-<orderId>)
  order_code: string; // mã vận đơn GHN để tra cứu
  status: string; // trạng thái gốc của GHN (delivering, delivered...)
  status_text: string; // mô tả tiếng Việt
  service_type_id: number;
  payment_type_id: number;
  total_fee: number;
  cod_amount: number;
  leadtime: string | null;
  last_synced_at: string | null;
  created_at: string;
}

// 1 chặng trong hành trình vận đơn GHN
export interface GHNJourneyStage {
  key: string;
  title: string;
  done: boolean;
  current: boolean;
  warning: boolean;
  at: string | null;
}

// 1 mốc hành trình vận đơn đã ghi nhận
export interface ShipmentEvent {
  id: number;
  order_id: number;
  shipment_id: number;
  status: string;
  status_text: string;
  source: string;
  created_at: string;
}

export interface UsedBookListing {
  id: string;
  title: string;
  author: string;
  category: string;
  priceEUR: number;
  priceVND: number;
  originalPriceEUR?: number;
  originalPriceVND?: number;
  condition: 'like-new' | 'very-good' | 'good' | 'fair' | 'vintage';
  conditionLabel: string;
  conditionPercentage: number;
  conditionDetails: string;
  coverUrl: string;
  extraPhotos?: string[];
  description: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  sellerLocation: string;
  status: 'available' | 'sold' | 'reserved';
  createdAt: string;
  likesCount: number;
  viewsCount: number;
  tags: string[];
}



