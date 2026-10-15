import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { BooksTab } from '../components/dashboard/BooksTab';
import { OrdersTab } from '../components/dashboard/OrdersTab';
import { CouponsTab } from '../components/dashboard/CouponsTab';
import { CategoriesTab } from '../components/dashboard/CategoriesTab';
import { EmailLogsTab } from '../components/dashboard/EmailLogsTab';
import { getSellerBooks, getSellerOrders, getCoupons } from '../api/seller';
import {
  AsyncState,
  Card,
  StatCard,
  StatusBadge,
  formatVND,
  formatDateTime,
} from '../components/dashboard/ui';

interface DashboardPageProps {
  user: User | null;
}

type TabKey = 'overview' | 'books' | 'orders' | 'coupons' | 'categories' | 'emails';

interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Tổng quan', icon: 'fa-chart-pie' },
  { key: 'books', label: 'Sách', icon: 'fa-book' },
  { key: 'orders', label: 'Đơn hàng', icon: 'fa-receipt' },
  { key: 'coupons', label: 'Mã giảm giá', icon: 'fa-ticket' },
  { key: 'categories', label: 'Danh mục', icon: 'fa-layer-group', adminOnly: true },
  { key: 'emails', label: 'Nhật ký email', icon: 'fa-envelope', adminOnly: true },
];

// ============================================================================
// Tổng quan: gộp số liệu từ endpoint sách/đơn/mã giảm giá sẵn có.
// ============================================================================
const OverviewTab: React.FC<{ user: User | null; refreshKey: number }> = ({ user, refreshKey }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    books: 0,
    lowStock: 0,
    orders: 0,
    pending: 0,
    revenue: 0,
    coupons: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [booksRes, ordersRes, couponsRes] = await Promise.all([
      getSellerBooks(),
      getSellerOrders(),
      getCoupons(),
    ]);
    if (!booksRes.ok || !ordersRes.ok) {
      setError(booksRes.error || ordersRes.error || 'Không tải được số liệu tổng quan.');
      setLoading(false);
      return;
    }
    const books = booksRes.data?.data || [];
    const orders = ordersRes.data?.data || [];
    const coupons = couponsRes.ok ? couponsRes.data?.data || [] : [];

    const revenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.total || 0), 0);

    setStats({
      books: books.length,
      lowStock: books.filter((b) => (b.stock ?? 0) <= 5).length,
      orders: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      revenue,
      coupons: coupons.length,
    });
    setRecentOrders(orders.slice(0, 5));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-6" data-testid="overview-tab">
      {error && <AsyncState error={error} onRetry={load} />}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Đầu sách" value={String(stats.books)} icon="fa-book" tone="blue" testId="stat-books" />
        <StatCard label="Đơn hàng" value={String(stats.orders)} icon="fa-receipt" tone="violet" testId="stat-orders" />
        <StatCard
          label="Doanh thu (chưa huỷ)"
          value={formatVND(stats.revenue)}
          icon="fa-sack-dollar"
          tone="emerald"
          testId="stat-revenue"
        />
        <StatCard
          label="Mã giảm giá"
          value={String(stats.coupons)}
          icon="fa-ticket"
          tone="amber"
          testId="stat-coupons"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4" data-testid="stat-pending">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Đơn chờ xác nhận</p>
          <p className="text-2xl font-display font-bold text-amber-600">{stats.pending}</p>
        </Card>
        <Card className="p-4" data-testid="stat-lowstock">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Sách sắp hết (≤5)</p>
          <p className="text-2xl font-display font-bold text-rose-600">{stats.lowStock}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Vai trò</p>
          <p className="text-2xl font-display font-bold text-slate-900 capitalize">{user?.role || '—'}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-display font-bold text-base text-slate-900 mb-3">Đơn hàng gần đây</h3>
        <AsyncState loading={loading} empty={!recentOrders.length} emptyText="Chưa có đơn hàng." />
        {!loading && recentOrders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2.5">Mã đơn</th>
                  <th className="px-3 py-2.5">Khách</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Tổng</th>
                  <th className="px-3 py-2.5">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">#{o.id}</td>
                    <td className="px-3 py-2.5 text-slate-600">{o.user?.name || 'Khách'}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{formatVND(o.total)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ user }) => {
  const navigate = useNavigate();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleChanged = () => setRefreshKey((k) => k + 1);

  return (
    <main className="flex-1 w-full animate-fadeIn bg-slate-50" data-testid="dashboard-page">
      <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <span className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold block mb-1">
              BOKO • BẢNG ĐIỀU KHIỂN
            </span>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight">
              Xin chào, {user?.name || 'bạn'} 👋
            </h1>
            <p className="font-body text-sm text-slate-500 mt-1">
              Quản lý sách, đơn hàng, mã giảm giá và vận chuyển của cửa hàng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                isAdmin ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {isAdmin ? 'Quản trị viên' : 'Người bán'}
            </span>
            <button
              onClick={() => navigate('/')}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
            >
              <i className="fa-solid fa-store mr-2"></i>
              Về cửa hàng
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex items-center gap-2 flex-wrap mb-6 border-b border-slate-200 pb-3">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              data-testid={`tab-${t.key}`}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === t.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <i className={`fa-solid ${t.icon} mr-2`}></i>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && <OverviewTab user={user} refreshKey={refreshKey} />}
        {activeTab === 'books' && <BooksTab onChanged={handleChanged} />}
        {activeTab === 'orders' && <OrdersTab user={user} onChanged={handleChanged} />}
        {activeTab === 'coupons' && <CouponsTab onChanged={handleChanged} />}
        {activeTab === 'categories' && isAdmin && <CategoriesTab onChanged={handleChanged} />}
        {activeTab === 'emails' && isAdmin && <EmailLogsTab onChanged={handleChanged} />}
      </div>
    </main>
  );
};
