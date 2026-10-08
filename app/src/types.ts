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
  ward?: string;
  streetAddress?: string;
  paymentMethod: 'card' | 'ewallet' | 'bank' | 'cod' | 'paypal';
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  ewalletType: 'zalopay';
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  province: string;
  ward: string;
  streetAddress: string;
}

export interface SavedPaymentMethod {
  id: string;
  type: 'card' | 'zalopay' | 'bank' | 'paypal';
  label: string; // e.g. "Thẻ Visa •••• 8892" or "Ví ZaloPay - 0912 345 678"
  accountNumber: string;
  accountHolder: string;
  providerName?: string; // e.g. "Visa", "Mastercard", "ZaloPay", "Vietcombank", "MB Bank"
  bankName?: string;
  cardExpiry?: string;
  isDefault: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  provider?: 'email' | 'google' | 'facebook' | 'apple';
  memberSince?: string;
  shippingAddress?: ShippingAddress;
  savedAddresses?: ShippingAddress[];
  paymentMethods?: SavedPaymentMethod[];
}

export interface Order {
  id: string;
  date: string;
  items: CartItem[];
  customer: CheckoutFormState;
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



